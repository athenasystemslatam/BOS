import { TableroClient } from "./TableroClient";
import { obtenerDatosTablero } from "./datos";

export default async function TableroLibrosPage() {
  const datos = await obtenerDatosTablero();
  return <TableroClient datos={datos} />;
}
