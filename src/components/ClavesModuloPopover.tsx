"use client";

import { useState } from "react";
import { KeyRound, Eye, EyeOff } from "lucide-react";
import type { ClaveAcceso, ModuloClave } from "@/types";

// Botón + popover de solo lectura para ver, desde dentro de un módulo, las
// claves de ese cliente etiquetadas para ese módulo. La edición sigue
// siendo solo desde la ficha maestra (/empresas → editar) — esto es la
// mitad "visible desde el módulo" del pedido de Giuliana, no la mitad
// "editable desde el módulo" (esa requiere que Panel General tenga edición
// de clientes, que hoy no existe).
export function ClavesModuloPopover({
  claves,
  modulo,
}: {
  claves: ClaveAcceso[] | null | undefined;
  modulo: ModuloClave;
}) {
  const [abierto, setAbierto] = useState(false);
  const [verPass, setVerPass] = useState<Record<number, boolean>>({});

  const propias = (claves ?? []).filter((c) => (c.modulo ?? "") === modulo);
  if (propias.length === 0) return null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        title={`${propias.length} clave${propias.length > 1 ? "s" : ""} de este módulo`}
        className="text-gray-300 hover:text-amber-600 transition-colors"
      >
        <KeyRound size={13} />
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="absolute left-0 top-full mt-1 z-20 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2.5">
            {propias.map((c, i) => (
              <div key={i} className="text-[12px]">
                <p className="font-semibold text-gray-800">{c.sistema || "Sin nombre"}</p>
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
            <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">
              Para editar, ir a Clientes → {"{empresa}"} → Editar
            </p>
          </div>
        </>
      )}
    </div>
  );
}
