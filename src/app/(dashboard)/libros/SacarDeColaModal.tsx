"use client";

import { useState, useTransition } from "react";
import { sacarDeLaCola } from "./actions";
import { INPUT, LABEL, Modal, Pie } from "./ModalBase";

export function SacarDeColaModal({ titulo, libroId, onClose }: { titulo: string; libroId: string; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await sacarDeLaCola(libroId, motivo);
      if (res.error) return setError(res.error);
      onClose();
    });
  }

  return (
    <Modal titulo={titulo} subtitulo="Sacar de la cola" onClose={onClose}>
      <form onSubmit={confirmar} className="flex flex-col min-h-0">
        <div className="px-6 py-5 space-y-4">
          <p className="text-[13px] text-ink">
            ¿Sacar este libro de la cola? No se registra ningún copiado y el &ldquo;copiado hasta&rdquo; queda como
            está. En el historial del libro queda anotado quién lo sacó y cuándo.
          </p>
          <div>
            <label className={LABEL}>Motivo (opcional)</label>
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: error, no se van a actualizar los libros"
              className={INPUT}
              autoFocus
            />
          </div>
        </div>
        <Pie error={error} pendiente={pendiente} onClose={onClose} textoGuardar="Sacar de la cola" />
      </form>
    </Modal>
  );
}
