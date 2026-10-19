"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { ORIGEN_TAREA_LABEL, fmtFecha } from "@/lib/libros";
import { historialLibro, type FilaHistorial } from "../../actions";
import { Modal } from "../../ModalBase";
import { NUM, TH } from "../../ui";

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
          <p className="text-sm text-ink-subtle text-center py-10">Cargando…</p>
        ) : filas.length === 0 ? (
          <p className="text-sm text-ink-muted text-center py-10">
            Todavía no hay copiados registrados para este libro. Se registran desde Libros → Seguimiento con
            &ldquo;Retirado / Registrar copiado&rdquo;.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-row">
                <th className={clsx(TH, "text-right pl-0")}>Fecha</th>
                <th className={clsx(TH, "text-right")}>Tomo</th>
                <th className={clsx(TH, "text-left")}>Origen</th>
                <th className={clsx(TH, "text-right")}>Copiado hasta</th>
                <th className={clsx(TH, "text-right")}>Folios</th>
                <th className={clsx(TH, "text-left hidden sm:table-cell")}>Responsable</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} title={f.observaciones ?? ""} className="border-t border-line-row">
                  <td className={clsx(NUM, "py-2 pl-0 pr-3")}>{fmtFecha(f.fecha_fin)}</td>
                  <td className={clsx(NUM, "py-2 px-3")}>{f.tomo}</td>
                  <td className="py-2 px-3 text-[12px] text-ink-muted">{ORIGEN_TAREA_LABEL[f.origen]}</td>
                  <td className={clsx(NUM, "py-2 px-3")}>{fmtFecha(f.periodo_hasta)}</td>
                  <td className={clsx(NUM, "py-2 px-3")}>{f.folios_usados ?? "—"}</td>
                  <td className="py-2 px-3 text-[12px] text-ink-muted hidden sm:table-cell">{f.responsable ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
