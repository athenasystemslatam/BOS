"use client";

import { useEffect } from "react";

/** Al cargar la página, deja la tabla scrolleada justo donde empieza el mes actual. */
export function ScrollToMesActual() {
  useEffect(() => {
    document
      .getElementById("mes-actual-row")
      ?.scrollIntoView({ block: "start" });
  }, []);

  return null;
}
