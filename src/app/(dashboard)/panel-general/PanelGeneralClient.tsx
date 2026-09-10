"use client";

import { useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { Download, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { EquipoMiembro, VistEmpresa } from "@/types";
import { NuevoClienteModal } from "./NuevoClienteModal";
import { EditarClienteModal } from "./EditarClienteModal";
import { darDeBajaServicio, darDeBajaCliente } from "./actions";

// Rediseño Panel General (handoff sep-2026): Libros queda fuera de esta
// pantalla por decisión del usuario — es otro módulo y se gestiona aparte.
const GRUPOS = [
  { key: "sueldos", label: "Sueldos", cols: [{ key: "sueldos:general", label: "Responsable" }] },
  {
    key: "impuestos",
    label: "Impuestos",
    cols: [
      { key: "impuestos:iva", label: "IVA" },
      { key: "impuestos:iibb", label: "IIBB" },
      { key: "impuestos:seh", label: "Seg. e Hig." },
    ],
  },
  { key: "contable", label: "Contable", cols: [{ key: "contable:general", label: "Responsable" }] },
  { key: "monotributo", label: "Monotributo", cols: [{ key: "monotributo:general", label: "Responsable" }] },
] as const;

const VISTA_FIELD: Record<string, keyof VistEmpresa> = {
  "sueldos:general": "responsable_sueldos",
  "impuestos:iva": "responsable_impuestos_iva",
  "impuestos:iibb": "responsable_impuestos_iibb",
  "impuestos:seh": "responsable_impuestos_seh",
  "contable:general": "responsable_contable",
  "monotributo:general": "responsable_monotributo",
};

// Todas las columnas de responsable, para el filtro "cualquier área" — la
// vista guarda el nombre (no el id) en cada una.
const RESPONSABLE_FIELDS = Object.values(VISTA_FIELD);

const TODAS_LAS_COLUMNAS = new Set<string>(GRUPOS.flatMap((g) => g.cols.map((c) => c.key as string)));

const STOPWORDS = new Set(["de", "del", "la", "el", "y", "&", "s.a.", "s.r.l.", "sa", "srl"]);

function sigla(nombre: string) {
  const palabras = nombre
    .toLowerCase()
    .replace(/[.,&]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
  return ((palabras[0]?.[0] ?? "") + (palabras[1]?.[0] ?? "")).toUpperCase();
}

// Búsqueda insensible a acentos — sin esto "lanus" no encontraba "Textiles
// Lanús". Se normalizan ambos lados con NFD y se sacan los diacríticos.
// Tras NFD, los acentos quedan como marcas combinantes en el rango
// U+0300-U+036F. Se arma con String.fromCharCode (no un literal \u en el
// código fuente) para no correr riesgo de que el rango termine
// guardado/pegado como los caracteres combinantes reales.
const DIACRITICOS = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");

function normalizar(t: string) {
  // Sin esto, "lanus" no encontraba "Textiles Lanús".
  return t.toLowerCase().normalize("NFD").replace(DIACRITICOS, "");
}

type Confirmando =
  | { tipo: "servicio"; clienteId: string; servicio: string; subtipo: string }
  | { tipo: "cliente"; clienteId: string };

export function PanelGeneralClient({
  empresas,
  equipo,
  equipoModulos,
  serviciosActivos,
  sueldosSinLiquidadora,
  isAdmin,
}: {
  empresas: VistEmpresa[];
  equipo: EquipoMiembro[];
  equipoModulos: { equipo_id: string; modulo: string }[];
  serviciosActivos: Record<string, string[]>;
  sueldosSinLiquidadora: string[];
  isAdmin: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"activo" | "inactivo" | "">("activo");
  const [soloSinResponsable, setSoloSinResponsable] = useState(false);
  const [filtroResponsable, setFiltroResponsable] = useState("");
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<Confirmando | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  // Columna "Cliente" fija al scrollear lateralmente: se parte la tabla en
  // dos. La de la izquierda (solo Cliente) vive en su propio contenedor SIN
  // scroll horizontal, así nunca se desplaza de costado — no hay position:
  // sticky (a Chrome le hacía pintar mal restos de columnas ya scrolleadas
  // en esta tabla) ni transform por JS (iba un frame atrás del scroll y
  // "temblaba"). El scroll vertical de las dos mitades se sincroniza abajo.
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const frozenScrollRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const filaRef = useRef<HTMLTableRowElement>(null);
  const filaBodyRef = useRef<HTMLTableRowElement>(null);
  const [headerAltura, setHeaderAltura] = useState(0);
  const [filaAltura, setFilaAltura] = useState(0);
  // Alto de la barra de scroll horizontal de la mitad derecha (0 si no hay).
  // La izquierda no la tiene, así que sin compensar esto la derecha puede
  // scrollear ~15px más y las dos se despegan cerca del final.
  const [scrollbarComp, setScrollbarComp] = useState(0);

  // Sincronizar el scroll vertical entre las dos mitades. Se aplica directo
  // en el evento (sin rAF) para que queden lo más pegadas posible; el lock
  // evita el ida y vuelta infinito entre los dos onScroll.
  const syncLock = useRef(false);
  function syncVertical(desde: "body" | "frozen") {
    if (syncLock.current) {
      syncLock.current = false;
      return;
    }
    const src = desde === "body" ? bodyScrollRef.current : frozenScrollRef.current;
    const dst = desde === "body" ? frozenScrollRef.current : bodyScrollRef.current;
    if (!src || !dst || dst.scrollTop === src.scrollTop) return;
    syncLock.current = true;
    dst.scrollTop = src.scrollTop;
  }

  const sinLiqSet = useMemo(() => new Set(sueldosSinLiquidadora), [sueldosSinLiquidadora]);

  // Empresas activas con al menos un servicio activo sin responsable asignado
  // — misma condición que ya pinta "Sin responsable" en cada celda, pero
  // agregada para el filtro de un clic. No se guarda en ningún lado.
  const empresasSinResponsable = useMemo(() => {
    const set = new Set<string>();
    for (const empresa of empresas) {
      if (empresa.estado !== "activo") continue;
      const activos = serviciosActivos[empresa.id] ?? [];
      for (const key of activos) {
        const field = VISTA_FIELD[key];
        if (field && !empresa[field]) {
          set.add(empresa.id);
          break;
        }
      }
    }
    return set;
  }, [empresas, serviciosActivos]);

  // KPIs de cabecera — sobre todas las columnas de servicio. No piden datos
  // nuevos: salen de lo que ya llega por props.
  const kpi = useMemo(() => {
    const activas = empresas.filter((e) => e.estado === "activo");
    let servicios = 0;
    let sinResp = 0;
    for (const e of activas) {
      const activos = serviciosActivos[e.id] ?? [];
      for (const key of activos) {
        if (!TODAS_LAS_COLUMNAS.has(key)) continue;
        servicios++;
        const field = VISTA_FIELD[key];
        if (field && !e[field]) sinResp++;
      }
    }
    return { activas: activas.length, servicios, sinResp };
  }, [empresas, serviciosActivos]);

  const filtradas = useMemo(() => {
    const q = normalizar(search).trim();
    // El CUIT se guarda sin guiones — se le sacan los caracteres no
    // numéricos a lo tipeado para que busque igual con o sin guiones.
    const qCuit = q.replace(/\D/g, "");
    return empresas.filter((e) => {
      if (q && !normalizar(e.nombre).includes(q) && !(qCuit && e.cuit.includes(qCuit))) return false;
      if (filtroEstado && e.estado !== filtroEstado) return false;
      if (soloSinResponsable && !empresasSinResponsable.has(e.id)) return false;
      // "Cualquier área": alcanza con que la persona sea responsable de un
      // solo servicio (ej. solo IVA) para que la empresa aparezca — no hace
      // falta que lo sea en todas.
      if (filtroResponsable && !RESPONSABLE_FIELDS.some((f) => e[f] === filtroResponsable)) return false;
      return true;
    });
  }, [empresas, search, filtroEstado, soloSinResponsable, empresasSinResponsable, filtroResponsable]);

  const gruposVisibles = GRUPOS;
  const columnasVisibles = gruposVisibles.flatMap((g) => g.cols.map((c) => ({ ...c, grupo: g.key })));

  // Datos por fila que comparten las dos mitades de la tabla (Cliente a la
  // izquierda, el resto a la derecha) — así no se recalculan/desincronizan.
  const filasConEstilo = useMemo(
    () =>
      filtradas.map((empresa, ri) => ({
        empresa,
        activa: empresa.estado === "activo",
        zebra: ri % 2 === 1 ? "bg-paper-alt" : "bg-paper",
      })),
    [filtradas]
  );

  // Las dos mitades tienen que quedar alineadas fila a fila. El encabezado
  // de la derecha son dos filas (módulo + subcolumna); la izquierda lo
  // iguala con esa altura medida. Para las filas del cuerpo se mide la
  // altura natural de AMBOS lados (la primera fila de cada tabla) y se le
  // impone a las dos el techo redondeado hacia arriba — si se dejara que
  // cada lado use su altura natural, la diferencia sub-pixel entre uno y
  // otro se va sumando fila a fila y el scroll vertical se desfasa cada
  // vez más.
  const hayFilas = filtradas.length > 0;
  useLayoutEffect(() => {
    const th = theadRef.current;
    const medir = () => {
      if (th) setHeaderAltura(Math.ceil(th.getBoundingClientRect().height));
      const izq = filaRef.current?.getBoundingClientRect().height ?? 0;
      const der = filaBodyRef.current?.getBoundingClientRect().height ?? 0;
      const alto = Math.max(izq, der);
      if (alto) setFilaAltura(Math.ceil(alto));
      const b = bodyScrollRef.current;
      if (b) setScrollbarComp(b.offsetHeight - b.clientHeight);
    };
    medir();
    const ro = new ResizeObserver(medir);
    if (th) ro.observe(th);
    if (filaRef.current) ro.observe(filaRef.current);
    if (filaBodyRef.current) ro.observe(filaBodyRef.current);
    if (bodyScrollRef.current) ro.observe(bodyScrollRef.current);
    window.addEventListener("resize", medir);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [gruposVisibles.length, hayFilas]);

  function confirmar(c: Confirmando) {
    setActionError(null);
    if (
      confirmando &&
      confirmando.tipo === c.tipo &&
      confirmando.clienteId === c.clienteId &&
      (c.tipo === "cliente" ||
        (confirmando.tipo === "servicio" &&
          confirmando.servicio === c.servicio &&
          confirmando.subtipo === c.subtipo))
    ) {
      // Segunda pulsación: ejecutar
      startTransition(async () => {
        const result =
          c.tipo === "servicio"
            ? await darDeBajaServicio(c.clienteId, c.servicio, c.subtipo)
            : await darDeBajaCliente(c.clienteId);
        if (result?.error) setActionError(result.error);
        setConfirmando(null);
      });
    } else {
      setConfirmando(c);
    }
  }

  function esConfirmando(c: Confirmando) {
    if (!confirmando || confirmando.tipo !== c.tipo || confirmando.clienteId !== c.clienteId) return false;
    if (c.tipo === "servicio" && confirmando.tipo === "servicio") {
      return confirmando.servicio === c.servicio && confirmando.subtipo === c.subtipo;
    }
    return true;
  }

  function verSinAsignar() {
    setSoloSinResponsable(true);
    setFiltroEstado("activo");
    setSearch("");
  }

  return (
    <>
      <div className="flex flex-col h-full bg-appbg p-4 md:p-0 md:pl-7 md:pr-7 md:pb-6">
        {/* Encabezado */}
        <div className="flex items-end justify-between gap-6 md:gap-[30px] py-4 md:py-[30px] md:pt-[30px] md:px-0.5 md:pb-5 shrink-0 flex-wrap">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[.2em] uppercase text-ink-faint">
              Cartera del estudio
            </p>
            <h1 className="text-[26px] md:text-[33px] font-semibold tracking-[-.032em] leading-none text-ink mt-2.5">
              Panel General
            </h1>
          </div>

          <div className="flex items-stretch border border-line-input rounded-xl bg-paper overflow-hidden">
            <div className="px-4 md:px-5 py-[11px]">
              <p className="text-xl md:text-[23px] font-semibold tracking-[-.02em] leading-none text-ink tabular-nums">
                {kpi.activas}
              </p>
              <p className="text-[10.5px] font-medium tracking-[.1em] uppercase text-ink-faint mt-[5px]">Activas</p>
            </div>
            <div className="w-px bg-line-soft" />
            <div className="px-4 md:px-5 py-[11px]">
              <p className="text-xl md:text-[23px] font-semibold tracking-[-.02em] leading-none text-ink tabular-nums">
                {kpi.servicios}
              </p>
              <p className="text-[10.5px] font-medium tracking-[.1em] uppercase text-ink-faint mt-[5px]">Servicios</p>
            </div>
            <div className="w-px bg-line-soft" />
            {kpi.sinResp > 0 ? (
              <button
                onClick={verSinAsignar}
                title={`${kpi.sinResp} servicio${kpi.sinResp !== 1 ? "s" : ""} contratado${kpi.sinResp !== 1 ? "s" : ""} sin responsable asignado`}
                className="px-4 md:px-5 py-[11px] bg-alerta-bg text-left hover:brightness-[0.98] transition-[filter]"
              >
                <p className="text-xl md:text-[23px] font-semibold tracking-[-.02em] leading-none text-alerta-fg tabular-nums">
                  {kpi.sinResp}
                </p>
                <p className="text-[10.5px] font-medium tracking-[.1em] uppercase text-alerta-label mt-[5px]">
                  Sin asignar
                </p>
              </button>
            ) : (
              <div className="px-4 md:px-5 py-[11px]">
                <p className="text-xl md:text-[23px] font-semibold tracking-[-.02em] leading-none text-ink tabular-nums">
                  0
                </p>
                <p className="text-[10.5px] font-medium tracking-[.1em] uppercase text-ink-faint mt-[5px]">
                  Sin asignar
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 md:px-0.5 pb-4 shrink-0">
          <div className="relative w-full sm:w-[290px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente o CUIT…"
              className="w-full text-[12.5px] text-ink bg-paper border border-line-input rounded-[9px] pl-[34px] pr-3 py-[9px] outline-none transition-[border-color,box-shadow] duration-150 focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] placeholder:text-ink-faint"
            />
          </div>

          <div className="flex items-center gap-[3px] p-[3px] bg-[#E4E0D8] rounded-[9px]">
            {(
              [
                { v: "activo", label: "Activas" },
                { v: "inactivo", label: "Inactivas" },
                { v: "", label: "Todas" },
              ] as const
            ).map(({ v, label }) => (
              <button
                key={label}
                onClick={() => setFiltroEstado(v)}
                className={clsx(
                  "text-xs font-semibold px-3 py-1.5 rounded-[7px] transition-colors",
                  filtroEstado === v ? "bg-paper text-bordo shadow-[0_1px_2px_rgba(23,20,26,.12)]" : "text-ink-subtle hover:text-ink"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="hidden sm:block w-px h-[22px] bg-line-input mx-0.5" />

          <select
            value={filtroResponsable}
            onChange={(e) => setFiltroResponsable(e.target.value)}
            className="text-[12.5px] text-ink border border-line-input rounded-[9px] pl-3 pr-2 py-[9px] bg-paper outline-none focus:border-bordo"
          >
            <option value="">Cualquier responsable</option>
            {equipo.map((m) => (
              <option key={m.id} value={m.nombre}>{m.nombre}</option>
            ))}
          </select>

          {isAdmin && (
            <a
              href="/api/exportar/clientes"
              title="Exportar todos los clientes a Excel"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-subtle border border-line-input rounded-[9px] px-3 py-[9px] bg-paper hover:bg-paper-hover hover:text-ink transition-colors"
            >
              <Download size={13} />
              Exportar
            </a>
          )}

          {soloSinResponsable && (
            <button
              onClick={() => setSoloSinResponsable(false)}
              className="flex items-center gap-1.5 bg-alerta-bg text-alerta-fg text-xs font-semibold px-2.5 py-[7px] rounded-full hover:brightness-[0.98] transition-[filter]"
            >
              Sin asignar
              <X size={12} />
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setCreando(true)}
              className="ml-auto inline-flex items-center gap-2 bg-bordo text-white text-[12.5px] font-semibold px-4 py-2.5 rounded-[9px] hover:bg-bordo-light transition-colors"
            >
              <Plus size={14} />
              Nuevo cliente
            </button>
          )}
        </div>

        {actionError && (
          <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 shrink-0">
            {actionError}
          </div>
        )}

        {/* Mobile cards — el rediseño es de la tabla de escritorio; en
            celular se mantiene la lista simple existente. */}
        <div className="md:hidden flex-1 min-h-0 overflow-y-auto space-y-2">
          {filtradas.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-16 text-center">
              <p className="text-gray-400 text-sm">
                {search || filtroEstado !== "activo"
                  ? "No hay clientes que coincidan con los filtros"
                  : "No hay clientes cargados aún"}
              </p>
            </div>
          ) : (
            filtradas.map((empresa) => {
              const activos = serviciosActivos[empresa.id] ?? [];
              return (
                <div key={empresa.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-[14px] font-semibold text-gray-800">{empresa.nombre}</p>
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                        {empresa.cuit.replace(/(\d{2})(\d{8})(\d)/, "$1-$2-$3")}
                      </p>
                      {empresa.emails_contacto && empresa.emails_contacto.length > 0 && (
                        <p
                          className="text-[11px] text-gray-400 truncate"
                          title={empresa.emails_contacto.join("\n")}
                        >
                          {empresa.emails_contacto.join(", ")}
                        </p>
                      )}
                    </div>
                    <span className={clsx(
                      "shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                      empresa.estado === "activo" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                    )}>
                      {empresa.estado === "activo" ? "Activa" : "Inactiva"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {GRUPOS.flatMap((g) => g.cols.map((c) => ({ ...c, grupoLabel: g.label }))).map(({ key, label, grupoLabel }) => {
                      if (!activos.includes(key)) return null;
                      const field = VISTA_FIELD[key];
                      const nombre = empresa[field] as string | null;
                      const esSueldos = key === "sueldos:general";
                      const warning = esSueldos && sinLiqSet.has(empresa.id);
                      const etiqueta = label === "Responsable" ? grupoLabel : `${grupoLabel} — ${label}`;
                      return (
                        <div key={key} className="flex items-center gap-2 text-[12px] flex-wrap">
                          <span className="text-gray-400 min-w-[120px]">{etiqueta}:</span>
                          {warning ? (
                            <span className="flex items-center gap-1 text-amber-600">Falta asignar en Sueldos</span>
                          ) : nombre ? (
                            <span className="text-gray-700">{nombre}</span>
                          ) : (
                            <span className="text-gray-300">Sin responsable</span>
                          )}
                          {esSueldos && empresa.fecha_inicio_liquidacion && (
                            <span className="text-gray-300 text-[11px]">
                              (desde {new Date(empresa.fecha_inicio_liquidacion).toLocaleDateString("es-AR", { timeZone: "UTC" })})
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-50">
                      <button
                        onClick={() => setEditando(empresa.id)}
                        className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-bordo transition-colors"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                      <a
                        href={`/api/exportar/clientes?id=${empresa.id}`}
                        className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-bordo transition-colors"
                      >
                        <Download size={12} /> Exportar
                      </a>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Tabla desktop */}
        <div className="hidden md:flex flex-1 min-h-0 bg-paper border border-line-panel rounded-[14px] flex-col overflow-hidden">
          {filtradas.length > 0 && (
            <div className="shrink-0 border-b border-line-soft px-[26px] py-[11px] flex items-center justify-between gap-5 text-[11.5px]">
              <p className="text-ink-subtle">
                <span className="font-semibold text-ink tabular-nums">{filtradas.length}</span> de {empresas.length} clientes
              </p>
              <p className="text-ink-faint">
                Una raya “—” indica servicio no contratado · dar de baja un servicio no da de baja al cliente
              </p>
            </div>
          )}
          {filtradas.length === 0 ? (
            <div className="flex-1 min-h-0 py-[72px] px-6 text-center">
              <p className="font-archivo text-base font-semibold tracking-[-.015em] text-ink">Sin resultados</p>
              <p className="text-[12.5px] text-ink-faint mt-2">
                Probá con otro nombre, CUIT o filtro de estado.
              </p>
            </div>
          ) : (
            /* Tabla partida en dos: la columna "Cliente" vive en su propio
               contenedor a la izquierda SIN scroll horizontal (por eso nunca
               tiembla ni deja asomar contenido), y todo el resto scrollea de
               costado a la derecha. El scroll vertical se sincroniza entre
               las dos mitades (ver syncVertical). Reemplaza al viejo panel
               con transform, que iba un frame atrás del scroll. */
            <div className="flex-1 min-h-0 flex overflow-hidden">
              {/* ── Mitad izquierda: solo Cliente ── */}
              <div
                ref={frozenScrollRef}
                onScroll={() => syncVertical("frozen")}
                className="shrink-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <table className="w-[294px] border-collapse text-[12.5px] table-fixed">
                  <colgroup>
                    <col className="w-[294px]" />
                  </colgroup>
                  <thead className="bg-paper">
                    <tr>
                      <th
                        style={{ height: headerAltura || undefined }}
                        className="bg-paper align-bottom text-left pl-[26px] pr-4 pb-[9px] pt-[11px] text-[10px] font-semibold tracking-[.14em] uppercase text-ink-faint border-b border-line-rule border-r border-line-group box-border"
                      >
                        Cliente
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasConEstilo.map(({ empresa, activa, zebra }, ri) => {
                      const filaHover = hoverRow === empresa.id;
                      const rowBg = filaHover ? "bg-paper-hover" : zebra;
                      return (
                        <tr
                          key={empresa.id}
                          ref={ri === 0 ? filaRef : undefined}
                          style={{ height: filaAltura || undefined }}
                          onMouseEnter={() => setHoverRow(empresa.id)}
                          onMouseLeave={() => setHoverRow(null)}
                        >
                          <td className={clsx("pl-[26px] pr-4 py-[13px] border-b border-line-row border-r border-line-group align-middle whitespace-nowrap", rowBg)}>
                            <div className="flex items-center gap-[11px]">
                              <span
                                className={clsx(
                                  "w-[29px] h-[29px] rounded-[9px] shrink-0 flex items-center justify-center font-archivo text-[11.5px] font-semibold",
                                  activa ? "bg-bordo-tint2 text-bordo" : "bg-paper-alt text-ink-faint"
                                )}
                              >
                                {sigla(empresa.nombre)}
                              </span>
                              <div className="min-w-0">
                                <p className="text-[13px] font-medium tracking-[-.012em] text-ink truncate" title={empresa.nombre}>
                                  {empresa.nombre}
                                </p>
                                <p className="font-plex text-[10.5px] text-ink-faint mt-[3px]">
                                  {empresa.cuit.replace(/(\d{2})(\d{8})(\d)/, "$1-$2-$3")}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {/* Iguala el alto scrolleable con el de la derecha, que
                    pierde ~15px por su barra de scroll horizontal. */}
                {scrollbarComp > 0 && <div style={{ height: scrollbarComp }} aria-hidden />}
              </div>

              {/* ── Mitad derecha: todo lo demás (scroll horizontal + vertical) ── */}
              <div
                ref={bodyScrollRef}
                onScroll={() => syncVertical("body")}
                className="flex-1 min-w-0 overflow-auto pr-[26px] [scrollbar-gutter:stable]"
              >
                <table className="w-full min-w-[880px] border-collapse text-[12.5px] table-fixed">
                <colgroup>
                  {columnasVisibles.map((c) => (
                    <col key={c.key} className="w-[170px]" />
                  ))}
                  <col className="w-[116px]" />
                  {isAdmin && <col className="w-[190px]" />}
                </colgroup>
                <thead ref={theadRef} className="bg-paper">
                  {/* Fila 1: nombre de módulo. Los de una sola columna
                      (Sueldos/Contable/Monotributo) ocupan directamente las
                      dos filas — no tiene sentido repetir "Responsable"
                      abajo si no hay nada más que distinguir. Impuestos, con
                      3 subcolumnas, sí se abre en dos filas. */}
                  <tr>
                    {gruposVisibles.map((g, gi) => {
                      const unaSola = g.cols.length === 1;
                      if (unaSola) {
                        return (
                          <th
                            key={g.key}
                            rowSpan={2}
                            className={clsx(
                              "bg-paper align-bottom text-center px-3.5 pb-[9px] pt-[11px] border-b-2 border-bordo",
                              gi > 0 && "border-l border-line-group"
                            )}
                          >
                            <span className="font-archivo text-[11.5px] font-semibold tracking-[.1em] uppercase text-ink whitespace-nowrap">
                              {g.label}
                            </span>
                          </th>
                        );
                      }
                      return (
                        <th
                          key={g.key}
                          colSpan={g.cols.length}
                          className={clsx("bg-paper pt-[18px] pb-1.5", gi > 0 && "border-l border-line-group")}
                        >
                          <div className="border-b-2 border-bordo pb-[7px] px-3.5 flex items-center justify-center gap-2.5">
                            <span className="font-archivo text-[11.5px] font-semibold tracking-[.1em] uppercase text-ink whitespace-nowrap">
                              {g.label}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                    <th
                      rowSpan={2}
                      className="bg-paper align-bottom text-center px-3.5 pb-[9px] pt-[11px] text-[10px] font-semibold tracking-[.14em] uppercase text-ink-faint border-b border-line-rule border-l border-line-group"
                    >
                      Estado
                    </th>
                    {isAdmin && (
                      <th rowSpan={2} className="bg-paper border-b border-line-rule border-l border-line-group" />
                    )}
                  </tr>
                  {/* Fila 2: solo subcolumnas de los grupos con más de una
                      (hoy, únicamente Impuestos) — los de una sola columna
                      ya ocuparon su celda en la fila 1 con rowSpan=2. */}
                  <tr>
                    {gruposVisibles.flatMap((g, gi) =>
                      g.cols.length === 1
                        ? []
                        : g.cols.map((c, i) => (
                            <th
                              key={c.key}
                              className={clsx(
                                "bg-paper text-center px-3.5 pb-[9px] pt-[11px] text-[10px] font-medium tracking-[.1em] uppercase text-ink-faint border-b border-line-rule",
                                i === 0 && gi > 0 && "border-l border-line-group"
                              )}
                            >
                              {c.label}
                            </th>
                          ))
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filasConEstilo.map(({ empresa, activa, zebra }, ri) => {
                    const activos = serviciosActivos[empresa.id] ?? [];
                    const confirmBajaCliente: Confirmando = { tipo: "cliente", clienteId: empresa.id };
                    const pendienteBajaCliente = esConfirmando(confirmBajaCliente);
                    const filaHover = hoverRow === empresa.id;
                    const rowBg = filaHover ? "bg-paper-hover" : zebra;

                    return (
                      <tr
                        key={empresa.id}
                        ref={ri === 0 ? filaBodyRef : undefined}
                        style={{ height: filaAltura || undefined }}
                        onMouseEnter={() => setHoverRow(empresa.id)}
                        onMouseLeave={() => setHoverRow(null)}
                      >
                        {/* Celdas de servicio */}
                        {columnasVisibles.map((c, ci) => {
                          const [servicio, subtipo] = c.key.split(":");
                          const field = VISTA_FIELD[c.key];
                          const nombre = field ? (empresa[field] as string | null) : null;
                          const tieneServicio = activos.includes(c.key);
                          const esSueldos = c.key === "sueldos:general";
                          const warning = esSueldos && tieneServicio && sinLiqSet.has(empresa.id);
                          // Divisoria entre módulos. La primera columna de
                          // todas (Sueldos) no la lleva: ahí la línea la
                          // dibuja el borde derecho de la mitad "Cliente".
                          const primero = ci > 0 && gruposVisibles.some((g) => g.cols[0]?.key === c.key);
                          const confirmServicio: Confirmando = { tipo: "servicio", clienteId: empresa.id, servicio, subtipo };
                          const pendienteEste = esConfirmando(confirmServicio);

                          return (
                            <td
                              key={c.key}
                              onMouseEnter={() => setHoverRow(empresa.id)}
                              className={clsx(
                                "px-3.5 py-[13px] text-center align-middle border-b border-line-row whitespace-nowrap",
                                rowBg,
                                primero && "border-l border-line-group"
                              )}
                            >
                              {warning ? (
                                <span className="inline-flex items-center gap-[7px] text-xs font-medium text-alerta-text">
                                  <span className="w-[5px] h-[5px] rounded-full bg-alerta-dot shrink-0" />
                                  Sin asignar
                                </span>
                              ) : tieneServicio ? (
                                <span className="inline-flex items-center gap-2 group/cell">
                                  <span className="text-[12.5px] font-medium text-ink-cell">
                                    {nombre ?? <span className="text-ink-faint">Sin responsable</span>}
                                  </span>
                                  {isAdmin && activa && (
                                    pendienteEste ? (
                                      <span className="inline-flex items-center gap-1">
                                        <button
                                          onClick={() => confirmar(confirmServicio)}
                                          disabled={isPending}
                                          className="text-[10px] font-bold text-white bg-danger rounded-[6px] px-[7px] py-[3px] disabled:opacity-50"
                                        >
                                          Confirmar
                                        </button>
                                        <button
                                          onClick={() => setConfirmando(null)}
                                          className="text-[11px] text-ink-faint px-[3px] py-0.5"
                                        >
                                          ✕
                                        </button>
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => confirmar(confirmServicio)}
                                        title="Dar de baja este servicio"
                                        className="text-[11px] leading-none text-transparent group-hover/cell:text-dot hover:!text-danger hover:bg-red-50 rounded-[5px] p-[3px] transition-colors"
                                      >
                                        ✕
                                      </button>
                                    )
                                  )}
                                </span>
                              ) : (
                                <span className="inline-block w-3.5 h-px bg-line-dash align-middle" />
                              )}
                            </td>
                          );
                        })}

                        {/* Estado */}
                        <td className={clsx("px-3.5 py-[13px] text-center border-b border-line-row border-l border-line-group whitespace-nowrap", rowBg)}>
                          <span className={clsx("inline-flex items-center gap-[7px] text-[11.5px] font-medium", activa ? "text-activo" : "text-ink-subtle")}>
                            <span className={clsx("w-[5px] h-[5px] rounded-full shrink-0", activa ? "bg-activo-dot" : "bg-dot")} />
                            {activa ? "Activa" : "Inactiva"}
                          </span>
                        </td>

                        {/* Acciones */}
                        {isAdmin && (
                          <td className={clsx("px-3.5 py-[13px] text-center border-b border-line-row border-l border-line-group whitespace-nowrap group/acciones", rowBg)}>
                            <span className="inline-flex items-center gap-1">
                              <a
                                href={`/api/exportar/clientes?id=${empresa.id}`}
                                title="Exportar este cliente a Excel"
                                className="text-ink-faint hover:!text-bordo transition-colors p-[5px] rounded-[6px]"
                              >
                                <Download size={12} />
                              </a>
                              <button
                                onClick={() => setEditando(empresa.id)}
                                title="Editar"
                                className="text-ink-faint hover:!text-bordo transition-colors p-[5px] rounded-[6px]"
                              >
                                <Pencil size={12} />
                              </button>
                              {activa && (
                                pendienteBajaCliente ? (
                                  <span className="inline-flex items-center gap-[5px]">
                                    <button
                                      onClick={() => confirmar(confirmBajaCliente)}
                                      disabled={isPending}
                                      className="text-[10.5px] font-bold text-white bg-danger rounded-[7px] px-[9px] py-[5px] disabled:opacity-50"
                                    >
                                      Confirmar baja
                                    </button>
                                    <button
                                      onClick={() => setConfirmando(null)}
                                      className="text-[11px] text-ink-faint p-[3px]"
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => confirmar(confirmBajaCliente)}
                                    className="text-[11.5px] font-medium text-transparent group-hover/acciones:text-ink-subtle hover:!text-danger hover:bg-red-50 border border-transparent hover:!border-red-100 rounded-[7px] px-[9px] py-[5px] transition-colors whitespace-nowrap"
                                  >
                                    <Trash2 size={11} className="inline -mt-px mr-1" />
                                    Dar de baja
                                  </button>
                                )
                              )}
                            </span>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {creando && (
        <NuevoClienteModal
          equipo={equipo}
          equipoModulos={equipoModulos}
          onClose={() => setCreando(false)}
        />
      )}

      {editando && (
        <EditarClienteModal
          clienteId={editando}
          equipo={equipo}
          equipoModulos={equipoModulos}
          onClose={() => setEditando(null)}
        />
      )}
    </>
  );
}
