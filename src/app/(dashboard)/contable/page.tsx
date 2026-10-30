import { getAniosContables } from "@/lib/aniosContables";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { getContextoVencimientos } from "@/lib/vencimientosContablesServer";
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
    vencimientos,
    anios,
    { data: cambiosCierre },
  ] = await Promise.all([
    getCurrentLiquidadora(),
    getAreasDelUsuario(),
    admin
      .from("balances")
      .select(
        "*, clientes(id, nombre, cuit, tipo_contribuyente, claves_acceso, cierre_ejercicio_mes, cierre_ejercicio_dia), " +
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
    getContextoVencimientos(),
    getAniosContables(),
    // Ítem 109: último cambio registrado de la fecha de cierre fija de cada
    // cliente, para explicar por qué un balance no coincide con ella.
    admin
      .from("clientes_cierre_cambios")
      .select("cliente_id, motivo, mes_anterior, dia_anterior, creado_en")
      .order("creado_en", { ascending: false }),
  ]);
  const ultimoCambio = new Map<string, { motivo: string; mes_anterior: number; dia_anterior: number }>();
  for (const c of cambiosCierre ?? []) if (!ultimoCambio.has(c.cliente_id)) ultimoCambio.set(c.cliente_id, c);

  // Cada balance lleva sus vencimientos ya resueltos (regla, prórroga o
  // manual, ítem 91): ContableClient no sabe nada de reglas, solo los muestra.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balancesConObjetivo = ((balancesRaw as any[]) ?? []).map((b) => {
    const mes = b.clientes?.cierre_ejercicio_mes as number | null;
    const dia = b.clientes?.cierre_ejercicio_dia as number | null;
    const [, m, d] = (b.fecha_cierre as string).split("-").map(Number);
    let cierre_distinto: string | null = null;
    if (mes && dia && (m !== mes || d !== dia)) {
      const fijo = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
      const cambio = ultimoCambio.get(b.cliente_id);
      cierre_distinto = `Distinto del cierre fijo del cliente (${fijo})` + (cambio ? `. Cambio registrado: ${cambio.motivo}` : "");
    }
    return { ...b, vtos: vencimientos.resolver(b), cierre_distinto };
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
      // balancesMap se inicializa una sola vez (useState lazy) a partir de
      // los balances que llegan por props: sin este key, cambiar de año solo
      // actualizaba la URL (router.push) pero el componente seguía montado
      // con los datos viejos hasta un F5. Con key={anio} React lo remonta
      // entero cada vez que cambia el año.
      key={anio}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      balances={balancesConObjetivo as any[]}
      equipoContable={equipoContable}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clientesConServicio={clientesConServicio as any[]}
      anio={anio}
      anios={anios}
      isAdmin={yo?.isAdmin ?? false}
      miId={yo?.id ?? null}
      // Ítem 119: administrativo ve Contable (si tiene el área asignada)
      // pero no edita acá, solo consulta.
      puedeEditar={!yo?.esCobranzas && !yo?.esAdministrativo && (!!yo?.isAdmin || areas.includes("contable"))}
      equipo={equipo}
      equipoModulos={equipoModulosTodos ?? []}
    />
  );
}
