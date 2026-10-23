"use client";

import { useState, useTransition } from "react";
import { Trash2, Check } from "lucide-react";
import {
  basesPermitidas,
  describirRegla,
  LABEL_VTO,
  TIPOS_VTO,
  type BaseVto,
  type Prorroga,
  type ReglasVto,
  type TipoVto,
} from "@/lib/vencimientosContables";
import {
  guardarReglasVto,
  crearProrroga,
  eliminarProrroga,
  guardarVtoManual,
  eliminarVtoManual,
  buscarBalancesParaManual,
  type BalanceParaManual,
} from "./actions";

export type ManualListado = {
  id: string;
  tipo: TipoVto;
  fecha: string;
  motivo: string;
  cliente: string;
  anio_fiscal: number;
};

function fmt(fecha: string): string {
  const [y, m, d] = fecha.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const INPUT = "text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 bg-white";
const LABEL = "block text-[11px] text-gray-500 mb-1";

function Tarjeta({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 md:p-6">
      <h2 className="text-[15px] font-semibold text-gray-900 mb-1">{titulo}</h2>
      <p className="text-[12px] text-gray-400 mb-4">{ayuda}</p>
      {children}
    </div>
  );
}

function MensajeError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">{msg}</p>;
}

export function ReglasVencimientosClient({
  reglasIniciales,
  prorrogasIniciales,
  manualesIniciales,
}: {
  reglasIniciales: ReglasVto;
  prorrogasIniciales: Prorroga[];
  manualesIniciales: ManualListado[];
}) {
  const [isPending, startTransition] = useTransition();

  // ── Nivel 1 ──
  const [reglas, setReglas] = useState(reglasIniciales);
  const [guardadoReglas, setGuardadoReglas] = useState(false);
  const [errorReglas, setErrorReglas] = useState<string | null>(null);

  function guardarReglas() {
    setErrorReglas(null);
    startTransition(async () => {
      const r = await guardarReglasVto(reglas);
      if (r?.error) return setErrorReglas(r.error);
      setGuardadoReglas(true);
      setTimeout(() => setGuardadoReglas(false), 2000);
    });
  }

  // ── Nivel 2 ──
  const [prorrogas, setProrrogas] = useState(prorrogasIniciales);
  const [nuevaP, setNuevaP] = useState({ tipo: "ganancias" as TipoVto, cierre_desde: "", cierre_hasta: "", fecha: "", motivo: "" });
  const [errorP, setErrorP] = useState<string | null>(null);

  function agregarProrroga() {
    setErrorP(null);
    startTransition(async () => {
      const r = await crearProrroga(nuevaP);
      if (r?.error || !r.prorroga) return setErrorP(r?.error ?? "No se pudo guardar.");
      setProrrogas((prev) => [r.prorroga!, ...prev]);
      setNuevaP((p) => ({ ...p, cierre_desde: "", cierre_hasta: "", fecha: "", motivo: "" }));
    });
  }

  function quitarProrroga(id: string) {
    setProrrogas((prev) => prev.filter((p) => p.id !== id));
    startTransition(async () => {
      await eliminarProrroga(id);
    });
  }

  // ── Nivel 3 ──
  const [manuales, setManuales] = useState(manualesIniciales);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<BalanceParaManual[]>([]);
  const [balanceSel, setBalanceSel] = useState<BalanceParaManual | null>(null);
  const [nuevaM, setNuevaM] = useState({ tipo: "balance" as TipoVto, fecha: "", motivo: "" });
  const [errorM, setErrorM] = useState<string | null>(null);

  async function buscar(q: string) {
    setQuery(q);
    setBalanceSel(null);
    setResultados(q.trim().length < 2 ? [] : await buscarBalancesParaManual(q));
  }

  function agregarManual() {
    if (!balanceSel) return setErrorM("Elegí un balance.");
    setErrorM(null);
    const sel = balanceSel;
    startTransition(async () => {
      const r = await guardarVtoManual({ balance_id: sel.id, ...nuevaM });
      if (r?.error) return setErrorM(r.error);
      // Al recargar la página aparece con su id real; mientras, se muestra
      // reemplazando la anterior del mismo balance y vencimiento si había.
      setManuales((prev) => [
        { id: `tmp-${sel.id}-${nuevaM.tipo}`, tipo: nuevaM.tipo, fecha: nuevaM.fecha, motivo: nuevaM.motivo.trim(), cliente: sel.cliente, anio_fiscal: sel.anio_fiscal },
        ...prev.filter((m) => !(m.cliente === sel.cliente && m.anio_fiscal === sel.anio_fiscal && m.tipo === nuevaM.tipo)),
      ]);
      setNuevaM({ tipo: "balance", fecha: "", motivo: "" });
      setBalanceSel(null);
      setQuery("");
      setResultados([]);
    });
  }

  function quitarManual(id: string) {
    setManuales((prev) => prev.filter((m) => m.id !== id));
    if (id.startsWith("tmp-")) return;
    startTransition(async () => {
      await eliminarVtoManual(id);
    });
  }

  return (
    <div className="space-y-6">
      {/* Nivel 1 */}
      <Tarjeta
        titulo="Contable — 1. Regla general de vencimientos"
        ayuda="Cada vencimiento se calcula desde una base más una cantidad de días. Si una base tiene prórroga o fecha manual, lo que depende de ella se corre con esa fecha."
      >
        <div className="space-y-2">
          {TIPOS_VTO.map((tipo) => (
            <div key={tipo} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-24 font-medium text-gray-700">VTO {LABEL_VTO[tipo]}</span>
              <span className="text-gray-400">=</span>
              <select
                value={reglas[tipo].base}
                onChange={(e) => setReglas((r) => ({ ...r, [tipo]: { ...r[tipo], base: e.target.value as BaseVto } }))}
                className={INPUT}
              >
                {basesPermitidas(tipo).map((b) => (
                  <option key={b} value={b}>{b === "cierre" ? "Cierre" : `VTO ${LABEL_VTO[b]}`}</option>
                ))}
              </select>
              <span className="text-gray-400">+</span>
              <input
                type="number"
                value={reglas[tipo].dias}
                onChange={(e) => setReglas((r) => ({ ...r, [tipo]: { ...r[tipo], dias: Math.trunc(Number(e.target.value) || 0) } }))}
                className={`${INPUT} w-20`}
              />
              <span className="text-gray-400">días</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={guardarReglas}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Guardar
          </button>
          {guardadoReglas && (
            <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 font-medium">
              <Check size={13} /> Guardado
            </span>
          )}
        </div>
        <MensajeError msg={errorReglas} />
      </Tarjeta>

      {/* Nivel 2 */}
      <Tarjeta
        titulo="Contable — 2. Prórrogas por período"
        ayuda="Pisa la regla general para todos los balances cuyo cierre cae entre las dos fechas. Si dos prórrogas se superponen, vale la última cargada. Se marca con P en Seguimiento y Vencimientos."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <label>
            <span className={LABEL}>Vencimiento</span>
            <select value={nuevaP.tipo} onChange={(e) => setNuevaP((p) => ({ ...p, tipo: e.target.value as TipoVto }))} className={`${INPUT} w-full`}>
              {TIPOS_VTO.map((t) => <option key={t} value={t}>{LABEL_VTO[t]}</option>)}
            </select>
          </label>
          <label>
            <span className={LABEL}>Cierres desde</span>
            <input type="date" value={nuevaP.cierre_desde} onChange={(e) => setNuevaP((p) => ({ ...p, cierre_desde: e.target.value }))} className={`${INPUT} w-full`} />
          </label>
          <label>
            <span className={LABEL}>Cierres hasta</span>
            <input type="date" value={nuevaP.cierre_hasta} onChange={(e) => setNuevaP((p) => ({ ...p, cierre_hasta: e.target.value }))} className={`${INPUT} w-full`} />
          </label>
          <label>
            <span className={LABEL}>Vence el</span>
            <input type="date" value={nuevaP.fecha} onChange={(e) => setNuevaP((p) => ({ ...p, fecha: e.target.value }))} className={`${INPUT} w-full`} />
          </label>
          <label>
            <span className={LABEL}>Motivo (obligatorio)</span>
            <input value={nuevaP.motivo} placeholder="Ej: RG 5xxx/2026" onChange={(e) => setNuevaP((p) => ({ ...p, motivo: e.target.value }))} className={`${INPUT} w-full`} />
          </label>
        </div>
        <button
          onClick={agregarProrroga}
          disabled={isPending}
          className="mt-3 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
        >
          Agregar prórroga
        </button>
        <MensajeError msg={errorP} />

        <div className="mt-5 divide-y divide-gray-100 border-t border-gray-100">
          {prorrogas.length === 0 && <p className="text-[13px] text-gray-400 py-4 text-center">Sin prórrogas cargadas</p>}
          {prorrogas.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-2.5 text-[13px]">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white bg-blue-500 shrink-0">P</span>
              <span className="flex-1 text-gray-700">
                <b>{LABEL_VTO[p.tipo]}</b> de cierres entre {fmt(p.cierre_desde)} y {fmt(p.cierre_hasta)} vence el <b>{fmt(p.fecha)}</b>
                <span className="text-gray-400"> — {p.motivo}</span>
              </span>
              <button onClick={() => quitarProrroga(p.id)} className="text-gray-300 hover:text-red-500" title="Borrar prórroga">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </Tarjeta>

      {/* Nivel 3 */}
      <Tarjeta
        titulo="Contable — 3. Fecha manual por balance"
        ayuda="Pisa la regla y las prórrogas para un balance puntual. El motivo es obligatorio. Se marca con M en Seguimiento y Vencimientos."
      >
        <div className="relative">
          <span className={LABEL}>Balance</span>
          <input
            value={balanceSel ? `${balanceSel.cliente} — ${balanceSel.anio_fiscal} (cierre ${fmt(balanceSel.fecha_cierre)})` : query}
            onChange={(e) => buscar(e.target.value)}
            placeholder="Buscar cliente por nombre..."
            className={`${INPUT} w-full`}
          />
          {!balanceSel && resultados.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
              {resultados.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBalanceSel(b)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {b.cliente} <span className="text-gray-400">— {b.anio_fiscal} · cierre {fmt(b.fecha_cierre)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {balanceSel && (
          <p className="text-[11px] text-gray-400 mt-2">
            Hoy: {TIPOS_VTO.map((t) => `${LABEL_VTO[t]} ${fmt(balanceSel.vtos[t].fecha)}`).join(" · ")}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mt-3">
          <label>
            <span className={LABEL}>Vencimiento</span>
            <select value={nuevaM.tipo} onChange={(e) => setNuevaM((m) => ({ ...m, tipo: e.target.value as TipoVto }))} className={`${INPUT} w-full`}>
              {TIPOS_VTO.map((t) => <option key={t} value={t}>{LABEL_VTO[t]}</option>)}
            </select>
          </label>
          <label>
            <span className={LABEL}>Vence el</span>
            <input type="date" value={nuevaM.fecha} onChange={(e) => setNuevaM((m) => ({ ...m, fecha: e.target.value }))} className={`${INPUT} w-full`} />
          </label>
          <label>
            <span className={LABEL}>Motivo (obligatorio)</span>
            <input value={nuevaM.motivo} onChange={(e) => setNuevaM((m) => ({ ...m, motivo: e.target.value }))} className={`${INPUT} w-full`} />
          </label>
        </div>
        <button
          onClick={agregarManual}
          disabled={isPending}
          className="mt-3 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
        >
          Guardar fecha manual
        </button>
        <MensajeError msg={errorM} />

        <div className="mt-5 divide-y divide-gray-100 border-t border-gray-100">
          {manuales.length === 0 && <p className="text-[13px] text-gray-400 py-4 text-center">Sin fechas manuales cargadas</p>}
          {manuales.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-2.5 text-[13px]">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white bg-fuchsia-500 shrink-0">M</span>
              <span className="flex-1 text-gray-700">
                {m.cliente} {m.anio_fiscal} — <b>{LABEL_VTO[m.tipo]}</b> vence el <b>{fmt(m.fecha)}</b>
                <span className="text-gray-400"> — {m.motivo}</span>
              </span>
              <button onClick={() => quitarManual(m.id)} className="text-gray-300 hover:text-red-500" title="Borrar fecha manual">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </Tarjeta>

      <p className="text-[11px] text-gray-400">
        Regla actual: {TIPOS_VTO.map((t) => `${LABEL_VTO[t]} ${describirRegla(reglas[t])}`).join(" · ")}
      </p>
    </div>
  );
}
