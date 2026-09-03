"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { editarEmpresa } from "./actions";
import { Cliente, Liquidadora, ClaveAcceso } from "@/types";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { ClavesAccesoEditor } from "@/components/ClavesAccesoEditor";

const inputCls =
  "w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-bordo focus:ring-1 focus:ring-bordo/20 transition-colors bg-white";

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${value ? "bg-bordo" : "bg-gray-200"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function formatCuit(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

const JURISDICCIONES = ["CABA", "PBA", "Otra"];

export function EditarEmpresaModal({
  cliente,
  liquidadoras,
  onClose,
}: {
  cliente: Cliente & { liquidadora?: Liquidadora };
  liquidadoras: Liquidadora[];
  onClose: () => void;
}) {
  const [cuit, setCuit] = useState(formatCuit(cliente.cuit));
  const [tieneSindicato, setTieneSindicato] = useState(cliente.tiene_sindicato);
  const [tieneRubrica, setTieneRubrica] = useState(cliente.tiene_rubrica_lsd);
  const [lsdDesdeAnio, setLsdDesdeAnio] = useState<number | null>(cliente.lsd_desde_anio ?? null);
  const [lsdDesMes, setLsdDesMes] = useState<number | null>(cliente.lsd_desde_mes ?? null);
  const [lsdHastaAnio, setLsdHastaAnio] = useState<number | null>(cliente.lsd_hasta_anio ?? null);
  const [lsdHastaMes, setLsdHastaMes] = useState<number | null>(cliente.lsd_hasta_mes ?? null);
  const [esQuincenal, setEsQuincenal] = useState(cliente.es_quincenal);
  const [jurisdiccion, setJurisdiccion] = useState(
    JURISDICCIONES.includes(cliente.jurisdiccion ?? "") ? (cliente.jurisdiccion as string) : "Otra"
  );
  const [claves, setClaves] = useState<ClaveAcceso[]>(
    (cliente.claves_acceso ?? []).map((c) => ({ ...c, url: c.url ?? "" }))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const terminacion =
    cuit.replace(/\D/g, "").length === 11 ? cuit.replace(/\D/g, "")[10] : "—";

  const sugerenciasClaves = [
    "ARCA",
    ...(jurisdiccion === "CABA" ? ["TAD"] : []),
    ...(jurisdiccion === "PBA" ? ["SITRADIB"] : []),
    ...(tieneSindicato && cliente.sindicato_nombre ? [cliente.sindicato_nombre] : []),
    ...(tieneRubrica ? ["Rúbrica"] : []),
  ];

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("tiene_sindicato", String(tieneSindicato));
    formData.set("tiene_rubrica_lsd", String(tieneRubrica));
    formData.set("es_quincenal", String(esQuincenal));
    formData.set("claves_acceso", JSON.stringify(claves));
    if (jurisdiccion !== "Otra") formData.set("jurisdiccion", jurisdiccion);
    if (tieneRubrica && (jurisdiccion === "PBA" || jurisdiccion === "CABA")) {
      if (lsdDesdeAnio) formData.set("lsd_desde_anio", String(lsdDesdeAnio));
      if (lsdDesMes) formData.set("lsd_desde_mes", String(lsdDesMes));
      if (lsdHastaAnio) formData.set("lsd_hasta_anio", String(lsdHastaAnio));
      if (lsdHastaMes) formData.set("lsd_hasta_mes", String(lsdHastaMes));
    }
    setError(null);
    startTransition(async () => {
      const result = await editarEmpresa(formData);
      if (result?.error) setError(result.error);
      else onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="text-[15px] font-semibold text-gray-900">Editar empresa</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 flex flex-col">
          <div className="px-6 py-5 space-y-4 flex-1">
            <input type="hidden" name="id" value={cliente.id} />

            {/* Nombre */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Nombre / Razón social <span className="text-danger">*</span>
              </label>
              <input name="nombre" type="text" required defaultValue={cliente.nombre} className={inputCls} />
            </div>

            {/* CUIT + Terminación */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  CUIT <span className="text-danger">*</span>
                </label>
                <input
                  name="cuit"
                  type="text"
                  required
                  value={cuit}
                  onChange={(e) => setCuit(formatCuit(e.target.value))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Term. CUIT
                </label>
                <div className="text-sm border border-gray-100 rounded-lg px-3 py-2.5 bg-gray-50 text-gray-500 font-mono">
                  {terminacion}
                </div>
              </div>
            </div>

            {/* CUIL de ARCA */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                CUIL de acceso a ARCA
              </label>
              <input
                name="cuil_arca"
                type="text"
                defaultValue={cliente.cuil_arca ?? ""}
                className={inputCls}
              />
            </div>

            {/* Tipo + Liquidadora */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Tipo de contribuyente <span className="text-danger">*</span>
                </label>
                <select name="tipo_contribuyente" defaultValue={cliente.tipo_contribuyente} className={inputCls}>
                  <option value="empresa">Empresa</option>
                  <option value="monotributista">Monotributista</option>
                  <option value="inscripto">Inscripto</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Liquidadora <span className="text-danger">*</span>
                </label>
                <select name="liquidador_id" required defaultValue={cliente.liquidador_id} className={inputCls}>
                  <option value="">Seleccionar…</option>
                  {liquidadoras.map((l) => (
                    <option key={l.id} value={l.id}>{l.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quincenal */}
            <div className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Es quincenal</span>
                <Toggle value={esQuincenal} onChange={setEsQuincenal} />
              </div>
            </div>

            {/* Jurisdicción + Estado */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Jurisdicción laboral</label>
                <select
                  value={jurisdiccion}
                  onChange={(e) => setJurisdiccion(e.target.value)}
                  className={inputCls}
                >
                  {JURISDICCIONES.map((j) => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
                {jurisdiccion === "Otra" && (
                  <input
                    name="jurisdiccion"
                    type="text"
                    defaultValue={JURISDICCIONES.includes(cliente.jurisdiccion ?? "") ? "" : cliente.jurisdiccion ?? ""}
                    placeholder="Especificar jurisdicción"
                    className={`${inputCls} mt-2`}
                  />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Estado</label>
                <select name="estado" defaultValue={cliente.estado} className={inputCls}>
                  <option value="activo">Activa</option>
                  <option value="inactivo">Inactiva</option>
                </select>
              </div>
            </div>

            {/* ART + Red bancaria */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">ART</label>
                <input name="art" type="text" defaultValue={cliente.art ?? ""} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Red bancaria</label>
                <input name="red_bancaria" type="text" defaultValue={cliente.red_bancaria ?? ""} className={inputCls} />
              </div>
            </div>

            {/* Fecha alta empleador */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Fecha de alta como empleador
              </label>
              <input
                name="fecha_alta_empleador"
                type="date"
                defaultValue={cliente.fecha_alta_empleador ?? ""}
                className={inputCls}
              />
            </div>

            {/* Sindicato */}
            <div className="border border-gray-100 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Sindicato</span>
                <Toggle value={tieneSindicato} onChange={setTieneSindicato} />
              </div>
              {tieneSindicato && (
                <input
                  name="sindicato_nombre"
                  type="text"
                  placeholder="Nombre del sindicato"
                  defaultValue={cliente.sindicato_nombre ?? ""}
                  className={inputCls}
                />
              )}
            </div>

            {/* Rúbrica LSD */}
            <div className="border border-gray-100 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-700">Rúbrica LSD</span>
                <Toggle value={tieneRubrica} onChange={setTieneRubrica} />
              </div>
              {tieneRubrica && (jurisdiccion === "PBA" || jurisdiccion === "CABA") && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">Regularización desde</label>
                    <div className="flex gap-2">
                      <select
                        value={lsdDesMes ?? ""}
                        onChange={(e) => setLsdDesMes(e.target.value ? Number(e.target.value) : null)}
                        className={`${inputCls} flex-1`}
                      >
                        <option value="">— Mes</option>
                        {MESES_NOMBRES.slice(1).map((m, i) => (
                          <option key={i + 1} value={i + 1}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={lsdDesdeAnio ?? ""}
                        onChange={(e) => setLsdDesdeAnio(e.target.value ? Number(e.target.value) : null)}
                        className={`${inputCls} flex-1`}
                      >
                        <option value="">— Año</option>
                        {Array.from({ length: 9 }, (_, i) => 2018 + i).map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5">
                      Hasta (manual, si el historial no está en el sistema)
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={lsdHastaMes ?? ""}
                        onChange={(e) => setLsdHastaMes(e.target.value ? Number(e.target.value) : null)}
                        className={`${inputCls} flex-1`}
                      >
                        <option value="">— Mes</option>
                        {MESES_NOMBRES.slice(1).map((m, i) => (
                          <option key={i + 1} value={i + 1}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={lsdHastaAnio ?? ""}
                        onChange={(e) => setLsdHastaAnio(e.target.value ? Number(e.target.value) : null)}
                        className={`${inputCls} flex-1`}
                      >
                        <option value="">— Año</option>
                        {Array.from({ length: 9 }, (_, i) => 2018 + i).map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">El sistema usa el mayor entre este valor y lo detectado automáticamente.</p>
                  </div>
                </>
              )}
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Observaciones</label>
              <textarea
                name="observaciones"
                rows={2}
                defaultValue={cliente.observaciones ?? ""}
                className={`${inputCls} resize-none`}
              />
            </div>

            {/* Carpeta Drive */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Carpeta Drive (URL o ID)
              </label>
              <input
                name="drive_folder_id"
                type="text"
                defaultValue={cliente.drive_folder_id ?? ""}
                placeholder="https://drive.google.com/drive/folders/… o ID directo"
                className={inputCls}
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Usalo cuando el nombre en Drive no coincide con el nombre del sistema (ej: carpeta &quot;RA&quot; para &quot;Rodrigo Acosta&quot;).
              </p>
            </div>

            {/* Claves de acceso */}
            <div className="border border-gray-100 rounded-lg p-4">
              <p className="text-xs font-medium text-gray-700 mb-3">Claves de acceso</p>
              <ClavesAccesoEditor claves={claves} onChange={setClaves} sugerencias={sugerenciasClaves} />
            </div>

            {error && (
              <p className="text-xs text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="bg-bordo text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-bordo-dark transition-colors disabled:opacity-60"
            >
              {isPending ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
