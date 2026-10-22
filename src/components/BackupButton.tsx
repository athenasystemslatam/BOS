import { Archive } from "lucide-react";
import type { BackupModulo } from "@/lib/backups";

// Botón "Backup" — descarga un volcado crudo de las tablas del tablero (ver
// src/lib/backups.ts). Solo para admins; el que lo usa decide si lo muestra.
// "completo" pide /api/backup/completo: toda la base, tabla por tabla,
// resuelta en el momento (no depende de la lista fija de BACKUPS).
export function BackupButton({ modulo }: { modulo: BackupModulo | "completo" }) {
  const esCompleto = modulo === "completo";
  return (
    <a
      href={`/api/backup/${modulo}`}
      title={
        esCompleto
          ? "Backup completo del sistema — toda la base, para recuperar y retomar todo"
          : "Backup de este tablero (volcado crudo para restaurar)"
      }
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-subtle border border-line-input rounded-[9px] px-3 py-[9px] bg-paper hover:bg-paper-hover hover:text-ink transition-colors"
    >
      <Archive size={13} />
      {esCompleto ? "Backup completo" : "Backup"}
    </a>
  );
}
