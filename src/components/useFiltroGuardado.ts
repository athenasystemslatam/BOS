"use client";

import { useEffect, useState } from "react";

/**
 * Filtro que arranca en "" (ver todo) y recuerda en este navegador la última
 * elección de la persona. Si lo guardado ya no es válido, vuelve a "".
 */
export function useFiltroGuardado(clave: string, valido: (v: string) => boolean) {
  const [valor, setValor] = useState("");

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(clave);
      if (guardado && valido(guardado)) setValor(guardado);
    } catch {
      /* sin almacenamiento: queda en "ver todo" */
    }
    // Solo al montar: la validación usa los datos de la primera carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  function cambiar(v: string) {
    setValor(v);
    try {
      if (v) localStorage.setItem(clave, v);
      else localStorage.removeItem(clave);
    } catch {
      /* sin almacenamiento */
    }
  }

  return [valor, cambiar] as const;
}
