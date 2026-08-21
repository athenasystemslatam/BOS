import { ModuleTabBar } from "@/components/ModuleTabBar";

const TABS = [
  { href: "/monotributo", label: "Seguimiento" },
  { href: "/monotributo/dashboard", label: "Dashboard" },
  { href: "/monotributo/vencimientos", label: "Vencimientos" },
  { href: "/monotributo/equipo", label: "Equipo" },
];

export default function MonotributoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <ModuleTabBar tabs={TABS} accentColor="text-amber-600" />
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
