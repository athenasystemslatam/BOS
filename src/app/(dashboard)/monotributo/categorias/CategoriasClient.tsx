"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2 } from "lucide-react";
import { useDeshacer } from "@/components/DeshacerAviso";
import { fmtFecha, fmtPesos, leerTablaCategorias } from "@/lib/monotributoFacturacion";
import type { VersionCategorias } from "@/lib/monotributoFacturacionServer";
import { borrarVersionCategorias, guardarVersionCategorias } from "../facturacion/facturacionActions";

/** Tabla de categorías de ARCA con vigencia: cada actualización es una versión nueva. */
export function CategoriasClient({
  versiones,
  vigenteId,
  disponible,
  puedeEditar,
  esAdmin,
}: {
  versiones: VersionCategorias[];
  vigenteId: string | null;
  disponible: boolean;
  puedeEditar: boolean;
  esAdmin: boolean;
}) {
  const router = useRouter();
  const { ofrecer, aviso } = useDeshacer(15);
  const [pegado, setPegado] = useState("");
  const [vigenteDesde, setVigenteDesde] = useState("");
  const [fuente, setFuente] = useState("arca.gob.ar/monotributo/categorias.asp");
  const [vista, setVista] = useState<ReturnType<typeof leerTablaCategorias> | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [verId, setVerId] = useState<string | null>(vigenteId ?? versiones[0]?.id ?? null);
  const [trabajando, start] = useTransition();

  function previsualizar() {
    const r = leerTablaCategorias(pegado);
    setVista(r);
    if (r.vigenteDetectada && !vigenteDesde) setVigenteDesde(r.vigenteDetectada);
    setMsg(null);
  }

  function guardar() {
    if (!vista || vista.errores.length) return;
    if (!vigenteDesde) return setMsg({ tipo: "error", texto: "Indicá la fecha \"vigente desde\"." });
    start(async () => {
      const r = await guardarVersionCategorias(vigenteDesde, vista.filas, fuente, null);
      if ("error" in r) return setMsg({ tipo: "error", texto: r.error });
      setMsg({ tipo: "ok", texto: `Guardada la tabla vigente desde ${fmtFecha(vigenteDesde)}.` });
      ofrecer(r.historialIds, "Tabla de categorías guardada", () => router.refresh());
      setPegado("");
      setVista(null);
      setVigenteDesde("");
      router.refresh();
    });
  }

  function borrar(v: VersionCategorias) {
    if (!window.confirm(`¿Borrar la tabla vigente desde ${fmtFecha(v.vigente_desde)}? Queda en el historial y se puede restaurar.`)) return;
    start(async () => {
      const r = await borrarVersionCategorias(v.id);
      if ("error" in r) return setMsg({ tipo: "error", texto: r.error });
      ofrecer(r.historialIds, "Versión borrada", () => router.refresh());
      router.refresh();
    });
  }

  const ver = versiones.find((v) => v.id === verId) ?? null;
  const th = "px-3 py-2.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide";

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">Monotributo · Facturación</p>
      <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">Categorías</h1>
      <p className="text-sm text-gray-400 mt-1 mb-5">
        Tope de ingresos brutos anuales (últimos 12 meses) por categoría, según ARCA. Cada actualización es una versión nueva:
        las anteriores no se pisan y cada cálculo usa la vigente en su fecha.
      </p>

      {!disponible && (
        <p className="mb-4 text-[12.5px] bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5">
          Falta correr el SQL de Facturación (add_monotributo_facturacion.sql).
        </p>
      )}
      {msg && (
        <p className={clsx("mb-4 text-[12.5px] rounded-lg px-4 py-2", msg.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{msg.texto}</p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-gray-100">
            {versiones.length === 0 && <span className="text-[12.5px] text-gray-400">Todavía no hay ninguna tabla cargada.</span>}
            {versiones.map((v) => (
              <button
                key={v.id}
                onClick={() => setVerId(v.id)}
                className={clsx(
                  "px-3 py-1 rounded-full text-[12px] font-medium border",
                  verId === v.id ? "bg-bordo text-white border-bordo" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                )}
              >
                Desde {fmtFecha(v.vigente_desde)}{v.id === vigenteId ? " · vigente" : ""}
              </button>
            ))}
          </div>
          {ver && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px] whitespace-nowrap">
                  <thead>
                    <tr className="text-center border-b border-gray-100">
                      <th className={th}>Categoría</th>
                      <th className={th}>Tope ingresos brutos (12 meses)</th>
                      <th className={th}>Cuota mensual · servicios</th>
                      <th className={th}>Cuota mensual · venta de cosas muebles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ver.filas.map((f) => (
                      <tr key={f.categoria} className="text-center">
                        <td className="px-3 py-2 font-semibold text-gray-800">{f.categoria}</td>
                        <td className="px-3 py-2 tabular-nums">{fmtPesos(f.tope_anual)}</td>
                        <td className="px-3 py-2 tabular-nums text-gray-600">{fmtPesos(f.cuota_servicios)}</td>
                        <td className="px-3 py-2 tabular-nums text-gray-600">{fmtPesos(f.cuota_venta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-[11.5px] text-gray-400">
                <span>{ver.fuente ? `Fuente: ${ver.fuente}` : ""}</span>
                {esAdmin && (
                  <button onClick={() => borrar(ver)} disabled={trabajando} className="text-red-600 hover:underline">Borrar esta versión</button>
                )}
              </div>
            </>
          )}
        </div>

        {puedeEditar && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 h-fit">
            <h2 className="text-[14px] font-semibold text-gray-900">Cargar una tabla nueva</h2>
            <p className="text-[11.5px] text-gray-400 mt-0.5 mb-3">
              Copiá la tabla de la página de categorías de ARCA (o del PDF) y pegala acá, tal cual. Se toman el tope de ingresos brutos y
              los totales mensuales; las columnas de superficie, energía, alquileres e impuesto/aportes por separado se ignoran.
              Se ve antes de guardar.
            </p>
            <textarea
              value={pegado}
              onChange={(e) => { setPegado(e.target.value); setVista(null); }}
              rows={8}
              placeholder={"A\t$12.009.410,45\tNo excluida\tHasta 30 m²\t…\t$49.527,18\t$49.527,18\nB\t…"}
              className="w-full text-[12px] font-mono border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400"
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <label className="text-[11px] text-gray-500">
                Vigente desde
                <input type="date" value={vigenteDesde} onChange={(e) => setVigenteDesde(e.target.value)}
                  className="mt-0.5 w-full text-[12.5px] border border-gray-200 rounded-md px-2 py-1" />
              </label>
              <label className="text-[11px] text-gray-500">
                Fuente
                <input value={fuente} onChange={(e) => setFuente(e.target.value)}
                  className="mt-0.5 w-full text-[12.5px] border border-gray-200 rounded-md px-2 py-1" />
              </label>
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={previsualizar} disabled={!pegado.trim()}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 disabled:opacity-40">
                Vista previa
              </button>
              {vista && !vista.errores.length && (
                <button onClick={guardar} disabled={trabajando || !vigenteDesde}
                  className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-medium disabled:opacity-40 flex items-center gap-1.5">
                  {trabajando && <Loader2 size={12} className="animate-spin" />} Guardar versión
                </button>
              )}
            </div>
            {vista && (
              <div className="mt-3 text-[12px]">
                {vista.errores.map((e) => <p key={e} className="text-red-600">{e}</p>)}
                {vista.vigenteDetectada && <p className="text-gray-500 mb-1">Fecha detectada en lo pegado: {fmtFecha(vista.vigenteDetectada)}. Revisala.</p>}
                {vista.filas.length > 0 && (
                  <table className="w-full text-[12px] tabular-nums">
                    <tbody>
                      {vista.filas.map((f) => (
                        <tr key={f.categoria} className="border-b border-gray-50">
                          <td className="py-0.5 font-semibold">{f.categoria}</td>
                          <td className="py-0.5 text-right">{fmtPesos(f.tope_anual)}</td>
                          <td className="py-0.5 text-right text-gray-500">{fmtPesos(f.cuota_servicios)}</td>
                          <td className="py-0.5 text-right text-gray-500">{fmtPesos(f.cuota_venta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {vista.ignoradas > 0 && <p className="text-gray-400 mt-1">{vista.ignoradas} línea(s) ignoradas (títulos, referencias).</p>}
              </div>
            )}
          </div>
        )}
      </div>
      {aviso}
    </div>
  );
}
