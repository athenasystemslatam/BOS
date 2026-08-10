"use client";

import { useState, useTransition } from "react";
import { ShieldOff, Trash2 } from "lucide-react";
import { AccesoBloqueado } from "@/types";
import { bloquearAcceso, desbloquearAcceso } from "./actions";

export function BloqueosPanel({ bloqueados }: { bloqueados: AccesoBloqueado[] }) {
  const [lista, setLista] = useState(bloqueados);
  const [email, setEmail] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleBloquear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await bloquearAcceso(email, motivo.trim() || null);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setLista((prev) => [
        { email: email.trim().toLowerCase(), motivo: motivo.trim() || null, bloqueado_por: null, bloqueado_en: new Date().toISOString() },
        ...prev.filter((b) => b.email !== email.trim().toLowerCase()),
      ]);
      setEmail("");
      setMotivo("");
    });
  }

  function handleDesbloquear(email: string) {
    startTransition(async () => {
      const result = await desbloquearAcceso(email);
      if (!result?.error) {
        setLista((prev) => prev.filter((b) => b.email !== email));
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm mt-6">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-[15px] font-semibold text-gray-900 flex items-center gap-2">
          <ShieldOff size={15} className="text-gray-400" />
          Accesos bloqueados
        </h2>
        <p className="text-[12px] text-gray-400 mt-0.5">
          Corta el acceso a gente en modo consulta (sin fila de liquidadora/admin) que ya no debería
          entrar a BOS — por ejemplo, alguien de otra área que se desvinculó del estudio.
        </p>
      </div>

      <form onSubmit={handleBloquear} className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@kmaconsultores.com.ar"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo focus:ring-1 focus:ring-bordo/20 transition-colors"
          />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Motivo <span className="text-gray-300 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: se desvinculó del estudio"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo focus:ring-1 focus:ring-bordo/20 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-60"
        >
          Bloquear
        </button>
        {error && <p className="text-xs text-danger w-full">{error}</p>}
      </form>

      {lista.length === 0 ? (
        <div className="px-6 py-8 text-center text-[13px] text-gray-400">
          No hay accesos bloqueados.
        </div>
      ) : (
        <ul className="divide-y divide-gray-50">
          {lista.map((b) => (
            <li key={b.email} className="px-6 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-gray-800 truncate">{b.email}</p>
                <p className="text-[11px] text-gray-400 truncate">
                  {b.motivo ?? "Sin motivo"} ·{" "}
                  {new Date(b.bloqueado_en).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <button
                onClick={() => handleDesbloquear(b.email)}
                disabled={isPending}
                title="Desbloquear"
                className="shrink-0 flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-bordo hover:bg-bordo/5 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50"
              >
                <Trash2 size={12} />
                Desbloquear
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
