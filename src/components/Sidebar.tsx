"use client";

import { useEffect, useRef } from "react";
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
} from "lucide-react";
import clsx from "clsx";
import { ModuloId, MODULO_LABELS } from "@/lib/modulos";
import type { Rol } from "@/types";

// modulo: null = sección general, visible para cualquiera con sesión. Con
// modulo puesto, solo la ve un admin o alguien con ese módulo en
// equipo_modulos (ver filtro más abajo) — antes esta lista no se filtraba
// por área y cualquier persona veía las secciones de todos los módulos.
const SECTIONS: {
  label: string | null;
  modulo: ModuloId | null;
  items: { href: string; label: string; icon: typeof LayoutGrid; adminOnly: boolean; areaOnly?: ModuloId }[];
}[] = [
  {
    label: null,
    modulo: null,
    items: [
      { href: "/panel-general", label: "Panel General", icon: LayoutGrid, adminOnly: false },
      // Equipo abarca todos los módulos, por eso vive acá y no adentro de
      // una sección — pero por ahora (solo Sueldos está en uso real) se lo
      // dejamos ver a quien sea de Sueldos, no solo a admins. Las acciones
      // exclusivas de admin (crear/editar persona, transferir cartera,
      // bloqueos) se ocultan adentro de la página igual.
      { href: "/equipo",        label: "Equipo",        icon: Users,      adminOnly: false, areaOnly: "sueldos" },
    ],
  },
  {
    label: MODULO_LABELS.sueldos,
    modulo: "sueldos",
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
    items: [
      { href: "/monotributo",              label: "Seguimiento",  icon: FileText,        adminOnly: false },
      { href: "/monotributo/dashboard",    label: "Dashboard",    icon: LayoutDashboard, adminOnly: false },
      { href: "/monotributo/vencimientos", label: "Vencimientos", icon: Calendar,        adminOnly: false },
      { href: "/monotributo/equipo",       label: "Equipo",       icon: Users,           adminOnly: false },
    ],
  },
];

const ROL_LABELS: Record<Rol, string> = {
  admin: "Administrador/a",
  supervisor: "Supervisor/a",
  liquidadora: "Liquidadora",
  viewer: "Solo lectura",
};

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase();
}

export function Sidebar({
  isAdmin,
  nombre,
  rol,
  areas,
  onClose,
}: {
  isAdmin: boolean;
  nombre: string | null;
  rol?: Rol;
  areas: string[];
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const asideRef = useRef<HTMLElement>(null);

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

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside
      ref={asideRef}
      className="w-[214px] bg-paper flex flex-col h-screen sticky top-0 shrink-0 overflow-y-auto border-r border-line-panel"
    >
      {/* Logo */}
      <div className="px-[18px] pt-[22px] pb-4 flex items-center gap-[11px] shrink-0">
        <div className="w-[27px] h-[27px] bg-bordo rounded-lg flex items-center justify-center shrink-0">
          <span className="text-white font-archivo font-bold text-xs tracking-tight">K</span>
        </div>
        <div className="min-w-0">
          <p className="font-archivo font-semibold text-ink text-[13px] leading-[1.15] tracking-[-0.012em]">
            KMA Consultores
          </p>
          <p className="text-ink-faint text-[10px] font-medium tracking-[.14em] uppercase mt-[3px]">
            Sistema BOS
          </p>
        </div>
      </div>

      <div className="mx-[14px] h-px bg-line-soft shrink-0" />

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-[19px]">
        {SECTIONS.filter(
          (section) => section.modulo === null || isAdmin || areas.includes(section.modulo)
        ).map((section, si) => {
          const visibleItems = section.items.filter((item) => {
            if (item.adminOnly) return isAdmin;
            if (item.areaOnly) return isAdmin || areas.includes(item.areaOnly);
            return true;
          });
          if (visibleItems.length === 0) return null;

          // Grupo superior (Panel General / Equipo) sin título de módulo: se
          // renderiza distinto — barra de 2px al lado de cada ítem, no una
          // espina de grupo con título arriba.
          if (!section.label) {
            return (
              <div key={si} className="flex flex-col gap-0.5">
                {visibleItems.map(({ href, label, icon: Icon }) => {
                  const isActive = esRutaActiva(pathname, href);
                  return (
                    <NavLink key={href} href={href} isActive={isActive} onClose={onClose} topLevel>
                      <Icon size={14} strokeWidth={isActive ? 2.25 : 1.75} className="shrink-0" />
                      {label}
                    </NavLink>
                  );
                })}
              </div>
            );
          }

          return (
            <div key={si} className="flex gap-[11px]">
              <span className="w-0.5 shrink-0 rounded-full bg-bordo ml-[3px] mt-[3px] mb-[5px]" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-[9px] mb-[7px] pr-0.5">
                  <p className="font-archivo font-semibold text-[12.5px] tracking-[.01em] text-ink whitespace-nowrap">
                    {section.label}
                  </p>
                  <span className="flex-1 h-px bg-line-group" />
                </div>
                <div className="flex flex-col gap-px">
                  {visibleItems.map(({ href, label }) => {
                    const isActive = esRutaActiva(pathname, href);
                    return (
                      <NavLink key={href} href={href} isActive={isActive} onClose={onClose}>
                        <span
                          className={clsx(
                            "w-[3px] h-[3px] rounded-full shrink-0",
                            isActive ? "bg-bordo" : "bg-dot"
                          )}
                        />
                        {label}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mx-[14px] h-px bg-line-soft shrink-0" />

      {/* Pie: usuario + cerrar sesión */}
      <div className="p-3 flex flex-col gap-1 shrink-0">
        {nombre && (
          <div className="flex items-center gap-2.5 px-[9px] py-[5px]">
            <div className="w-[26px] h-[26px] rounded-full bg-bordo-tint2 flex items-center justify-center shrink-0">
              <span className="text-bordo text-[10px] font-semibold">{iniciales(nombre)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-ink text-[11.5px] font-medium truncate">{nombre}</p>
              {rol && <p className="text-ink-faint text-[10.5px] mt-0.5">{ROL_LABELS[rol]}</p>}
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 px-[9px] py-[7px] rounded-[7px] text-[12.5px] font-medium text-ink-subtle hover:bg-paper-hover hover:text-ink w-full transition-colors duration-150 text-left"
        >
          <LogOut size={14} strokeWidth={1.75} className="shrink-0" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}

// Exact match, o prefix match solo si no sigue un path más profundo.
function esRutaActiva(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/dashboard" && pathname.startsWith(href) && !pathname.slice(href.length).startsWith("/"))
  );
}

function NavLink({
  href,
  isActive,
  onClose,
  topLevel,
  children,
}: {
  href: string;
  isActive: boolean;
  onClose?: () => void;
  topLevel?: boolean;
  children: React.ReactNode;
}) {
  return (
    // <a> normal a propósito, no <Link> de Next: recarga la página entera en
    // cada clic del menú. Es la única forma que garantiza traer los datos
    // frescos del servidor — revalidatePath + staleTimes en 0 + prefetch
    // apagado no alcanzaron para evitar que quedara una copia vieja en
    // memoria al navegar "por dentro" entre secciones.
    <a
      href={href}
      onClick={onClose}
      className={clsx(
        "flex items-center gap-[9px] rounded-[7px] text-[12.5px] font-medium transition-colors duration-150",
        topLevel ? "py-2 px-[9px]" : "py-[6px] px-[9px]",
        isActive && topLevel && "bg-bordo text-white",
        isActive && !topLevel && "text-ink",
        !isActive && "text-ink-muted hover:bg-paper-hover hover:text-ink"
      )}
    >
      {topLevel && (
        <span
          className={clsx("w-0.5 h-[15px] rounded-full shrink-0", isActive ? "bg-white/85" : "bg-line-input")}
        />
      )}
      {children}
    </a>
  );
}
