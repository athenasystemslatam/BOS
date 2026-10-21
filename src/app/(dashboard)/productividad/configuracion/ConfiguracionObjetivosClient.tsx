"use client";

import { useState, useTransition } from "react";
import { Trash2, Plus, Check } from "lucide-react";
import clsx from "clsx";
import type { ObjetivoContable, ObjetivoSueldos } from "@/lib/objetivos";
import {
  guardarObjetivoArea,
  guardarExcepcionCliente,
  eliminarExcepcionCliente,
  buscarClientesParaExcepcion,
} from "./actions";

type Excepcion = { clienteId: string; nombre: string; config: Record<string, number | null> };

// Campos de Contable que se pueden overridear, con su etiqueta. Los dos
// últimos quedan a propósito sin objetivo general todavía (ítem 70), pero
// ya se puede cargar una excepción puntual si dirección la define antes
// para un cliente específico.
const CAMPOS_CONTABLE: { campo: keyof ObjetivoContable; label: string }[] = [
  { campo: "balance_dias_vto", label: "Días cierre -> VTO balance" },
  { campo: "f855_dias_vto_extra", label: "Días extra VTO balance -> VTO F.855" },
  { campo: "dias_pedir_info_desde_cierre", label: "Días para pedir info (interno)" },
  { campo: "dias_recepcion_a_legalizado", label: "Días recepción -> Legalizado (interno)" },
];

function GuardarBadge({ guardado }: { guardado: boolean }) {
  if (!guardado) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 font-medium">
      <Check size={13} /> Guardado
    </span>
  );
}

export function ConfiguracionObjetivosClient({
  objetivoSueldos,
  objetivoContable,
  excepcionesIniciales,
}: {
  objetivoSueldos: ObjetivoSueldos;
  objetivoContable: ObjetivoContable;
  excepcionesIniciales: Excepcion[];
}) {
  const [, startTransition] = useTransition();

  const [sueldos, setSueldos] = useState(objetivoSueldos);
  const [contable, setContable] = useState(objetivoContable);
  const [guardadoSueldos, setGuardadoSueldos] = useState(false);
  const [guardadoContable, setGuardadoContable] = useState(false);

  const [excepciones, setExcepciones] = useState(excepcionesIniciales);
  const [buscando, setBuscando] = useState(false);
  const [queryCliente, setQueryCliente] = useState("");
  const [resultados, setResultados] = useState<{ id: string; nombre: string }[]>([]);

  function guardarSueldos() {
    startTransition(async () => {
      await guardarObjetivoArea("sueldos", sueldos);
      setGuardadoSueldos(true);
      setTimeout(() => setGuardadoSueldos(false), 2000);
    });
  }

  function guardarContableGeneral() {
    startTransition(async () => {
      await guardarObjetivoArea("contable", contable);
      setGuardadoContable(true);
      setTimeout(() => setGuardadoContable(false), 2000);
    });
  }

  async function buscar(q: string) {
    setQueryCliente(q);
    if (q.trim().length < 2) {
      setResultados([]);
      return;
    }
    setResultados(await buscarClientesParaExcepcion(q));
  }

  function agregarExcepcion(cliente: { id: string; nombre: string }) {
    if (excepciones.some((e) => e.clienteId === cliente.id)) {
      setBuscando(false);
      setQueryCliente("");
      setResultados([]);
      return;
    }
    setExcepciones((prev) => [...prev, { clienteId: cliente.id, nombre: cliente.nombre, config: {} }]);
    setBuscando(false);
    setQueryCliente("");
    setResultados([]);
  }

  function actualizarExcepcionLocal(clienteId: string, campo: string, valor: number | null) {
    setExcepciones((prev) =>
      prev.map((e) => (e.clienteId === clienteId ? { ...e, config: { ...e.config, [campo]: valor } } : e))
    );
  }

  function guardarExcepcion(e: Excepcion) {
    // Solo manda los campos que realmente tienen un valor cargado — un
    // campo vacío significa "usar el objetivo general", no "pisarlo con
    // null".
    const config = Object.fromEntries(
      Object.entries(e.config).filter(([, v]) => v !== null && v !== undefined)
    );
    startTransition(async () => {
      await guardarExcepcionCliente(e.clienteId, "contable", config);
    });
  }

  function quitarExcepcion(clienteId: string) {
    setExcepciones((prev) => prev.filter((e) => e.clienteId !== clienteId));
    startTransition(async () => {
      await eliminarExcepcionCliente(clienteId, "contable");
    });
  }

  return (
    <div className="space-y-6">
      {/* Objetivo general de Sueldos (ítem 69) */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 md:p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[15px] font-semibold text-gray-900">Sueldos — objetivo general</h2>
          <GuardarBadge guardado={guardadoSueldos} />
        </div>
        <p className="text-[12px] text-gray-400 mb-4">
          Aplica a todos los clientes. La excepción acá no es por cliente — es la marca &quot;Preliquidado –
          esperando novedades&quot; por período (ítem 97), que solo mueve el objetivo de Recibos.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Campo
            label="F.931: días hábiles antes del vencimiento"
            value={sueldos.f931_dias_habiles_antes_vencimiento}
            onChange={(v) => setSueldos((s) => ({ ...s, f931_dias_habiles_antes_vencimiento: v ?? 0 }))}
          />
          <Campo
            label="Recibos: días antes de fin de mes"
            value={sueldos.recibos_dias_antes_fin_mes}
            onChange={(v) => setSueldos((s) => ({ ...s, recibos_dias_antes_fin_mes: v ?? 0 }))}
          />
          <Campo
            label="Recibos: límite = día hábil del mes siguiente"
            value={sueldos.recibos_limite_dia_habil_mes_siguiente}
            onChange={(v) => setSueldos((s) => ({ ...s, recibos_limite_dia_habil_mes_siguiente: v ?? 0 }))}
          />
        </div>
        <button
          onClick={guardarSueldos}
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-bordo hover:opacity-90 rounded-lg transition-opacity"
        >
          Guardar
        </button>
      </div>

      {/* Objetivo general de Contable (ítem 70) */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 md:p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[15px] font-semibold text-gray-900">Contable — objetivo general</h2>
          <GuardarBadge guardado={guardadoContable} />
        </div>
        <p className="text-[12px] text-gray-400 mb-4">
          Piso legal ya cargado. Los dos objetivos internos quedan sin definir a propósito hasta medir el ciclo de
          cierres al 31/12/2026 (vencimiento 15/05/2027) — dejalos vacíos.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo
            label="Días cierre -> VTO balance (En ARCA)"
            value={contable.balance_dias_vto}
            onChange={(v) => setContable((c) => ({ ...c, balance_dias_vto: v ?? 0 }))}
          />
          <Campo
            label="Días extra VTO balance -> VTO F.855"
            value={contable.f855_dias_vto_extra}
            onChange={(v) => setContable((c) => ({ ...c, f855_dias_vto_extra: v ?? 0 }))}
          />
          <Campo
            label="Días para pedir info desde el cierre (interno)"
            value={contable.dias_pedir_info_desde_cierre}
            onChange={(v) => setContable((c) => ({ ...c, dias_pedir_info_desde_cierre: v }))}
            opcional
          />
          <Campo
            label="Días recepción -> Legalizado (interno)"
            value={contable.dias_recepcion_a_legalizado}
            onChange={(v) => setContable((c) => ({ ...c, dias_recepcion_a_legalizado: v }))}
            opcional
          />
        </div>
        <button
          onClick={guardarContableGeneral}
          className="mt-4 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
        >
          Guardar
        </button>
      </div>

      {/* Excepciones por cliente (ítem 67, Contable) */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 md:p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-[15px] font-semibold text-gray-900">Contable — excepción por cliente</h2>
          <button
            onClick={() => setBuscando((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
          >
            <Plus size={13} /> Agregar
          </button>
        </div>
        <p className="text-[12px] text-gray-400 mb-4">
          Un valor vacío usa el objetivo general de arriba. Solo se guardan los campos que se completen acá.
        </p>

        {buscando && (
          <div className="relative mb-4">
            <input
              autoFocus
              value={queryCliente}
              onChange={(e) => buscar(e.target.value)}
              placeholder="Buscar cliente por nombre..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400"
            />
            {resultados.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-auto">
                {resultados.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => agregarExcepcion(c)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {excepciones.length === 0 ? (
          <p className="text-[13px] text-gray-400 py-6 text-center">Sin excepciones cargadas</p>
        ) : (
          <div className="space-y-3">
            {excepciones.map((e) => (
              <div key={e.clienteId} className="border border-gray-100 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-medium text-gray-800">{e.nombre}</span>
                  <button
                    onClick={() => quitarExcepcion(e.clienteId)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {CAMPOS_CONTABLE.map(({ campo, label }) => (
                    <Campo
                      key={campo}
                      label={label}
                      value={e.config[campo] ?? null}
                      onChange={(v) => actualizarExcepcionLocal(e.clienteId, campo, v)}
                      opcional
                      compacto
                    />
                  ))}
                </div>
                <button
                  onClick={() => guardarExcepcion(e)}
                  className="mt-3 px-3 py-1.5 text-xs font-medium text-white bg-gray-800 hover:bg-gray-900 rounded-lg transition-colors"
                >
                  Guardar excepción
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  opcional,
  compacto,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  opcional?: boolean;
  compacto?: boolean;
}) {
  return (
    <label className="block">
      <span className={clsx("block text-gray-500 mb-1", compacto ? "text-[10px]" : "text-[11px]")}>
        {label} {opcional && <span className="text-gray-300">(opcional)</span>}
      </span>
      <input
        type="number"
        value={value ?? ""}
        placeholder={opcional ? "sin definir" : ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={clsx(
          "w-full border border-gray-200 rounded-lg focus:outline-none focus:border-emerald-400",
          compacto ? "text-[12px] px-2 py-1.5" : "text-sm px-3 py-2"
        )}
      />
    </label>
  );
}
