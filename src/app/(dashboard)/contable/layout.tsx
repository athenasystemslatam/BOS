import { ModuleTabBar } from "@/components/ModuleTabBar";

const TABS = [
  { href: "/contable", label: "Balances" },
  { href: "/contable/dashboard", label: "Dashboard" },
  { href: "/contable/vencimientos", label: "Vencimientos" },
  { href: "/contable/equipo", label: "Equipo" },
];

export default function ContableLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-full">
      <ModuleTabBar tabs={TABS} accentColor="text-emerald-600" />
      <div className="flex-1 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
