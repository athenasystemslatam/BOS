import { getCurrentLiquidadora } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getObjetivoContable, getObjetivoSueldos, getExcepcionesCliente } from "@/lib/objetivos";
import { ProductividadTabs } from "@/components/ProductividadTabs";
import { ConfiguracionObjetivosClient } from "./ConfiguracionObjetivosClient";
import { ReglasVencimientosClient, type ManualListado } from "./ReglasVencimientosClient";
import { getContextoVencimientos } from "@/lib/vencimientosContablesServer";

export default async function ConfiguracionObjetivosPage() {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/productividad");

  const admin = createAdminClient();
  const [objetivoSueldos, objetivoContable, excepcionesMap, vencimientos, { data: manualesRaw }] = await Promise.all([
    getObjetivoSueldos(),
    getObjetivoContable(),
    getExcepcionesCliente("contable"),
    getContextoVencimientos(),
    admin
      .from("contable_vto_manual")
      .select("id, tipo, fecha, motivo, balances(anio_fiscal, clientes(nombre))")
      .order("creado_en", { ascending: false }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manuales: ManualListado[] = ((manualesRaw as any[]) ?? []).map((m) => ({
    id: m.id,
    tipo: m.tipo,
    fecha: m.fecha,
    motivo: m.motivo,
    cliente: m.balances?.clientes?.nombre ?? "—",
    anio_fiscal: m.balances?.anio_fiscal ?? 0,
  }));
  const prorrogas = [...vencimientos.prorrogas].sort((a, b) => b.creado_en.localeCompare(a.creado_en));

  const clienteIds = Array.from(excepcionesMap.keys());
  const clientesRaw = clienteIds.length > 0
    ? (await admin.from("clientes").select("id, nombre").in("id", clienteIds)).data
    : [];
  const nombrePorId = new Map((clientesRaw ?? []).map((c) => [c.id, c.nombre]));

  const excepciones = Array.from(excepcionesMap.entries())
    .map(([clienteId, config]) => ({
      clienteId,
      nombre: nombrePorId.get(clienteId) ?? "Cliente eliminado",
      config,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="p-4 md:p-8">
      <ProductividadTabs current="/productividad/configuracion" />
      <div className="mb-6 md:mb-8">
        <p className="text-sm text-gray-400 font-medium uppercase tracking-wide">Productividad</p>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">Configuración de objetivos</h1>
        <p className="text-sm text-gray-400 mt-1">
          Objetivo general por área, con excepción opcional por cliente en Contable
        </p>
      </div>

      <ConfiguracionObjetivosClient
        objetivoSueldos={objetivoSueldos}
        objetivoContable={objetivoContable}
        excepcionesIniciales={excepciones}
      />

      <div className="mt-6">
        <ReglasVencimientosClient
          reglasIniciales={vencimientos.reglasGenerales}
          prorrogasIniciales={prorrogas}
          manualesIniciales={manuales}
        />
      </div>
    </div>
  );
}
