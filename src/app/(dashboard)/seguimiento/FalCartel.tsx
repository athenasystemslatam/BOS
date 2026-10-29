"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { AlertTriangle, ChevronRight, Landmark, Loader2, Search, X } from "lucide-react";
import type { Cliente, Liquidadora } from "@/types";
import { useBackdropClose } from "@/lib/useBackdropClose";
import { marcarPasoFal, guardarIdFal } from "./falActions";
import {
  FAL_DESDE_ANIO,
  FAL_DESDE_MES,
  falActivo,
  filaFalVacia,
  fmtFechaCorte,
  fmtFechaFal,
  type FilaFal,
  type PasoFal,
} from "@/lib/fal";

type ClienteFal = Cliente & { liquidadora: { id: string; nombre: string } };

/** Cartel de avance FAL arriba de Seguimiento + lista de clientes para
 * marcar. Visible desde el período octubre 2026 hasta el día anterior a la
 * fecha de corte; después de eso, el FAL de cada cliente queda en su ficha. */
export function FalCartel({
  clientes,
  filas,
  fechaCorte,
  periodo,
  puedeEditar,
  liquidadoras,
}: {
  clientes: ClienteFal[];
  filas: FilaFal[];
  fechaCorte: string;
  periodo: { anio: number; mes: number } | null;
  puedeEditar: boolean;
  liquidadoras: Pick<Liquidadora, "id" | "nombre">[];
}) {
  const [porCliente, setPorCliente] = useState(() => new Map(filas.map((f) => [f.cliente_id, f])));
  const [idsFal, setIdsFal] = useState(() => new Map(clientes.map((c) => [c.id, c.id_fal ?? ""])));
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    setPorCliente(new Map(filas.map((f) => [f.cliente_id, f])));
  }, [filas]);
  useEffect(() => {
    setIdsFal(new Map(clientes.map((c) => [c.id, c.id_fal ?? ""])));
  }, [clientes]);

  const desdePeriodo = !!periodo && periodo.anio * 100 + periodo.mes >= FAL_DESDE_ANIO * 100 + FAL_DESDE_MES;
  if (!desdePeriodo || !falActivo(fechaCorte) || clientes.length === 0) return null;

  const fila = (id: string) => porCliente.get(id) ?? filaFalVacia(id);
  const total = clientes.length;
  const avisados = clientes.filter((c) => fila(c.id).aviso_enviado).length;
  const respondieron = clientes.filter((c) => fila(c.id).respondio).length;
  const confirmados = clientes.filter((c) => fila(c.id).confirmado_arca).length;
  const faltaConfirmar = clientes.filter((c) => fila(c.id).respondio && !fila(c.id).confirmado_arca).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="shrink-0 mb-4 w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:border-bordo/40 transition-colors group"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <Landmark size={16} className="text-bordo shrink-0" />
          <p className="text-[13px] text-gray-700">
            <span className="font-semibold text-gray-900">FAL:</span>{" "}
            {avisados} de {total} avisados · {respondieron} respondieron ·{" "}
            <span className={clsx("font-medium", confirmados === total ? "text-success" : "text-gray-900")}>
              {confirmados} confirmados en ARCA
            </span>
          </p>
          {faltaConfirmar > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              <AlertTriangle size={11} />
              {faltaConfirmar} {faltaConfirmar === 1 ? "respondió y falta" : "respondieron y falta"} confirmar en ARCA
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-[11px] text-gray-400 group-hover:text-bordo">
            Corte {fmtFechaCorte(fechaCorte)} · Ver lista <ChevronRight size={13} />
          </span>
        </div>
      </button>

      {abierto && (
        <FalListaModal
          clientes={clientes}
          fila={fila}
          idsFal={idsFal}
          puedeEditar={puedeEditar}
          liquidadoras={liquidadoras}
          onClose={() => setAbierto(false)}
          onFila={(f) => setPorCliente((m) => new Map(m).set(f.cliente_id, f))}
          onIdFal={(id, v) => setIdsFal((m) => new Map(m).set(id, v))}
        />
      )}
    </>
  );
}

function FalListaModal({
  clientes, fila, idsFal, puedeEditar, liquidadoras, onClose, onFila, onIdFal,
}: {
  clientes: ClienteFal[];
  fila: (id: string) => FilaFal;
  idsFal: Map<string, string>;
  puedeEditar: boolean;
  liquidadoras: Pick<Liquidadora, "id" | "nombre">[];
  onClose: () => void;
  onFila: (f: FilaFal) => void;
  onIdFal: (clienteId: string, v: string) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [liqFiltro, setLiqFiltro] = useState("");
  const [soloFaltaConfirmar, setSoloFaltaConfirmar] = useState(false);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [idsGuardados, setIdsGuardados] = useState(() => new Map(idsFal));
  const [err, setErr] = useState<string | null>(null);
  const [, startGuardar] = useTransition();
  const backdrop = useBackdropClose(onClose);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return clientes
      .filter((c) => !q || c.nombre.toLowerCase().includes(q) || (c.cuit ?? "").includes(q))
      .filter((c) => !liqFiltro || c.liquidador_id === liqFiltro)
      .filter((c) => !soloFaltaConfirmar || (fila(c.id).respondio && !fila(c.id).confirmado_arca))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [clientes, busqueda, liqFiltro, soloFaltaConfirmar, fila]);

  function guardar(clienteId: string, accion: () => ReturnType<typeof marcarPasoFal>) {
    setGuardandoId(clienteId);
    startGuardar(async () => {
      const r = await accion();
      if ("error" in r) setErr(r.error);
      else {
        setErr(null);
        onFila(r.fila);
        onIdFal(clienteId, r.idFal ?? "");
        setIdsGuardados((m) => new Map(m).set(clienteId, r.idFal ?? ""));
      }
      setGuardandoId(null);
    });
  }

  function marcar(clienteId: string, paso: PasoFal, valor: boolean) {
    guardar(clienteId, () => marcarPasoFal(clienteId, paso, valor));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" {...backdrop}>
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-100 w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[.18em] uppercase text-gray-400">Sueldos</p>
            <h2 className="text-[16px] font-semibold text-gray-900 mt-0.5">FAL — Fondo de Asistencia Laboral</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente o CUIT"
              className="pl-7 pr-3 py-1.5 text-[12.5px] border border-gray-200 rounded-lg focus:outline-none focus:border-bordo w-[220px]"
            />
          </div>
          {liquidadoras.length > 0 && (
            <select
              value={liqFiltro}
              onChange={(e) => setLiqFiltro(e.target.value)}
              className="py-1.5 px-2 text-[12.5px] border border-gray-200 rounded-lg bg-white"
            >
              <option value="">Todas las liquidadoras</option>
              {liquidadoras.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-[12.5px] text-gray-600 ml-1">
            <input type="checkbox" checked={soloFaltaConfirmar} onChange={(e) => setSoloFaltaConfirmar(e.target.checked)} className="accent-bordo" />
            Solo los que falta confirmar en ARCA
          </label>
          <span className="ml-auto text-[11px] text-gray-400">{visibles.length} clientes</span>
        </div>

        {err && <p className="px-5 py-2 text-[12px] text-danger bg-red-50 border-b border-red-100">{err}</p>}

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-gray-100">
                {["Cliente", "Liquidador/a", "Aviso enviado", "Respondió", "ID FAL", "Confirmado en ARCA"].map((h, i) => (
                  <th key={h} className={clsx("py-2.5 text-[10.5px] font-semibold text-gray-400 uppercase tracking-wider", i < 2 ? "px-4 text-left" : "px-3 text-center")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visibles.map((c) => {
                const f = fila(c.id);
                const ocupado = guardandoId === c.id;
                const alerta = f.respondio && !f.confirmado_arca;
                return (
                  <tr key={c.id} className={clsx("hover:bg-gray-50/60", alerta && "bg-amber-50/40")}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-gray-800 flex items-center gap-1.5">
                        {c.nombre}
                        {ocupado && <Loader2 size={11} className="animate-spin text-gray-400" />}
                      </p>
                      <p className="text-[10.5px] text-gray-400 font-mono">{c.cuit}</p>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{c.liquidadora?.nombre ?? "—"}</td>
                    <CeldaPaso marcado={f.aviso_enviado} fecha={f.aviso_enviado_en} disabled={!puedeEditar || ocupado} onChange={(v) => marcar(c.id, "aviso_enviado", v)} />
                    <CeldaPaso marcado={f.respondio} fecha={f.respondio_en} disabled={!puedeEditar || ocupado} onChange={(v) => marcar(c.id, "respondio", v)} />
                    <td className="px-3 py-2 text-center">
                      {puedeEditar ? (
                        <input
                          value={idsFal.get(c.id) ?? ""}
                          onChange={(e) => onIdFal(c.id, e.target.value)}
                          onBlur={(e) => {
                            const valor = e.target.value.trim();
                            if (valor !== (idsGuardados.get(c.id) ?? "")) guardar(c.id, () => guardarIdFal(c.id, valor));
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          disabled={ocupado}
                          placeholder="Opcional"
                          className="w-[130px] text-[12px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-bordo"
                        />
                      ) : (
                        <span className="text-gray-700">{idsFal.get(c.id) || "—"}</span>
                      )}
                    </td>
                    <CeldaPaso marcado={f.confirmado_arca} fecha={f.confirmado_arca_en} disabled={!puedeEditar || ocupado} onChange={(v) => marcar(c.id, "confirmado_arca", v)} />
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400">No hay clientes con ese filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CeldaPaso({ marcado, fecha, disabled, onChange }: {
  marcado: boolean; fecha: string | null; disabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <td className="px-3 py-2 text-center">
      <input type="checkbox" checked={marcado} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-bordo w-4 h-4" />
      {marcado && fecha && <p className="text-[10px] text-gray-400 leading-tight">{fmtFechaFal(fecha)}</p>}
    </td>
  );
}
