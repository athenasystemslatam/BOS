"use client";

import { useState, useTransition } from "react";
import { fmtFecha, vencimientoMandato, ANIOS_MANDATO_SA } from "@/lib/libros";
import type { TipoSocietario } from "@/types";
import { guardarMandato, type DatosMandatoForm } from "./actions";
import { INPUT, LABEL, Modal, Pie } from "./ModalBase";
import { MONO } from "./ui";

export type ValoresMandato = { designacion: string; anios: string; vencePreciso: string };

export function valoresIniciales(
  soc: { mandato_designacion: string | null; mandato_anios: number | null; mandato_vence_preciso?: string | null } | null,
  tipo: TipoSocietario | null | undefined
): ValoresMandato {
  return {
    designacion: soc?.mandato_designacion ?? "",
    anios: soc?.mandato_anios?.toString() ?? (tipo === "SA" && !soc?.mandato_designacion ? String(ANIOS_MANDATO_SA) : ""),
    vencePreciso: soc?.mandato_vence_preciso ?? "",
  };
}

/** Convierte lo cargado en el formulario; devuelve un error legible si no cierra. */
export function aDatosMandato(v: ValoresMandato): DatosMandatoForm | string {
  const anios = v.anios.trim() === "" ? null : Number(v.anios);
  if (anios != null && (!Number.isInteger(anios) || anios < 1)) {
    return "Los años de mandato tienen que ser un número entero mayor a 0 (vacío = indeterminado).";
  }
  if (v.vencePreciso && v.designacion && v.vencePreciso <= v.designacion) {
    return "El vencimiento preciso tiene que ser posterior a la designación.";
  }
  return { mandato_designacion: v.designacion || null, mandato_anios: anios, mandato_vence_preciso: v.vencePreciso || null };
}

/** Designación + años → vencimiento calculado; el preciso, si está, lo reemplaza. */
export function MandatoCampos({ valores, onChange }: { valores: ValoresMandato; onChange: (v: ValoresMandato) => void }) {
  const anios = Number(valores.anios);
  const calculado = Number.isInteger(anios) && anios > 0 ? vencimientoMandato(valores.designacion || null, anios) : null;
  const final = valores.vencePreciso || calculado;
  return (
    <>
      <div>
        <label className={LABEL}>Designación de autoridades</label>
        <input
          type="date"
          value={valores.designacion}
          onChange={(e) => onChange({ ...valores, designacion: e.target.value })}
          className={INPUT}
        />
      </div>
      <div>
        <label className={LABEL}>Mandato (años)</label>
        <input
          type="number"
          min={1}
          value={valores.anios}
          onChange={(e) => onChange({ ...valores, anios: e.target.value })}
          placeholder="Vacío = indeterminado"
          className={INPUT}
        />
      </div>
      <div>
        <label className={LABEL}>Vencimiento preciso (opcional)</label>
        <input
          type="date"
          value={valores.vencePreciso}
          onChange={(e) => onChange({ ...valores, vencePreciso: e.target.value })}
          className={INPUT}
        />
      </div>
      <div>
        <span className={LABEL}>Vence</span>
        <p className="text-[13px] text-ink py-2">
          {final ? <span className={MONO}>{fmtFecha(final)}</span> : <span className="text-ink-subtle">—</span>}
          {final && (
            <span className="text-[11px] text-ink-subtle">
              {" "}
              · {valores.vencePreciso ? "preciso" : "calculado"}
            </span>
          )}
        </p>
      </div>
    </>
  );
}

export function MandatoModal({
  cliente,
  onClose,
}: {
  cliente: {
    id: string;
    nombre: string;
    tipo: TipoSocietario | null;
    mandato: { mandato_designacion: string | null; mandato_anios: number | null; mandato_vence_preciso?: string | null } | null;
  };
  onClose: () => void;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [valores, setValores] = useState(() => valoresIniciales(cliente.mandato, cliente.tipo));

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = aDatosMandato(valores);
    if (typeof datos === "string") return setError(datos);
    startTransition(async () => {
      const res = await guardarMandato(cliente.id, datos);
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo={cliente.nombre} subtitulo="Mandato" onClose={onClose}>
      <form onSubmit={guardar} className="flex flex-col min-h-0">
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MandatoCampos valores={valores} onChange={setValores} />
          <p className="sm:col-span-2 text-[11.5px] text-ink-subtle">
            En las SA el mandato se cuenta por ejercicios: si el vencimiento real no es designación + años, cargá el
            preciso. Los avisos de 90/60/30 días usan el vencimiento final.
          </p>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} />
      </form>
    </Modal>
  );
}
