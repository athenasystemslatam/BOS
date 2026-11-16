import { createAdminClient } from "@/lib/supabase/admin";
import { requireAreaOrAdmin } from "@/lib/auth";
import {
  DATOS_VACIOS,
  evaluarReglasCliente,
  hoyArgentina,
  requiereVerificarPago,
  valorCampo,
  type CampoRevision,
  type DatosMonotributoCliente,
  type EstadoMes,
  type Revision,
} from "@/lib/monotributo";

type Admin = ReturnType<typeof createAdminClient>;

/** Trae todas las filas de a 1000 (PostgREST corta ahí, ítem 78). */
export async function traerPaginado<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return filas;
  }
}

export async function leerDatosCliente(admin: Admin, clienteId: string): Promise<DatosMonotributoCliente> {
  const { data } = await admin
    .from("monotributo_clientes")
    .select("*")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!data) return { ...DATOS_VACIOS };
  return { ...DATOS_VACIOS, ...data, mails: data.mails ?? [] } as DatosMonotributoCliente;
}

const CAMPOS_REGLA_CLIENTE = ["responsable", "forma_pago", "medio_contacto"] as const;

/** Crea o resuelve las marcas de los datos fijos del cliente según las reglas.
 * - Hay problema y no hay marca pendiente → crea una (salvo que se haya
 *   confirmado "Está bien así" con este mismo valor).
 * - No hay problema y hay marca pendiente → se resuelve sola como "corregido".
 * Solo aplica a clientes con Monotributo activo. Una marca nunca bloquea nada. */
export async function sincronizarRevisionesCliente(
  admin: Admin,
  clienteId: string,
  resueltaPor: string | null
): Promise<void> {
  const [{ data: servicio }, datos, { data: revsRaw }] = await Promise.all([
    admin
      .from("servicios_cliente")
      .select("responsable_id")
      .eq("cliente_id", clienteId)
      .eq("servicio", "monotributo")
      .eq("estado", true)
      .maybeSingle(),
    leerDatosCliente(admin, clienteId),
    admin
      .from("monotributo_revisiones")
      .select("*")
      .eq("cliente_id", clienteId)
      .in("campo", [...CAMPOS_REGLA_CLIENTE])
      .order("detectada_at", { ascending: false }),
  ]);
  if (!servicio) return;

  const responsableId = (servicio as { responsable_id: string | null }).responsable_id;
  const revs = (revsRaw ?? []) as Revision[];
  const hallazgos = evaluarReglasCliente(datos, responsableId);
  const ahora = new Date().toISOString();

  for (const campo of CAMPOS_REGLA_CLIENTE) {
    const hallazgo = hallazgos.find((h) => h.campo === campo);
    const pendiente = revs.find((r) => r.campo === campo && r.estado === "pendiente");

    if (!hallazgo) {
      if (pendiente) {
        await admin
          .from("monotributo_revisiones")
          .update({ estado: "resuelta", resolucion: "corregido", resuelta_por: resueltaPor, resuelta_at: ahora })
          .eq("id", pendiente.id);
      }
      continue;
    }

    const valor = valorCampo(campo, datos, responsableId);
    if (pendiente) {
      if (pendiente.motivo !== hallazgo.motivo) {
        await admin.from("monotributo_revisiones").update({ motivo: hallazgo.motivo }).eq("id", pendiente.id);
      }
      continue;
    }
    const confirmadoAsi = revs.some(
      (r) => r.campo === campo && r.resolucion === "confirmado" && r.valor_confirmado === valor
    );
    if (confirmadoAsi) continue;

    await admin.from("monotributo_revisiones").insert({
      cliente_id: clienteId,
      campo,
      motivo: hallazgo.motivo,
      gravedad: hallazgo.gravedad,
      origen: "regla_automatica",
    });
  }
}

/** Parte una lista en tandas (los filtros `.in()` van en la URL: no mandar cientos de ids juntos). */
export function enTandas<T>(lista: T[], tam = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tam) out.push(lista.slice(i, i + tam));
  return out;
}

const MOTIVO_VERIFICAR_PAGO = "VEP enviado y sin Pagado pasado el vencimiento: verificar pago";

/** Pasa las reglas automáticas sobre todo el módulo, en pocas consultas:
 * - datos del cliente (responsable, forma de pago, medio de contacto)
 * - "verificar pago": VEP enviado y sin Pagado pasado el vencimiento del 20
 * - deuda: la marca "sin verificar" se resuelve sola cuando el último mes tiene Sí/No
 * Crea las marcas que faltan (salvo que se haya confirmado "Está bien así" con
 * el mismo valor) y resuelve como "corregido" las que ya no corresponden.
 * Solo clientes con Monotributo activo. Nunca pasa nada solo a "No pagó". */
export async function sincronizarRevisionesModulo(admin: Admin): Promise<{ creadas: number; resueltas: number }> {
  type Serv = { cliente_id: string; responsable_id: string | null; estado: boolean };
  type Tarea = { cliente_id: string; anio: number; mes: number; cuota_estado: EstadoMes; deuda_estado: string };
  type RevMin = Pick<Revision, "id" | "cliente_id" | "anio" | "mes" | "campo" | "estado" | "resolucion" | "valor_confirmado">;

  const [servicios, datosRows, revs, tareas] = await Promise.all([
    traerPaginado<Serv>((d, h) =>
      admin.from("servicios_cliente").select("cliente_id, responsable_id, estado")
        .eq("servicio", "monotributo").eq("subtipo", "general").order("id").range(d, h)
    ),
    traerPaginado<DatosMonotributoCliente & { cliente_id: string }>((d, h) =>
      admin.from("monotributo_clientes").select("*").order("id").range(d, h)
    ),
    traerPaginado<RevMin>((d, h) =>
      admin.from("monotributo_revisiones")
        .select("id, cliente_id, anio, mes, campo, estado, resolucion, valor_confirmado")
        .or("estado.eq.pendiente,resolucion.eq.confirmado")
        .order("id").range(d, h)
    ),
    traerPaginado<Tarea>((d, h) =>
      admin.from("monotributo_tareas").select("cliente_id, anio, mes, cuota_estado, deuda_estado")
        .order("id").range(d, h)
    ),
  ]);

  const activos = new Map(servicios.filter((s) => s.estado).map((s) => [s.cliente_id, s.responsable_id]));
  const datosPor = new Map(datosRows.map((r) => [r.cliente_id, { ...DATOS_VACIOS, ...r, mails: r.mails ?? [] }]));
  const clave = (c: string, campo: string, anio: number | null, mes: number | null) => `${c}|${campo}|${anio ?? 0}|${mes ?? 0}`;

  const pendientes = new Map<string, RevMin>();
  const confirmadas = new Map<string, Set<string>>();
  for (const r of revs) {
    const k = clave(r.cliente_id, r.campo, r.anio, r.mes);
    if (r.estado === "pendiente") pendientes.set(k, r);
    else if (r.resolucion === "confirmado") {
      if (!confirmadas.has(k)) confirmadas.set(k, new Set());
      confirmadas.get(k)!.add(r.valor_confirmado ?? "");
    }
  }

  // Lo que hoy corresponde marcar
  const hallazgos = new Map<string, { cliente_id: string; campo: CampoRevision; anio: number | null; mes: number | null; motivo: string; gravedad: "rojo" | "amarillo"; valor: string }>();
  activos.forEach((responsableId, clienteId) => {
    const datos = datosPor.get(clienteId) ?? { ...DATOS_VACIOS };
    for (const h of evaluarReglasCliente(datos, responsableId)) {
      const campo = h.campo as "responsable" | "forma_pago" | "medio_contacto";
      hallazgos.set(clave(clienteId, campo, null, null), {
        cliente_id: clienteId, campo, anio: null, mes: null, motivo: h.motivo, gravedad: h.gravedad,
        valor: valorCampo(campo, datos, responsableId),
      });
    }
  });
  const hoy = hoyArgentina();
  const ultimaTarea = new Map<string, Tarea>();
  for (const t of tareas) {
    const u = ultimaTarea.get(t.cliente_id);
    if (!u || t.anio * 100 + t.mes > u.anio * 100 + u.mes) ultimaTarea.set(t.cliente_id, t);
    if (activos.has(t.cliente_id) && requiereVerificarPago(t.cuota_estado, t.anio, t.mes, hoy)) {
      hallazgos.set(clave(t.cliente_id, "pago", t.anio, t.mes), {
        cliente_id: t.cliente_id, campo: "pago", anio: t.anio, mes: t.mes,
        motivo: MOTIVO_VERIFICAR_PAGO, gravedad: "amarillo", valor: t.cuota_estado,
      });
    }
  }

  // Resolver las pendientes que ya no corresponden (solo de clientes activos)
  const aResolver: string[] = [];
  pendientes.forEach((r, k) => {
    if (!activos.has(r.cliente_id)) return;
    if (r.campo === "responsable" || r.campo === "forma_pago" || r.campo === "medio_contacto" || r.campo === "pago") {
      if (!hallazgos.has(k)) aResolver.push(r.id);
    } else if (r.campo === "deuda") {
      const u = ultimaTarea.get(r.cliente_id);
      if (u && u.deuda_estado !== "sin_verificar") aResolver.push(r.id);
    }
  });

  // Crear las que faltan
  const aCrear: Record<string, unknown>[] = [];
  hallazgos.forEach((h, k) => {
    if (pendientes.has(k)) return;
    if (confirmadas.get(k)?.has(h.valor)) return;
    aCrear.push({ cliente_id: h.cliente_id, anio: h.anio, mes: h.mes, campo: h.campo, motivo: h.motivo, gravedad: h.gravedad, origen: "regla_automatica" });
  });

  const ahora = new Date().toISOString();
  for (const ids of enTandas(aResolver)) {
    await admin.from("monotributo_revisiones")
      .update({ estado: "resuelta", resolucion: "corregido", resuelta_at: ahora })
      .in("id", ids).eq("estado", "pendiente");
  }
  for (const filas of enTandas(aCrear, 200)) {
    await admin.from("monotributo_revisiones").insert(filas);
  }
  return { creadas: aCrear.length, resueltas: aResolver.length };
}

/** Edita Monotributo: equipo del módulo o admin. "Solo lectura" (viewer),
 * Cobranzas y Administrativo consultan pero no editan, ni confirman ni
 * resuelven marcas (requireAreaOrAdmin ya rechaza a los dos últimos). */
export async function requireEditorMonotributo() {
  const yo = await requireAreaOrAdmin("monotributo");
  if (yo.rol === "viewer") throw new Error("No tenés permiso para editar — tu rol es de solo lectura.");
  return yo;
}
