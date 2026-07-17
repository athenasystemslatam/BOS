import { Sidebar } from "@/components/Sidebar";
import { getCurrentLiquidadora } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const yo = await getCurrentLiquidadora();

  return (
    <div className="flex h-screen bg-[#F5F5F5] overflow-hidden">
      <Sidebar isAdmin={yo?.isAdmin ?? false} />
      <main className="flex-1 overflow-y-auto min-w-0">
        {children}
      </main>
    </div>
  );
}
