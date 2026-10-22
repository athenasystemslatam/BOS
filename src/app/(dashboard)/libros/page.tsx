import { SeguimientoLibrosClient } from "./SeguimientoLibrosClient";
import { obtenerColaLibros } from "./datos";

export default async function SeguimientoLibrosPage() {
  const datos = await obtenerColaLibros();
  return <SeguimientoLibrosClient {...datos} />;
}
