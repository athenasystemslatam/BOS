"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import clsx from "clsx";

/**
 * Envuelve una tarjeta (barra de herramientas + tabla) con un botón para
 * ampliarla. Al expandir, se mide la posición actual de la tarjeta y se
 * fija ese mismo `top` — así lo que esté arriba (buscador, filtros, nav de
 * período) queda visible en su lugar normal, sin que la tarjeta ampliada
 * lo tape, aunque pase a `position: fixed` para ocupar el resto de la
 * pantalla.
 */
export function ExpandableCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [top, setTop] = useState(0);

  function toggle() {
    if (!expanded && ref.current) {
      setTop(ref.current.getBoundingClientRect().top);
    }
    setExpanded((v) => !v);
  }

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  return (
    <div
      ref={ref}
      style={expanded ? { top, left: 0, right: 0, bottom: 0, position: "fixed" } : undefined}
      className={clsx(
        "relative",
        expanded ? "z-[100] flex flex-col bg-white p-4 md:p-6" : className
      )}
    >
      <button
        type="button"
        onClick={toggle}
        title={expanded ? "Restaurar tamaño" : "Ampliar tabla"}
        className="absolute top-3 right-3 z-30 w-8 h-8 rounded-lg border border-gray-200 bg-white/95 backdrop-blur flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
      >
        {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
      {children}
    </div>
  );
}
