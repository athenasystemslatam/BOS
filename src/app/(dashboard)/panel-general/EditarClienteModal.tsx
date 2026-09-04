"use client";

import { useState, useTransition, useEffect } from "react";
import { X } from "lucide-react";
import { EquipoMiembro, ClaveAcceso } from "@/types";
import { SERVICIOS_CONFIG } from "@/lib/modulos";
import { Toggle } from "@/components/Toggle";
import { ClavesAccesoEditor } from "@/components/ClavesAccesoEditor";
import { EmailsContactoEditor } from "@/components/EmailsContactoEditor";
import { editarClienteConServicios, getEmpresaCompleta } from "./actions";

type ServicioKey = `${string}:${string}`;

const JURISDICCIONES = ["CABA", "PBA", "Otra"];

export function EditarClienteModal({
  clienteId,
  equipo,
  equipoModulos,
  onClose,
}: {
  clienteId: string;
  equipo: EquipoMiembro[];
  equipoModulos: { equipo_id: string; modulo: string }[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [nombre, setNombre] = useState("");
  const [cuit, setCuit] = useState("");
  const [tipoContribuyente, setTipoContribuyente] = useState("empresa");
  const [emailsContacto, setEmailsContacto] = useState<string[]>([]);

  // serviciosActivos: key "servicio:subtipo" → responsable_id | ""
  const [serviciosActivos, setServiciosActivos] = useState<Record<ServicioKey, string>>({});

  const [esQuincenal, setEsQuincenal] = useState(false);
  const [tieneSindicato, setTieneSindicato] = useState(false);
  const [sindicatoNombre, setSindicatoNombre] = useState("");
  const [tieneRubricaLsd, setTieneRubricaLsd] = useState(false);
  const [jurisdiccion, setJurisdiccion] = useState("CABA");

  const [cuilArca, setCuilArca] = useState("");
  const [art, setArt] = useState("");
  const [redBancaria, setRedBancaria] = useState("");
  const [fechaAltaEmpleador, setFechaAltaEmpleador] = useState("");
  const [claves, setClaves] = useState<ClaveAcceso[]>([]);
  const [observaciones, setObservaciones] = useState("");
  const [driveFolder, setDriveFolder] = useState("");

  // Precargar con los datos actuales de la empresa — vista_empresas (lo que
  // ya tiene la tabla en memoria) solo trae nombres de responsable, no ids
  // ni los campos propios de Sueldos, así que hay que pedirlos de nuevo acá.
  useEffect(() => {
    let cancelado = false;
    getEmpresaCompleta(clienteId).then((res) => {
      if (cancelado || !res) return;
      const { cliente, servicios } = res;

      setNombre(cliente.nombre);
      setCuit(cliente.cuit.replace(/(\d{2})(\d{8})(\d)/, "$1-$2-$3"));
      setTipoContribuyente(cliente.tipo_contribuyente ?? "empresa");
      setEmailsContacto(cliente.emails_contacto ?? []);

      const activos: Record<ServicioKey, string> = {};
      for (const s of servicios) {
        if (!s.estado) continue;
        activos[`${s.servicio}:${s.subtipo}` as ServicioKey] = s.responsable_id ?? "";
      }
      setServiciosActivos(activos);

      setEsQuincenal(!!cliente.es_quincenal);
      setTieneSindicato(!!cliente.tiene_sindicato);
      setSindicatoNombre(cliente.sindicato_nombre ?? "");
      setTieneRubricaLsd(!!cliente.tiene_rubrica_lsd);
      setJurisdiccion(cliente.jurisdiccion ?? "CABA");

      setCuilArca(cliente.cuil_arca ?? "");
      setArt(cliente.art ?? "");
      setRedBancaria(cliente.red_bancaria ?? "");
      setFechaAltaEmpleador(cliente.fecha_alta_empleador ?? "");
      setClaves(Array.isArray(cliente.claves_acceso) ? cliente.claves_acceso : []);
      setObservaciones(cliente.observaciones ?? "");
      setDriveFolder(cliente.drive_folder_id ?? "");

      setCargando(false);
    });
    return () => { cancelado = true; };
  }, [clienteId]);

  const sugerenciasClaves = [
    "ARCA",
    ...(jurisdiccion === "CABA" ? ["TAD"] : []),
    ...(jurisdiccion === "PBA" ? ["SITRADIB"] : []),
    ...(tieneSindicato && sindicatoNombre ? [sindicatoNombre] : []),
    ...(tieneRubricaLsd ? ["Rúbrica"] : []),
  ];

  function toggleServicio(key: ServicioKey) {
    setServiciosActivos((prev) => {
      if (key in prev) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: "" };
    });
  }

  function setResponsable(key: ServicioKey, value: string) {
    setServiciosActivos((prev) => ({ ...prev, [key]: value }));
  }

  function responsablesPara(modulo: string) {
    const ids = new Set(equipoModulos.filter((m) => m.modulo === modulo).map((m) => m.equipo_id));
    return equipo.filter((e) => ids.has(e.id));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("id", clienteId);

    const serviciosPayload = Object.entries(serviciosActivos).map(([key, responsable_id]) => {
      const [servicio, subtipo] = key.split(":");
      return { servicio, subtipo, responsable_id: responsable_id || null };
    });

    formData.set("servicios", JSON.stringify(serviciosPayload));
    formData.set(
      "emails_contacto",
      JSON.stringify(emailsContacto.map((e) => e.trim()).filter(Boolean))
    );

    if ("sueldos:general" in serviciosActivos) {
      formData.set("sueldos_es_quincenal", String(esQuincenal));
      formData.set("sueldos_tiene_sindicato", String(tieneSindicato));
      formData.set("sueldos_sindicato_nombre", sindicatoNombre);
      formData.set("sueldos_tiene_rubrica_lsd", String(tieneRubricaLsd));
      formData.set("sueldos_jurisdiccion", jurisdiccion);
      formData.set("sueldos_cuil_arca", cuilArca);
      formData.set("sueldos_art", art);
      formData.set("sueldos_red_bancaria", redBancaria);
      formData.set("sueldos_fecha_alta_empleador", fechaAltaEmpleador);
      formData.set("sueldos_claves_acceso", JSON.stringify(claves));
      formData.set("sueldos_observaciones", observaciones);
      formData.set("sueldos_drive_folder_id", driveFolder);
    }

    startTransition(async () => {
      const result = await editarClienteConServicios(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-[15px] font-semibold text-gray-900">Editar empresa</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {cargando ? (
          <div className="px-6 py-16 text-center text-sm text-gray-400">Cargando…</div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            {/* Datos básicos */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  Nombre <span className="text-red-400">*</span>
                </label>
                <input
                  name="nombre"
                  required
                  defaultValue={nombre}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo"
                  placeholder="Razón social"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  CUIT <span className="text-red-400">*</span>
                </label>
                <input
                  name="cuit"
                  required
                  defaultValue={cuit}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo font-mono"
                  placeholder="20-12345678-9"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  Tipo de contribuyente
                </label>
                <select
                  name="tipo_contribuyente"
                  defaultValue={tipoContribuyente}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo bg-white"
                >
                  <option value="empresa">Empresa</option>
                  <option value="monotributista">Monotributista</option>
                  <option value="inscripto">Inscripto</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  Emails de contacto
                </label>
                <EmailsContactoEditor emails={emailsContacto} onChange={setEmailsContacto} />
              </div>
            </div>

            {/* Servicios */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-3">Servicios activos</p>
              <div className="space-y-2">
                {SERVICIOS_CONFIG.map(({ servicio, subtipo, label, modulo }) => {
                  const key = `${servicio}:${subtipo}` as ServicioKey;
                  const activo = key in serviciosActivos;
                  const opciones = responsablesPara(modulo);
                  return (
                    <div key={key} className="rounded-lg border border-gray-100 overflow-hidden">
                      <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={activo}
                          onChange={() => toggleServicio(key)}
                          className="accent-bordo w-4 h-4 shrink-0"
                        />
                        <span className="text-[13px] font-medium text-gray-800">{label}</span>
                      </label>
                      {activo && (
                        <div className="px-3 pb-3 pt-1 bg-gray-50 border-t border-gray-100">
                          <label className="text-[11px] text-gray-400 block mb-1">Responsable</label>
                          <select
                            value={serviciosActivos[key]}
                            onChange={(e) => setResponsable(key, e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-bordo bg-white"
                          >
                            <option value="">Sin asignar</option>
                            {opciones.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nombre}
                              </option>
                            ))}
                          </select>

                          {servicio === "sueldos" && (
                            <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
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
                                    type="text"
                                    value={sindicatoNombre}
                                    onChange={(e) => setSindicatoNombre(e.target.value)}
                                    placeholder="Nombre del sindicato"
                                    className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-bordo bg-white"
                                  />
                                )}
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[12px] text-gray-600">
                                    Rúbrica LSD <span className="text-gray-400">(agrega tarea LSD)</span>
                                  </span>
                                  <Toggle value={tieneRubricaLsd} onChange={setTieneRubricaLsd} />
                                </div>
                                {tieneRubricaLsd && (
                                  <select
                                    value={jurisdiccion}
                                    onChange={(e) => setJurisdiccion(e.target.value)}
                                    className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-bordo bg-white"
                                  >
                                    {JURISDICCIONES.map((j) => (
                                      <option key={j} value={j}>{j}</option>
                                    ))}
                                  </select>
                                )}
                              </div>

                              <div className="pt-3 border-t border-gray-200 space-y-3">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                                  Datos adicionales
                                </p>

                                <div>
                                  <label className="text-[11px] text-gray-400 block mb-1">
                                    CUIL de acceso a ARCA
                                  </label>
                                  <input
                                    type="text"
                                    value={cuilArca}
                                    onChange={(e) => setCuilArca(e.target.value)}
                                    className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-bordo bg-white"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[11px] text-gray-400 block mb-1">ART</label>
                                    <input
                                      type="text"
                                      value={art}
                                      onChange={(e) => setArt(e.target.value)}
                                      className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-bordo bg-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] text-gray-400 block mb-1">Red bancaria</label>
                                    <input
                                      type="text"
                                      value={redBancaria}
                                      onChange={(e) => setRedBancaria(e.target.value)}
                                      className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-bordo bg-white"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="text-[11px] text-gray-400 block mb-1">
                                    Fecha de alta como empleador
                                  </label>
                                  <input
                                    type="date"
                                    value={fechaAltaEmpleador}
                                    onChange={(e) => setFechaAltaEmpleador(e.target.value)}
                                    className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-bordo bg-white"
                                  />
                                </div>

                                <div>
                                  <label className="text-[11px] text-gray-400 block mb-1">Claves de acceso</label>
                                  <ClavesAccesoEditor claves={claves} onChange={setClaves} sugerencias={sugerenciasClaves} />
                                </div>

                                <div>
                                  <label className="text-[11px] text-gray-400 block mb-1">Observaciones</label>
                                  <textarea
                                    value={observaciones}
                                    onChange={(e) => setObservaciones(e.target.value)}
                                    rows={2}
                                    placeholder="Notas adicionales…"
                                    className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-bordo bg-white resize-none"
                                  />
                                </div>

                                <div>
                                  <label className="text-[11px] text-gray-400 block mb-1">
                                    Carpeta Drive (URL o ID)
                                  </label>
                                  <input
                                    type="text"
                                    value={driveFolder}
                                    onChange={(e) => setDriveFolder(e.target.value)}
                                    placeholder="https://drive.google.com/drive/folders/… o ID directo"
                                    className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-bordo bg-white"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-bordo hover:bg-bordo/90 rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
