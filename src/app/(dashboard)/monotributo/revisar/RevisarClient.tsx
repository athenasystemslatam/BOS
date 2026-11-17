"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, Loader2 } from "lucide-react";
import { FichaClienteBoton } from "@/components/FichaClienteBoton";
import { getFichaCliente } from "@/app/(dashboard)/panel-general/actions";
import { CAMPO_REVISION_LABEL, type CampoRevision, type Gravedad } from "@/lib/monotributo";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { confirmarRevisiones, confirmarSinDeuda, listarResueltas, reabrirRevision, type MarcaResuelta } from "../revisionesActions";
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
  responsables,
  yoId,
  esAdmin,
  esResponsable,
  puedeEditar,
}: {
  filas: FilaRevision[];
  responsables: { id: string; nombre: string }[];
  yoId: string | null;
  esAdmin: boolean;
  esResponsable: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  // Quién revisa: el responsable del cliente; lo que no tiene responsable, el admin.
  const [filtroResp, setFiltroResp] = useState(esResponsable && !esAdmin ? MIOS : "");
  const [filtroGravedad, setFiltroGravedad] = useState<"" | Gravedad>("");
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
        if (filtroGravedad && f.gravedad !== filtroGravedad) return false;
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
  }, [filas, filtroResp, filtroGravedad, filtroCampo, busqueda, yoId]);

  const totales = useMemo(() => ({
    rojo: filas.filter((f) => f.gravedad === "rojo").length,
    amarillo: filas.filter((f) => f.gravedad === "amarillo").length,
  }), [filas]);

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
            <h1 className="text-[17px] font-semibold text-gray-900">A revisar ({filas.length})</h1>
            <p className="text-[12px] text-gray-400 mt-0.5">
              <span className="text-red-600 font-medium">{totales.rojo} en rojo</span> (falta o no coincide) ·{" "}
              <span className="text-amber-700 font-medium">{totales.amarillo} en amarillo</span> (sin verificar). Una marca no
              bloquea nada: el cliente se sigue trabajando.
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
          <option value="">Rojo y amarillo</option>
          <option value="rojo">Solo rojo</option>
          <option value="amarillo">Solo amarillo</option>
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
        <div className="overflow-x-auto pb-2">
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
