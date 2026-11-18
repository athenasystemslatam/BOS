"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, Trash2 } from "lucide-react";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { useDeshacer } from "@/components/DeshacerAviso";
import { MESES_CIERRE, corteDefecto, fmtFecha, ventana12, type Control } from "@/lib/monotributoFacturacion";
import { borrarControl, guardarControles, guardarUmbral, type FilaControlEdit } from "../facturacion/facturacionActions";

/** Controles de facturación del año: cuándo se revisa lo facturado en los últimos 12 meses. */
export function ControlesClient({
  anio,
  anioHoy,
  controles,
  umbral: umbralInicial,
  disponible,
  puedeEditar,
}: {
  anio: number;
  anioHoy: number;
  controles: Control[];
  umbral: number;
  disponible: boolean;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const { ofrecer, aviso } = useDeshacer(12);
  const [filas, setFilas] = useState<FilaControlEdit[]>(
    controles.map((c) => ({ id: c.id, mes: c.mes, fecha_corte: c.fecha_corte, es_cierre_semestre: c.es_cierre_semestre, nota: c.nota }))
  );
  const [modificado, setModificado] = useState(false);
  const [mesNuevo, setMesNuevo] = useState("");
  const [umbral, setUmbral] = useState(String(umbralInicial));
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [trabajando, start] = useTransition();

  function cambiar(mes: number, cambios: Partial<FilaControlEdit>) {
    setFilas((fs) => fs.map((f) => (f.mes === mes ? { ...f, ...cambios } : f)));
    setModificado(true);
  }

  function agregar() {
    const mes = Number(mesNuevo);
    if (!mes || filas.some((f) => f.mes === mes)) return;
    setFilas((fs) => [...fs, { id: null, mes, fecha_corte: corteDefecto(anio, mes), es_cierre_semestre: MESES_CIERRE.includes(mes), nota: null }].sort((a, b) => a.mes - b.mes));
    setMesNuevo("");
    setModificado(true);
  }

  function guardar() {
    setMsg(null);
    start(async () => {
      const r = await guardarControles(anio, filas);
      if ("error" in r) return setMsg({ tipo: "error", texto: r.error });
      setModificado(false);
      setMsg({ tipo: "ok", texto: r.historialIds.length ? "Controles guardados (quedan en el historial)." : "No había cambios." });
      ofrecer(r.historialIds, "Controles guardados", () => router.refresh());
      router.refresh();
    });
  }

  function sacar(f: FilaControlEdit) {
    if (!f.id) {
      setFilas((fs) => fs.filter((x) => x.mes !== f.mes));
      return;
    }
    if (!window.confirm(`¿Sacar el control de ${MESES_NOMBRES[f.mes]} ${anio}? Si tiene datos cargados, solo un administrador puede sacarlo.`)) return;
    start(async () => {
      const r = await borrarControl(f.id!);
      if ("error" in r) return setMsg({ tipo: "error", texto: r.error });
      setFilas((fs) => fs.filter((x) => x.id !== f.id));
      ofrecer(r.historialIds, `Control de ${MESES_NOMBRES[f.mes]} sacado`, () => router.refresh());
      router.refresh();
    });
  }

  function guardarElUmbral() {
    const n = Number(umbral.replace(",", "."));
    start(async () => {
      const r = await guardarUmbral(n);
      if ("error" in r) return setMsg({ tipo: "error", texto: r.error });
      setMsg({ tipo: "ok", texto: `Umbral guardado: amarillo desde el ${n}% del tope.` });
      ofrecer(r.historialIds, "Umbral guardado", () => router.refresh());
      router.refresh();
    });
  }

  const input = "text-[12.5px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-amber-400 disabled:bg-gray-50";
  const th = "px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide";

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Monotributo · Facturación</p>
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Controles {anio}</h1>
          <p className="text-sm text-gray-400 mt-1 max-w-3xl">
            En cada control se carga lo facturado en los 12 meses que terminan en la fecha de corte. Junio y diciembre son los cierres de
            semestre (la recategorización es en enero y julio, con límite el 5 de febrero y el 5 de agosto).
          </p>
        </div>
        <select
          value={anio}
          onChange={(e) => {
            if (modificado && !window.confirm("Hay cambios sin guardar. ¿Cambiar de año igual?")) return;
            router.push(`/monotributo/controles?anio=${e.target.value}`);
          }}
          className="text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2"
        >
          {[anioHoy - 1, anioHoy, anioHoy + 1].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {!disponible && (
        <p className="mb-4 text-[12.5px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5">
          Falta correr el SQL de Facturación (add_monotributo_facturacion.sql).
        </p>
      )}
      {!puedeEditar && (
        <p className="mb-4 text-[12.5px] bg-gray-100 text-gray-600 rounded-lg px-4 py-2.5">Modo consulta: los controles los editan el equipo de Monotributo y los administradores.</p>
      )}
      {msg && (
        <p className={clsx("mb-4 text-[12.5px] rounded-lg px-4 py-2", msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{msg.texto}</p>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto mb-4">
        <table className="w-full text-[12.5px] whitespace-nowrap">
          <thead>
            <tr className="text-center border-b border-gray-100">
              <th className={clsx(th, "text-left pl-5")}>Control</th>
              <th className={th}>Fecha de corte</th>
              <th className={th}>Ventana de 12 meses</th>
              <th className={th}>Cierre de semestre</th>
              <th className={th}>Nota</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filas.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-gray-400">No hay controles para {anio}.</td></tr>
            )}
            {filas.map((f) => {
              const v = f.fecha_corte ? ventana12(f.fecha_corte) : null;
              return (
                <tr key={f.mes} className="text-center">
                  <td className="pl-5 pr-3 py-2 text-left font-medium text-gray-800">{MESES_NOMBRES[f.mes]}</td>
                  <td className="px-3 py-2">
                    <input type="date" className={input} value={f.fecha_corte} disabled={!puedeEditar} onChange={(e) => cambiar(f.mes, { fecha_corte: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 text-gray-600 tabular-nums">{v ? `del ${fmtFecha(v.desde)} al ${fmtFecha(v.hasta)}` : "—"}</td>
                  <td className="px-3 py-2">
                    <input type="checkbox" className="accent-bordo" checked={f.es_cierre_semestre} disabled={!puedeEditar} onChange={(e) => cambiar(f.mes, { es_cierre_semestre: e.target.checked })} />
                  </td>
                  <td className="px-3 py-2">
                    <input className={clsx(input, "w-56 text-center")} value={f.nota ?? ""} placeholder="—" disabled={!puedeEditar} onChange={(e) => cambiar(f.mes, { nota: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    {puedeEditar && (
                      <button onClick={() => sacar(f)} disabled={trabajando} title="Sacar este control" className="text-gray-300 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {puedeEditar && (
        <div className="flex items-center gap-2 flex-wrap mb-8">
          <select value={mesNuevo} onChange={(e) => setMesNuevo(e.target.value)} className="text-[12.5px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
            <option value="">Agregar un control…</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !filas.some((f) => f.mes === m)).map((m) => (
              <option key={m} value={m}>{MESES_NOMBRES[m]}</option>
            ))}
          </select>
          <button onClick={agregar} disabled={!mesNuevo} className="text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 disabled:opacity-40">Agregar</button>
          <button onClick={guardar} disabled={trabajando || !modificado}
            className="text-xs px-4 py-2 rounded-lg bg-gray-900 text-white font-medium disabled:opacity-40 flex items-center gap-1.5">
            {trabajando && <Loader2 size={12} className="animate-spin" />} Guardar controles {anio}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 max-w-xl">
        <h2 className="text-[14px] font-semibold text-gray-900">Cerca del tope</h2>
        <p className="text-[11.5px] text-gray-400 mt-0.5 mb-3">
          Verde por debajo de este porcentaje del tope, amarillo desde acá hasta el 100 % y rojo si lo supera. Vale para la pantalla y para la ficha.
        </p>
        <div className="flex items-center gap-2">
          <input value={umbral} onChange={(e) => setUmbral(e.target.value)} disabled={!puedeEditar} className={clsx(input, "w-20 text-center")} />
          <span className="text-[12.5px] text-gray-500">%</span>
          {puedeEditar && (
            <button onClick={guardarElUmbral} disabled={trabajando || Number(umbral.replace(",", ".")) === umbralInicial}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-medium disabled:opacity-40">Guardar</button>
          )}
        </div>
      </div>
      {aviso}
    </div>
  );
}
