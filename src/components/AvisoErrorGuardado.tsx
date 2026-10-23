"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

// Ítem 81: las pantallas marcan el cambio al instante (optimista) y antes no
// miraban qué devolvía el guardado. Esto corre la acción del servidor y
// devuelve el mensaje de error, o null si se guardó bien.
export async function guardar(accion: () => Promise<unknown>): Promise<string | null> {
  try {
    const r = await accion();
    if (r && typeof r === "object" && "error" in r && (r as { error?: unknown }).error) {
      return String((r as { error: unknown }).error);
    }
    return null;
  } catch {
    return "No hay conexión con el servidor o la sesión venció.";
  }
}

// Aviso fijo abajo a la derecha, para cuando un guardado falla.
export function useAvisoErrorGuardado() {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const avisar = useCallback((texto: string) => {
    setMensaje(texto);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMensaje(null), 8000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const aviso = mensaje ? (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-[60] max-w-sm flex items-start gap-2.5 bg-white border border-red-200 shadow-lg rounded-xl px-4 py-3"
    >
      <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
      <p className="text-[13px] text-gray-700 flex-1">{mensaje}</p>
      <button onClick={() => setMensaje(null)} className="text-gray-300 hover:text-gray-600" title="Cerrar">
        <X size={14} />
      </button>
    </div>
  ) : null;

  return { avisar, aviso };
}
