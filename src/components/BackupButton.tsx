import { Archive } from "lucide-react";
import type { BackupModulo } from "@/lib/backups";

// Botón "Backup" — descarga un volcado crudo de las tablas del tablero (ver
// src/lib/backups.ts). Solo para admins; el que lo usa decide si lo muestra.
export function BackupButton({ modulo }: { modulo: BackupModulo }) {
  return (
    <a
      href={`/api/backup/${modulo}`}
      title="Backup de este tablero (volcado crudo para restaurar)"
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-subtle border border-line-input rounded-[9px] px-3 py-[9px] bg-paper hover:bg-paper-hover hover:text-ink transition-colors"
    >
      <Archive size={13} />
      Backup
    </a>
  );
}
