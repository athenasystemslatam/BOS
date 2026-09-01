"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./Sidebar";

export function NavWrapper({
  isAdmin,
  nombre,
  areas,
  children,
}: {
  isAdmin: boolean;
  nombre: string | null;
  areas: string[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const mainRef = useRef<HTMLElement>(null);

  // Desde que el menú recarga la página entera (ver Sidebar.tsx, necesario
  // para no mostrar datos viejos), el scroll siempre arranca arriba. Esto
  // recuerda por dónde estabas parado en cada sección y lo restaura al
  // volver — no toca nada de la caché de Next, es aparte.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const key = `bos-scroll:${pathname}`;

    const guardado = sessionStorage.getItem(key);
    if (guardado) {
      const y = Number(guardado) || 0;
      // Dos rAF en vez de fijarlo ya: recién montada, la página puede
      // seguir acomodando su alto real (fuentes, tablas grandes) — si
      // fijamos el scroll demasiado pronto, ese reacomodo lo vuelve a 0.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.scrollTop = y;
        });
      });
    }

    const onScroll = () => sessionStorage.setItem(key, String(el.scrollTop));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [pathname]);

  return (
    <div className="flex h-screen bg-[#F5F5F5] overflow-hidden">
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-bordo flex items-center px-4 gap-3 shrink-0">
        <button
          onClick={() => setOpen(true)}
          className="text-white/80 hover:text-white p-1 -ml-1"
          aria-label="Abrir menú"
        >
          <Menu size={22} />
        </button>
        <span className="font-semibold text-white text-sm">KMA · Módulo Sueldos</span>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar — static on desktop, drawer on mobile */}
      <div
        className={`
          fixed md:static inset-y-0 left-0 z-50
          transition-transform duration-200 ease-in-out
          md:translate-x-0 md:flex md:shrink-0
          ${open ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="relative md:hidden">
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 text-white/60 hover:text-white z-10"
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>
        <Sidebar isAdmin={isAdmin} nombre={nombre} areas={areas} onClose={() => setOpen(false)} />
      </div>

      {/* Page content */}
      <main ref={mainRef} className="flex-1 overflow-y-auto min-w-0 pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
