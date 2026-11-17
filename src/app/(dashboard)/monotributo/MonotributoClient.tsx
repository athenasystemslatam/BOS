"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, History, X } from "lucide-react";
import clsx from "clsx";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { AsignacionServicioModal } from "@/components/AsignacionServicioModal";
import { EquipoModuloPanel, EquipoModuloBoton } from "@/components/EquipoModuloPanel";
import { ClavesModuloPopover } from "@/components/ClavesModuloPopover";
import { FichaClienteBoton } from "@/components/FichaClienteBoton";
import { guardar, useAvisoErrorGuardado } from "@/components/AvisoErrorGuardado";
import { useDeshacer } from "@/components/DeshacerAviso";
import { getFichaCliente } from "@/app/(dashboard)/panel-general/actions";
import type { ClaveAcceso } from "@/types";
import { upsertMonotributoTarea, type CambiosTarea } from "./actions";
import {
  ESTADOS_MES,
  ESTADOS_SIN_GESTIONAR,
  ESTADO_MES_LABEL,
  FORMA_PAGO_LABEL,
  MEDIO_LABEL,
  fmtFechaHoraAR,
  hoyArgentina,
  type EstadoMes,
  type FormaPago,
  type Medio,
} from "@/lib/monotributo";

const ACCENT_MONOTRIBUTO = { dot: "bg-amber-500", bg: "bg-amber-50", text: "text-amber-700" };

const CATEGORIAS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];

const ESTILO_ESTADO: Record<EstadoMes, string> = {
  pendiente: "bg-gray-100 text-gray-600",
  vep_generado: "bg-sky-50 text-sky-700",
  en_borrador: "bg-indigo-50 text-indigo-700",
  enviado: "bg-blue-50 text-blue-700",
  avisado: "bg-violet-50 text-violet-700",
  pagado: "bg-emerald-50 text-emerald-700",
  no_pago: "bg-red-50 text-red-700",
};

const DEUDA_LABEL = { sin_verificar: "Sin verificar", no: "No", si: "Sí" } as const;
const INTIMACION_LABEL = { no: "No", fijarse: "Fijarse", avisado: "Avisado", si: "Sí", pago: "Pagó" } as const;
type DeudaEstado = keyof typeof DEUDA_LABEL;
type IntimacionEstado = keyof typeof INTIMACION_LABEL;

type Tarea = {
  cliente_id: string;
  anio: number;
  mes: number;
  cuota_estado: EstadoMes;
  cuota_fecha: string | null;
  estado_cambiado_en: string | null;
  estado_cambiado_por: string | null;
  origen: "manual" | "importado" | "automatico";
  recategorizacion: "no_corresponde" | "pendiente" | "realizada";
  categoria: string | null;
  deuda_estado: DeudaEstado;
  deuda_periodos: string | null;
  deuda_texto_original: string | null;
  deuda_nota: string | null;
  deuda_monto: number | null;
  deuda_aviso: boolean;
  deuda_aviso_fecha: string | null;
  deuda_resuelta: boolean;
  deuda_resuelta_fecha: string | null;
  intimacion_estado: IntimacionEstado | null;
  intimacion_fecha: string | null;
  observaciones: string | null;
};

export type FichaResumen = {
  forma_pago: FormaPago | null;
  medio: Medio | null;
  avisa: boolean;
  envia_vep: boolean;
  destinatario: string | null;
};

type Servicio = {
  cliente_id: string;
  responsable_id: string | null;
  responsable_nombre: string | null;
  ficha: FichaResumen | null;
  clientes: { id: string; nombre: string; cuit: string; tipo_contribuyente: string; claves_acceso: ClaveAcceso[] | null };
};

/** Meses del selector: el próximo y los 13 anteriores al mes de trabajo. */
function generarPeriodos(mesActual: number, anioActual: number) {
  const result = [];
  let m = mesActual + 1;
  let a = anioActual;
  if (m > 12) { m = 1; a++; }
  for (let i = 0; i < 15; i++) {
    result.push({ mes: m, anio: a });
    m--;
    if (m === 0) { m = 12; a--; }
  }
  return result;
}

function fmtFecha(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function textoEnvio(f: FichaResumen | null) {
  if (!f) return null;
  if (f.envia_vep && f.avisa) return "Avisar y enviar";
  if (f.envia_vep) return "Enviar";
  if (f.avisa) return "Avisar";
  return null;
}

export function MonotributoClient({
  servicios,
  tareas: initialTareas,
  equipoMonotributo,
  mes,
  anio,
  isAdmin,
  puedeEditar,
  creadoPor,
  revisiones,
  totalARevisar,
  totalAlertas,
  nombres,
  yoId,
  esRecategorizacion,
  avisoCalendario,
}: {
  servicios: Servicio[];
  tareas: Tarea[];
  equipoMonotributo: { id: string; nombre: string }[];
  mes: number;
  anio: number;
  isAdmin: boolean;
  puedeEditar: boolean;
  creadoPor: string | null;
  revisiones: Record<string, { rojo: number; amarillo: number }>;
  totalARevisar: number;
  totalAlertas: number | null;
  nombres: Record<string, string>;
  yoId: string | null;
  /** El mes cae en una ventana de recategorización del calendario ARCA. */
  esRecategorizacion: boolean;
  /** Solo para administradores: falta cargar el calendario ARCA. */
  avisoCalendario: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { avisar, aviso } = useAvisoErrorGuardado();
  const { ofrecer, aviso: avisoDeshacer } = useDeshacer();
  // Al entrar: "Mis clientes" para quien tiene clientes; los administradores ven todos.
  const [filterResp, setFilterResp] = useState(() =>
    !isAdmin && yoId && servicios.some((s) => s.responsable_id === yoId) ? "__mios__" : ""
  );
  const [filterEstado, setFilterEstado] = useState<"" | EstadoMes | "sin_gestionar">("");
  const [soloARevisar, setSoloARevisar] = useState(false);
  const [soloConDeuda, setSoloConDeuda] = useState(false);
  const [reasignando, setReasignando] = useState<Servicio | null>(null);
  const [editandoDeuda, setEditandoDeuda] = useState<Servicio | null>(null);
  const [mostrarEquipo, setMostrarEquipo] = useState(false);


  const vacia = (clienteId: string): Tarea => ({
    cliente_id: clienteId,
    anio,
    mes,
    cuota_estado: "pendiente",
    cuota_fecha: null,
    estado_cambiado_en: null,
    estado_cambiado_por: null,
    origen: "manual",
    recategorizacion: esRecategorizacion ? "pendiente" : "no_corresponde",
    categoria: null,
    deuda_estado: "sin_verificar",
    deuda_periodos: null,
    deuda_texto_original: null,
    deuda_nota: null,
    deuda_monto: null,
    deuda_aviso: false,
    deuda_aviso_fecha: null,
    deuda_resuelta: false,
    deuda_resuelta_fecha: null,
    intimacion_estado: null,
    intimacion_fecha: null,
    observaciones: null,
  });

  const [tareasMap, setTareasMap] = useState<Map<string, Tarea>>(() => {
    const m = new Map<string, Tarea>();
    for (const t of initialTareas) m.set(t.cliente_id, t);
    return m;
  });

  function getTarea(clienteId: string): Tarea {
    return tareasMap.get(clienteId) ?? vacia(clienteId);
  }

  function patchTarea(clienteId: string, patch: Partial<Tarea>) {
    setTareasMap((prev) => {
      const next = new Map(prev);
      next.set(clienteId, { ...(prev.get(clienteId) ?? vacia(clienteId)), ...patch });
      return next;
    });
  }

  /** Guarda y, si falla, vuelve la fila a como estaba y avisa. */
  function guardarCambio(clienteId: string, cambios: CambiosTarea, patchLocal: Partial<Tarea> = cambios as Partial<Tarea>) {
    const antes = tareasMap.get(clienteId);
    patchTarea(clienteId, patchLocal);
    const volverAtras = () =>
      setTareasMap((prev) => {
        const next = new Map(prev);
        if (antes) next.set(clienteId, antes); else next.delete(clienteId);
        return next;
      });
    startTransition(async () => {
      let historialIds: string[] | undefined;
      const error = await guardar(async () => {
        const r = await upsertMonotributoTarea(clienteId, anio, mes, cambios);
        if (r && "historialIds" in r) historialIds = r.historialIds;
        return r;
      });
      if (error) {
        avisar(error);
        volverAtras();
        return;
      }
      // Aviso "Deshacer" unos segundos: revierte en la base (queda en el historial) y en pantalla.
      ofrecer(historialIds, "Cambio guardado", volverAtras);
    });
  }

  function cambiarEstado(clienteId: string, estado: EstadoMes) {
    const t = getTarea(clienteId);
    if (t.cuota_estado === estado) return;
    const cambios: CambiosTarea = { cuota_estado: estado };
    if (estado === "pagado" && !t.cuota_fecha) cambios.cuota_fecha = hoyArgentina();
    guardarCambio(clienteId, cambios, { ...cambios, estado_cambiado_en: new Date().toISOString(), estado_cambiado_por: creadoPor } as Partial<Tarea>);
  }

  function navigatePeriod(newMes: number, newAnio: number) {
    router.push(`/monotributo?mes=${newMes}&anio=${newAnio}`);
  }

  const periodos = useMemo(() => generarPeriodos(mes, anio), [mes, anio]);

  const responsables = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const s of servicios) {
      if (s.responsable_nombre && !seen.has(s.responsable_nombre)) {
        seen.add(s.responsable_nombre);
        result.push(s.responsable_nombre);
      }
    }
    return result.sort();
  }, [servicios]);

  // Cantidad de clientes a cargo de cada persona, para el panel de equipo
  const conteosResp = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of servicios) {
      if (!s.responsable_nombre) continue;
      m[s.responsable_nombre] = (m[s.responsable_nombre] ?? 0) + 1;
    }
    return m;
  }, [servicios]);

  const filas = useMemo(() => {
    let list = servicios;
    if (filterResp === "__mios__") list = list.filter((s) => s.responsable_id === yoId);
    else if (filterResp === "__sin__") list = list.filter((s) => !s.responsable_nombre);
    else if (filterResp) list = list.filter((s) => s.responsable_nombre === filterResp);
    if (soloARevisar) list = list.filter((s) => !!revisiones[s.cliente_id]);
    if (soloConDeuda) list = list.filter((s) => { const t = getTarea(s.cliente_id); return t.deuda_estado === "si" && !t.deuda_resuelta; });
    if (filterEstado === "sin_gestionar") list = list.filter((s) => ESTADOS_SIN_GESTIONAR.includes(getTarea(s.cliente_id).cuota_estado));
    else if (filterEstado) list = list.filter((s) => getTarea(s.cliente_id).cuota_estado === filterEstado);
    return [...list].sort((a, b) => (a.clientes?.nombre ?? "").localeCompare(b.clientes?.nombre ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicios, filterResp, filterEstado, soloARevisar, soloConDeuda, revisiones, tareasMap]);

  const stats = useMemo(() => {
    const porEstado = Object.fromEntries(ESTADOS_MES.map((e) => [e, 0])) as Record<EstadoMes, number>;
    let conDeuda = 0, recategorizadas = 0;
    for (const s of servicios) {
      const t = getTarea(s.cliente_id);
      porEstado[t.cuota_estado]++;
      if (t.deuda_estado === "si" && !t.deuda_resuelta) conDeuda++;
      if (t.recategorizacion === "realizada") recategorizadas++;
    }
    return { total: servicios.length, porEstado, conDeuda, recategorizadas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicios, tareasMap]);

  const hayFiltro = !!(filterResp || filterEstado || soloARevisar || soloConDeuda);

  return (
    <>
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 rounded-full bg-amber-500" />
            <div>
              <h1 className="text-[17px] font-semibold text-gray-900">Monotributo</h1>
              <p className="text-[12px] text-gray-400 mt-0.5">Seguimiento mensual</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/monotributo/revisar"
              className={clsx(
                "text-xs px-3 py-2 rounded-lg border font-medium transition-colors",
                totalARevisar > 0 ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
              )}
            >
              A revisar ({totalARevisar})
            </Link>
            {totalAlertas !== null && (
              <Link
                href={`/monotributo/alertas?mes=${mes}&anio=${anio}`}
                className={clsx(
                  "text-xs px-3 py-2 rounded-lg border font-medium transition-colors",
                  totalAlertas > 0 ? "bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100" : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
                )}
              >
                Alertas ({totalAlertas})
              </Link>
            )}
            <EquipoModuloBoton cantidad={equipoMonotributo.length} accent={ACCENT_MONOTRIBUTO} onClick={() => setMostrarEquipo(true)} />
            <div className="relative">
              <select
                value={`${mes}-${anio}`}
                onChange={(e) => {
                  const [m, a] = e.target.value.split("-").map(Number);
                  navigatePeriod(m, a);
                }}
                className="appearance-none text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-amber-400 cursor-pointer"
              >
                {periodos.map(({ mes: m, anio: a }) => (
                  <option key={`${m}-${a}`} value={`${m}-${a}`}>{MESES_NOMBRES[m]} {a}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {avisoCalendario && (
        <Link href="/monotributo/calendario" className="block text-[12.5px] bg-amber-50 border-b border-amber-200 text-amber-800 px-6 py-2 hover:bg-amber-100">
          {avisoCalendario} Cargarlo →
        </Link>
      )}

      {/* Stats + Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-x-6 gap-y-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
          {ESTADOS_MES.map((e) => (
            <button
              key={e}
              onClick={() => setFilterEstado((f) => (f === e ? "" : e))}
              className={clsx(
                "rounded-full px-2 py-0.5 font-medium border transition-colors",
                ESTILO_ESTADO[e],
                filterEstado === e ? "border-gray-400" : "border-transparent",
                stats.porEstado[e] === 0 && "opacity-40"
              )}
            >
              {ESTADO_MES_LABEL[e]} {stats.porEstado[e]}
            </button>
          ))}
          <span className="text-gray-300 mx-1">·</span>
          <span className="text-gray-500">{stats.total} clientes</span>
          {stats.conDeuda > 0 && (
            <span className="bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5 font-semibold">{stats.conDeuda} con deuda</span>
          )}
          {esRecategorizacion && (
            <span className="bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-2 py-0.5 font-medium">
              Mes de recategorización · {stats.recategorizadas}/{stats.total}
            </span>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <select
              value={filterResp}
              onChange={(e) => setFilterResp(e.target.value)}
              className="appearance-none text-xs text-gray-600 bg-white border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:border-amber-400 cursor-pointer"
            >
              <option value="">Todos los responsables</option>
              {yoId && <option value="__mios__">Mis clientes</option>}
              {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value="__sin__">Sin responsable</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <FiltroBoton activo={filterEstado === "sin_gestionar"} onClick={() => setFilterEstado((f) => (f === "sin_gestionar" ? "" : "sin_gestionar"))} color="amber">
            Sin gestionar
          </FiltroBoton>
          <FiltroBoton activo={soloConDeuda} onClick={() => setSoloConDeuda((v) => !v)} color="red">Con deuda</FiltroBoton>
          <FiltroBoton activo={soloARevisar} onClick={() => setSoloARevisar((v) => !v)} color="red">Solo a revisar</FiltroBoton>
        </div>
      </div>

      {/* Tabla: una sola caja con scroll en los dos sentidos, así la barra horizontal queda siempre al pie de la pantalla */}
      <div className="flex-1 min-h-0 overflow-auto" style={{ overflowX: "scroll" }}>
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="sticky top-0 bg-gray-50 z-20">
            <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
              <th className="sticky left-0 z-30 bg-gray-50 px-6 py-2.5 min-w-[280px]">Cliente</th>
              <th className="px-3 py-2.5">Responsable</th>
              <th className="px-3 py-2.5">Pago y envío</th>
              <th className="px-3 py-2.5">Estado del mes</th>
              <th className="px-3 py-2.5">Deuda</th>
              <th className="px-3 py-2.5">Intimación</th>
              <th className="px-3 py-2.5">Categ.</th>
              {esRecategorizacion && <th className="px-3 py-2.5">Recategorización</th>}
              <th className="px-3 py-2.5">Observaciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {filas.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center text-gray-400 text-sm py-16">
                  {hayFiltro ? "Sin resultados para el filtro aplicado" : "No hay clientes con servicio de monotributo"}
                </td>
              </tr>
            )}
            {filas.map((s) => {
              const t = getTarea(s.cliente_id);
              const f = s.ficha;
              const envio = textoEnvio(f);
              const conDeuda = t.deuda_estado === "si" && !t.deuda_resuelta;
              const cambio = t.estado_cambiado_en
                ? `Último cambio: ${fmtFechaHoraAR(t.estado_cambiado_en)}${t.estado_cambiado_por && nombres[t.estado_cambiado_por] ? ` · ${nombres[t.estado_cambiado_por]}` : ""}`
                : undefined;
              return (
                <tr key={s.cliente_id} className={clsx("group transition-colors", conDeuda ? "bg-red-50/40 hover:bg-amber-50" : "hover:bg-amber-50")}>
                  {/* Cliente (fija al scrollear de costado) */}
                  <td className={clsx("sticky left-0 z-10 px-6 py-1.5 group-hover:bg-amber-50", conDeuda ? "bg-red-50" : "bg-white")}>
                    <div className="flex items-center gap-1.5">
                      {revisiones[s.cliente_id] && (
                        <span
                          title={`A revisar: ${revisiones[s.cliente_id].rojo} en rojo, ${revisiones[s.cliente_id].amarillo} en amarillo (ver la ficha)`}
                          className={clsx("w-2 h-2 rounded-full shrink-0", revisiones[s.cliente_id].rojo > 0 ? "bg-red-500" : "bg-amber-400")}
                        />
                      )}
                      <span className="text-[13px] font-medium text-gray-800 truncate max-w-[230px]" title={s.clientes?.nombre}>
                        {s.clientes?.nombre ?? "—"}
                      </span>
                      {s.clientes?.tipo_contribuyente === "empresa" && (
                        <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1">Empresa</span>
                      )}
                      <ClavesModuloPopover claves={s.clientes?.claves_acceso} modulo="monotributo" />
                      <FichaClienteBoton clienteId={s.cliente_id} nombre={s.clientes?.nombre ?? ""} fetchAction={getFichaCliente} />
                    </div>
                  </td>

                  {/* Responsable */}
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={clsx("text-[12px]", s.responsable_nombre ? "text-gray-600" : "text-red-600 font-medium")}>
                        {s.responsable_nombre ?? "Sin responsable"}
                      </span>
                      {isAdmin && (
                        <button onClick={() => setReasignando(s)} title="Ver historial / reasignar" className="text-gray-300 hover:text-amber-600 transition-colors">
                          <History size={13} />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Pago y envío (datos fijos: se editan en la ficha) */}
                  <td className="px-3 py-1.5" title={[f?.medio ? MEDIO_LABEL[f.medio] : null, f?.destinatario].filter(Boolean).join(" · ") || undefined}>
                    <span className={clsx("text-[12px]", f?.forma_pago ? "text-gray-700" : "text-red-600")}>
                      {f?.forma_pago ? FORMA_PAGO_LABEL[f.forma_pago] : "Sin forma de pago"}
                    </span>
                    {envio && <span className="text-[11px] text-gray-400"> · {envio}</span>}
                  </td>

                  {/* Estado del mes */}
                  <td className="px-3 py-1.5" title={cambio}>
                    {puedeEditar ? (
                      <div className="relative inline-block">
                        <select
                          value={t.cuota_estado}
                          onChange={(e) => cambiarEstado(s.cliente_id, e.target.value as EstadoMes)}
                          className={clsx(
                            "appearance-none text-[12px] font-medium rounded-full pl-2.5 pr-6 py-0.5 border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-300",
                            ESTILO_ESTADO[t.cuota_estado]
                          )}
                        >
                          {ESTADOS_MES.map((e) => <option key={e} value={e}>{ESTADO_MES_LABEL[e]}</option>)}
                        </select>
                        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 pointer-events-none" />
                      </div>
                    ) : (
                      <span className={clsx("text-[12px] font-medium rounded-full px-2.5 py-0.5", ESTILO_ESTADO[t.cuota_estado])}>
                        {ESTADO_MES_LABEL[t.cuota_estado]}
                      </span>
                    )}
                  </td>

                  {/* Deuda */}
                  <td className="px-3 py-1.5">
                    <button
                      onClick={() => setEditandoDeuda(s)}
                      title={puedeEditar ? "Ver / editar deuda e intimación" : "Ver deuda e intimación"}
                      className={clsx(
                        "text-[12px] font-medium rounded-full px-2 py-0.5",
                        t.deuda_estado === "si" ? (t.deuda_resuelta ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")
                          : t.deuda_estado === "no" ? "bg-gray-100 text-gray-600" : "bg-amber-50 text-amber-700"
                      )}
                    >
                      {t.deuda_estado === "si" ? (t.deuda_resuelta ? "Resuelta" : "Sí") : DEUDA_LABEL[t.deuda_estado]}
                      {conDeuda && t.deuda_monto ? ` · $ ${Number(t.deuda_monto).toLocaleString("es-AR")}` : ""}
                      {conDeuda ? (t.deuda_aviso ? " · avisada" : " · sin avisar") : ""}
                    </button>
                  </td>

                  {/* Intimación */}
                  <td className="px-3 py-1.5" title={t.intimacion_fecha ? `Desde ${fmtFecha(t.intimacion_fecha)}` : undefined}>
                    {puedeEditar ? (
                      <div className="relative inline-block">
                        <select
                          value={t.intimacion_estado ?? ""}
                          onChange={(e) => {
                            const v = (e.target.value || null) as IntimacionEstado | null;
                            guardarCambio(s.cliente_id, { intimacion_estado: v, intimacion_fecha: v && v !== "no" ? hoyArgentina() : null });
                          }}
                          className={clsx(
                            "appearance-none text-[12px] bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-amber-300 rounded px-1 py-0.5 pr-5 cursor-pointer",
                            t.intimacion_estado === "si" ? "text-red-600 font-medium" : t.intimacion_estado === "fijarse" ? "text-amber-600 font-medium" : "text-gray-500"
                          )}
                        >
                          <option value="">—</option>
                          {(Object.keys(INTIMACION_LABEL) as IntimacionEstado[]).map((k) => <option key={k} value={k}>{INTIMACION_LABEL[k]}</option>)}
                        </select>
                        <ChevronDown size={11} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    ) : (
                      <span className="text-[12px] text-gray-500">{t.intimacion_estado ? INTIMACION_LABEL[t.intimacion_estado] : "—"}</span>
                    )}
                  </td>

                  {/* Categoría */}
                  <td className="px-3 py-1.5">
                    {puedeEditar ? (
                      <div className="relative inline-block">
                        <select
                          value={t.categoria ?? ""}
                          onChange={(e) => guardarCambio(s.cliente_id, { categoria: e.target.value || null })}
                          className="appearance-none text-[13px] font-semibold text-gray-700 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-amber-300 rounded px-1 py-0.5 pr-5 cursor-pointer"
                        >
                          <option value="">—</option>
                          {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <ChevronDown size={11} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                      </div>
                    ) : (
                      <span className="text-[13px] font-semibold text-gray-700">{t.categoria ?? <span className="text-gray-300">—</span>}</span>
                    )}
                  </td>

                  {/* Recategorización: solo en la ventana del calendario ARCA */}
                  {esRecategorizacion && (
                    <td className="px-3 py-1.5">
                      {puedeEditar ? (
                        <div className="relative inline-block">
                          <select
                            value={t.recategorizacion}
                            onChange={(e) => guardarCambio(s.cliente_id, { recategorizacion: e.target.value as Tarea["recategorizacion"] })}
                            className={clsx(
                              "appearance-none text-[12px] bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-amber-300 rounded px-1 py-0.5 pr-5 cursor-pointer",
                              t.recategorizacion === "realizada" ? "text-emerald-600 font-medium" : t.recategorizacion === "pendiente" ? "text-amber-600" : "text-gray-300"
                            )}
                          >
                            <option value="no_corresponde">No corresponde</option>
                            <option value="pendiente">Pendiente</option>
                            <option value="realizada">Realizada</option>
                          </select>
                          <ChevronDown size={11} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                      ) : (
                        <span className={clsx("text-[12px]", t.recategorizacion === "realizada" ? "text-emerald-600 font-medium" : t.recategorizacion === "pendiente" ? "text-amber-600" : "text-gray-300")}>
                          {t.recategorizacion === "realizada" ? "Realizada" : t.recategorizacion === "pendiente" ? "Pendiente" : "—"}
                        </span>
                      )}
                    </td>
                  )}

                  {/* Observaciones */}
                  <td className="px-3 py-1.5">
                    {puedeEditar ? (
                      <input
                        type="text"
                        defaultValue={t.observaciones ?? ""}
                        placeholder="—"
                        onBlur={(e) => {
                          const val = e.target.value || null;
                          if (val !== t.observaciones) guardarCambio(s.cliente_id, { observaciones: val });
                        }}
                        className="text-[12px] text-gray-600 border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-amber-300 rounded px-1 py-0.5 w-full min-w-[160px] placeholder:text-gray-300"
                      />
                    ) : (
                      <span className="text-[12px] text-gray-500">{t.observaciones ?? "—"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    {aviso}
    {avisoDeshacer}
    {editandoDeuda && (
      <DeudaModal
        nombre={editandoDeuda.clientes?.nombre ?? ""}
        tarea={getTarea(editandoDeuda.cliente_id)}
        mes={mes}
        anio={anio}
        puedeEditar={puedeEditar}
        onGuardar={(cambios) => {
          guardarCambio(editandoDeuda.cliente_id, cambios);
          setEditandoDeuda(null);
        }}
        onClose={() => setEditandoDeuda(null)}
      />
    )}
    {reasignando && (
      <AsignacionServicioModal
        clienteId={reasignando.cliente_id}
        clienteNombre={reasignando.clientes?.nombre ?? ""}
        servicio="monotributo"
        subtipo="general"
        equipo={equipoMonotributo}
        responsableActual={reasignando.responsable_nombre}
        creadoPor={creadoPor}
        onClose={() => setReasignando(null)}
      />
    )}
    {mostrarEquipo && (
      <EquipoModuloPanel
        moduloNombre="Monotributo"
        equipo={equipoMonotributo}
        conteos={conteosResp}
        filterResp={filterResp}
        onSelect={(nombre) => setFilterResp((prev) => (prev === nombre ? "" : nombre))}
        onClose={() => setMostrarEquipo(false)}
        accent={ACCENT_MONOTRIBUTO}
      />
    )}
    </>
  );
}

function FiltroBoton({ activo, onClick, color, children }: { activo: boolean; onClick: () => void; color: "amber" | "red"; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "text-xs px-3 py-1.5 rounded-lg border font-medium transition-all",
        activo
          ? color === "red" ? "bg-red-50 border-red-300 text-red-700" : "bg-amber-50 border-amber-300 text-amber-700"
          : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
      )}
    >
      {children}
    </button>
  );
}

/** NOTAS de la planilla, sacadas del texto original importado ("DEUDA: SI | PERIODOS: … | NOTAS: …"). */
function notasDeLaPlanilla(textoOriginal: string | null): string {
  const m = (textoOriginal ?? "").match(/NOTAS:\s*(.*)$/);
  return m ? m[1].trim() : "";
}

/** Ventana chica de la deuda del mes: estado, períodos, importe, avisada (+fecha) y nota.
 * Precargada con lo importado de la planilla. Guarda con historial y "Deshacer". */
function DeudaModal({
  nombre,
  tarea,
  mes,
  anio,
  puedeEditar,
  onGuardar,
  onClose,
}: {
  nombre: string;
  tarea: Tarea;
  mes: number;
  anio: number;
  puedeEditar: boolean;
  onGuardar: (cambios: CambiosTarea) => void;
  onClose: () => void;
}) {
  const [estado, setEstado] = useState<DeudaEstado>(tarea.deuda_estado);
  const [periodos, setPeriodos] = useState(tarea.deuda_periodos ?? "");
  const [monto, setMonto] = useState(tarea.deuda_monto === null ? "" : String(tarea.deuda_monto).replace(".", ","));
  const [avisada, setAvisada] = useState(tarea.deuda_aviso);
  const [avisadaFecha, setAvisadaFecha] = useState(tarea.deuda_aviso_fecha ?? "");
  const [nota, setNota] = useState(tarea.deuda_nota ?? notasDeLaPlanilla(tarea.deuda_texto_original));
  const [err, setErr] = useState<string | null>(null);

  function guardar() {
    const limpio = monto.trim().replace(/\$|\s/g, "");
    const m = limpio === "" ? null : Number(limpio.includes(",") ? limpio.replace(/\./g, "").replace(",", ".") : limpio);
    if (m !== null && (!Number.isFinite(m) || m < 0)) return setErr("El importe tiene que ser un número (ej. 208.274,38).");
    onGuardar({
      deuda_estado: estado,
      deuda_periodos: periodos.trim() || null,
      deuda_monto: m,
      deuda_aviso: avisada,
      deuda_aviso_fecha: avisada ? (avisadaFecha || hoyArgentina()) : null,
      deuda_nota: nota.trim() || null,
    });
  }

  const input = "w-full text-[13px] border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-amber-400 disabled:bg-gray-50";
  const label = "text-[10.5px] font-semibold tracking-[.08em] uppercase text-gray-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[.14em] uppercase text-gray-400">Deuda · {MESES_NOMBRES[mes]} {anio}</p>
            <h2 className="text-[15px] font-semibold text-gray-900 mt-0.5">{nombre}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex gap-2">
            {(["si", "no", "sin_verificar"] as DeudaEstado[]).map((k) => (
              <button
                key={k}
                disabled={!puedeEditar}
                onClick={() => setEstado(k)}
                className={clsx(
                  "text-[12px] px-3 py-1.5 rounded-lg border font-medium",
                  estado === k
                    ? k === "si" ? "bg-red-50 border-red-300 text-red-700" : k === "no" ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-amber-50 border-amber-300 text-amber-700"
                    : "bg-white border-gray-200 text-gray-500"
                )}
              >
                {DEUDA_LABEL[k]}
              </button>
            ))}
          </div>
          <div>
            <p className={label}>Períodos adeudados</p>
            <input className={input} value={periodos} onChange={(e) => setPeriodos(e.target.value)} disabled={!puedeEditar} placeholder="ej. 07/2026 + intereses" />
          </div>
          <div>
            <p className={label}>Importe (opcional)</p>
            <input className={input} value={monto} onChange={(e) => setMonto(e.target.value)} disabled={!puedeEditar} placeholder="ej. 208.274,38" />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-gray-700 shrink-0">
              <input type="checkbox" checked={avisada} onChange={(e) => setAvisada(e.target.checked)} disabled={!puedeEditar} className="accent-bordo" />
              Avisada al cliente
            </label>
            {avisada && <input type="date" className={input} value={avisadaFecha} onChange={(e) => setAvisadaFecha(e.target.value)} disabled={!puedeEditar} />}
          </div>
          <div>
            <p className={label}>Nota</p>
            <textarea className={clsx(input, "resize-y")} rows={2} value={nota} onChange={(e) => setNota(e.target.value)} disabled={!puedeEditar} placeholder="—" />
          </div>
          {tarea.deuda_texto_original && (
            <p className="text-[11px] text-gray-400">Planilla: {tarea.deuda_texto_original}</p>
          )}
          {err && <p className="text-[12px] text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-[13px] px-4 py-1.5 rounded-lg border border-gray-200 text-gray-600">
            {puedeEditar ? "Cancelar" : "Cerrar"}
          </button>
          {puedeEditar && (
            <button onClick={guardar} className="text-[13px] px-4 py-1.5 rounded-lg bg-gray-900 text-white font-medium">Guardar</button>
          )}
        </div>
      </div>
    </div>
  );
}
