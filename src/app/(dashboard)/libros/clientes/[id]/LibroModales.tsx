"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { useBackdropClose } from "@/lib/useBackdropClose";
import {
  ESTADO_LIBRO,
  PERIODICIDAD_LABEL,
  SOPORTE_LABEL,
  UBICACION_LABEL,
} from "@/lib/libros";
import type {
  EstadoLibro,
  Libro,
  LibroCatalogo,
  PeriodicidadLibro,
  SoporteLibro,
  UbicacionLibro,
} from "@/types";
import { abrirNuevoTomo, crearLibro, editarLibro, type DatosLibro } from "../../actions";

const LABEL = "text-xs font-medium text-gray-500 block mb-1";
const INPUT =
  "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500 bg-white";

function aEntero(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
}

function Modal({
  titulo,
  subtitulo,
  onClose,
  children,
}: {
  titulo: string;
  subtitulo: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const backdrop = useBackdropClose(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...backdrop}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[.18em] uppercase text-gray-400">{subtitulo}</p>
            <h2 className="text-[15px] font-semibold text-gray-900 mt-1">{titulo}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Pie({ error, pendiente, onClose }: { error: string | null; pendiente: boolean; onClose: () => void }) {
  return (
    <div className="px-6 py-4 border-t border-gray-100 shrink-0 space-y-3">
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pendiente}
          className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50"
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

export function LibroModal({
  clienteId,
  item,
  libro,
  soporteDefault,
  onClose,
}: {
  clienteId: string;
  item: LibroCatalogo;
  libro: Libro | null;
  soporteDefault: SoporteLibro;
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tomo, setTomo] = useState(String(libro?.tomo ?? 1));
  const [estado, setEstado] = useState<EstadoLibro>(libro?.estado ?? "activo");
  const [soporte, setSoporte] = useState<SoporteLibro>(libro?.soporte ?? soporteDefault);
  const [rubricaNro, setRubricaNro] = useState(libro?.rubrica_nro ?? "");
  const [rubricaFecha, setRubricaFecha] = useState(libro?.rubrica_fecha ?? "");
  const [foliosTotales, setFoliosTotales] = useState(libro?.folios_totales?.toString() ?? "");
  const [foliosUsados, setFoliosUsados] = useState(String(libro?.folios_usados ?? 0));
  const [ultimoCopiado, setUltimoCopiado] = useState(libro?.ultimo_periodo_copiado ?? "");
  const [periodicidad, setPeriodicidad] = useState<PeriodicidadLibro | "">(libro?.periodicidad ?? "");
  const [ubicacion, setUbicacion] = useState<UbicacionLibro>(libro?.ubicacion ?? "estudio");
  const [ubicacionDetalle, setUbicacionDetalle] = useState(libro?.ubicacion_detalle ?? "");
  const [observaciones, setObservaciones] = useState(libro?.observaciones ?? "");

  const sinLibro = estado === "sin_libro";

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nTomo = aEntero(tomo);
    const nTotales = aEntero(foliosTotales);
    const nUsados = aEntero(foliosUsados) ?? 0;
    if (nTomo == null || Number.isNaN(nTomo) || nTomo < 1) return setError("El tomo tiene que ser un número mayor a 0.");
    if (Number.isNaN(nTotales) || Number.isNaN(nUsados)) return setError("Los folios tienen que ser números enteros.");
    if (nTotales != null && nTotales < 1) return setError("Los folios totales tienen que ser mayores a 0.");
    if (nTotales != null && nUsados > nTotales) return setError("Los folios usados no pueden superar los totales.");

    const datos: DatosLibro = {
      tomo: nTomo,
      estado,
      soporte,
      rubrica_nro: sinLibro ? null : rubricaNro.trim() || null,
      rubrica_fecha: sinLibro ? null : rubricaFecha || null,
      folios_totales: sinLibro ? null : nTotales,
      folios_usados: sinLibro ? 0 : nUsados,
      ultimo_periodo_copiado: sinLibro ? null : ultimoCopiado || null,
      periodicidad: periodicidad || null,
      ubicacion,
      ubicacion_detalle: ubicacion === "otro" ? ubicacionDetalle.trim() || null : null,
      observaciones: observaciones.trim() || null,
    };

    startTransition(async () => {
      const res = libro ? await editarLibro(libro.id, datos) : await crearLibro(clienteId, item.id, datos);
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo={item.nombre} subtitulo={libro ? `Editar tomo ${libro.tomo}` : "Cargar libro"} onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>Tomo</label>
              <input type="number" min={1} value={tomo} onChange={(e) => setTomo(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Estado</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value as EstadoLibro)} className={INPUT}>
                {Object.entries(ESTADO_LIBRO).map(([v, { label }]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Soporte</label>
              <select value={soporte} onChange={(e) => setSoporte(e.target.value as SoporteLibro)} className={INPUT}>
                {Object.entries(SOPORTE_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {sinLibro ? (
            <p className="text-[12px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              &ldquo;Sin libro&rdquo; = al cliente le corresponde este libro pero no lo tiene. Rúbrica y folios
              se cargan cuando exista el tomo.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Nº de rúbrica</label>
                  <input value={rubricaNro} onChange={(e) => setRubricaNro(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Fecha de rúbrica</label>
                  <input type="date" value={rubricaFecha} onChange={(e) => setRubricaFecha(e.target.value)} className={INPUT} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={LABEL}>Folios totales</label>
                  <input type="number" min={1} value={foliosTotales} onChange={(e) => setFoliosTotales(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Folios usados</label>
                  <input type="number" min={0} value={foliosUsados} onChange={(e) => setFoliosUsados(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Último copiado</label>
                  <input type="date" value={ultimoCopiado} onChange={(e) => setUltimoCopiado(e.target.value)} className={INPUT} />
                </div>
              </div>
            </>
          )}

          <div>
            <label className={LABEL}>Frecuencia</label>
            <select
              value={periodicidad}
              onChange={(e) => setPeriodicidad(e.target.value as PeriodicidadLibro | "")}
              className={INPUT}
            >
              <option value="">Según catálogo — {PERIODICIDAD_LABEL[item.periodicidad]}</option>
              {Object.entries(PERIODICIDAD_LABEL).map(([v, label]) => (
                <option key={v} value={v}>{label} (propia de este cliente)</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Cambiala solo si el estatuto del cliente pide otra frecuencia.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Ubicación</label>
              <select value={ubicacion} onChange={(e) => setUbicacion(e.target.value as UbicacionLibro)} className={INPUT}>
                {Object.entries(UBICACION_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
            </div>
            {ubicacion === "otro" && (
              <div>
                <label className={LABEL}>¿Dónde?</label>
                <input value={ubicacionDetalle} onChange={(e) => setUbicacionDetalle(e.target.value)} className={INPUT} />
              </div>
            )}
          </div>

          <div>
            <label className={LABEL}>Observaciones</label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className={INPUT}
            />
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} />
      </form>
    </Modal>
  );
}

export function NuevoTomoModal({
  item,
  libro,
  onClose,
}: {
  item: LibroCatalogo;
  libro: Libro;
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rubricaNro, setRubricaNro] = useState("");
  const [rubricaFecha, setRubricaFecha] = useState("");
  const [foliosTotales, setFoliosTotales] = useState(libro.folios_totales?.toString() ?? "");

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const nTotales = aEntero(foliosTotales);
    if (Number.isNaN(nTotales) || (nTotales != null && nTotales < 1)) {
      return setError("Los folios totales tienen que ser un número mayor a 0.");
    }
    startTransition(async () => {
      const res = await abrirNuevoTomo(libro.id, {
        rubrica_nro: rubricaNro.trim() || null,
        rubrica_fecha: rubricaFecha || null,
        folios_totales: nTotales,
      });
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo={item.nombre} subtitulo="Nuevo tomo" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="px-6 py-5 space-y-4">
          <p className="text-[12px] text-gray-600 bg-violet-50 rounded-lg px-3 py-2">
            El tomo {libro.tomo} queda <strong>cerrado</strong> y se abre el siguiente con 0 folios usados.
            El tomo cerrado se sigue viendo en &ldquo;Tomos anteriores&rdquo;.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL}>Nº de rúbrica</label>
              <input value={rubricaNro} onChange={(e) => setRubricaNro(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Fecha de rúbrica</label>
              <input type="date" value={rubricaFecha} onChange={(e) => setRubricaFecha(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className={LABEL}>Folios totales</label>
              <input type="number" min={1} value={foliosTotales} onChange={(e) => setFoliosTotales(e.target.value)} className={INPUT} />
            </div>
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} />
      </form>
    </Modal>
  );
}
