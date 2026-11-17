"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, Loader2 } from "lucide-react";
import { FichaClienteBoton } from "@/components/FichaClienteBoton";
import { getFichaCliente } from "@/app/(dashboard)/panel-general/actions";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import {
  TIPOS_ALERTA,
  TIPOS_CON_RESUELTA,
  TIPO_ALERTA_CIERRE,
  TIPO_ALERTA_LABEL,
  type Alerta,
  type TipoAlerta,
} from "@/lib/monotributoAlertasTipos";
import { marcarAlertaResuelta } from "../alertasActions";
import { upsertMonotributoTarea, type CambiosTarea } from "../actions";
import { hoyArgentina } from "@/lib/monotributo";

const ACCION_DIRECTA: Partial<Record<TipoAlerta, { label: string; cambios: CambiosTarea }>> = {
  sin_avisar: { label: "Marcar Avisado", cambios: { cuota_estado: "avisado" } },
  sin_enviar: { label: "Marcar Enviado", cambios: { cuota_estado: "enviado" } },
  deuda_sin_avisar: { label: "Ya avisada", cambios: { deuda_aviso: true } },
};

const MIOS = "__mios__";
const SIN = "__sin__";

function opcionesMes(mes: number, anio: number) {
  const out: { mes: number; anio: number }[] = [];
  let m = mes + 2, a = anio;
  while (m > 12) { m -= 12; a++; }
  for (let i = 0; i < 15; i++) {
    out.push({ mes: m, anio: a });
    m--;
    if (m === 0) { m = 12; a--; }
  }
  return out;
}

export function AlertasClient({
  alertas,
  vencimiento,
  vencido,
  resueltasDisponible,
  mes,
  anio,
  mesDefault,
  anioDefault,
  yoId,
  filtroInicialMios,
  puedeEditar,
}: {
  alertas: Alerta[];
  vencimiento: string;
  vencido: boolean;
  resueltasDisponible: boolean;
  mes: number;
  anio: number;
  mesDefault: number;
  anioDefault: number;
  yoId: string | null;
  filtroInicialMios: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [filtroResp, setFiltroResp] = useState(filtroInicialMios ? MIOS : "");
  const [filtroTipo, setFiltroTipo] = useState<"" | TipoAlerta>("");
  const [nota, setNota] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();

  const responsables = useMemo(() => {
    const m = new Map<string, string>();
    alertas.forEach((a) => { if (a.responsable_id) m.set(a.responsable_id, a.responsable); });
    return Array.from(m.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [alertas]);

  const porResp = useMemo(() => alertas.filter((a) =>
    !filtroResp ? true : filtroResp === MIOS ? a.responsable_id === yoId : filtroResp === SIN ? !a.responsable_id : a.responsable_id === filtroResp
  ), [alertas, filtroResp, yoId]);

  const conteo = useMemo(() => {
    const c = Object.fromEntries(TIPOS_ALERTA.map((t) => [t, { total: 0, rojo: 0 }])) as Record<TipoAlerta, { total: number; rojo: number }>;
    porResp.forEach((a) => { c[a.tipo].total++; if (a.gravedad === "rojo") c[a.tipo].rojo++; });
    return c;
  }, [porResp]);

  const visibles = filtroTipo ? porResp.filter((a) => a.tipo === filtroTipo) : porResp;
  const [y, m, d] = vencimiento.split("-");

  function resolver(a: Alerta) {
    setErr(null);
    startGuardar(async () => {
      const r = await marcarAlertaResuelta([{ clienteId: a.cliente_id, tipo: a.tipo, valor: a.valor }], anio, mes, nota);
      if ("error" in r) return setErr(r.error);
      setAbierta(null);
      setNota("");
      router.refresh();
    });
  }

  /** Botones directos por fila (de a una, sin lote). */
  function accionDirecta(a: Alerta, cambios: CambiosTarea) {
    setErr(null);
    setProcesando(a.clave);
    startGuardar(async () => {
      const r = await upsertMonotributoTarea(a.cliente_id, anio, mes,
        cambios.deuda_aviso ? { ...cambios, deuda_aviso_fecha: hoyArgentina() } : cambios);
      setProcesando(null);
      if (r && "error" in r && r.error) return setErr(r.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 rounded-full bg-amber-500" />
            <div>
              <h1 className="text-[17px] font-semibold text-gray-900">Alertas ({porResp.length})</h1>
              <p className="text-[12px] text-gray-400 mt-0.5">
                {MESES_NOMBRES[mes]} {anio} · la cuota {vencido ? "venció" : "vence"} el {d}/{m}/{y}. Solo internas: no se envía nada a clientes.
                Cada una le llega al responsable del cliente; las de clientes sin responsable, al administrador.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Selector
              value={`${anio}-${mes}`}
              onChange={(v) => { const [a, mm] = v.split("-"); router.push(`/monotributo/alertas?mes=${mm}&anio=${a}`); }}
            >
              {opcionesMes(mesDefault, anioDefault).map((o) => (
                <option key={`${o.anio}-${o.mes}`} value={`${o.anio}-${o.mes}`}>{MESES_NOMBRES[o.mes]} {o.anio}</option>
              ))}
            </Selector>
            <Selector value={filtroResp} onChange={setFiltroResp}>
              <option value="">Todos los responsables</option>
              {yoId && <option value={MIOS}>Mis clientes</option>}
              <option value={SIN}>Sin responsable</option>
              {responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </Selector>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-6 py-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {TIPOS_ALERTA.map((tipo) => (
          <button
            key={tipo}
            onClick={() => setFiltroTipo((f) => (f === tipo ? "" : tipo))}
            title={TIPO_ALERTA_CIERRE[tipo]}
            className={clsx(
              "text-left rounded-lg border px-3 py-2 transition-colors",
              filtroTipo === tipo ? "border-amber-400 bg-amber-50" : "border-gray-100 bg-gray-50/60 hover:border-gray-300"
            )}
          >
            <p className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">{TIPO_ALERTA_LABEL[tipo]}</p>
            <p className={clsx("text-[22px] font-bold leading-tight",
              conteo[tipo].total === 0 ? "text-gray-300" : conteo[tipo].rojo ? "text-red-600" : "text-amber-600")}>
              {conteo[tipo].total}
            </p>
          </button>
        ))}
      </div>

      {filtroTipo && (
        <div className="px-6 py-2 text-[12px] text-gray-600 bg-amber-50/50 border-b border-amber-100">
          <span className="font-semibold">{TIPO_ALERTA_LABEL[filtroTipo]}:</span> {TIPO_ALERTA_CIERRE[filtroTipo]}
        </div>
      )}
      {err && <div className="px-6 py-2 text-[12px] bg-red-50 text-red-700 border-b border-red-200">{err}</div>}

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="overflow-x-auto pb-2">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                <th className="pl-6 pr-4 py-3">Cliente</th>
                <th className="px-4 py-3">Responsable</th>
                <th className="px-4 py-3">Alerta</th>
                <th className="px-4 py-3">Detalle</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {visibles.length === 0 ? (
                <tr><td colSpan={5} className="py-16 text-center text-[13px] text-gray-400">No hay alertas con estos filtros.</td></tr>
              ) : visibles.map((a) => (
                <tr key={a.clave} className="hover:bg-gray-50 align-top">
                  <td className="pl-6 pr-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className={clsx("w-2 h-2 rounded-full shrink-0", a.gravedad === "rojo" ? "bg-red-500" : "bg-amber-400")} />
                      <span className="text-[13px] font-medium text-gray-800 truncate max-w-[260px]" title={a.cliente}>{a.cliente}</span>
                      <FichaClienteBoton clienteId={a.cliente_id} nombre={a.cliente} fetchAction={getFichaCliente} />
                    </div>
                  </td>
                  <td className={clsx("px-4 py-2.5 text-[12.5px]", a.responsable_id ? "text-gray-700" : "text-red-600 font-medium")}>{a.responsable}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-gray-800">{TIPO_ALERTA_LABEL[a.tipo]}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-gray-600 whitespace-normal min-w-[280px]">{a.detalle}</td>
                  <td className="px-4 py-2.5 text-right">
                    {puedeEditar && ACCION_DIRECTA[a.tipo] && (
                      <button
                        disabled={guardando}
                        onClick={() => accionDirecta(a, ACCION_DIRECTA[a.tipo]!.cambios)}
                        className="text-[11.5px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {procesando === a.clave ? <Loader2 size={11} className="animate-spin" /> : ACCION_DIRECTA[a.tipo]!.label}
                      </button>
                    )}
                    {puedeEditar && TIPOS_CON_RESUELTA.includes(a.tipo) && (
                      abierta === a.clave ? (
                        <div className="flex items-center gap-1.5 justify-end">
                          <input autoFocus value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota opcional"
                            className="text-[11.5px] border border-gray-200 rounded px-1.5 py-0.5 w-40" />
                          <button disabled={guardando || !resueltasDisponible} onClick={() => resolver(a)}
                            className="text-[11px] font-semibold bg-gray-900 text-white rounded px-2 py-0.5 disabled:opacity-50">
                            {guardando ? <Loader2 size={11} className="animate-spin" /> : "Resuelta"}
                          </button>
                          <button onClick={() => setAbierta(null)} className="text-[11px] text-gray-500">Cancelar</button>
                        </div>
                      ) : (
                        <button onClick={() => { setAbierta(a.clave); setNota(""); }}
                          title={resueltasDisponible ? "" : "Falta correr el SQL de la etapa 7"}
                          className="text-[11.5px] text-gray-500 hover:text-gray-900 hover:underline underline-offset-2">
                          Resuelta
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Selector({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="appearance-none text-xs text-gray-600 bg-white border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:border-amber-400 cursor-pointer">
        {children}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}
