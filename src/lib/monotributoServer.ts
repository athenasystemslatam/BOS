import { createAdminClient } from "@/lib/supabase/admin";
import {
  DATOS_VACIOS,
  evaluarReglasCliente,
  valorCampo,
  type DatosMonotributoCliente,
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
