import { NavWrapper } from "@/components/NavWrapper";
import { getCurrentLiquidadora } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const yo = await getCurrentLiquidadora();

  return (
    <NavWrapper isAdmin={yo?.isAdmin ?? false}>
      {children}
    </NavWrapper>
  );
}
