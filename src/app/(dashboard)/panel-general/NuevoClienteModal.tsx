"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { EquipoMiembro } from "@/types";
import { crearClienteConServicios } from "./actions";

const SERVICIOS_CONFIG = [
  { servicio: "sueldos",   subtipo: "general", label: "Sueldos",                modulo: "sueldos" },
  { servicio: "impuestos", subtipo: "iva",     label: "Impuestos — IVA",        modulo: "impuestos" },
  { servicio: "impuestos", subtipo: "iibb",    label: "Impuestos — IIBB",       modulo: "impuestos" },
  { servicio: "impuestos", subtipo: "seh",     label: "Impuestos — Seg. e Hig.", modulo: "impuestos" },
  { servicio: "contable",  subtipo: "general", label: "Contable",               modulo: "contable" },
  { servicio: "monotributo", subtipo: "general", label: "Monotributo",         modulo: "monotributo" },
  { servicio: "libros",    subtipo: "general", label: "Libros",                 modulo: "libros" },
] as const;

type ServicioKey = `${string}:${string}`;

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

  // serviciosActivos: key "servicio:subtipo" → responsable_id | ""
  const [serviciosActivos, setServiciosActivos] = useState<Record<ServicioKey, string>>({});

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
    // Solo liquidadoras: admins y perfiles de solo lectura no llevan clientes propios.
    return equipo.filter((e) => ids.has(e.id) && e.rol === "liquidadora");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Nueva empresa</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Datos básicos */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">
                Nombre <span className="text-red-400">*</span>
              </label>
              <input
                name="nombre"
                required
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
                defaultValue="empresa"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-bordo bg-white"
              >
                <option value="empresa">Empresa</option>
                <option value="monotributista">Monotributista</option>
                <option value="inscripto">Inscripto</option>
              </select>
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

          <div className="flex justify-end gap-2 pt-1">
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
              {isPending ? "Guardando…" : "Crear empresa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
