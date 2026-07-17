"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  LogOut,
  ClipboardList,
} from "lucide-react";
import clsx from "clsx";

const navItems = [
  { href: "/seguimiento",  label: "Seguimiento",  icon: ClipboardList, adminOnly: false },
  { href: "/dashboard",    label: "Dashboard",    icon: LayoutDashboard, adminOnly: false },
  { href: "/empresas",     label: "Empresas",     icon: Building2, adminOnly: false },
  { href: "/liquidadoras", label: "Liquidadoras", icon: Users, adminOnly: true },
  { href: "/vencimientos", label: "Vencimientos", icon: Calendar, adminOnly: false },
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="w-52 bg-bordo flex flex-col h-screen sticky top-0 shrink-0">
      {/* Logo */}
      <div className="px-5 pt-7 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-white/20 rounded-md flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs tracking-tight">K</span>
          </div>
          <div>
            <p className="font-semibold text-white text-[13px] leading-tight">
              KMA Consultores
            </p>
            <p className="text-white/50 text-[11px] mt-0.5">Módulo Sueldos</p>
          </div>
        </div>
      </div>

      <div className="mx-4 h-px bg-white/10" />

      {/* Nav */}
      <nav className="flex-1 px-3 pt-5 pb-4 space-y-0.5">
        <p className="text-white/40 text-[10px] font-semibold tracking-widest uppercase px-2 mb-2.5">
          Navegación
        </p>
        {navItems.filter((item) => !item.adminOnly || isAdmin).map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-all duration-150",
                isActive
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:bg-white/10 hover:text-white/90"
              )}
            >
              <Icon
                size={14}
                strokeWidth={isActive ? 2.25 : 1.75}
                className="shrink-0"
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 h-px bg-white/10" />

      {/* Logout */}
      <div className="px-3 py-4">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium text-white/50 hover:bg-white/10 hover:text-white/80 w-full transition-all duration-150"
        >
          <LogOut size={14} strokeWidth={1.75} className="shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
