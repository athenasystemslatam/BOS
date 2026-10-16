"use client";

import { useEffect, useState } from "react";
import { ORIGEN_TAREA_LABEL, fmtFecha } from "@/lib/libros";
import { historialLibro, type FilaHistorial } from "../../actions";
import { Modal } from "../../ModalBase";

export function HistorialLibroModal({
  libroId,
  titulo,
  onClose,
}: {
  libroId: string;
  titulo: string;
  onClose: () => void;
}) {
  const [filas, setFilas] = useState<FilaHistorial[] | null>(null);

  useEffect(() => {
    historialLibro(libroId).then(setFilas);
  }, [libroId]);

  return (
    <Modal titulo={titulo} subtitulo="Historial de copiados" onClose={onClose} ancho="max-w-2xl">
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {filas === null ? (
          <p className="text-sm text-gray-400 text-center py-10">Cargando…</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">
            Todavía no hay copiados registrados para este libro. Se registran desde Libros → Seguimiento.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 text-left">Fecha</th>
                <th className="py-2 text-center">Tomo</th>
                <th className="py-2 text-left">Origen</th>
                <th className="py-2 text-left">Copiado hasta</th>
                <th className="py-2 text-center">Folios</th>
                <th className="py-2 text-left">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map((f) => (
                <tr key={f.id} title={f.observaciones ?? ""}>
                  <td className="py-2 text-[12px] text-gray-700">{fmtFecha(f.fecha_fin)}</td>
                  <td className="py-2 text-center text-[12px] text-gray-600">{f.tomo}</td>
                  <td className="py-2 text-[12px] text-gray-500">{ORIGEN_TAREA_LABEL[f.origen]}</td>
                  <td className="py-2 text-[12px] text-gray-700">{fmtFecha(f.periodo_hasta)}</td>
                  <td className="py-2 text-center text-[12px] text-gray-600">{f.folios_usados ?? "—"}</td>
                  <td className="py-2 text-[12px] text-gray-500">{f.responsable ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
