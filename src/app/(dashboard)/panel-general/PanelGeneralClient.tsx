"use client";

import { useMemo, useState, useTransition } from "react";
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
  const [ocultos, setOcultos] = useState<Record<string, boolean>>({});
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [hoverGrupo, setHoverGrupo] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<Confirmando | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

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

  // KPIs de cabecera — sobre Sueldos/Impuestos/Contable siempre, no cambian
  // si se ocultan columnas con los chips (eso es solo un filtro visual). No
  // piden datos nuevos: salen de lo que ya llega por props.
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

  const gruposVisibles = GRUPOS.filter((g) => !ocultos[g.key]);
  const columnasVisibles = gruposVisibles.flatMap((g) => g.cols.map((c) => ({ ...c, grupo: g.key })));

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

  function toggleGrupo(key: string) {
    setOcultos((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }

  function verSinAsignar() {
    setSoloSinResponsable(true);
    setFiltroEstado("activo");
    setSearch("");
  }

  return (
    <>
      <div className="flex flex-col h-full bg-appbg p-4 md:p-0 md:pl-0 md:pr-7 md:pb-6">
        {/* Encabezado */}
        <div className="flex items-end justify-between gap-6 md:gap-[30px] py-4 md:py-[30px] md:pt-[30px] md:px-0.5 md:pb-5 shrink-0 flex-wrap">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[.2em] uppercase text-ink-faint">
              Cartera del estudio
            </p>
            <h1 className="font-archivo text-[26px] md:text-[33px] font-semibold tracking-[-.032em] leading-none text-ink mt-2.5">
              Panel General
            </h1>
          </div>

          <div className="flex items-stretch border border-line-input rounded-xl bg-paper overflow-hidden">
            <div className="px-4 md:px-5 py-[11px]">
              <p className="font-archivo text-xl md:text-[23px] font-semibold tracking-[-.02em] leading-none text-ink tabular-nums">
                {kpi.activas}
              </p>
              <p className="text-[10.5px] font-medium tracking-[.1em] uppercase text-ink-faint mt-[5px]">Activas</p>
            </div>
            <div className="w-px bg-line-soft" />
            <div className="px-4 md:px-5 py-[11px]">
              <p className="font-archivo text-xl md:text-[23px] font-semibold tracking-[-.02em] leading-none text-ink tabular-nums">
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
                <p className="font-archivo text-xl md:text-[23px] font-semibold tracking-[-.02em] leading-none text-alerta-fg tabular-nums">
                  {kpi.sinResp}
                </p>
                <p className="text-[10.5px] font-medium tracking-[.1em] uppercase text-alerta-label mt-[5px]">
                  Sin asignar
                </p>
              </button>
            ) : (
              <div className="px-4 md:px-5 py-[11px]">
                <p className="font-archivo text-xl md:text-[23px] font-semibold tracking-[-.02em] leading-none text-ink tabular-nums">
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
              placeholder="Buscar empresa o CUIT…"
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

          {soloSinResponsable && (
            <button
              onClick={() => setSoloSinResponsable(false)}
              className="flex items-center gap-1.5 bg-alerta-bg text-alerta-fg text-xs font-semibold px-2.5 py-[7px] rounded-full hover:brightness-[0.98] transition-[filter]"
            >
              Sin asignar
              <X size={12} />
            </button>
          )}

          <div className="hidden sm:block w-px h-[22px] bg-line-input mx-0.5" />

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-faint mr-0.5">
              Módulos
            </span>
            {GRUPOS.map((g) => {
              const on = !ocultos[g.key];
              return (
                <button
                  key={g.key}
                  onClick={() => toggleGrupo(g.key)}
                  className={clsx(
                    "text-xs font-semibold px-[11px] py-1.5 rounded-full border transition-colors",
                    on ? "bg-bordo-tint text-bordo border-bordo-border" : "bg-transparent text-ink-faint border-line-input"
                  )}
                >
                  {g.label}
                </button>
              );
            })}
          </div>

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

          {isAdmin && (
            <button
              onClick={() => setCreando(true)}
              className="ml-auto inline-flex items-center gap-2 bg-bordo text-white text-[12.5px] font-semibold px-4 py-2.5 rounded-[9px] hover:bg-bordo-light transition-colors"
            >
              <Plus size={14} />
              Nueva empresa
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
                  ? "No hay empresas que coincidan con los filtros"
                  : "No hay empresas cargadas aún"}
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
          <div className="relative flex-1 min-h-0 overflow-auto px-[26px] pb-2 [scrollbar-gutter:stable]">
            {filtradas.length === 0 ? (
              <div className="py-[72px] px-6 text-center">
                <p className="font-archivo text-base font-semibold tracking-[-.015em] text-ink">Sin resultados</p>
                <p className="text-[12.5px] text-ink-faint mt-2">
                  Probá con otro nombre, CUIT o filtro de estado.
                </p>
              </div>
            ) : (
              <>
              {/* Encabezado "Empresa" pegado a ambos ejes a la vez: un <th>
                  sticky en top Y left al mismo tiempo no repinta bien el
                  fondo en Chrome sobre celdas que scrollean por detrás (bug
                  del navegador, no es un <th> real, así que lo esquiva). El
                  <div> exterior no ocupa espacio (w-0 h-0) y solo ancla la
                  esquina superior izquierda visible de la tabla; adentro, un
                  <div> absoluto pinta el mismo texto/fondo que ya muestra el
                  <th> real de abajo (que sigue ahí sin tocarse). */}
              <div className="sticky top-0 left-0 z-[7] w-0 h-0 overflow-visible pointer-events-none">
                <div className="absolute top-0 left-0 w-[268px] bg-paper">
                  <div className="h-[50px]" />
                  <div className="pr-4 pb-[9px] pt-[11px] text-[10px] font-semibold tracking-[.14em] uppercase text-ink-faint border-b border-line-rule">
                    Empresa
                  </div>
                </div>
              </div>
              <table className="w-full min-w-[1140px] border-collapse text-[12.5px] table-fixed">
                <colgroup>
                  <col className="w-[268px]" />
                  {columnasVisibles.map((c) => (
                    <col key={c.key} className="w-[170px]" />
                  ))}
                  <col className="w-[116px]" />
                  {isAdmin && <col className="w-[190px]" />}
                </colgroup>
                <thead>
                  {/* Fila 1: nombre de módulo, con el filete bordó de 2px que
                      "abraza" exactamente el ancho de sus columnas. */}
                  <tr>
                    {/* Solo sticky arriba, no también a la izquierda: probado
                        en vivo con ~480 filas reales, un <th> sticky en los
                        dos ejes a la vez no repinta bien en Chrome sobre
                        celdas que scrollean por detrás (bug del navegador,
                        no se encontró una forma limpia de evitarlo). El td
                        del cuerpo sí sigue fijo a la izquierda sin problema
                        — se pierde ver la palabra "Empresa" en el título
                        mientras estás scrolleado del todo a la derecha,
                        nada más. */}
                    <th className="sticky top-0 z-[6] bg-paper pt-[18px] pb-1.5 w-[268px]" />
                    {gruposVisibles.map((g) => (
                      <th
                        key={g.key}
                        colSpan={g.cols.length}
                        className="sticky top-0 z-[5] bg-paper pt-[18px] pb-1.5"
                      >
                        <div className="border-b-2 border-bordo pb-[7px] px-3.5 flex items-center gap-2.5">
                          <span className="sticky left-[269px] font-archivo text-[11.5px] font-semibold tracking-[.1em] uppercase text-ink whitespace-nowrap bg-paper pr-2.5">
                            {g.label}
                          </span>
                        </div>
                      </th>
                    ))}
                    <th colSpan={isAdmin ? 2 : 1} className="sticky top-0 z-[5] bg-paper pt-[18px] pb-1.5" />
                  </tr>
                  {/* Fila 2: nombre de columna */}
                  <tr>
                    <th className="sticky top-[50px] z-[6] bg-paper text-left pr-4 pb-[9px] pt-[11px] text-[10px] font-semibold tracking-[.14em] uppercase text-ink-faint border-b border-line-rule w-[268px]">
                      Empresa
                    </th>
                    {columnasVisibles.map((c, i) => {
                      const primero = gruposVisibles.some((g) => g.cols[0]?.key === c.key);
                      void i;
                      return (
                        <th
                          key={c.key}
                          className={clsx(
                            "sticky top-[50px] z-[5] bg-paper text-center px-3.5 pb-[9px] pt-[11px] text-[10px] font-medium tracking-[.1em] uppercase text-ink-faint border-b border-line-rule",
                            primero && "border-l border-line-group"
                          )}
                        >
                          {c.label}
                        </th>
                      );
                    })}
                    <th className="sticky top-[50px] z-[5] bg-paper text-center px-3.5 pb-[9px] pt-[11px] text-[10px] font-semibold tracking-[.14em] uppercase text-ink-faint border-b border-line-rule border-l border-line-group">
                      Estado
                    </th>
                    {isAdmin && (
                      <th className="sticky top-[50px] z-[5] bg-paper pb-[9px] pt-[11px] border-b border-line-rule border-l border-line-group" />
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filtradas.map((empresa, ri) => {
                    const activos = serviciosActivos[empresa.id] ?? [];
                    const confirmBajaCliente: Confirmando = { tipo: "cliente", clienteId: empresa.id };
                    const pendienteBajaCliente = esConfirmando(confirmBajaCliente);
                    const activa = empresa.estado === "activo";
                    const filaHover = hoverRow === empresa.id;
                    const zebra = ri % 2 === 1 ? "bg-paper-alt" : "bg-paper";
                    const rowBg = filaHover ? "bg-paper-hover" : zebra;

                    return (
                      <tr
                        key={empresa.id}
                        onMouseEnter={() => setHoverRow(empresa.id)}
                        onMouseLeave={() => {
                          setHoverRow(null);
                          setHoverGrupo(null);
                        }}
                      >
                        {/* Empresa */}
                        <td className={clsx("sticky left-0 z-[2] py-[13px] pr-4 border-b border-line-row whitespace-nowrap w-[268px]", rowBg)}>
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

                        {/* Celdas de servicio */}
                        {columnasVisibles.map((c) => {
                          const [servicio, subtipo] = c.key.split(":");
                          const field = VISTA_FIELD[c.key];
                          const nombre = field ? (empresa[field] as string | null) : null;
                          const tieneServicio = activos.includes(c.key);
                          const esSueldos = c.key === "sueldos:general";
                          const warning = esSueldos && tieneServicio && sinLiqSet.has(empresa.id);
                          const primero = gruposVisibles.some((g) => g.cols[0]?.key === c.key);
                          const confirmServicio: Confirmando = { tipo: "servicio", clienteId: empresa.id, servicio, subtipo };
                          const pendienteEste = esConfirmando(confirmServicio);
                          const grupoTinte = !filaHover && hoverGrupo === c.grupo ? "bg-paper-group" : rowBg;

                          return (
                            <td
                              key={c.key}
                              onMouseEnter={() => {
                                setHoverRow(empresa.id);
                                setHoverGrupo(c.grupo);
                              }}
                              className={clsx(
                                "px-3.5 py-[13px] text-center align-middle border-b border-line-row whitespace-nowrap",
                                grupoTinte,
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
                                title="Exportar esta empresa a Excel"
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
              </>
            )}
          </div>

          {filtradas.length > 0 && (
            <div className="shrink-0 border-t border-line-soft px-[26px] py-[11px] flex items-center justify-between gap-5 text-[11.5px]">
              <p className="text-ink-subtle">
                <span className="font-semibold text-ink tabular-nums">{filtradas.length}</span> de {empresas.length} empresas
              </p>
              <p className="text-ink-faint">
                Una raya “—” indica servicio no contratado · dar de baja un servicio no da de baja al cliente
              </p>
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
