import { ModuleTabBar } from "@/components/ModuleTabBar";

const TABS = [
  { href: "/impuestos", label: "Seguimiento" },
  { href: "/impuestos/dashboard", label: "Dashboard" },
  { href: "/impuestos/vencimientos", label: "Vencimientos" },
  { href: "/impuestos/equipo", label: "Equipo" },
];

export default function ImpuestosLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <ModuleTabBar tabs={TABS} accentColor="text-blue-600" />
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
