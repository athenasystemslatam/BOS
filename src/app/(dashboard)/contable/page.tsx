import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { getObjetivoContable, getExcepcionesCliente, resolverObjetivoContable } from "@/lib/objetivos";
import { ContableClient } from "./ContableClient";

export default async function ContablePage({
  searchParams,
}: {
  searchParams: { anio?: string };
}) {
  const anio = Number(searchParams.anio) || new Date().getFullYear();
  const admin = createAdminClient();
  const [
    yo,
    areas,
    { data: balancesRaw },
    { data: clientesContable },
    { data: equipoTodos },
    { data: equipoModulosTodos },
    objetivoGeneral,
    excepciones,
  ] = await Promise.all([
    getCurrentLiquidadora(),
    getAreasDelUsuario(),
    admin
      .from("balances")
      .select(
        "*, clientes(id, nombre, cuit, tipo_contribuyente, claves_acceso), " +
        "responsable:liquidadoras!balances_responsable_id_fkey(id, nombre), " +
        "responsable2:liquidadoras!balances_responsable2_id_fkey(id, nombre)"
      )
      .eq("anio_fiscal", anio)
      .order("fecha_cierre"),
    admin
      .from("servicios_cliente")
      .select("cliente_id, clientes(id, nombre, cuit, cierre_ejercicio_mes, cierre_ejercicio_dia)")
      .eq("servicio", "contable")
      .eq("estado", true),
    // Para el modal de edición de ficha (reutiliza EditarClienteModal de
    // Panel General), que necesita el equipo completo y sus módulos, no
    // solo el de Contable, ya que edita servicios de todos los módulos.
    admin.from("liquidadoras").select("id, nombre, activa, rol").eq("activa", true).order("nombre"),
    admin.from("equipo_modulos").select("equipo_id, modulo"),
    getObjetivoContable(),
    getExcepcionesCliente("contable"),
  ]);

  // Ítem 67: cada balance lleva pegados los días de vencimiento que le
  // corresponden (general, o la excepción de su cliente si tiene) — así
  // ContableClient (componente de cliente) no necesita saber nada de
  // objetivos ni excepciones, solo usa lo que ya viene resuelto.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balancesConObjetivo = ((balancesRaw as any[]) ?? []).map((b) => {
    const objetivo = resolverObjetivoContable(objetivoGeneral, excepciones, b.cliente_id as string);
    return {
      ...b,
      dias_vto_balance: objetivo.balance_dias_vto,
      dias_vto_f855: objetivo.balance_dias_vto + objetivo.f855_dias_vto_extra,
    };
  });

  const equipoIdsContable = new Set(
    (equipoModulosTodos ?? []).filter((m) => m.modulo === "contable").map((m) => m.equipo_id)
  );
  const equipoContable = (equipoTodos ?? [])
    .filter((e) => equipoIdsContable.has(e.id))
    .map((e) => ({ id: e.id, nombre: e.nombre }));

  const equipo = (equipoTodos ?? []).map((e) => ({
    id: e.id,
    nombre: e.nombre,
    activo: e.activa,
    rol: e.rol,
  }));

  // Clients with contable service
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientesConServicio = (clientesContable ?? []).map((s: any) => s.clientes).filter(Boolean);

  return (
    <ContableClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      balances={balancesConObjetivo as any[]}
      equipoContable={equipoContable}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientesConServicio={clientesConServicio as any[]}
      anio={anio}
      isAdmin={yo?.isAdmin ?? false}
      puedeEditar={!yo?.esCobranzas && (!!yo?.isAdmin || areas.includes("contable"))}
      equipo={equipo}
      equipoModulos={equipoModulosTodos ?? []}
    />
  );
}
