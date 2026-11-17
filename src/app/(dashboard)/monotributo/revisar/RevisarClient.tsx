"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, Loader2 } from "lucide-react";
import { FichaClienteBoton } from "@/components/FichaClienteBoton";
import { getFichaCliente } from "@/app/(dashboard)/panel-general/actions";
import { CAMPO_REVISION_LABEL, type CampoRevision, type Gravedad } from "@/lib/monotributo";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import {
  confirmarGrupo,
  confirmarRevisiones,
  confirmarSinDeuda,
  listarPendientesGrupo,
  listarResueltas,
  reabrirRevision,
  type MarcaPendienteVista,
  type MarcaResuelta,
} from "../revisionesActions";
import { useDeshacer } from "@/components/DeshacerAviso";

export interface FilaRevision {
  id: string;
  cliente_id: string;
  cliente: string;
  cuit: string;
  responsable_id: string | null;
  responsable: string | null;
  servicio_activo: boolean;
  campo: CampoRevision;
  motivo: string;
  gravedad: Gravedad;
  anio: number | null;
  mes: number | null;
  origen: "importacion" | "regla_automatica";
  detectada_at: string;
}

const SIN_RESP = "__sin__";
const MIOS = "__mios__";

export function RevisarClient({
  filas,
  amarillas,
  responsables,
  yoId,
  esAdmin,
  esResponsable,
  puedeEditar,
}: {
  /** Marcas rojas (completas). Las amarillas vienen livianas y se muestran agrupadas. */
  filas: FilaRevision[];
  amarillas: AmarillaMin[];
  responsables: { id: string; nombre: string }[];
  yoId: string | null;
  esAdmin: boolean;
  esResponsable: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  // Quién revisa: el responsable del cliente; lo que no tiene responsable, el admin.
  const [filtroResp, setFiltroResp] = useState(esResponsable && !esAdmin ? MIOS : "");
  // Por defecto solo ROJO; las amarillas se ven agrupadas por tipo.
  const [filtroGravedad, setFiltroGravedad] = useState<"" | Gravedad>("rojo");
  const [filtroCampo, setFiltroCampo] = useState<"" | CampoRevision>("");
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [nota, setNota] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { ofrecer, aviso: avisoDeshacer } = useDeshacer();
  const [guardando, startGuardar] = useTransition();

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return filas
      .filter((f) => {
        if (filtroResp === MIOS && f.responsable_id !== yoId) return false;
        if (filtroResp === SIN_RESP && f.responsable_id) return false;
        if (filtroResp && filtroResp !== MIOS && filtroResp !== SIN_RESP && f.responsable_id !== filtroResp) return false;
        if (filtroCampo && f.campo !== filtroCampo) return false;
        if (q && !f.cliente.toLowerCase().includes(q) && !f.cuit.includes(q)) return false;
        return true;
      })
      .sort((a, b) =>
        (a.gravedad === b.gravedad ? 0 : a.gravedad === "rojo" ? -1 : 1) ||
        a.cliente.localeCompare(b.cliente) ||
        a.campo.localeCompare(b.campo) ||
        (a.anio ?? 0) * 100 + (a.mes ?? 0) - ((b.anio ?? 0) * 100 + (b.mes ?? 0))
      );
  }, [filas, filtroResp, filtroCampo, busqueda, yoId]);

  const amarillasVisibles = useMemo(() => amarillas.filter((a) =>
    !filtroResp ? true : filtroResp === MIOS ? a.responsable_id === yoId : filtroResp === SIN_RESP ? !a.responsable_id : a.responsable_id === filtroResp
  ), [amarillas, filtroResp, yoId]);

  const totales = { rojo: filas.length, amarillo: amarillas.length };

  const camposPresentes = useMemo(
    () => Array.from(new Set(filas.map((f) => f.campo))).sort((a, b) => CAMPO_REVISION_LABEL[a].localeCompare(CAMPO_REVISION_LABEL[b])),
    [filas]
  );

  const seleccionadas = visibles.filter((f) => seleccion.has(f.id));
  const todasVisiblesSeleccionadas = visibles.length > 0 && seleccionadas.length === visibles.length;
  const soloDeuda = seleccionadas.length > 0 && seleccionadas.every((f) => f.campo === "deuda");

  function alternar(id: string) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function alternarTodas() {
    setSeleccion(todasVisiblesSeleccionadas ? new Set() : new Set(visibles.map((f) => f.id)));
  }

  function ejecutar(accion: "confirmar" | "sin_deuda", ids: string[]) {
    setErr(null);
    setAviso(null);
    startGuardar(async () => {
      const r = accion === "sin_deuda" ? await confirmarSinDeuda(ids, nota) : await confirmarRevisiones(ids, nota);
      if ("error" in r) {
        setErr(r.error);
        return;
      }
      setSeleccion(new Set());
      setNota("");
      setAviso(`${r.resueltas} ${r.resueltas === 1 ? "marca salió" : "marcas salieron"} de revisión.`);
      router.refresh();
      ofrecer(r.historialIds, `${r.resueltas} ${r.resueltas === 1 ? "marca confirmada" : "marcas confirmadas"}`, () => router.refresh());
    });
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-2 h-6 rounded-full bg-amber-500" />
          <div>
            <h1 className="text-[17px] font-semibold text-gray-900">A revisar ({filas.length + amarillas.length})</h1>
            <p className="text-[12px] text-gray-400 mt-0.5">
              <span className="text-red-600 font-medium">{totales.rojo} en rojo</span> (falta o no coincide) ·{" "}
              <span className="text-amber-700 font-medium">{totales.amarillo} en amarillo</span> (sin verificar).
            </p>
            <p className="text-[12px] text-gray-500 mt-1">
              <span className="font-semibold text-gray-700">A revisar = datos mal cargados o faltantes</span> (responsable, forma de pago, contacto, CUIT…).
              Se corrigen una vez y salen solas; no dependen del mes. Las tareas de cada mes (enviar, avisar) están en Alertas. Una marca no bloquea nada.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-2 flex-wrap">
        <Selector value={filtroResp} onChange={setFiltroResp}>
          <option value="">Todos los responsables</option>
          {yoId && <option value={MIOS}>Mis clientes</option>}
          <option value={SIN_RESP}>Sin responsable</option>
          {responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </Selector>
        <Selector value={filtroGravedad} onChange={(v) => setFiltroGravedad(v as "" | Gravedad)}>
          <option value="rojo">Rojas</option>
          <option value="amarillo">Amarillas (por tipo)</option>
          <option value="">Rojas y amarillas</option>
        </Selector>
        <Selector value={filtroCampo} onChange={(v) => setFiltroCampo(v as "" | CampoRevision)}>
          <option value="">Todos los campos</option>
          {camposPresentes.map((c) => <option key={c} value={c}>{CAMPO_REVISION_LABEL[c]}</option>)}
        </Selector>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente o CUIT"
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-52 focus:outline-none focus:border-amber-400"
        />
        <span className="text-[11px] text-gray-400 ml-1">{visibles.length} visibles</span>
      </div>

      {puedeEditar && seleccionadas.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center gap-2 flex-wrap text-[12px]">
          <span className="font-semibold text-amber-800">{seleccionadas.length} seleccionadas</span>
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder='Nota opcional (ej. "no debe", "paga por su cuenta")'
            className="flex-1 min-w-[220px] max-w-md text-xs border border-amber-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:border-amber-400"
          />
          {soloDeuda && (
            <button
              disabled={guardando}
              onClick={() => ejecutar("sin_deuda", seleccionadas.map((f) => f.id))}
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              Confirmar sin deuda
            </button>
          )}
          <button
            disabled={guardando}
            onClick={() => ejecutar("confirmar", seleccionadas.map((f) => f.id))}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-medium hover:bg-gray-700 disabled:opacity-50"
          >
            Está bien así
          </button>
          {guardando && <Loader2 size={14} className="animate-spin text-amber-700" />}
        </div>
      )}
      {(err || aviso) && (
        <div className={clsx("px-6 py-2 text-[12px] border-b", err ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200")}>
          {err ?? aviso}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {filtroGravedad !== "rojo" && (
          <GruposAmarillos amarillas={amarillasVisibles} puedeEditar={puedeEditar} onCambio={() => router.refresh()} ofrecer={ofrecer} />
        )}
        <div className={clsx("overflow-x-auto pb-2", filtroGravedad === "amarillo" && "hidden")}>
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="sticky top-0 bg-gray-50 z-10">
              <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                {puedeEditar && (
                  <th className="pl-6 pr-2 py-3 w-8">
                    <input type="checkbox" checked={todasVisiblesSeleccionadas} onChange={alternarTodas} className="accent-amber-600" />
                  </th>
                )}
                <th className={clsx("py-3 pr-4", !puedeEditar && "pl-6")}>Cliente</th>
                <th className="px-4 py-3">Responsable</th>
                <th className="px-4 py-3">Campo</th>
                <th className="px-4 py-3">Mes</th>
                <th className="px-4 py-3">Motivo</th>
                {puedeEditar && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-[13px] text-gray-400">
                    {filas.length === 0 ? "No hay nada para revisar." : "No hay marcas con estos filtros."}
                  </td>
                </tr>
              ) : (
                visibles.map((f) => (
                  <tr key={f.id} className={clsx("hover:bg-gray-50", seleccion.has(f.id) && "bg-amber-50/50")}>
                    {puedeEditar && (
                      <td className="pl-6 pr-2 py-2.5">
                        <input type="checkbox" checked={seleccion.has(f.id)} onChange={() => alternar(f.id)} className="accent-amber-600" />
                      </td>
                    )}
                    <td className={clsx("py-2.5 pr-4", !puedeEditar && "pl-6")}>
                      <div className="flex items-center gap-1.5">
                        <span className={clsx("w-2 h-2 rounded-full shrink-0", f.gravedad === "rojo" ? "bg-red-500" : "bg-amber-400")} />
                        <span className="text-[13px] font-medium text-gray-800 truncate max-w-[260px]" title={f.cliente}>{f.cliente}</span>
                        <FichaClienteBoton clienteId={f.cliente_id} nombre={f.cliente} fetchAction={getFichaCliente} />
                        {!f.servicio_activo && <span className="text-[10px] text-gray-400 uppercase">baja</span>}
                      </div>
                    </td>
                    <td className={clsx("px-4 py-2.5 text-[12.5px]", f.responsable ? "text-gray-700" : "text-red-600 font-medium")}>
                      {f.responsable ?? "Sin responsable"}
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-gray-700">{CAMPO_REVISION_LABEL[f.campo]}</td>
                    <td className="px-4 py-2.5 text-[12.5px] text-gray-500">
                      {f.anio && f.mes ? `${MESES_NOMBRES[f.mes]} ${f.anio}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-[12.5px] text-gray-700 whitespace-normal min-w-[280px]">{f.motivo}</td>
                    {puedeEditar && (
                      <td className="px-4 py-2.5 text-right">
                        <button
                          disabled={guardando}
                          onClick={() => ejecutar("confirmar", [f.id])}
                          className="text-[11.5px] text-gray-500 hover:text-gray-900 underline-offset-2 hover:underline disabled:opacity-50"
                        >
                          Está bien así
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <ResueltasPanel puedeEditar={puedeEditar} onCambio={() => router.refresh()} />
      </div>
      {avisoDeshacer}
    </div>
  );
}


export interface AmarillaMin {
  id: string;
  cliente_id: string;
  campo: CampoRevision;
  responsable_id: string | null;
}

/** Amarillas agrupadas por tipo, con "Confirmar todas" por grupo (queda en el historial, se puede deshacer).
 * El detalle de cada grupo se pide recién al desplegarlo. */
function GruposAmarillos({
  amarillas,
  puedeEditar,
  onCambio,
  ofrecer,
}: {
  amarillas: AmarillaMin[];
  puedeEditar: boolean;
  onCambio: () => void;
  ofrecer: (ids: string[] | undefined, texto: string, alDeshacer?: () => void) => void;
}) {
  const [nota, setNota] = useState("");
  const [abierto, setAbierto] = useState<CampoRevision | null>(null);
  const [detalle, setDetalle] = useState<MarcaPendienteVista[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [trabajando, startTrabajo] = useTransition();

  const grupos = useMemo(() => {
    const m = new Map<CampoRevision, string[]>();
    for (const a of amarillas) m.set(a.campo, [...(m.get(a.campo) ?? []), a.id]);
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [amarillas]);

  function ver(campo: CampoRevision) {
    if (abierto === campo) return setAbierto(null);
    setAbierto(campo);
    setDetalle(null);
    listarPendientesGrupo(campo, "amarillo").then(setDetalle);
  }

  function confirmar(campo: CampoRevision, ids: string[], modo: "confirmar" | "sin_deuda") {
    const etiqueta = modo === "sin_deuda" ? "Confirmar sin deuda" : "Confirmar";
    if (!window.confirm(`${etiqueta}: ${ids.length} marca(s) de "${CAMPO_REVISION_LABEL[campo]}". Queda en el historial y se puede deshacer o reabrir. ¿Seguir?`)) return;
    setErr(null);
    startTrabajo(async () => {
      const r = await confirmarGrupo(campo, ids, nota || null, modo);
      if ("error" in r) return setErr(r.error);
      setNota("");
      setAbierto(null);
      onCambio();
      ofrecer(r.historialIds, `${r.resueltas} marca(s) confirmadas`, onCambio);
    });
  }

  function confirmarUna(id: string) {
    setErr(null);
    startTrabajo(async () => {
      const r = await confirmarRevisiones([id], nota || null);
      if ("error" in r) return setErr(r.error);
      setDetalle((d) => d?.filter((x) => x.id !== id) ?? null);
      onCambio();
      ofrecer(r.historialIds, "Marca confirmada", onCambio);
    });
  }

  if (!grupos.length) return null;
  return (
    <div className="px-6 py-4 border-b border-gray-200 bg-amber-50/30">
      <div className="flex items-center gap-3 flex-wrap mb-2">
        <h2 className="text-[13px] font-semibold text-amber-800">Amarillas (sin verificar) · {amarillas.length}</h2>
        {puedeEditar && (
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder='Nota para confirmar (ej. "no debe")'
            className="text-xs border border-amber-200 rounded-lg px-2.5 py-1 w-64 bg-white focus:outline-none focus:border-amber-400"
          />
        )}
        {trabajando && <Loader2 size={13} className="animate-spin text-amber-700" />}
      </div>
      <div className="space-y-1.5">
        {grupos.map(([campo, ids]) => (
          <div key={campo} className="bg-white border border-amber-100 rounded-lg">
            <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
              <span className="text-[12.5px] font-medium text-gray-800">{CAMPO_REVISION_LABEL[campo]}</span>
              <span className="text-[12px] text-amber-700 font-semibold">{ids.length}</span>
              <button onClick={() => ver(campo)} className="text-[11.5px] text-gray-500 hover:text-gray-900">
                {abierto === campo ? "Ocultar" : "Ver"}
              </button>
              <div className="flex-1" />
              {puedeEditar && campo === "deuda" && (
                <button disabled={trabajando} onClick={() => confirmar(campo, ids, "sin_deuda")}
                  className="text-[11.5px] px-2.5 py-1 rounded-md bg-emerald-600 text-white font-medium disabled:opacity-50">
                  Confirmar sin deuda ({ids.length})
                </button>
              )}
              {puedeEditar && (
                <button disabled={trabajando} onClick={() => confirmar(campo, ids, "confirmar")}
                  className="text-[11.5px] px-2.5 py-1 rounded-md bg-gray-900 text-white font-medium disabled:opacity-50">
                  Confirmar todas ({ids.length})
                </button>
              )}
            </div>
            {abierto === campo && (
              <div className="border-t border-amber-100 px-3 py-2 max-h-64 overflow-y-auto">
                {!detalle ? (
                  <p className="text-[12px] text-gray-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Cargando…</p>
                ) : (
                  detalle.filter((d) => ids.includes(d.id)).map((d) => (
                    <div key={d.id} className="flex items-center gap-2 text-[12px] py-0.5">
                      <span className="text-gray-800 truncate max-w-[260px]" title={d.cliente}>{d.cliente}</span>
                      <FichaClienteBoton clienteId={d.cliente_id} nombre={d.cliente} fetchAction={getFichaCliente} />
                      <span className="text-gray-400">{d.anio && d.mes ? `${MESES_NOMBRES[d.mes]} ${d.anio} · ` : ""}{d.motivo}</span>
                      <div className="flex-1" />
                      {puedeEditar && (
                        <button disabled={trabajando} onClick={() => confirmarUna(d.id)} className="text-[11.5px] text-gray-500 hover:text-gray-900 hover:underline">
                          Está bien así
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {err && <p className="text-[12px] text-red-600 mt-2">{err}</p>}
    </div>
  );
}

/** Marcas ya resueltas (de a 50, lo más reciente primero) con "Reabrir" para lo que se resolvió por error. */
function ResueltasPanel({ puedeEditar, onCambio }: { puedeEditar: boolean; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<MarcaResuelta[] | null>(null);
  const [mas, setMas] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [trabajando, startTrabajo] = useTransition();

  function cargar(desde = 0) {
    listarResueltas(desde).then((r) => {
      setMas(r.length === 50);
      setFilas((prev) => (desde === 0 || !prev ? r : [...prev, ...r]));
    });
  }

  function reabrir(id: string) {
    setErr(null);
    startTrabajo(async () => {
      const r = await reabrirRevision(id);
      if ("error" in r) return setErr(r.error);
      setFilas((prev) => prev?.filter((f) => f.id !== id) ?? null);
      onCambio();
    });
  }

  return (
    <div className="px-6 py-4 bg-gray-50">
      <button onClick={() => { setAbierto((v) => !v); if (!filas) cargar(0); }} className="text-[12px] font-medium text-gray-600 hover:text-gray-900">
        {abierto ? "Ocultar marcas resueltas" : "Ver marcas resueltas (para reabrir)"}
      </button>
      {abierto && (
        <div className="mt-2 space-y-1">
          {!filas ? (
            <p className="text-[12px] text-gray-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Cargando…</p>
          ) : filas.length === 0 ? (
            <p className="text-[12px] text-gray-400">No hay marcas resueltas.</p>
          ) : (
            filas.map((f) => (
              <p key={f.id} className="text-[12px] text-gray-600">
                <span className="font-medium text-gray-800">{f.cliente}</span> · {CAMPO_REVISION_LABEL[f.campo]}
                {f.anio && f.mes ? ` (${MESES_NOMBRES[f.mes]} ${f.anio})` : ""}: {f.motivo} —{" "}
                {f.resolucion === "confirmado" ? "confirmada así" : "corregida"}
                {f.nota ? ` · “${f.nota}”` : ""}
                {puedeEditar && (
                  <button disabled={trabajando} onClick={() => reabrir(f.id)} className="ml-2 text-amber-700 hover:underline disabled:opacity-50">
                    Reabrir
                  </button>
                )}
              </p>
            ))
          )}
          {filas && mas && filas.length > 0 && (
            <button onClick={() => cargar(filas.length)} className="text-[11.5px] text-gray-500 hover:text-gray-800">Ver más</button>
          )}
          {err && <p className="text-[12px] text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}

function Selector({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none text-xs text-gray-600 bg-white border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:border-amber-400 cursor-pointer"
      >
        {children}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}
