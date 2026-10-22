import clsx from "clsx";

// Un módulo = una pestaña, pero Productividad ya no cruza entre módulos: a
// cada uno se entra desde su propio ítem "Productividad" en el sidebar (ver
// Sidebar.tsx), así que acá solo se muestra el módulo actual (no los otros
// tres) más Configuración, que no es un módulo sino el ajuste de objetivos
// compartido entre varios.
const MODULOS = [
  { href: "/productividad", label: "Sueldos", color: "text-bordo border-bordo" },
  { href: "/productividad/impuestos", label: "Impuestos", color: "text-blue-600 border-blue-600" },
  { href: "/productividad/contable", label: "Contable", color: "text-emerald-600 border-emerald-600" },
  { href: "/productividad/monotributo", label: "Monotributo", color: "text-amber-600 border-amber-600" },
] as const;
const CONFIGURACION = { href: "/productividad/configuracion", label: "Configuración", color: "text-gray-700 border-gray-700" } as const;
type Href = (typeof MODULOS)[number]["href"] | (typeof CONFIGURACION)["href"];

export function ProductividadTabs({ current }: { current: Href }) {
  const propio = MODULOS.find((m) => m.href === current);
  const visibles = propio ? [propio, CONFIGURACION] : [CONFIGURACION];
  return (
    <div className="flex gap-1 border-b border-gray-100 mb-6 -mt-1">
      {/* <a> normal, no <Link>: mismo motivo que en Sidebar — garantiza
          datos frescos del servidor en cada clic. */}
      {visibles.map((tab) => (
        <a
          key={tab.href}
          href={tab.href}
          className={clsx(
            "px-3.5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors",
            current === tab.href
              ? tab.color
              : "text-gray-400 border-transparent hover:text-gray-600"
          )}
        >
          {tab.label}
        </a>
      ))}
    </div>
  );
}
