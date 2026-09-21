import { useRef } from "react";
import type { MouseEvent } from "react";

/**
 * Props para el fondo oscuro de un modal: lo cierra al hacer clic, pero solo
 * si el clic EMPEZÓ y TERMINÓ en el fondo. Con un onClick común, arrastrar
 * para seleccionar texto dentro del modal y soltar afuera dispara un click
 * en el fondo (es el ancestro común del mousedown y el mouseup) y cierra el
 * modal sin querer.
 */
export function useBackdropClose(onClose: () => void) {
  const empezoEnFondo = useRef(false);
  return {
    onMouseDown: (e: MouseEvent<HTMLElement>) => {
      empezoEnFondo.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent<HTMLElement>) => {
      if (empezoEnFondo.current && e.target === e.currentTarget) onClose();
      empezoEnFondo.current = false;
    },
  };
}
