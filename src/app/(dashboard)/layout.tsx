import { cookies } from "next/headers";
import { NavWrapper } from "@/components/NavWrapper";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { MODULO_LABELS } from "@/lib/modulos";

// Secciones colapsables del menú (ver Sidebar.tsx) — las mismas 4 que usan
// MODULO_LABELS.x como section.label. "Libros" no tiene sección propia
// todavía, no entra acá.
const SECCIONES_COLAPSABLES = [
  MODULO_LABELS.sueldos,
  MODULO_LABELS.impuestos,
  MODULO_LABELS.contable,
  MODULO_LABELS.monotributo,
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const yo = await getCurrentLiquidadora();
  // Un admin ve todo igual — no hace falta pedir sus áreas.
  const areas = yo && !yo.isAdmin ? await getAreasDelUsuario() : [];

  // Secciones del sidebar que el usuario dejó colapsadas (cookie escrita
  // desde el cliente). Se lee acá para renderizarlas cerradas ya en el
  // server y no ver el parpadeo de "todo abierto → se esconde". Si la
  // cookie todavía no existe (primera vez que entra a BOS) arrancan todas
  // cerradas — distinto de que exista con valor vacío, que significa que
  // la persona ya las abrió todas a propósito.
  const cookieCerrados = cookies().get("bos-sidebar-cerrados");
  const seccionesCerradas = cookieCerrados
    ? cookieCerrados.value.split(",").filter(Boolean)
    : SECCIONES_COLAPSABLES;

  return (
    <NavWrapper
      isAdmin={yo?.isAdmin ?? false}
      nombre={yo?.nombre ?? null}
      rol={yo?.rol}
      areas={areas}
      cerradosInicial={seccionesCerradas}
    >
      {children}
    </NavWrapper>
  );
}
