import { cookies } from "next/headers";
import { NavWrapper } from "@/components/NavWrapper";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";

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
  // server y no ver el parpadeo de "todo abierto → se esconde".
  const cerradosRaw = cookies().get("bos-sidebar-cerrados")?.value ?? "";
  const seccionesCerradas = cerradosRaw ? cerradosRaw.split(",").filter(Boolean) : [];

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
