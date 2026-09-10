"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { EquipoMiembro, ClaveAcceso } from "@/types";
import { SERVICIOS_CONFIG } from "@/lib/modulos";
import { Toggle } from "@/components/Toggle";
import { ClavesAccesoEditor } from "@/components/ClavesAccesoEditor";
import { EmailsContactoEditor } from "@/components/EmailsContactoEditor";
import { crearClienteConServicios } from "./actions";

type ServicioKey = `${string}:${string}`;

const JURISDICCIONES = ["CABA", "PBA", "Otra"];

export function NuevoClienteModal({
  equipo,
  equipoModulos,
  onClose,
}: {
  equipo: EquipoMiembro[];
  equipoModulos: { equipo_id: string; modulo: string }[];
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [emailsContacto, setEmailsContacto] = useState<string[]>([]);

  // serviciosActivos: key "servicio:subtipo" → responsable_id | ""
  const [serviciosActivos, setServiciosActivos] = useState<Record<ServicioKey, string>>({});

  // Datos propios de Sueldos: de esto depende qué tareas le va a pedir
  // Seguimiento a esta empresa (Q1 si es quincenal, Bol. Sind. si tiene
  // sindicato, LSD si lleva rúbrica) — sin esto la empresa entraba "vacía"
  // y Seguimiento no le exigía nada de eso aunque correspondiera.
  const [fechaInicioLiquidacion, setFechaInicioLiquidacion] = useState("");
  const [esQuincenal, setEsQuincenal] = useState(false);
  const [tieneSindicato, setTieneSindicato] = useState(false);
  const [sindicatoNombre, setSindicatoNombre] = useState("");
  const [tieneRubricaLsd, setTieneRubricaLsd] = useState(false);
  const [jurisdiccion, setJurisdiccion] = useState("CABA");

  // Datos adicionales de Sueldos — antes solo se cargaban después desde
  // Clientes → Editar; se agregan acá para no tener que pasar por dos
  // pantallas al dar de alta una empresa. Mismos campos de `clientes`,
  // sin duplicar nada.
  const [cuilArca, setCuilArca] = useState("");
  const [art, setArt] = useState("");
  const [redBancaria, setRedBancaria] = useState("");
  const [fechaAltaEmpleador, setFechaAltaEmpleador] = useState("");
  const [claves, setClaves] = useState<ClaveAcceso[]>([]);
  const [observaciones, setObservaciones] = useState("");
  const [driveFolder, setDriveFolder] = useState("");

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
    // Antes excluía a quien no fuera rol "liquidadora" (admins, solo lectura),
    // pero eso no era parejo con "Editar empresa" y "Transferir cartera", que
    // sí permiten elegir a un admin que además lleva cartera propia (ej.
    // Giuliana). Se deja pasar a cualquiera que pertenezca al módulo.
    return equipo.filter((e) => ids.has(e.id));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

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
      formData.set("sueldos_fecha_inicio_liquidacion", fechaInicioLiquidacion);
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
      const result = await crearClienteConServicios(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(23,20,26,.46)] p-4">
      <div className="bg-paper rounded-2xl shadow-[0_30px_70px_rgba(23,20,26,.3)] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-[26px] py-[18px] pt-6 border-b border-line-soft shrink-0">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[.18em] uppercase text-ink-faint">Alta de cliente</p>
            <h2 className="font-archivo text-[22px] font-semibold tracking-[-.025em] text-ink mt-2">Nuevo cliente</h2>
          </div>
          <button
            onClick={onClose}
            className="text-ink-faint hover:text-ink-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {/* Datos básicos */}
          <div className="space-y-3">
            <div>
              <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">
                Nombre <span className="text-red-400">*</span>
              </label>
              <input
                name="nombre"
                required
                className="w-full text-[13px] text-ink border border-line-input rounded-[9px] px-3 py-2.5 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow] placeholder:text-ink-faint"
                placeholder="Ej. Distribuidora Sanmartín S.A."
              />
            </div>

            <div>
              <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">
                CUIT <span className="text-red-400">*</span>
              </label>
              <input
                name="cuit"
                required
                className="w-full font-plex text-[12.5px] text-ink border border-line-input rounded-[9px] px-3 py-2.5 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow] placeholder:text-ink-faint"
                placeholder="30-71234567-4"
              />
            </div>

            <div>
              <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">
                Tipo de contribuyente
              </label>
              <select
                name="tipo_contribuyente"
                defaultValue="empresa"
                className="w-full text-[12.5px] text-ink border border-line-input rounded-[9px] px-3 py-2.5 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow]"
              >
                <option value="empresa">Empresa</option>
                <option value="monotributista">Monotributista</option>
                <option value="inscripto">Inscripto</option>
              </select>
            </div>

            <div>
              <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">
                Teléfono
              </label>
              <input
                name="telefono"
                className="w-full text-[13px] text-ink border border-line-input rounded-[9px] px-3 py-2.5 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow] placeholder:text-ink-faint"
                placeholder="Ej. 11 4567-8900"
              />
            </div>

            <div>
              <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">
                Emails de contacto
              </label>
              <EmailsContactoEditor emails={emailsContacto} onChange={setEmailsContacto} />
            </div>
          </div>

          {/* Servicios */}
          <div>
            <p className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle mb-[9px]">Servicios y responsables</p>
            <div className="space-y-2">
              {SERVICIOS_CONFIG.map(({ servicio, subtipo, label, modulo }) => {
                const key = `${servicio}:${subtipo}` as ServicioKey;
                const activo = key in serviciosActivos;
                const opciones = responsablesPara(modulo);
                return (
                  <div
                    key={key}
                    className={clsx(
                      "rounded-[10px] border overflow-hidden",
                      activo ? "border-bordo-border bg-[#FCF7F7]" : "border-line-soft"
                    )}
                  >
                    <div className="flex items-center gap-[11px] px-[11px] py-[9px]">
                      <Toggle value={activo} onChange={() => toggleServicio(key)} />
                      <span className={clsx("flex-1 text-[12.5px] font-medium", activo ? "text-ink" : "text-ink-faint")}>
                        {label}
                      </span>
                    </div>
                    {activo && (
                      <div className="px-[11px] pb-3 pt-1 border-t border-bordo-border">
                        <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">Responsable</label>
                        <select
                          value={serviciosActivos[key]}
                          onChange={(e) => setResponsable(key, e.target.value)}
                          className="w-full text-[12.5px] text-ink border border-line-input rounded-lg px-3 py-2 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow]"
                        >
                          <option value="">Sin asignar</option>
                          {opciones.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>

                        {servicio === "sueldos" && (
                          <div className="mt-3 pt-3 border-t border-line-soft space-y-3">
                            <div>
                              <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">
                                Fecha de inicio de liquidación
                              </label>
                              <input
                                type="date"
                                value={fechaInicioLiquidacion}
                                onChange={(e) => setFechaInicioLiquidacion(e.target.value)}
                                className="w-full text-[12.5px] text-ink border border-line-input rounded-lg px-3 py-2 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow]"
                              />
                            </div>

                            <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-[.1em]">
                              Para Seguimiento
                            </p>

                            <div className="flex items-center justify-between">
                              <span className="text-[12px] text-ink-muted">
                                Es quincenal <span className="text-ink-faint">(agrega Recibo Q1)</span>
                              </span>
                              <Toggle value={esQuincenal} onChange={setEsQuincenal} />
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[12px] text-ink-muted">
                                  Tiene sindicato <span className="text-ink-faint">(agrega Bol. Sind.)</span>
                                </span>
                                <Toggle value={tieneSindicato} onChange={setTieneSindicato} />
                              </div>
                              {tieneSindicato && (
                                <input
                                  type="text"
                                  value={sindicatoNombre}
                                  onChange={(e) => setSindicatoNombre(e.target.value)}
                                  placeholder="Nombre del sindicato"
                                  className="w-full text-[12.5px] text-ink border border-line-input rounded-lg px-3 py-2 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow]"
                                />
                              )}
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[12px] text-ink-muted">
                                  Rúbrica LSD <span className="text-ink-faint">(agrega tarea LSD)</span>
                                </span>
                                <Toggle value={tieneRubricaLsd} onChange={setTieneRubricaLsd} />
                              </div>
                              {tieneRubricaLsd && (
                                <select
                                  value={jurisdiccion}
                                  onChange={(e) => setJurisdiccion(e.target.value)}
                                  className="w-full text-[12.5px] text-ink border border-line-input rounded-lg px-3 py-2 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow]"
                                >
                                  {JURISDICCIONES.map((j) => (
                                    <option key={j} value={j}>{j}</option>
                                  ))}
                                </select>
                              )}
                            </div>

                            <div className="pt-3 border-t border-line-soft space-y-3">
                              <p className="text-[10px] font-semibold text-ink-faint uppercase tracking-[.1em]">
                                Datos adicionales
                              </p>

                              <div>
                                <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">
                                  CUIL de acceso a ARCA
                                </label>
                                <input
                                  type="text"
                                  value={cuilArca}
                                  onChange={(e) => setCuilArca(e.target.value)}
                                  className="w-full text-[12.5px] text-ink border border-line-input rounded-lg px-3 py-2 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow]"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">ART</label>
                                  <input
                                    type="text"
                                    value={art}
                                    onChange={(e) => setArt(e.target.value)}
                                    className="w-full text-[12.5px] text-ink border border-line-input rounded-lg px-3 py-2 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow]"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">Red bancaria</label>
                                  <input
                                    type="text"
                                    value={redBancaria}
                                    onChange={(e) => setRedBancaria(e.target.value)}
                                    className="w-full text-[12.5px] text-ink border border-line-input rounded-lg px-3 py-2 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow]"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">
                                  Fecha de alta como empleador
                                </label>
                                <input
                                  type="date"
                                  value={fechaAltaEmpleador}
                                  onChange={(e) => setFechaAltaEmpleador(e.target.value)}
                                  className="w-full text-[12.5px] text-ink border border-line-input rounded-lg px-3 py-2 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow]"
                                />
                              </div>

                              <div>
                                <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">Claves de acceso</label>
                                <ClavesAccesoEditor claves={claves} onChange={setClaves} sugerencias={sugerenciasClaves} />
                              </div>

                              <div>
                                <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">Observaciones</label>
                                <textarea
                                  value={observaciones}
                                  onChange={(e) => setObservaciones(e.target.value)}
                                  rows={2}
                                  placeholder="Notas adicionales…"
                                  className="w-full text-[12.5px] text-ink border border-line-input rounded-lg px-3 py-2 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow] resize-none"
                                />
                              </div>

                              <div>
                                <label className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-ink-subtle block mb-[7px]">
                                  Carpeta Drive (URL o ID)
                                </label>
                                <input
                                  type="text"
                                  value={driveFolder}
                                  onChange={(e) => setDriveFolder(e.target.value)}
                                  placeholder="https://drive.google.com/drive/folders/… o ID directo"
                                  className="w-full text-[12.5px] text-ink border border-line-input rounded-lg px-3 py-2 outline-none bg-white focus:border-bordo focus:ring-[3px] focus:ring-bordo/[0.09] transition-[border-color,box-shadow]"
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

        <div className="flex justify-end gap-2.5 px-[26px] py-[18px] border-t border-line-soft shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-[12.5px] font-medium text-ink-muted bg-white border border-line-input rounded-[9px] hover:bg-paper-hover transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-[18px] py-2.5 text-[12.5px] font-semibold text-white bg-bordo hover:bg-bordo-light rounded-[9px] transition-colors disabled:opacity-50"
            >
              {isPending ? "Guardando…" : "Crear cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
