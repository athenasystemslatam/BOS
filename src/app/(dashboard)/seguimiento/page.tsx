import { SeguimientoClient } from "./SeguimientoClient";
import { obtenerSeguimientoSueldos } from "./datos";

// Ruta dinámica: usa cookies para saber qué empresas mostrar.
export default async function SeguimientoPage() {
  const { clientes, tareas, periodos, periodo, liquidadoras, isAdmin, puedeEditar, recordatoriosPrevios, fal } =
    await obtenerSeguimientoSueldos();

  return (
    <SeguimientoClient
      clientes={clientes}
      tareas={tareas}
      periodos={periodos}
      periodo={periodo}
      liquidadoras={liquidadoras}
      isAdmin={isAdmin}
      puedeEditar={puedeEditar}
      recordatoriosPrevios={recordatoriosPrevios}
      fal={fal}
    />
  );
}
