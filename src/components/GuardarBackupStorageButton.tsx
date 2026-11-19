"use client";

import { useState } from "react";
import { CloudUpload, Check, AlertTriangle } from "lucide-react";
import type { BackupModulo } from "@/lib/backups";

// Botón "Guardar copia" — a diferencia de BackupButton (que descarga el
// Excel al navegador), este sube la misma copia a Supabase Storage
// (carpeta "manual/" del bucket "backups") sin bajar nada a la computadora
// de quien lo aprieta. Pensado para no depender de que alguien se acuerde
// de subir el backup a mano a otro lado (Drive, etc.).
export function GuardarBackupStorageButton({ modulo }: { modulo: BackupModulo | "completo" }) {
  const [estado, setEstado] = useState<"idle" | "cargando" | "ok" | "error">("idle");

  async function guardar() {
    setEstado("cargando");
    try {
      const res = await fetch(`/api/backup/${modulo}/storage`, { method: "POST" });
      if (!res.ok) throw new Error();
      setEstado("ok");
    } catch {
      setEstado("error");
    } finally {
      setTimeout(() => setEstado("idle"), 3000);
    }
  }

  const Icono = estado === "ok" ? Check : estado === "error" ? AlertTriangle : CloudUpload;

  return (
    <button
      type="button"
      onClick={guardar}
      disabled={estado === "cargando"}
      title="Guarda una copia de este backup en Supabase Storage, sin descargarla"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-subtle border border-line-input rounded-[9px] px-3 py-[9px] bg-paper hover:bg-paper-hover hover:text-ink transition-colors disabled:opacity-50"
    >
      <Icono
        size={13}
        className={estado === "ok" ? "text-emerald-600" : estado === "error" ? "text-red-600" : undefined}
      />
      {estado === "cargando" ? "Guardando…" : estado === "ok" ? "Guardado" : estado === "error" ? "No se pudo" : "Guardar copia"}
    </button>
  );
}
