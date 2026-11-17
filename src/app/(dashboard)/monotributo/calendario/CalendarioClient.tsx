"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { copiarAnioAnterior, leerTablaPegada, mesPorDefecto, type MesCalendario } from "@/lib/calendarioArcaUtil";
import { guardarCalendarioAnio, type FilaCalendarioEdit } from "./calendarioActions";

const aEdit = (m: MesCalendario): FilaCalendarioEdit => ({
  mes: m.mes,
  vencimiento: m.vencimiento,
  recatLimite: m.recatLimite,
  recatDesde: m.recatDesde,
  nota: m.nota,
});

function diaSemana(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-AR", { weekday: "short" });
}

/** Calendario ARCA de Monotributo (solo administradores): se carga a mano una vez por año. */
export function CalendarioClient({
  anio,
  anioHoy,
  filas: iniciales,
  cargado,
  anterior,
  aviso,
}: {
  anio: number;
  anioHoy: number;
  filas: MesCalendario[];
  cargado: boolean;
  anterior: MesCalendario[];
  aviso: string | null;
}) {
  const router = useRouter();
  const [filas, setFilas] = useState<FilaCalendarioEdit[]>(iniciales.map(aEdit));
  const [modificado, setModificado] = useState(false);
  const [pegado, setPegado] = useState("");
  const [vistaPrevia, setVistaPrevia] = useState<ReturnType<typeof leerTablaPegada> | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, startGuardar] = useTransition();

  function cambiar(mes: number, campo: keyof FilaCalendarioEdit, valor: string) {
    setFilas((fs) => fs.map((f) => (f.mes === mes ? { ...f, [campo]: valor || null } : f)));
    setModificado(true);
  }

  function copiarAnterior() {
    if (!anterior.length) return setMsg({ tipo: "error", texto: `No hay calendario ${anio - 1} cargado para copiar.` });
    setFilas(copiarAnioAnterior(anterior, anio).map(aEdit));
    setModificado(true);
    setMsg({ tipo: "ok", texto: `Copiado de ${anio - 1}: vencimientos el 20 y límites el 5, corridos a día hábil. Revisá feriados y guardá.` });
  }

  function aplicarPegado() {
    if (!vistaPrevia || vistaPrevia.errores.length) return;
    setFilas((fs) =>
      fs.map((f) => {
        const p = vistaPrevia.filas.find((x) => x.mes === f.mes);
        if (!p) return f;
        // Solo pisa lo que vino en lo pegado: si no trajo recategorización, se deja la que había.
        return {
          ...f,
          vencimiento: p.vencimiento ?? f.vencimiento,
          ...(p.recatLimite ? { recatLimite: p.recatLimite, recatDesde: f.recatDesde ?? mesPorDefecto(anio, f.mes).recatDesde } : {}),
        };
      })
    );
    setModificado(true);
    setPegado("");
    setVistaPrevia(null);
    setMsg({ tipo: "ok", texto: "Tabla aplicada. Revisá y guardá." });
  }

  function guardar(confirmar = false) {
    setMsg(null);
    startGuardar(async () => {
      const r = await guardarCalendarioAnio(anio, filas, confirmar);
      if ("error" in r) return setMsg({ tipo: "error", texto: r.error });
      if ("requiereConfirmacion" in r) {
        if (window.confirm(`El calendario ${anio} ya está cargado. ¿Reemplazar ${r.cambios} dato(s)? Cada cambio queda en el historial.`)) guardar(true);
        return;
      }
      setModificado(false);
      setMsg({ tipo: "ok", texto: r.cambios ? `Guardado: ${r.cambios} cambio(s), registrados en el historial.` : "No había cambios." });
      router.refresh();
    });
  }

  const input = "text-[12.5px] border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-amber-400";

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Monotributo</p>
          <h1 className="text-[20px] font-semibold text-gray-900">Calendario {anio}</h1>
          <p className="text-[12px] text-gray-400 mt-0.5">
            Vencimiento de la cuota y ventanas de recategorización. Fuente: afip.gob.ar/vencimientos. Se usa en Seguimiento, Dashboard, Vencimientos y Alertas.
          </p>
        </div>
        <select
          value={anio}
          onChange={(e) => {
            if (modificado && !window.confirm("Hay cambios sin guardar. ¿Cambiar de año igual?")) return;
            router.push(`/monotributo/calendario?anio=${e.target.value}`);
          }}
          className="text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2"
        >
          {[anioHoy - 1, anioHoy, anioHoy + 1, anioHoy + 2].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {aviso && <p className="mb-4 text-[12.5px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5">{aviso}</p>}
      {!cargado && (
        <p className="mb-4 text-[12.5px] bg-gray-100 text-gray-600 rounded-lg px-4 py-2.5">
          {anio} todavía no está cargado: abajo se ven los valores por defecto (día 20 corrido a día hábil). Copiá el año anterior o pegá la tabla, revisá y guardá.
        </p>
      )}

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={copiarAnterior} className="text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300">
          Copiar desde {anio - 1} y ajustar fechas
        </button>
        <button
          onClick={() => guardar(false)}
          disabled={guardando || !modificado}
          className="text-xs px-4 py-2 rounded-lg bg-gray-900 text-white font-medium disabled:opacity-40 flex items-center gap-1.5"
        >
          {guardando && <Loader2 size={12} className="animate-spin" />} Guardar {anio}
        </button>
      </div>
      {msg && (
        <p className={clsx("mb-4 text-[12.5px] rounded-lg px-4 py-2", msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
          {msg.texto}
        </p>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto mb-6">
        <table className="w-full text-[12.5px] whitespace-nowrap">
          <thead>
            <tr className="bg-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wider text-left">
              <th className="px-5 py-3">Mes</th>
              <th className="px-3 py-3">Vencimiento cuota</th>
              <th className="px-3 py-3">Límite recategorización</th>
              <th className="px-3 py-3">Recategoriza desde</th>
              <th className="px-3 py-3">Nota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filas.map((f) => (
              <tr key={f.mes}>
                <td className="px-5 py-2 font-medium text-gray-800">{MESES_NOMBRES[f.mes]}</td>
                <td className="px-3 py-2">
                  <input type="date" className={input} value={f.vencimiento} onChange={(e) => cambiar(f.mes, "vencimiento", e.target.value)} />
                  <span className="ml-2 text-[11px] text-gray-400">{diaSemana(f.vencimiento)}</span>
                </td>
                <td className="px-3 py-2">
                  <input type="date" className={input} value={f.recatLimite ?? ""} onChange={(e) => cambiar(f.mes, "recatLimite", e.target.value)} />
                </td>
                <td className="px-3 py-2">
                  <input type="date" className={input} value={f.recatDesde ?? ""} disabled={!f.recatLimite}
                    onChange={(e) => cambiar(f.mes, "recatDesde", e.target.value)} />
                </td>
                <td className="px-3 py-2">
                  <input className={clsx(input, "w-56")} value={f.nota ?? ""} placeholder="—" onChange={(e) => cambiar(f.mes, "nota", e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-[14px] font-semibold text-gray-900">Pegar una tabla</h2>
        <p className="text-[11.5px] text-gray-400 mt-0.5 mb-3">
          Una línea por mes: mes, vencimiento y (si corresponde) límite de recategorización, separados por tabulador o punto y coma.
          Se puede pegar tal como se copia de la página de vencimientos de ARCA, por ejemplo <code>Enero	20/01/{String(anio).slice(2)}</code> y{" "}
          <code>Recategorización semestral	05/02/{String(anio).slice(2)}</code> (el límite va al mes de esa fecha). Las líneas sin fecha se ignoran.
          Se ve antes de aplicar y no se guarda hasta tocar &quot;Guardar&quot;.
        </p>
        <textarea
          value={pegado}
          onChange={(e) => { setPegado(e.target.value); setVistaPrevia(null); }}
          rows={6}
          className="w-full text-[12.5px] font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400"
        />
        <div className="flex gap-2 mt-2">
          <button onClick={() => setVistaPrevia(leerTablaPegada(pegado, anio))} disabled={!pegado.trim()}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 disabled:opacity-40">
            Vista previa
          </button>
          {vistaPrevia && !vistaPrevia.errores.length && vistaPrevia.filas.length > 0 && (
            <button onClick={aplicarPegado} className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white font-medium">
              Aplicar {vistaPrevia.filas.length} mes(es)
            </button>
          )}
        </div>
        {vistaPrevia && (
          <div className="mt-3 text-[12px]">
            {vistaPrevia.errores.map((e) => <p key={e} className="text-red-600">{e}</p>)}
            {vistaPrevia.filas.map((p) => (
              <p key={p.mes} className="text-gray-700">
                {MESES_NOMBRES[p.mes]}:{p.vencimiento ? ` vence ${p.vencimiento.split("-").reverse().join("/")} (${diaSemana(p.vencimiento)})` : " vencimiento sin cambios"}
                {p.recatLimite ? ` · límite recategorización ${p.recatLimite.split("-").reverse().join("/")}` : ""}
              </p>
            ))}
            {vistaPrevia.ignoradas > 0 && <p className="text-gray-400">{vistaPrevia.ignoradas} línea(s) sin fecha ignoradas (títulos o encabezados).</p>}
          </div>
        )}
      </div>
    </div>
  );
}
