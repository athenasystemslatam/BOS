"use client";

import { useState, useTransition } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { LibroEstado } from "@/types";
import type { Objetivo } from "@/lib/librosObjetivosMetricas";
import { ObjetivosCard } from "./ObjetivosCard";
import {
  actualizarAvisosMandato,
  actualizarEstado,
  actualizarFechaMeta,
  actualizarMailsLibros,
  actualizarUmbralFolios,
  type ConfigMails,
} from "../actions";
import { BOTON_PRIMARIO, ENCABEZADO, PAGINA, PANEL, PANEL_CABECERA, RAYA_MODULO, SUBTITULO, TITULO } from "../ui";

const CODIGOS_PROTEGIDOS = new Set(["pendiente", "en_proceso", "en_espera", "para_copiar", "copiandose", "copiado"]);
const INPUT = "text-sm text-ink border border-line-input rounded-[9px] px-3 py-2 focus:outline-none focus:border-bordo bg-paper w-full font-plex tabular-nums";
const TH = "px-3 py-2 text-[10.5px] font-semibold text-ink-subtle uppercase tracking-[0.08em]";

// La explicación de cada ajuste va detrás de un "?" (los títulos no llevan instrucciones).
function Ayuda({ children }: { children: React.ReactNode }) {
  return (
    <details className="group inline-block align-middle">
      <summary
        aria-label="Ayuda"
        className="list-none cursor-pointer select-none w-5 h-5 rounded-full border border-line-rule text-[11px] font-semibold text-ink-muted flex items-center justify-center hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        ?
      </summary>
      <p className="mt-2 text-xs text-ink-muted max-w-md">{children}</p>
    </details>
  );
}

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
    <section className={clsx(PANEL, "p-6")}>
      <div className="flex items-start gap-2 mb-4">
        <h2 className="font-archivo text-[15px] font-bold text-ink">Umbral de folios</h2>
        <Ayuda>
          Cuando a un libro le quedan este número de folios libres o menos, se crea solo un pedido de presupuesto de
          tomo nuevo.
        </Ayuda>
      </div>
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
          className={clsx(BOTON_PRIMARIO, "whitespace-nowrap")}
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </form>
      {msg && (
        <p className={clsx("text-xs mt-2", msg.ok ? "text-green-700" : "text-red-700")}>
          {msg.texto}
        </p>
      )}
    </section>
  );
}

// ── Avisos de mandato ────────────────────────────────────────────────────────

function AvisosMandatoCard({ avisosIniciales }: { avisosIniciales: number[] }) {
  const [valor, setValor] = useState(avisosIniciales.join(", "));
  const [pendiente, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const dias = valor.split(/[,\s]+/).filter(Boolean).map(Number);
    if (dias.length === 0 || dias.some((d) => !Number.isInteger(d) || d < 1 || d > 365)) {
      return setMsg({ ok: false, texto: "Cargá días enteros entre 1 y 365, separados por coma." });
    }
    startTransition(async () => {
      const res = await actualizarAvisosMandato(dias);
      if (res.error) setMsg({ ok: false, texto: res.error });
      else setMsg({ ok: true, texto: "Guardado." });
    });
  }

  return (
    <section className={clsx(PANEL, "p-6")}>
      <div className="flex items-start gap-2 mb-4">
        <h2 className="font-archivo text-[15px] font-bold text-ink">Avisos de vencimiento de mandato</h2>
        <Ayuda>
          Días antes del vencimiento en que se avisa por mail (cada aviso una sola vez). El primero (el mayor) crea el
          pedido de renovación de autoridades.
        </Ayuda>
      </div>
      <form onSubmit={guardar} className="flex items-center gap-3 max-w-xs">
        <input className={INPUT} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="90, 60, 30" />
        <button
          type="submit"
          disabled={pendiente}
          className={clsx(BOTON_PRIMARIO, "whitespace-nowrap")}
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </form>
      {msg && (
        <p className={clsx("text-xs mt-2", msg.ok ? "text-green-700" : "text-red-700")}>
          {msg.texto}
        </p>
      )}
    </section>
  );
}

// ── Fecha meta de la puesta al día ───────────────────────────────────────────

function FechaMetaCard({ fechaInicial }: { fechaInicial: string | null }) {
  const [valor, setValor] = useState(fechaInicial ?? "");
  const [pendiente, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await actualizarFechaMeta(valor || null);
      if (res.error) setMsg({ ok: false, texto: res.error });
      else setMsg({ ok: true, texto: "Guardado." });
    });
  }

  return (
    <section className={clsx(PANEL, "p-6")}>
      <div className="flex items-start gap-2 mb-4">
        <h2 className="font-archivo text-[15px] font-bold text-ink">Fecha meta de la puesta al día</h2>
        <Ayuda>
          Fecha para la que el atraso del estudio tiene que llegar a 0. El Dashboard calcula con ella cuántos períodos hay
          que copiar por semana. Vacía = sin meta.
        </Ayuda>
      </div>
      <form onSubmit={guardar} className="flex items-center gap-3 max-w-xs">
        <input type="date" className={INPUT} value={valor} onChange={(e) => setValor(e.target.value)} />
        <button type="submit" disabled={pendiente} className={clsx(BOTON_PRIMARIO, "whitespace-nowrap")}>
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      </form>
      {msg && <p className={clsx("text-xs mt-2", msg.ok ? "text-green-700" : "text-red-700")}>{msg.texto}</p>}
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
    <tr className="border-t border-line-row">
      <td className="px-3 py-2 w-8">
        <div className="flex flex-col gap-0.5">
          <button
            onClick={() => onMover("up")}
            disabled={esPrimero || pendiente}
            aria-label="Subir"
            className="p-0.5 text-ink-ghost hover:text-ink disabled:invisible"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => onMover("down")}
            disabled={esUltimo || pendiente}
            aria-label="Bajar"
            className="p-0.5 text-ink-ghost hover:text-ink disabled:invisible"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </td>
      <td className="px-3 py-2">
        <input
          aria-label="Nombre del estado"
          className="text-sm text-ink border border-transparent rounded-lg px-2 py-1 w-full hover:border-line-input focus:border-bordo focus:outline-none bg-transparent"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onBlur={renombrar}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        {error && <p className="text-[11px] text-red-700 mt-0.5">{error}</p>}
      </td>
      <td className="px-3 py-2 text-xs text-ink-subtle hidden sm:table-cell">
        {estado.codigo ? (
          <code className="font-plex bg-paper-hover px-1.5 py-0.5 rounded text-[11px] text-ink-muted">{estado.codigo}</code>
        ) : "—"}
      </td>
      <td className="px-3 py-2 text-center">
        {estado.es_final && (
          <span className="text-[10.5px] font-semibold bg-green-600 text-white px-1.5 py-0.5 rounded-full">final</span>
        )}
      </td>
      <td className="px-3 py-2 text-center">
        <button
          onClick={toggleActivo}
          disabled={protegido || pendiente}
          title={protegido ? "Este estado no se puede desactivar (lo usa el sistema)" : undefined}
          aria-label={activo ? "Desactivar estado" : "Activar estado"}
          aria-pressed={activo}
          className={clsx(
            "w-8 h-4 rounded-full transition-colors relative",
            activo ? "bg-bordo" : "bg-line-rule",
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
    <section className={clsx(PANEL, "overflow-hidden")}>
      <div className={clsx(PANEL_CABECERA, "px-6 py-3 flex items-start gap-2")}>
        <h2 className="font-archivo text-[15px] font-bold text-ink">Estados de tareas</h2>
        <Ayuda>Editá el nombre y el orden. Los estados con código interno los usa el sistema y no se pueden desactivar.</Ayuda>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="px-3 py-2 w-8"><span className="sr-only">Orden</span></th>
            <th className={clsx(TH, "text-left")}>Nombre</th>
            <th className={clsx(TH, "text-left hidden sm:table-cell")}>Código</th>
            <th className={clsx(TH, "text-center")}>¿Final?</th>
            <th className={clsx(TH, "text-center")}>Activo</th>
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

// ── Mails ────────────────────────────────────────────────────────────────────

export type PersonaMail = { id: string; nombre: string; email: string | null; enLibros: boolean; esAdmin: boolean };

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

function MailsCard({ personas, inicial }: { personas: PersonaMail[]; inicial: ConfigMails }) {
  const equipo = personas.filter((p) => p.enLibros);
  const [excluidos, setExcluidos] = useState<Set<string>>(() => new Set(inicial.diarioExcluidos));
  // null = los administradores: se muestra tildado lo que vale hoy.
  const [semanal, setSemanal] = useState<Set<string>>(
    () => new Set(inicial.semanalIds ?? personas.filter((p) => p.esAdmin).map((p) => p.id))
  );
  const [dia, setDia] = useState(inicial.semanalDia);
  const [pendiente, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function alternar(set: Set<string>, id: string, cambiar: (s: Set<string>) => void) {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    cambiar(n);
  }

  function guardar() {
    setMsg(null);
    startTransition(async () => {
      const res = await actualizarMailsLibros({
        diarioExcluidos: Array.from(excluidos),
        semanalIds: Array.from(semanal),
        semanalDia: dia,
      });
      setMsg(res.error ? { ok: false, texto: res.error } : { ok: true, texto: "Guardado." });
    });
  }

  const FILA = "flex items-center justify-between gap-3 py-2 border-t border-line-row text-sm";
  const sinMail = <span className="text-[11px] text-ink-subtle">sin mail cargado</span>;

  return (
    <section className={clsx(PANEL, "p-6 space-y-5")}>
      <div className="flex items-start gap-2">
        <h2 className="font-archivo text-[15px] font-bold text-ink">Mails</h2>
        <Ayuda>
          El mail diario sale de lunes a viernes a las 8:00 a cada persona del equipo de Libros, con lo de sus clientes
          (y lo de los clientes sin responsable). Quien se suma al equipo de Libros lo recibe sin tocar nada. El
          resumen semanal es lo del Dashboard en corto. Se mandan solos una vez que Libros está en producción.
        </Ayuda>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle mb-1">Mail diario · equipo de Libros</p>
        {equipo.length === 0 ? (
          <p className="text-[13px] text-ink-muted">
            No hay nadie en el equipo de Libros: el diario va a los administradores. Se agrega gente desde Equipo.
          </p>
        ) : (
          equipo.map((p) => (
            <label key={p.id} className={FILA}>
              <span className="text-ink">
                {p.nombre} {!p.email && sinMail}
              </span>
              <input
                type="checkbox"
                className="accent-[#7D1C2E] w-4 h-4"
                checked={!excluidos.has(p.id)}
                disabled={!p.email}
                onChange={() => alternar(excluidos, p.id, setExcluidos)}
              />
            </label>
          ))
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">Resumen semanal</p>
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            Día
            <select
              value={dia}
              onChange={(e) => setDia(Number(e.target.value))}
              className="text-sm text-ink border border-line-input rounded-[9px] px-2 py-1 bg-paper focus:outline-none focus:border-bordo"
            >
              {DIAS.map((d, i) => (
                <option key={d} value={i + 1}>{d}</option>
              ))}
            </select>
          </label>
        </div>
        {personas.map((p) => (
          <label key={p.id} className={FILA}>
            <span className="text-ink">
              {p.nombre}
              <span className="text-[11px] text-ink-subtle">
                {" "}
                {[p.esAdmin && "admin", p.enLibros && "Libros"].filter(Boolean).join(" · ")}
              </span>{" "}
              {!p.email && sinMail}
            </span>
            <input
              type="checkbox"
              className="accent-[#7D1C2E] w-4 h-4"
              checked={semanal.has(p.id)}
              disabled={!p.email}
              onChange={() => alternar(semanal, p.id, setSemanal)}
            />
          </label>
        ))}
        {semanal.size === 0 && <p className="text-[12px] text-ink-subtle pt-2">Sin destinatarios: el resumen no sale.</p>}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={guardar} disabled={pendiente} className={BOTON_PRIMARIO}>
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        {msg && <p className={clsx("text-xs", msg.ok ? "text-green-700" : "text-red-700")}>{msg.texto}</p>}
      </div>
    </section>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export function ConfiguracionClient({
  estados,
  umbralInicial,
  avisosMandato,
  fechaMeta,
  personas,
  mails,
  objetivos,
}: {
  estados: LibroEstado[];
  umbralInicial: number;
  avisosMandato: number[];
  fechaMeta: string | null;
  personas: PersonaMail[];
  mails: ConfigMails;
  objetivos: Objetivo[];
}) {
  return (
    <div className={clsx(PAGINA, "overflow-y-auto")}>
      <div className={ENCABEZADO}>
        <span className={RAYA_MODULO} />
        <div>
          <h1 className={TITULO}>Configuración</h1>
          <p className={SUBTITULO}>Solo administradores</p>
        </div>
      </div>
      <div className="flex-1 px-4 sm:px-6 pb-8 space-y-5 max-w-2xl">
        <ObjetivosCard objetivos={objetivos} />
        <UmbralCard umbralInicial={umbralInicial} />
        <FechaMetaCard fechaInicial={fechaMeta} />
        <AvisosMandatoCard avisosIniciales={avisosMandato} />
        <MailsCard personas={personas} inicial={mails} />
        <EstadosCard estadosIniciales={estados} />
      </div>
    </div>
  );
}
