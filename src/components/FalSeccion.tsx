"use client";

import { useEffect, useState, useTransition } from "react";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import {
  obtenerFalCliente,
  marcarPasoFal,
  guardarIdFal,
  guardarDefaultFal,
} from "@/app/(dashboard)/seguimiento/falActions";
import {
  PASOS_FAL,
  MOTIVO_DEFAULT_LABEL,
  falActivo,
  fmtFechaFal,
  fmtFechaCorte,
  type FilaFal,
  type MotivoDefaultFal,
  type PasoFal,
} from "@/lib/fal";

/** Sección "FAL" de la ficha del cliente: los cuatro pasos con su fecha y el
 * resultado al corte ("Asignado por default"), editable para quien es de
 * Sueldos. Se carga sola al abrir la ficha. */
export function FalSeccion({ clienteId }: { clienteId: string }) {
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof obtenerFalCliente>> | null>(null);
  const [idFal, setIdFal] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [guardando, startGuardar] = useTransition();

  useEffect(() => {
    obtenerFalCliente(clienteId).then((d) => {
      setDatos(d);
      setIdFal(d.idFal ?? "");
    });
  }, [clienteId]);

  if (!datos) {
    return <p className="text-[12px] text-gray-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Cargando FAL…</p>;
  }
  if (!datos.mostrar) return null;

  const { fila, puedeEditar, fechaCorte } = datos;
  const corteVencido = !falActivo(fechaCorte);

  function aplicar(r: { error: string } | { fila: FilaFal; idFal: string | null }) {
    if ("error" in r) setErr(r.error);
    else {
      setErr(null);
      setDatos((d) => (d ? { ...d, fila: r.fila, idFal: r.idFal } : d));
      setIdFal(r.idFal ?? "");
    }
  }

  function marcar(paso: PasoFal, valor: boolean) {
    startGuardar(async () => aplicar(await marcarPasoFal(clienteId, paso, valor)));
  }

  function guardarId() {
    if (idFal.trim() === (datos?.idFal ?? "")) return;
    startGuardar(async () => aplicar(await guardarIdFal(clienteId, idFal)));
  }

  function cambiarDefault(asignado: boolean, motivo: MotivoDefaultFal | null) {
    startGuardar(async () => aplicar(await guardarDefaultFal(clienteId, asignado, motivo)));
  }

  return (
    <div className="space-y-3">
      <p className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-gray-400 border-b border-gray-100 pb-1.5 flex items-center gap-2">
        FAL — Fondo de Asistencia Laboral
        {guardando && <Loader2 size={11} className="animate-spin text-gray-400" />}
      </p>

      <div className="space-y-2">
        {PASOS_FAL.slice(0, 2).map(({ paso, label }) => (
          <PasoFila key={paso} label={label} marcado={fila[paso]} fecha={fila[`${paso}_en`]}
            disabled={!puedeEditar || guardando} onChange={(v) => marcar(paso, v)} />
        ))}

        <div className="flex items-center gap-3">
          <span className="w-[150px] shrink-0 text-[12.5px] text-gray-700">ID FAL</span>
          {puedeEditar ? (
            <input
              value={idFal}
              onChange={(e) => setIdFal(e.target.value)}
              onBlur={guardarId}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder="Opcional"
              disabled={guardando}
              className="flex-1 min-w-0 text-[12.5px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-bordo"
            />
          ) : (
            <span className="flex-1 text-[12.5px] text-gray-800">{datos.idFal || "—"}</span>
          )}
          <span className="text-[11px] text-gray-400 w-[78px] text-right">{fmtFechaFal(fila.id_fal_en)}</span>
        </div>

        {PASOS_FAL.slice(2).map(({ paso, label }) => (
          <PasoFila key={paso} label={label} marcado={fila[paso]} fecha={fila[`${paso}_en`]}
            disabled={!puedeEditar || guardando} onChange={(v) => marcar(paso, v)} />
        ))}
      </div>

      {(corteVencido || fila.asignado_default) && (
        <div className={clsx("rounded-lg px-3 py-2.5 border", fila.asignado_default ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100")}>
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-gray-800">
            <input
              type="checkbox"
              checked={fila.asignado_default}
              disabled={!puedeEditar || guardando}
              onChange={(e) => cambiarDefault(e.target.checked, e.target.checked ? (fila.respondio ? "respondio_sin_confirmar" : "no_respondio") : null)}
              className="accent-bordo"
            />
            Asignado por default
          </label>
          {fila.asignado_default && (
            <div className="mt-1.5 pl-6 flex items-center gap-2 text-[12px] text-gray-600">
              Motivo:
              {puedeEditar ? (
                <select
                  value={fila.default_motivo ?? ""}
                  disabled={guardando}
                  onChange={(e) => cambiarDefault(true, e.target.value as MotivoDefaultFal)}
                  className="text-[12px] border border-gray-200 rounded-md px-1.5 py-0.5 bg-white"
                >
                  {Object.entries(MOTIVO_DEFAULT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ) : (
                <span className="text-gray-800">{fila.default_motivo ? MOTIVO_DEFAULT_LABEL[fila.default_motivo] : "—"}</span>
              )}
            </div>
          )}
          <p className="text-[10.5px] text-gray-400 mt-1.5">Fecha de corte: {fmtFechaCorte(fechaCorte)}</p>
        </div>
      )}

      {err && <p className="text-[11px] text-danger">{err}</p>}
    </div>
  );
}

function PasoFila({ label, marcado, fecha, disabled, onChange }: {
  label: string; marcado: boolean; fecha: string | null; disabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <span className="w-[150px] shrink-0 text-[12.5px] text-gray-700">{label}</span>
      <input type="checkbox" checked={marcado} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-bordo" />
      <span className="flex-1" />
      <span className="text-[11px] text-gray-400 w-[78px] text-right">{marcado ? fmtFechaFal(fecha) : ""}</span>
    </label>
  );
}
