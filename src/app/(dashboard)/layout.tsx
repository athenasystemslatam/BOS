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

  return (
    <NavWrapper isAdmin={yo?.isAdmin ?? false} nombre={yo?.nombre ?? null} rol={yo?.rol} areas={areas}>
      {children}
    </NavWrapper>
  );
}
