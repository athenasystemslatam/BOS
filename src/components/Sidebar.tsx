"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  LogOut,
  ClipboardList,
  TrendingUp,
  LayoutGrid,
  Receipt,
  BookOpen,
  FileText,
  Moon,
  Sun,
} from "lucide-react";
import clsx from "clsx";
import { ModuloId, MODULO_LABELS } from "@/lib/modulos";

// modulo: null = sección general, visible para cualquiera con sesión. Con
// modulo puesto, solo la ve un admin o alguien con ese módulo en
// equipo_modulos (ver filtro más abajo) — antes esta lista no se filtraba
// por área y cualquier persona veía las secciones de todos los módulos.
const SECTIONS: {
  label: string | null;
  modulo: ModuloId | null;
  accent: string | null;
  items: { href: string; label: string; icon: typeof LayoutGrid; adminOnly: boolean }[];
}[] = [
  {
    label: null,
    modulo: null,
    accent: null,
    items: [
      { href: "/panel-general", label: "Panel General", icon: LayoutGrid, adminOnly: false },
      { href: "/equipo",        label: "Equipo",        icon: Users,      adminOnly: true  },
    ],
  },
  {
    label: MODULO_LABELS.sueldos,
    modulo: "sueldos",
    accent: "bg-rose-400",
    items: [
      { href: "/seguimiento",   label: "Seguimiento",   icon: ClipboardList,   adminOnly: false },
      { href: "/dashboard",     label: "Dashboard",     icon: LayoutDashboard, adminOnly: false },
      { href: "/empresas",      label: "Clientes",      icon: Building2,       adminOnly: false },
      { href: "/vencimientos",  label: "Vencimientos",  icon: Calendar,        adminOnly: false },
      { href: "/productividad", label: "Productividad", icon: TrendingUp,      adminOnly: true  },
    ],
  },
  {
    label: MODULO_LABELS.impuestos,
    modulo: "impuestos",
    accent: "bg-blue-400",
    items: [
      { href: "/impuestos",              label: "Seguimiento",  icon: Receipt,         adminOnly: false },
      { href: "/impuestos/dashboard",    label: "Dashboard",    icon: LayoutDashboard, adminOnly: false },
      { href: "/impuestos/vencimientos", label: "Vencimientos", icon: Calendar,        adminOnly: false },
      { href: "/impuestos/equipo",       label: "Equipo",       icon: Users,           adminOnly: false },
    ],
  },
  {
    label: MODULO_LABELS.contable,
    modulo: "contable",
    accent: "bg-emerald-400",
    items: [
      { href: "/contable",              label: "Balances",     icon: BookOpen,        adminOnly: false },
      { href: "/contable/dashboard",    label: "Dashboard",    icon: LayoutDashboard, adminOnly: false },
      { href: "/contable/vencimientos", label: "Vencimientos", icon: Calendar,        adminOnly: false },
      { href: "/contable/equipo",       label: "Equipo",       icon: Users,           adminOnly: false },
    ],
  },
  {
    label: MODULO_LABELS.monotributo,
    modulo: "monotributo",
    accent: "bg-amber-400",
    items: [
      { href: "/monotributo",              label: "Seguimiento",  icon: FileText,        adminOnly: false },
      { href: "/monotributo/dashboard",    label: "Dashboard",    icon: LayoutDashboard, adminOnly: false },
      { href: "/monotributo/vencimientos", label: "Vencimientos", icon: Calendar,        adminOnly: false },
      { href: "/monotributo/equipo",       label: "Equipo",       icon: Users,           adminOnly: false },
    ],
  },
];

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

export function Sidebar({
  isAdmin,
  nombre,
  areas,
  onClose,
}: {
  isAdmin: boolean;
  nombre: string | null;
  areas: string[];
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [modoOscuro, setModoOscuro] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setModoOscuro(localStorage.getItem("bos-modo-oscuro") === "true");
  }, []);

  // El propio <aside> tiene scroll (el menú entero no entra en pantallas
  // chicas). Como cada clic recarga la página completa, el menú volvía a
  // arrancar arriba — esto guarda dónde estaba desplazado y lo restaura.
  // Una sola clave para todas las páginas: el menú es el mismo en todas.
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const key = "bos-sidebar-scroll";

    const guardado = sessionStorage.getItem(key);
    if (guardado) {
      const y = Number(guardado) || 0;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.scrollTop = y;
        });
      });
    }

    const onScroll = () => sessionStorage.setItem(key, String(el.scrollTop));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const toggleModoOscuro = () => {
    const nuevo = !modoOscuro;
    setModoOscuro(nuevo);
    localStorage.setItem("bos-modo-oscuro", String(nuevo));
    // TODO: todavía no repinta la interfaz — solo guarda la preferencia.
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside ref={asideRef} className="w-52 bg-bordo flex flex-col h-screen sticky top-0 shrink-0 overflow-y-auto">
      {/* Logo */}
      <div className="px-5 pt-7 pb-5 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-white/20 rounded-md flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-xs tracking-tight">K</span>
          </div>
          <div>
            <p className="font-semibold text-white text-[13px] leading-tight">KMA Consultores</p>
            <p className="text-white/50 text-[11px] mt-0.5">Sistema BOS</p>
          </div>
        </div>
      </div>

      <div className="mx-4 h-px bg-white/10 shrink-0" />

      {/* Nav */}
      <nav className="flex-1 px-3 pt-4 pb-4 space-y-4">
        {SECTIONS.filter(
          (section) => section.modulo === null || isAdmin || areas.includes(section.modulo)
        ).map((section, si) => {
          const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;
          return (
            <div key={si}>
              {section.label && (
                <div className="flex items-center gap-1.5 px-2 mb-1.5">
                  <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", section.accent)} />
                  <p className="text-white/40 text-[10px] font-semibold tracking-widest uppercase">
                    {section.label}
                  </p>
                </div>
              )}
              <div className="space-y-0.5">
                {visibleItems.map(({ href, label, icon: Icon }) => {
                  // Exact match, or prefix match only if no deeper path follows
                  const isActive =
                    pathname === href ||
                    (href !== "/dashboard" &&
                      pathname.startsWith(href) &&
                      !pathname.slice(href.length).startsWith("/"));
                  return (
                    // <a> normal a propósito, no <Link> de Next: recarga la
                    // página entera en cada clic del menú. Es la única forma
                    // que garantiza traer los datos frescos del servidor —
                    // revalidatePath + staleTimes en 0 + prefetch apagado no
                    // alcanzaron para evitar que quedara una copia vieja en
                    // memoria al navegar "por dentro" entre secciones.
                    <a
                      key={href}
                      href={href}
                      onClick={onClose}
                      className={clsx(
                        "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-all duration-150",
                        isActive
                          ? "bg-white/15 text-white"
                          : "text-white/60 hover:bg-white/10 hover:text-white/90"
                      )}
                    >
                      <Icon size={14} strokeWidth={isActive ? 2.25 : 1.75} className="shrink-0" />
                      {label}
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mx-4 h-px bg-white/10 shrink-0" />

      {/* Usuario logueado */}
      {nombre && (
        <div className="px-4 pt-4 flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <span className="text-white text-[11px] font-semibold">{iniciales(nombre)}</span>
          </div>
          <p className="text-white/80 text-[13px] font-medium truncate flex-1">{nombre}</p>
          <button
            onClick={toggleModoOscuro}
            aria-label={modoOscuro ? "Activar modo claro" : "Activar modo oscuro"}
            className="text-white/50 hover:text-white/90 p-1 shrink-0 transition-colors"
          >
            {modoOscuro ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
          </button>
        </div>
      )}

      {/* Logout */}
      <div className="px-3 py-4 shrink-0">
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
