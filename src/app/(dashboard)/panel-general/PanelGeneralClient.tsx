"use client";

import { useState, useMemo, useTransition } from "react";
import { Search, Plus, AlertTriangle, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { EquipoMiembro, VistEmpresa } from "@/types";
import { NuevoClienteModal } from "./NuevoClienteModal";
import { darDeBajaServicio, darDeBajaCliente } from "./actions";

// Colores por área
const AREA_STYLE = {
  SUELDOS:  { header: "bg-bordo/10 text-bordo",          sub: "bg-bordo/5",       dot: "bg-bordo"        },
  IMPUESTOS: { header: "bg-blue-50 text-blue-700",        sub: "bg-blue-50/60",    dot: "bg-blue-500"     },
  CONTABLE:  { header: "bg-emerald-50 text-emerald-700",  sub: "bg-emerald-50/60", dot: "bg-emerald-500"  },
  MONOTRIBUTO: { header: "bg-amber-50 text-amber-700",    sub: "bg-amber-50/60",   dot: "bg-amber-500"    },
  LIBROS:    { header: "bg-violet-50 text-violet-700",    sub: "bg-violet-50/60",  dot: "bg-violet-500"   },
} as const;

// Columnas de servicio en orden de renderizado
const COLS = [
  { key: "sueldos:general",     area: "SUELDOS"    as const, areaSpan: 1, subLabel: "Responsable",  impuestos: false },
  { key: "impuestos:iva",       area: "IMPUESTOS"   as const, areaSpan: 3, subLabel: "IVA",           impuestos: true  },
  { key: "impuestos:iibb",      area: "IMPUESTOS"   as const, areaSpan: 0, subLabel: "IIBB",          impuestos: true  },
  { key: "impuestos:seh",       area: "IMPUESTOS"   as const, areaSpan: 0, subLabel: "Seg. e Hig.",   impuestos: true  },
  { key: "contable:general",    area: "CONTABLE"    as const, areaSpan: 1, subLabel: "Responsable",  impuestos: false },
  { key: "monotributo:general", area: "MONOTRIBUTO" as const, areaSpan: 1, subLabel: "Responsable",  impuestos: false },
  { key: "libros:general",      area: "LIBROS"      as const, areaSpan: 1, subLabel: "Responsable",  impuestos: false },
] as const;

const VISTA_FIELD: Record<string, keyof VistEmpresa> = {
  "sueldos:general":     "responsable_sueldos",
  "impuestos:iva":       "responsable_impuestos_iva",
  "impuestos:iibb":      "responsable_impuestos_iibb",
  "impuestos:seh":       "responsable_impuestos_seh",
  "contable:general":    "responsable_contable",
  "monotributo:general": "responsable_monotributo",
  "libros:general":      "responsable_libros",
};

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
  const [creando, setCreando] = useState(false);
  const [confirmando, setConfirmando] = useState<Confirmando | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const sinLiqSet = useMemo(() => new Set(sueldosSinLiquidadora), [sueldosSinLiquidadora]);

  // Empresas activas con al menos un servicio activo sin responsable asignado
  // (la misma condición que ya pinta "Sin responsable" en cada celda de la
  // tabla, pero agregada acá para avisar de entrada, sin tener que revisar
  // fila por fila). No se guarda en ningún lado — se recalcula siempre de los
  // datos actuales, así que desaparece solo apenas se reasigna la última.
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

  const filtradas = useMemo(() => {
    const q = search.toLowerCase().trim();
    return empresas.filter((e) => {
      if (q && !e.nombre.toLowerCase().includes(q) && !e.cuit.includes(q)) return false;
      if (filtroEstado && e.estado !== filtroEstado) return false;
      if (soloSinResponsable && !empresasSinResponsable.has(e.id)) return false;
      return true;
    });
  }, [empresas, search, filtroEstado, soloSinResponsable, empresasSinResponsable]);

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

  return (
    <>
      <div className="flex flex-col h-full p-4 md:p-8">
        {/* Header */}
        <div className="mb-6 md:mb-8 flex items-start justify-between shrink-0">
          <div>
            <p className="text-sm text-gray-400 font-medium uppercase tracking-wide">KMA Consultores</p>
            <h1 className="text-2xl font-semibold text-gray-900 mt-1">Panel General</h1>
            <div className="flex items-center gap-3 mt-2">
              {(Object.entries(AREA_STYLE) as [keyof typeof AREA_STYLE, typeof AREA_STYLE[keyof typeof AREA_STYLE]][]).map(([area, s]) => (
                <span key={area} className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  <span className={clsx("w-2 h-2 rounded-full shrink-0", s.dot)} />
                  {area.charAt(0) + area.slice(1).toLowerCase()}
                </span>
              ))}
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setCreando(true)}
              className="flex items-center gap-2 bg-bordo text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-bordo/90 transition-colors"
            >
              <Plus size={15} />
              Nueva empresa
            </button>
          )}
        </div>

        {/* Aviso de empresas sin responsable — solo aparece si hay alguna,
            desaparece solo apenas se reasignan todas. */}
        {empresasSinResponsable.size > 0 && (
          <div className="mb-4 md:mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-amber-800 text-sm">
              <AlertTriangle size={16} className="shrink-0" />
              <span>
                <strong>{empresasSinResponsable.size}</strong>{" "}
                empresa{empresasSinResponsable.size !== 1 ? "s" : ""} activa
                {empresasSinResponsable.size !== 1 ? "s" : ""} con algún servicio sin responsable asignado.
              </span>
            </div>
            <button
              onClick={() => {
                setSoloSinResponsable(true);
                setFiltroEstado("activo");
                setSearch("");
              }}
              className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline underline-offset-2 shrink-0"
            >
              Ver estas empresas
            </button>
          </div>
        )}

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-4 md:mb-6 px-4 md:px-5 py-3 md:py-4 shrink-0">
          <div className="flex flex-wrap items-end gap-3 md:gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-gray-500 font-medium block mb-1">Buscar empresa</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nombre o CUIT…"
                  className="w-full text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-bordo transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Estado</label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value as typeof filtroEstado)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo bg-white"
              >
                <option value="activo">Activas</option>
                <option value="inactivo">Inactivas</option>
                <option value="">Todas</option>
              </select>
            </div>
            {soloSinResponsable && (
              <button
                onClick={() => setSoloSinResponsable(false)}
                className="flex items-center gap-1.5 bg-amber-50 text-amber-700 text-xs font-medium px-2.5 py-2 rounded-lg hover:bg-amber-100 transition-colors"
              >
                Sin responsable
                <X size={12} />
              </button>
            )}
            <div className="text-sm text-gray-400 pb-1.5 ml-auto">
              {filtradas.length} empresa{filtradas.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {actionError && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 shrink-0">
            {actionError}
          </div>
        )}

        <div className="flex-1 min-h-0">
        {filtradas.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-6 py-16 text-center">
            <p className="text-gray-400 text-sm">
              {search || filtroEstado !== "activo"
                ? "No hay empresas que coincidan con los filtros"
                : "No hay empresas cargadas aún"}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtradas.map((empresa) => {
                const activos = serviciosActivos[empresa.id] ?? [];
                return (
                  <div key={empresa.id} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <p className="text-[14px] font-semibold text-gray-800">{empresa.nombre}</p>
                        <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                          {empresa.cuit.replace(/(\d{2})(\d{8})(\d)/, "$1-$2-$3")}
                        </p>
                      </div>
                      <span className={clsx(
                        "shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                        empresa.estado === "activo" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                      )}>
                        {empresa.estado === "activo" ? "Activa" : "Inactiva"}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {COLS.map(({ key, subLabel, area, areaSpan }) => {
                        if (!activos.includes(key)) return null;
                        const field = VISTA_FIELD[key];
                        const nombre = empresa[field] as string | null;
                        const esSueldos = key === "sueldos:general";
                        const warning = esSueldos && sinLiqSet.has(empresa.id);
                        const areaLabel = areaSpan > 0 ? area : null;
                        const label = areaLabel
                          ? `${areaLabel}${subLabel !== "Responsable" ? ` — ${subLabel}` : ""}`
                          : subLabel;
                        return (
                          <div key={key} className="flex items-center gap-2 text-[12px]">
                            <span className="text-gray-400 min-w-[120px]">{label}:</span>
                            {warning ? (
                              <span className="flex items-center gap-1 text-amber-600">
                                <AlertTriangle size={11} />
                                Falta asignar en Sueldos
                              </span>
                            ) : nombre ? (
                              <span className="text-gray-700">{nombre}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tabla desktop */}
            <div className="hidden md:flex md:flex-col h-full bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex-1 min-h-0 overflow-auto [scrollbar-gutter:stable]">
                <table className="w-full min-w-[900px] text-[13px] table-fixed">
                  {/* Ancho fijo por columna: sin esto, "Empresa" (y las demás)
                      se agrandan a medida que el navegador va leyendo los
                      nombres de las 293 filas, lo que se ve como un salto
                      horizontal del encabezado al cargar. */}
                  <colgroup>
                    <col className="w-[340px]" />
                    <col className="w-[170px]" />
                    <col className="w-[170px]" />
                    <col className="w-[170px]" />
                    <col className="w-[170px]" />
                    <col className="w-[170px]" />
                    <col className="w-[170px]" />
                    <col className="w-[170px]" />
                    <col className="w-[100px]" />
                    {isAdmin && <col className="w-[150px]" />}
                  </colgroup>
                  <thead className="sticky top-0 z-20 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 uppercase tracking-wide">
                    {/* Fila 1: nombre del área — las de un solo servicio ocupan
                        también la fila 2 (no tienen nada más que agregar debajo) */}
                    <tr>
                      <th rowSpan={2} className="sticky top-0 left-0 z-20 px-5 py-2.5 text-left font-medium align-bottom pb-3 bg-gray-50">
                        Empresa
                      </th>
                      {COLS.filter((c) => c.areaSpan > 0).map(({ key, area, areaSpan }) => {
                        const s = AREA_STYLE[area];
                        const soloUnaFila = area !== "IMPUESTOS";
                        return (
                          <th
                            key={key}
                            colSpan={areaSpan}
                            rowSpan={soloUnaFila ? 2 : 1}
                            className={clsx(
                              "px-3 text-center font-semibold text-[10px] tracking-widest",
                              soloUnaFila ? "align-middle py-2 border-b-2" : "pt-2.5 pb-1.5",
                              s.header,
                              area === "SUELDOS"   && "border-bordo/30",
                              area === "CONTABLE"   && "border-emerald-200",
                              area === "MONOTRIBUTO" && "border-amber-200",
                              area === "LIBROS"     && "border-violet-200",
                            )}
                          >
                            {area}
                          </th>
                        );
                      })}
                      <th rowSpan={2} className="px-4 py-2.5 text-center font-medium align-bottom pb-3 bg-gray-50">
                        Estado
                      </th>
                      {isAdmin && (
                        <th rowSpan={2} className="px-4 py-2.5 text-center font-medium align-bottom pb-3 bg-gray-50">
                          Acciones
                        </th>
                      )}
                    </tr>
                    {/* Fila 2: solo Impuestos, con sus 3 tipos */}
                    <tr>
                      {COLS.filter((c) => c.impuestos).map(({ key, subLabel, area }) => {
                        const s = AREA_STYLE[area];
                        return (
                          <th
                            key={key}
                            className={clsx(
                              "px-3 pb-2.5 pt-1.5 text-center font-semibold text-[10px] tracking-widest border-b-2 border-blue-200 text-blue-700",
                              s.sub
                            )}
                          >
                            {subLabel}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-50">
                    {filtradas.map((empresa) => {
                      const activos = serviciosActivos[empresa.id] ?? [];
                      const confirmBajaCliente: Confirmando = { tipo: "cliente", clienteId: empresa.id };
                      const pendienteBajaCliente = esConfirmando(confirmBajaCliente);

                      return (
                        <tr key={empresa.id} className="hover:bg-gray-50/60 transition-colors group">
                          {/* Empresa */}
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 px-5 py-3.5">
                            <p className="font-medium text-gray-900 truncate" title={empresa.nombre}>{empresa.nombre}</p>
                            <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                              {empresa.cuit.replace(/(\d{2})(\d{8})(\d)/, "$1-$2-$3")}
                            </p>
                          </td>

                          {/* Celdas de servicio */}
                          {COLS.map(({ key }) => {
                            const [servicio, subtipo] = key.split(":");
                            const field = VISTA_FIELD[key];
                            const nombre = empresa[field] as string | null;
                            const tieneServicio = activos.includes(key);
                            const esSueldos = key === "sueldos:general";
                            const warning = esSueldos && sinLiqSet.has(empresa.id);
                            const confirmServicio: Confirmando = {
                              tipo: "servicio",
                              clienteId: empresa.id,
                              servicio,
                              subtipo,
                            };
                            const pendienteEste = esConfirmando(confirmServicio);

                            return (
                              <td key={key} className="px-3 py-3.5 text-center">
                                {warning ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
                                    <AlertTriangle size={11} className="shrink-0" />
                                    <span className="truncate">Falta asignar en Sueldos</span>
                                  </span>
                                ) : tieneServicio ? (
                                  <div className="inline-flex items-center gap-1.5 group/cell max-w-full">
                                    <span className="text-gray-700 truncate" title={nombre ?? undefined}>
                                      {nombre ?? <span className="text-gray-300">Sin responsable</span>}
                                    </span>
                                    {isAdmin && empresa.estado === "activo" && (
                                      pendienteEste ? (
                                        <span className="inline-flex items-center gap-1">
                                          <button
                                            onClick={() => confirmar(confirmServicio)}
                                            disabled={isPending}
                                            className="text-[10px] font-semibold text-white bg-red-500 hover:bg-red-600 px-1.5 py-0.5 rounded transition-colors disabled:opacity-50"
                                          >
                                            Confirmar
                                          </button>
                                          <button
                                            onClick={() => setConfirmando(null)}
                                            className="text-gray-400 hover:text-gray-600 text-[10px] px-1"
                                          >
                                            ✕
                                          </button>
                                        </span>
                                      ) : (
                                        <button
                                          onClick={() => confirmar(confirmServicio)}
                                          title="Dar de baja este servicio"
                                          className="opacity-0 group-hover/cell:opacity-100 text-gray-300 hover:text-red-400 transition-all"
                                        >
                                          <Trash2 size={11} />
                                        </button>
                                      )
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-gray-200">—</span>
                                )}
                              </td>
                            );
                          })}

                          {/* Estado */}
                          <td className="px-4 py-3.5 text-center">
                            <span className={clsx(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                              empresa.estado === "activo" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                            )}>
                              {empresa.estado === "activo" ? "Activa" : "Inactiva"}
                            </span>
                          </td>

                          {/* Acciones */}
                          {isAdmin && (
                            <td className="px-4 py-3.5 text-center">
                              {empresa.estado === "activo" && (
                                pendienteBajaCliente ? (
                                  <span className="inline-flex items-center gap-1">
                                    <button
                                      onClick={() => confirmar(confirmBajaCliente)}
                                      disabled={isPending}
                                      className="text-[11px] font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded transition-colors disabled:opacity-50"
                                    >
                                      Confirmar baja
                                    </button>
                                    <button
                                      onClick={() => setConfirmando(null)}
                                      className="text-gray-400 hover:text-gray-600 text-[11px] px-1"
                                    >
                                      ✕
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => confirmar(confirmBajaCliente)}
                                    className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors whitespace-nowrap"
                                  >
                                    <Trash2 size={11} />
                                    Dar de baja
                                  </button>
                                )
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
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
    </>
  );
}
