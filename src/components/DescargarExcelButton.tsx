import { Download } from "lucide-react";

// Botón "Descargar Excel" — a diferencia de BackupButton (volcado crudo de
// tablas para restaurar), este pide un Excel formateado con lo mismo que se
// ve en pantalla (columnas con nombre, fechas legibles), para abrir y leer
// directo. El que lo usa decide a qué ruta apunta y si lo muestra.
export function DescargarExcelButton({
  href,
  label = "Descargar Excel",
  title,
}: {
  href: string;
  label?: string;
  title?: string;
}) {
  return (
    <a
      href={href}
      title={title ?? "Descargar en Excel"}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-subtle border border-line-input rounded-[9px] px-3 py-[9px] bg-paper hover:bg-paper-hover hover:text-ink transition-colors"
    >
      <Download size={13} />
      {label}
    </a>
  );
}
