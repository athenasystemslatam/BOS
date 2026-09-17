"use client";

import { useState } from "react";
import { IdCard, X, Eye, EyeOff, ExternalLink, Pencil } from "lucide-react";
import type { Cliente, ModuloClave } from "@/types";

const MODULO_LABEL: Record<ModuloClave, string> = {
  "": "General",
  sueldos: "Sueldos",
  impuestos: "Impuestos",
  contable: "Contable",
  monotributo: "Monotributo",
};

function fmtFecha(v: string | null | undefined): string {
  if (!v) return "—";
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}

function driveUrl(v: string): string {
  return v.startsWith("http") ? v : `https://drive.google.com/drive/folders/${v}`;
}

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[.08em] uppercase text-gray-400">{label}</p>
      <p className="text-[13px] text-gray-800 mt-0.5">{value || "—"}</p>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[10.5px] font-semibold tracking-[.1em] uppercase text-gray-400 border-b border-gray-100 pb-1.5">
        {titulo}
      </p>
      {children}
    </div>
  );
}

/**
 * Ícono + modal de solo lectura con la ficha completa del cliente (misma
 * info que Panel General: domicilios, jurisdicciones, locales, sueldos,
 * claves de todos los módulos, Drive, observaciones). Reemplaza a
 * ClavesModuloPopover en Contable — esa solo mostraba las claves de un
 * módulo; esta trae todo, pidiéndolo a demanda al abrir (no se precarga
 * por cliente en la tabla).
 */
export function FichaClienteBoton({
  clienteId,
  nombre,
  fetchAction,
  puedeEditar,
  onEditar,
}: {
  clienteId: string;
  nombre: string;
  fetchAction: (id: string) => Promise<Cliente | null>;
  /** Si puede editar, se muestra un botón "Editar" que delega en onEditar (la
   *  edición en sí vive en EditarClienteModal de Panel General — acá solo se
   *  ve y se dispara). */
  puedeEditar?: boolean;
  onEditar?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [verPass, setVerPass] = useState<Record<number, boolean>>({});

  function abrir() {
    setAbierto(true);
    if (!cliente) {
      setCargando(true);
      fetchAction(clienteId).then((c) => {
        setCliente(c);
        setCargando(false);
      });
    }
  }

  const claves = cliente?.claves_acceso ?? [];
  const locales = cliente?.locales ?? [];

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title="Ver ficha del cliente"
        className="text-gray-400 hover:text-gray-800 transition-colors"
      >
        <IdCard size={14} />
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div>
                <p className="text-[10.5px] font-semibold tracking-[.18em] uppercase text-gray-400">Ficha de cliente</p>
                <h2 className="text-[17px] font-semibold text-gray-900 mt-1">{nombre}</h2>
              </div>
              <div className="flex items-center gap-3">
                {puedeEditar && onEditar && (
                  <button
                    onClick={() => {
                      setAbierto(false);
                      onEditar();
                    }}
                    className="flex items-center gap-1.5 text-[12px] font-medium text-gray-500 hover:text-gray-900 transition-colors"
                  >
                    <Pencil size={13} /> Editar
                  </button>
                )}
                <button
                  onClick={() => setAbierto(false)}
                  className="text-gray-400 hover:text-gray-700 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
              {cargando ? (
                <p className="text-sm text-gray-400 text-center py-10">Cargando…</p>
              ) : !cliente ? (
                <p className="text-sm text-gray-400 text-center py-10">No se pudo cargar la ficha.</p>
              ) : (
                <>
                  <Seccion titulo="Datos básicos">
                    <div className="grid grid-cols-2 gap-3">
                      <Campo label="CUIT" value={cliente.cuit?.replace(/(\d{2})(\d{8})(\d)/, "$1-$2-$3")} />
                      <Campo label="Teléfono" value={cliente.telefono} />
                    </div>
                    {(cliente.emails_contacto_detalle?.length ?? 0) > 0 ? (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold tracking-[.08em] uppercase text-gray-400">Emails de contacto</p>
                        {cliente.emails_contacto_detalle!.map((e, i) => (
                          <p key={i} className="text-[13px] text-gray-800">
                            {e.email}
                            {e.aclaracion && <span className="text-gray-400"> — {e.aclaracion}</span>}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <Campo label="Emails de contacto" value={cliente.emails_contacto?.join(", ")} />
                    )}
                  </Seccion>

                  <Seccion titulo="Domicilios">
                    <div className="grid grid-cols-[1fr_90px] gap-3">
                      <Campo label="Fiscal" value={cliente.domicilio_fiscal} />
                      <Campo label="Jurisd." value={cliente.jurisdiccion_fiscal} />
                    </div>
                    <div className="grid grid-cols-[1fr_90px] gap-3">
                      <Campo label="Legal" value={cliente.domicilio_legal} />
                      <Campo label="Jurisd." value={cliente.jurisdiccion_legal} />
                    </div>
                    {cliente.tiene_locales && locales.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold tracking-[.08em] uppercase text-gray-400">Locales / sucursales</p>
                        {locales.map((l, i) => (
                          <p key={i} className="text-[13px] text-gray-800">
                            {l.domicilio} <span className="text-gray-400">— {l.jurisdiccion}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </Seccion>

                  <Seccion titulo="Sueldos">
                    <div className="grid grid-cols-2 gap-3">
                      <Campo label="Inicio liquidación" value={fmtFecha(cliente.fecha_inicio_liquidacion)} />
                      <Campo label="Modalidad" value={cliente.es_quincenal ? "Quincenal" : "Mensual"} />
                      <Campo label="Sindicato" value={cliente.tiene_sindicato ? (cliente.sindicato_nombre || "Sí") : "No"} />
                      <Campo
                        label="Rúbrica LSD"
                        value={cliente.tiene_rubrica_lsd ? (cliente.jurisdiccion || "Sí") : "No"}
                      />
                      <Campo label="CUIL de acceso a ARCA" value={cliente.cuil_arca} />
                      <Campo label="ART" value={cliente.art} />
                      <Campo label="Alícuota ART" value={cliente.alicuota_art} />
                      <Campo label="Red bancaria" value={cliente.red_bancaria} />
                      <Campo label="Alta como empleador" value={fmtFecha(cliente.fecha_alta_empleador)} />
                    </div>
                  </Seccion>

                  {claves.length > 0 && (
                    <Seccion titulo="Claves de acceso">
                      <div className="space-y-2.5">
                        {claves.map((c, i) => (
                          <div key={i} className="text-[12.5px] bg-gray-50 rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between">
                              <p className="font-semibold text-gray-800">{c.sistema || "Sin nombre"}</p>
                              {c.modulo && (
                                <span className="text-[10px] text-gray-400 uppercase tracking-wide">
                                  {MODULO_LABEL[c.modulo]}
                                </span>
                              )}
                            </div>
                            <p className="text-gray-500">
                              Usuario: <span className="text-gray-700">{c.usuario || "—"}</span>
                            </p>
                            <div className="flex items-center gap-1 text-gray-500">
                              Clave:
                              <span className="text-gray-700">
                                {c.contrasena ? (verPass[i] ? c.contrasena : "••••••••") : "—"}
                              </span>
                              {c.contrasena && (
                                <button
                                  type="button"
                                  onClick={() => setVerPass((p) => ({ ...p, [i]: !p[i] }))}
                                  className="text-gray-300 hover:text-gray-600"
                                >
                                  {verPass[i] ? <EyeOff size={11} /> : <Eye size={11} />}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Seccion>
                  )}

                  {(cliente.drive_folder_id || cliente.observaciones) && (
                    <Seccion titulo="Otros">
                      {cliente.drive_folder_id && (
                        <a
                          href={driveUrl(cliente.drive_folder_id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[13px] text-blue-600 hover:text-blue-700"
                        >
                          <ExternalLink size={12} /> Carpeta de Drive
                        </a>
                      )}
                      {cliente.observaciones && (
                        <Campo label="Observaciones" value={cliente.observaciones} />
                      )}
                    </Seccion>
                  )}
                </>
              )}
            </div>

            {!puedeEditar && (
              <div className="px-6 py-3.5 border-t border-gray-100 text-[11px] text-gray-400 shrink-0">
                Para editar, ir a Clientes → {nombre} → Editar
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
