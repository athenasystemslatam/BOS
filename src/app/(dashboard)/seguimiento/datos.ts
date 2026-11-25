import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { Cliente, Liquidadora, Periodo, Tarea } from "@/types";
import { getMesTrabajoActual } from "@/lib/vencimientos";
import { fetchRecordatoriosPrevios, fetchPeriodo } from "./actions";
import { getObjetivoSueldos } from "@/lib/objetivos";
import { aplicarDefaultFal, getFilasFal } from "@/lib/falServer";
import { estaVigenteHoy } from "@/lib/estadoVigente";
import { paginado } from "@/lib/paginado";
import { cantidadClaves, sinSensibles } from "@/lib/clavesServer";
import { permisos } from "@/lib/permisos";

export type ClienteConLiq = Cliente & { liquidadora: { id: string; nombre: string } };

// Extraído de page.tsx (antes todo esto vivía ahí adentro) para que
// /api/exportar/sueldos/seguimiento pueda generar el Excel con los mismos
// clientes y tareas del período de trabajo actual que ve la pantalla (ítem 147).
export async function obtenerSeguimientoSueldos({ verTodos = false }: { verTodos?: boolean } = {}) {
  const admin = createAdminClient();
  const { mes, anio } = getMesTrabajoActual();

  // Ojo: para las asignaciones se usa la fecha calendario real, no el "mes de
  // trabajo" (anio/mes de arriba, que durante los primeros días del mes todavía
  // apunta al período anterior por la ventana de 2 días post-F.931). Un
  // traspaso hecho hoy tiene que pesar ya para saber quién es responsable
  // ahora — es el mismo criterio de vigencia que usa insertarAsignacion al
  // sincronizar clientes.liquidador_id, así los dos quedan de acuerdo.
  const hoyReal = new Date();
  const anioReal = hoyReal.getFullYear();
  const mesReal = hoyReal.getMonth() + 1;

  const [yo, periodo, { data: periodos }, { data: serviciosSueldos }, { data: asignaciones }, { data: liquidadorasActivas }, objetivoSueldos] =
    await Promise.all([
      getCurrentLiquidadora(),
      fetchPeriodo(anio, mes),
      admin.from("periodos").select("*").order("anio", { ascending: false }).order("mes", { ascending: false }).limit(24),
      // Responsable de Sueldos vía servicios_cliente (igual que todos los
      // demás módulos), en vez de clientes.liquidador_id directo. Sin
      // .eq("estado", true): la vigencia ahora depende también de
      // fecha_baja (ver estaVigenteHoy más abajo), no solo del booleano.
      admin
        .from("servicios_cliente")
        .select("cliente_id, responsable_id, estado, fecha_baja, liquidadora:liquidadoras!responsable_id(id, nombre)")
        .eq("servicio", "sueldos")
        .eq("subtipo", "general"),
      paginado((d, h) => admin
        .from("asignaciones")
        .select("cliente_id, liquidador_id, desde_anio, desde_mes, creado_en, liquidadora:liquidadoras!liquidador_id(id, nombre)")
        .lte("desde_anio", anioReal)
        .order("id")
        .range(d, h)),
      admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre"),
      getObjetivoSueldos(),
    ]);
  await aplicarDefaultFal(objetivoSueldos);
  // Vigentes hoy: activos de siempre, o dados de baja con una fecha que
  // todavía no llegó (baja programada a futuro) — ver estaVigenteHoy.
  const serviciosVigentes = (serviciosSueldos ?? []).filter((s) => estaVigenteHoy(s.estado, s.fecha_baja));
  const idsSueldos = serviciosVigentes.map((s) => s.cliente_id);
  const responsablePorCliente = new Map(serviciosVigentes.map((s) => [s.cliente_id, s]));

  // No-admin: solo ve sus propios clientes — antes era .eq("liquidador_id",
  // yo.id) contra la columna de `clientes`; ahora se resuelve el mismo
  // conjunto contra servicios_cliente.responsable_id.
  // Desde "ver todo" (DIAGNOSTICO D1) arranca en sus clientes pero puede pasar a
  // "Todos". Sin ficha activa (modo consulta o dada de baja) no ve clientes de
  // Sueldos: antes una liquidadora dada de baja quedaba viendo todos.
  const puedeElegirVista = !!yo && !yo.isAdmin && !yo.esCobranzas && !yo.esAdministrativo;
  const esRestringido = puedeElegirVista && !verTodos;
  const idsVisibles = !yo
    ? []
    : esRestringido
      ? serviciosVigentes.filter((s) => s.responsable_id === yo.id).map((s) => s.cliente_id)
      : idsSueldos;

  // Sin .eq("estado", "activo"): mismo criterio de vigencia por fecha que
  // arriba, aplicado también a la baja del cliente entero (no solo del
  // servicio Sueldos) — se filtra después de traerlos, más abajo.
  const clientesQuery = admin
    .from("clientes")
    .select("*")
    .in("id", idsVisibles)
    .order("terminacion_cuit");
  const [{ data: clientesRaw }, { data: tareas }, recordatoriosPrevios] = await Promise.all([
    idsVisibles.length > 0 ? clientesQuery : Promise.resolve({ data: [] }),
    periodo ? admin.from("tareas").select("*").eq("periodo_id", periodo.id) : Promise.resolve({ data: [] }),
    periodo ? fetchRecordatoriosPrevios(periodo.id, { anio: periodo.anio, mes: periodo.mes }) : Promise.resolve({}),
  ]);
  // Se pisan liquidador_id/liquidadora con lo que diga servicios_cliente —
  // la reconciliación contra "asignaciones" de más abajo sigue igual, no le
  // importa de dónde salió el valor que está pisando.
  const clientes = ((clientesRaw ?? []) as Cliente[])
    .filter((c) => estaVigenteHoy(c.estado === "activo", c.fecha_baja))
    .map((c) => {
      const resp = responsablePorCliente.get(c.id);
      return {
        ...sinSensibles(c),
        tiene_sensibles: cantidadClaves(c) > 0 || !!c.cuil_arca,
        liquidador_id: resp?.responsable_id ?? null,
        liquidadora: (resp?.liquidadora as unknown as { id: string; nombre: string } | null) ?? null,
      } as ClienteConLiq;
    });

  // Resolver liquidadora por período usando tabla asignaciones
  if (clientes.length > 0) {
    if (asignaciones && asignaciones.length > 0) {
      const porCliente = new Map<string, typeof asignaciones[0]>();
      for (const a of asignaciones) {
        if (a.desde_anio * 100 + a.desde_mes > anioReal * 100 + mesReal) continue;
        const prev = porCliente.get(a.cliente_id);
        if (
          !prev ||
          a.desde_anio * 100 + a.desde_mes > prev.desde_anio * 100 + prev.desde_mes ||
          (a.desde_anio * 100 + a.desde_mes === prev.desde_anio * 100 + prev.desde_mes &&
            a.creado_en > prev.creado_en)
        ) {
          porCliente.set(a.cliente_id, a);
        }
      }
      for (const c of clientes) {
        const asig = porCliente.get(c.id);
        // Ítem 80: ver mismo comentario en page.tsx — gana quien se haya
        // tocado más reciente entre la asignación y la última edición directa.
        if (asig && asig.creado_en > c.fecha_modificacion) {
          c.liquidador_id = asig.liquidador_id;
          (c as unknown as Record<string, unknown>).liquidadora = asig.liquidadora;
        }
      }
    }
  }

  const filasFal = await getFilasFal(clientes.map((c) => c.id));

  const clienteLiqIds = new Set((clientes ?? []).map((c) => c.liquidador_id).filter(Boolean));
  const liquidadoras = yo?.isAdmin || yo?.esCobranzas || yo?.esAdministrativo
    ? (liquidadorasActivas ?? []).filter((l) => clienteLiqIds.has(l.id))
    : [];

  return {
    clientes,
    tareas: (tareas as Tarea[]) ?? [],
    periodos: (periodos as Periodo[]) ?? [],
    periodo: periodo as Periodo | null,
    liquidadoras: (liquidadoras as Pick<Liquidadora, "id" | "nombre">[]) ?? [],
    isAdmin: yo?.isAdmin ?? false,
    puedeEditar: (await permisos()).puedeEditar("sueldos"),
    vista: (puedeElegirVista ? (esRestringido ? "mios" : "todos") : null) as "mios" | "todos" | null,
    recordatoriosPrevios,
    fal: { fechaCorte: objetivoSueldos.fal_fecha_corte, filas: filasFal },
  };
}

export type DatosSeguimientoSueldos = Awaited<ReturnType<typeof obtenerSeguimientoSueldos>>;
