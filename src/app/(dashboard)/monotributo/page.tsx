import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { getMesTrabajoActual } from "@/lib/vencimientos";
import { resolverResponsablesVigentes } from "@/lib/asignacionesServicio";
import { hoyArgentina, puedeSerResponsable, type Gravedad } from "@/lib/monotributo";
import { avisoCalendarioFaltante, enVentanaRecategorizacion, leerCalendario, vencimientoDe } from "@/lib/calendarioArca";
import { arrastrarMesCacheado, sincronizarRevisionesCacheado, traerPaginado } from "@/lib/monotributoServer";
import { calcularAlertasMonotributo } from "@/lib/monotributoAlertas";
import { estaVigenteHoy } from "@/lib/estadoVigente";
import { MonotributoClient, type FichaResumen } from "./MonotributoClient";
import { cantidadClaves, sinSensibles } from "@/lib/clavesServer";
import { permisos } from "@/lib/permisos";

// Siempre datos frescos: un cambio (estado, deuda, etc.) se ve al instante, sin caché del servidor.
export const dynamic = "force-dynamic";

export default async function MonotributoPage({
  searchParams,
}: {
  searchParams: { mes?: string; anio?: string };
}) {
  const inicio = Date.now();
  const { mes: mesDefault, anio: anioDefault } = getMesTrabajoActual();
  const mes = Number(searchParams.mes) || mesDefault;
  const anio = Number(searchParams.anio) || anioDefault;

  const admin = createAdminClient();
  const hoy = hoyArgentina();
  const calendario = await leerCalendario([anio, Number(hoy.slice(0, 4)), Number(hoy.slice(0, 4)) + 1]);
  const esRecategorizacion = enVentanaRecategorizacion(calendario, anio, mes);
  // Primero el arrastre de deuda/intimación/categoría al mes, después las reglas de revisión.
  try {
    await arrastrarMesCacheado(anio, mes, esRecategorizacion);
  } catch {
    // Si falla, el mes se muestra sin lo arrastrado.
  }
  try {
    await sincronizarRevisionesCacheado();
  } catch {
    // Si falla, se muestra igual lo que ya está marcado.
  }
  const [
    yo,
    areas,
    // Responsable vigente para el período mostrado — igual criterio que Sueldos.
    vigentes,
    { data: serviciosRaw },
    { data: tareas },
    { data: equipoRaw },
    { data: modulosRaw },
    pendientes,
    alertasMes,
    fichas,
  ] = await Promise.all([
    getCurrentLiquidadora(),
    getAreasDelUsuario(),
    resolverResponsablesVigentes("monotributo", "general", anio, mes),
    // Sin .eq("estado", true): la vigencia ahora también depende de
    // fecha_baja (baja programada a futuro sigue viéndose) — se filtra
    // después de traer, con estaVigenteHoy.
    admin
      .from("servicios_cliente")
      .select("cliente_id, responsable_id, estado, fecha_baja, clientes(id, nombre, cuit, tipo_contribuyente, claves_acceso, estado, fecha_baja)")
      .eq("servicio", "monotributo"),
    admin
      .from("monotributo_tareas")
      .select("*")
      .eq("anio", anio)
      .eq("mes", mes),
    admin.from("liquidadoras").select("id, nombre, rol").eq("activa", true),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "monotributo"),
    traerPaginado<{ cliente_id: string; gravedad: Gravedad; anio: number | null; mes: number | null }>((d, h) =>
      admin.from("monotributo_revisiones").select("cliente_id, gravedad, anio, mes")
        .eq("estado", "pendiente").order("id").range(d, h)
    ),
    calcularAlertasMonotributo(anio, mes).catch(() => null),
    traerPaginado<FichaResumen & { cliente_id: string }>((d, h) =>
      admin.from("monotributo_clientes").select("cliente_id, forma_pago, medio, avisa, envia_vep, destinatario").order("id").range(d, h)
    ),
  ]);
  const fichaPor = new Map(fichas.map(({ cliente_id, ...f }) => [cliente_id, f]));

  // Marcas que se ven en este mes: las del cliente y las de este mes puntual.
  const revisiones: Record<string, { rojo: number; amarillo: number }> = {};
  for (const p of pendientes) {
    if (p.anio !== null && (p.anio !== anio || p.mes !== mes)) continue;
    const r = (revisiones[p.cliente_id] ??= { rojo: 0, amarillo: 0 });
    r[p.gravedad]++;
  }

  const equipoIdsMonotributo = new Set((modulosRaw ?? []).map((m) => m.equipo_id));
  const equipoMonotributo = (equipoRaw ?? [])
    .filter((e) => equipoIdsMonotributo.has(e.id) && puedeSerResponsable(e.rol))
    .map(({ id, nombre }) => ({ id, nombre }));

  const equipoMap = new Map((equipoRaw ?? []).map((e) => [e.id, e.nombre]));

  const servicios = (serviciosRaw ?? [])
    .filter((s: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!estaVigenteHoy(s.estado, s.fecha_baja)) return false;
      const c = s.clientes;
      return !c || estaVigenteHoy(c.estado === "activo", c.fecha_baja);
    })
    .map((sc: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      // Las claves no viajan al navegador: solo cuántas hay (la llave las pide al abrir).
      const s = { ...sc, clientes: sc.clientes ? { ...sinSensibles(sc.clientes), claves_modulo: cantidadClaves(sc.clientes, "monotributo") } : null };
      const vigente = vigentes.get(s.cliente_id);
      const ficha = fichaPor.get(s.cliente_id) ?? null;
      if (vigente) return { ...s, ficha, responsable_id: vigente.id, responsable_nombre: vigente.nombre };
      return {
        ...s,
        ficha,
        responsable_nombre: s.responsable_id ? (equipoMap.get(s.responsable_id) ?? null) : null,
      };
    });

  // Importes (deuda, VEP): solo quien es de Monotributo o admin (DIAGNOSTICO D1).
  const verImportes = (await permisos()).puedeVerSensibles("monotributo");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tareasVisibles = ((tareas as any[]) ?? []).map((t) =>
    verImportes ? t : { ...t, deuda_monto: null, vep_importe: null, deuda_texto_original: null, deuda_periodos: null }
  );

  // Tiempo de armado en el servidor (se ve en los registros de Vercel).
  console.info(`[tiempo] /monotributo ${Date.now() - inicio} ms`);
  return (
    <MonotributoClient
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      servicios={servicios as any[]}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tareas={tareasVisibles}
      equipoMonotributo={equipoMonotributo}
      mes={mes}
      anio={anio}
      isAdmin={yo?.isAdmin ?? false}
      puedeEditar={!!yo && !yo.esCobranzas && !yo.esAdministrativo && yo.rol !== "viewer" && (yo.isAdmin || areas.includes("monotributo"))}
      creadoPor={yo?.id ?? null}
      revisiones={revisiones}
      totalARevisar={pendientes.length}
      totalAlertas={alertasMes?.alertas.length ?? null}
      nombres={Object.fromEntries(equipoMap)}
      yoId={yo?.id ?? null}
      esRecategorizacion={esRecategorizacion}
      avisoCalendario={yo && !yo.esCobranzas && !yo.esAdministrativo && yo.rol !== "viewer" ? avisoCalendarioFaltante(calendario, hoy) : null}
      vencimiento={vencimientoDe(calendario, anio, mes)}
      hoy={hoy}
    />
  );
}
