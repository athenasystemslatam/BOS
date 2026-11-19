import { BACKUP_LIMITE_BYTES, type UltimoBackupCompleto } from "@/lib/backups";

// Barra de estado para el admin: qué tan cerca está el último backup
// completo conocido (manual o automático, el que sea más reciente) del
// límite real de 4.5 MB que impone Vercel por respuesta — ver
// BACKUP_LIMITE_BYTES en src/lib/backups.ts. Se oculta sola si todavía no
// hay ningún registro (ej. recién se corrió la migración).
export function BackupTamanioBar({ ultimoBackup }: { ultimoBackup: UltimoBackupCompleto }) {
  if (!ultimoBackup) return null;

  const pct = Math.min(100, (ultimoBackup.tamanioBytes / BACKUP_LIMITE_BYTES) * 100);
  const mb = (ultimoBackup.tamanioBytes / 1024 / 1024).toFixed(2);
  const limiteMb = (BACKUP_LIMITE_BYTES / 1024 / 1024).toFixed(1);
  const fecha = new Date(ultimoBackup.creadoEn).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });

  const color = pct >= 70 ? "bg-red-500" : pct >= 50 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div
      className="flex items-center gap-2 text-[11px] text-gray-400"
      title={`Último backup completo: ${mb} MB de ${limiteMb} MB (límite de Vercel) — medido el ${fecha}`}
    >
      <div className="w-20 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span>
        {mb} / {limiteMb} MB
      </span>
    </div>
  );
}
