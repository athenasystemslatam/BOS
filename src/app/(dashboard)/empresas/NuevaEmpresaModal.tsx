"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { crearEmpresa } from "./actions";
import { Liquidadora, ClaveAcceso } from "@/types";
import { MESES_NOMBRES } from "@/lib/vencimientos";
import { Toggle } from "@/components/Toggle";
import { ClavesAccesoEditor } from "@/components/ClavesAccesoEditor";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-bordo focus:ring-1 focus:ring-bordo/20 transition-colors bg-white";

// Estilo más chico para los campos anidados dentro de la fila "Sueldos" —
// mismo criterio que Panel General usa para distinguir "Datos básicos"
// (inputCls) de lo que cuelga adentro de un servicio activo.
const nestedCls =
  "w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-bordo bg-white";

function formatCuit(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

const JURISDICCIONES = ["CABA", "PBA", "Otra"];

export function NuevaEmpresaModal({ liquidadoras }: { liquidadoras: Liquidadora[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [cuit, setCuit] = useState("");
  const [tieneSindicato, setTieneSindicato] = useState(false);
  const [tieneRubrica, setTieneRubrica] = useState(false);
  const [lsdDesdeAnio, setLsdDesdeAnio] = useState<number | null>(null);
  const [lsdDesMes, setLsdDesMes] = useState<number | null>(null);
  const [lsdHastaAnio, setLsdHastaAnio] = useState<number | null>(null);
  const [lsdHastaMes, setLsdHastaMes] = useState<number | null>(null);
  const [esQuincenal, setEsQuincenal] = useState(false);
  const [jurisdiccion, setJurisdiccion] = useState("CABA");
  const [sindicatoNombre, setSindicatoNombre] = useState("");
  const [claves, setClaves] = useState<ClaveAcceso[]>([]);

  const terminacion = cuit.replace(/\D/g, "").length === 11
    ? cuit.replace(/\D/g, "")[10]
    : "—";

  // Mismas sugerencias que en Panel General y Editar empresa — se arman
  // solas a partir de lo que ya se va tildando en el formulario.
  const sugerenciasClaves = [
    "ARCA",
    ...(jurisdiccion === "CABA" ? ["TAD"] : []),
    ...(jurisdiccion === "PBA" ? ["SITRADIB"] : []),
    ...(tieneSindicato && sindicatoNombre ? [sindicatoNombre] : []),
    ...(tieneRubrica ? ["Rúbrica"] : []),
  ];

  function handleOpen() {
    setOpen(true);
    setError(null);
    setCuit("");
    setTieneSindicato(false);
    setTieneRubrica(false);
    setLsdDesdeAnio(null);
    setLsdDesMes(null);
    setLsdHastaAnio(null);
    setLsdHastaMes(null);
    setEsQuincenal(false);
    setJurisdiccion("CABA");
    setSindicatoNombre("");
    setClaves([]);
  }

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
      const result = await crearEmpresa(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="bg-bordo text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-bordo-dark transition-colors"
      >
        + Nueva empresa
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="text-[15px] font-semibold text-gray-900">Nueva empresa</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Scrollable body */}
            <form onSubmit={handleSubmit} className="overflow-y-auto flex-1">
              <div className="px-6 py-5 space-y-5">

                {/* Datos básicos */}
                <div className="space-y-4">
                  <Field label="Nombre / Razón social" required>
                    <input
                      name="nombre"
                      type="text"
                      required
                      placeholder="Ej: Empresa S.A."
                      className={inputCls}
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="CUIT" required>
                      <input
                        name="cuit"
                        type="text"
                        required
                        value={cuit}
                        onChange={(e) => setCuit(formatCuit(e.target.value))}
                        placeholder="20-12345678-9"
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Terminación CUIT">
                      <div className="text-sm border border-gray-100 rounded-lg px-3 py-2.5 bg-gray-50 text-gray-500 font-mono">
                        {terminacion}
                      </div>
                    </Field>
                  </div>

                  <Field label="Tipo de contribuyente" required>
                    <select name="tipo_contribuyente" defaultValue="empresa" className={inputCls}>
                      <option value="empresa">Empresa</option>
                      <option value="monotributista">Monotributista</option>
                      <option value="inscripto">Inscripto</option>
                    </select>
                  </Field>
                </div>

                {/* Servicios activos — acá siempre es Sueldos (es la única
                    razón de ser de esta pantalla), por eso el check queda
                    tildado y bloqueado en vez de ser una opción real. Mismo
                    formato que Panel General para que sea el mismo lenguaje
                    visual al dar de alta desde cualquiera de las dos. */}
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-3">Servicios activos</p>
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked
                        disabled
                        title="Toda empresa creada acá es de Sueldos"
                        className="accent-bordo w-4 h-4 shrink-0"
                      />
                      <span className="text-[13px] font-medium text-gray-800">Sueldos</span>
                    </div>

                    <div className="px-3 pb-3 pt-1 bg-gray-50 border-t border-gray-100 space-y-3">
                      <div>
                        <label className="text-[11px] text-gray-400 block mb-1">Responsable</label>
                        <select name="liquidador_id" required defaultValue="" className={nestedCls}>
                          <option value="" disabled>Seleccionar…</option>
                          {liquidadoras.map((l) => (
                            <option key={l.id} value={l.id}>{l.nombre}</option>
                          ))}
                        </select>
                      </div>

                      {/* Para Seguimiento */}
                      <div className="pt-3 border-t border-gray-200 space-y-3">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                          Para Seguimiento
                        </p>

                        <div className="flex items-center justify-between">
                          <span className="text-[12px] text-gray-600">
                            Es quincenal <span className="text-gray-400">(agrega Recibo Q1)</span>
                          </span>
                          <Toggle value={esQuincenal} onChange={setEsQuincenal} />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] text-gray-600">
                              Tiene sindicato <span className="text-gray-400">(agrega Bol. Sind.)</span>
                            </span>
                            <Toggle value={tieneSindicato} onChange={setTieneSindicato} />
                          </div>
                          {tieneSindicato && (
                            <input
                              name="sindicato_nombre"
                              type="text"
                              value={sindicatoNombre}
                              onChange={(e) => setSindicatoNombre(e.target.value)}
                              placeholder="Nombre del sindicato"
                              className={nestedCls}
                            />
                          )}
                        </div>

                        <div>
                          <label className="text-[11px] text-gray-400 block mb-1">Jurisdicción laboral</label>
                          <select
                            value={jurisdiccion}
                            onChange={(e) => setJurisdiccion(e.target.value)}
                            className={nestedCls}
                          >
                            {JURISDICCIONES.map((j) => (
                              <option key={j} value={j}>{j}</option>
                            ))}
                          </select>
                          {jurisdiccion === "Otra" && (
                            <input
                              name="jurisdiccion"
                              type="text"
                              placeholder="Especificar jurisdicción"
                              className={`${nestedCls} mt-2`}
                            />
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] text-gray-600">
                              Rúbrica LSD <span className="text-gray-400">(agrega tarea LSD)</span>
                            </span>
                            <Toggle value={tieneRubrica} onChange={setTieneRubrica} />
                          </div>
                          {tieneRubrica && (jurisdiccion === "PBA" || jurisdiccion === "CABA") && (
                            <>
                              <div>
                                <label className="text-[11px] text-gray-400 block mb-1">Regularización desde</label>
                                <div className="flex gap-2">
                                  <select
                                    value={lsdDesMes ?? ""}
                                    onChange={(e) => setLsdDesMes(e.target.value ? Number(e.target.value) : null)}
                                    className={`${nestedCls} flex-1`}
                                  >
                                    <option value="">— Mes</option>
                                    {MESES_NOMBRES.slice(1).map((m, i) => (
                                      <option key={i + 1} value={i + 1}>{m}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={lsdDesdeAnio ?? ""}
                                    onChange={(e) => setLsdDesdeAnio(e.target.value ? Number(e.target.value) : null)}
                                    className={`${nestedCls} flex-1`}
                                  >
                                    <option value="">— Año</option>
                                    {Array.from({ length: 9 }, (_, i) => 2018 + i).map((y) => (
                                      <option key={y} value={y}>{y}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div>
                                <label className="text-[11px] text-gray-400 block mb-1">
                                  Hasta (manual, si el historial no está en el sistema)
                                </label>
                                <div className="flex gap-2">
                                  <select
                                    value={lsdHastaMes ?? ""}
                                    onChange={(e) => setLsdHastaMes(e.target.value ? Number(e.target.value) : null)}
                                    className={`${nestedCls} flex-1`}
                                  >
                                    <option value="">— Mes</option>
                                    {MESES_NOMBRES.slice(1).map((m, i) => (
                                      <option key={i + 1} value={i + 1}>{m}</option>
                                    ))}
                                  </select>
                                  <select
                                    value={lsdHastaAnio ?? ""}
                                    onChange={(e) => setLsdHastaAnio(e.target.value ? Number(e.target.value) : null)}
                                    className={`${nestedCls} flex-1`}
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
                      </div>

                      {/* Datos adicionales */}
                      <div className="pt-3 border-t border-gray-200 space-y-3">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                          Datos adicionales
                        </p>

                        <div>
                          <label className="text-[11px] text-gray-400 block mb-1">
                            CUIL de acceso a ARCA
                          </label>
                          <input name="cuil_arca" type="text" placeholder="20-12345678-9" className={nestedCls} />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-gray-400 block mb-1">ART</label>
                            <input name="art" type="text" placeholder="Ej: Galeno ART" className={nestedCls} />
                          </div>
                          <div>
                            <label className="text-[11px] text-gray-400 block mb-1">Red bancaria</label>
                            <input name="red_bancaria" type="text" placeholder="Ej: Banco Galicia" className={nestedCls} />
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] text-gray-400 block mb-1">
                            Fecha de alta como empleador
                          </label>
                          <input name="fecha_alta_empleador" type="date" className={nestedCls} />
                        </div>

                        <div>
                          <label className="text-[11px] text-gray-400 block mb-1">Claves de acceso</label>
                          <ClavesAccesoEditor claves={claves} onChange={setClaves} sugerencias={sugerenciasClaves} />
                        </div>

                        <div>
                          <label className="text-[11px] text-gray-400 block mb-1">Observaciones</label>
                          <textarea
                            name="observaciones"
                            rows={2}
                            placeholder="Notas adicionales…"
                            className={`${nestedCls} resize-none`}
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-gray-400 block mb-1">
                            Carpeta Drive (URL o ID)
                          </label>
                          <input
                            name="drive_folder_id"
                            type="text"
                            placeholder="https://drive.google.com/drive/folders/… o ID directo"
                            className={nestedCls}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {error && (
                  <p className="text-xs text-danger bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="bg-bordo text-white text-sm font-medium px-5 py-2 rounded-lg hover:bg-bordo-dark transition-colors disabled:opacity-60"
                >
                  {isPending ? "Guardando…" : "Guardar empresa"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
