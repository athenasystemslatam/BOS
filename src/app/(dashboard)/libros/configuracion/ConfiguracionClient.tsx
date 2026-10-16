"use client";

import { useState, useTransition } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { LibroEstado } from "@/types";
import { actualizarEstado, actualizarUmbralFolios } from "../actions";

const CODIGOS_PROTEGIDOS = new Set(["pendiente", "en_proceso", "en_espera", "para_copiar", "copiandose", "copiado"]);
const INPUT = "text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500 bg-white w-full";

// ── Umbral de folios ─────────────────────────────────────────────────────────

function UmbralCard({ umbralInicial }: { umbralInicial: number }) {
  const [valor, setValor] = useState(String(umbralInicial));
  const [pendiente, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const n = parseInt(valor, 10);
    if (!Number.isInteger(n) || n < 1) return setMsg({ ok: false, texto: "Tiene que ser un número entero mayor que 0." });
    startTransition(async () => {
      const res = await actualizarUmbralFolios(n);
      if (res.error) setMsg({ ok: false, texto: res.error });
      else setMsg({ ok: true, texto: "Guardado." });
    });
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-[13px] font-semibold text-gray-800 mb-1">Umbral de folios</h2>
      <p className="text-xs text-gray-500 mb-4">
        Cuando a un libro le quedan ≤ este número de folios libres, se genera automáticamente
        un pedido de presupuesto de tomo nuevo.
      </p>
      <form onSubmit={guardar} className="flex items-center gap-3 max-w-xs">
        <input
          type="number"
          min={1}
          step={1}
          className={INPUT}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
        <button
          type="submit"
          disabled={pendiente}
          className="px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 whitespace-nowrap"
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </form>
      {msg && (
        <p className={clsx("text-xs mt-2", msg.ok ? "text-green-600" : "text-red-600")}>
          {msg.texto}
        </p>
      )}
    </section>
  );
}

// ── Fila de estado ───────────────────────────────────────────────────────────

function FilaEstado({
  estado,
  esPrimero,
  esUltimo,
  onMover,
}: {
  estado: LibroEstado;
  esPrimero: boolean;
  esUltimo: boolean;
  onMover: (dir: "up" | "down") => void;
}) {
  const [nombre, setNombre] = useState(estado.nombre);
  const [activo, setActivo] = useState(estado.activo);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const protegido = !!estado.codigo && CODIGOS_PROTEGIDOS.has(estado.codigo);

  function renombrar() {
    if (nombre.trim() === estado.nombre) return;
    setError(null);
    startTransition(async () => {
      const res = await actualizarEstado(estado.id, { nombre: nombre.trim() });
      if (res.error) { setError(res.error); setNombre(estado.nombre); }
    });
  }

  function toggleActivo() {
    if (protegido) return;
    const next = !activo;
    setActivo(next);
    startTransition(async () => {
      const res = await actualizarEstado(estado.id, { activo: next });
      if (res.error) setActivo(!next);
    });
  }

  return (
    <tr className="border-t border-gray-100">
      <td className="px-3 py-2 w-8">
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onMover("up")}
            disabled={esPrimero || pendiente}
            className="p-0.5 text-gray-300 hover:text-gray-600 disabled:invisible"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => onMover("down")}
            disabled={esUltimo || pendiente}
            className="p-0.5 text-gray-300 hover:text-gray-600 disabled:invisible"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          className="text-sm border border-transparent rounded-lg px-2 py-1 w-full hover:border-gray-200 focus:border-violet-400 focus:outline-none bg-transparent"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={renombrar}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        {error && <p className="text-[11px] text-red-500 mt-0.5">{error}</p>}
      </td>
      <td className="px-3 py-2 text-xs text-gray-400">
        {estado.codigo ? (
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">{estado.codigo}</code>
        ) : "—"}
      </td>
      <td className="px-3 py-2 text-center">
        {estado.es_final && (
          <span className="text-[10px] font-medium bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded">final</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <button
          onClick={toggleActivo}
          disabled={protegido || pendiente}
          title={protegido ? "Este estado no se puede desactivar (lo usa el sistema)" : undefined}
          className={clsx(
            "w-8 h-4 rounded-full transition-colors relative",
            activo ? "bg-violet-500" : "bg-gray-300",
            protegido && "opacity-50 cursor-not-allowed"
          )}
        >
          <span
            className={clsx(
              "absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all",
              activo ? "left-4" : "left-0.5"
            )}
          />
        </button>
      </td>
    </tr>
  );
}

// ── Estados ──────────────────────────────────────────────────────────────────

function EstadosCard({ estadosIniciales }: { estadosIniciales: LibroEstado[] }) {
  const [estados, setEstados] = useState(estadosIniciales);
  const [, startTransition] = useTransition();

  function mover(idx: number, dir: "up" | "down") {
    const next = [...estados];
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];

    // Reasignar órdenes consecutivos basados en la nueva posición
    const nuevoOrden = next.map((e, i) => ({ ...e, orden: (i + 1) * 10 }));
    setEstados(nuevoOrden);

    // Persistir los dos estados intercambiados
    startTransition(async () => {
      await Promise.all([
        actualizarEstado(nuevoOrden[idx].id, { orden: nuevoOrden[idx].orden }),
        actualizarEstado(nuevoOrden[swap].id, { orden: nuevoOrden[swap].orden }),
      ]);
    });
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-[13px] font-semibold text-gray-800">Estados de tareas</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Editá el nombre y el orden. Los estados con código interno no se pueden desactivar.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50">
            <th className="px-3 py-2 w-8" />
            <th className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-left">Nombre</th>
            <th className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-left">Código</th>
            <th className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-center">¿Final?</th>
            <th className="px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-center">Activo</th>
          </tr>
        </thead>
        <tbody>
          {estados.map((e, i) => (
            <FilaEstado
              key={e.id}
              estado={e}
              esPrimero={i === 0}
              esUltimo={i === estados.length - 1}
              onMover={(dir) => mover(i, dir)}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export function ConfiguracionClient({
  estados,
  umbralInicial,
}: {
  estados: LibroEstado[];
  umbralInicial: number;
}) {
  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-y-auto">
      <div className="shrink-0 px-6 py-5 border-b border-gray-200 bg-white">
        <h1 className="text-[15px] font-semibold text-gray-900">Configuración · Libros</h1>
        <p className="text-xs text-gray-400 mt-0.5">Solo visible para administradores.</p>
      </div>
      <div className="flex-1 px-6 py-6 space-y-6 max-w-2xl">
        <UmbralCard umbralInicial={umbralInicial} />
        <EstadosCard estadosIniciales={estados} />
      </div>
    </div>
  );
}
