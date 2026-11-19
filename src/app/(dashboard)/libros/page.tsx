import { SeguimientoLibrosClient } from "./SeguimientoLibrosClient";
import { obtenerColaLibros } from "./datos";

export default async function SeguimientoLibrosPage() {
  const inicio = Date.now();
  const datos = await obtenerColaLibros();
  console.info(`[tiempo] /libros ${Date.now() - inicio} ms`);
  return <SeguimientoLibrosClient {...datos} />;
}
