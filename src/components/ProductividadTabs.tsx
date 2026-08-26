import clsx from "clsx";

const TABS = [
  { href: "/productividad", label: "Sueldos", color: "text-bordo border-bordo" },
  { href: "/productividad/impuestos", label: "Impuestos", color: "text-blue-600 border-blue-600" },
  { href: "/productividad/contable", label: "Contable", color: "text-emerald-600 border-emerald-600" },
  { href: "/productividad/monotributo", label: "Monotributo", color: "text-amber-600 border-amber-600" },
] as const;

export function ProductividadTabs({ current }: { current: (typeof TABS)[number]["href"] }) {
  return (
    <div className="flex gap-1 border-b border-gray-100 mb-6 -mt-1">
      {/* <a> normal, no <Link>: mismo motivo que en Sidebar — garantiza
          datos frescos del servidor en cada clic. */}
      {TABS.map((tab) => (
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
