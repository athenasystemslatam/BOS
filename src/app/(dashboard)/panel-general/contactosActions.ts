"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { registrarHistorial } from "@/lib/monotributoHistorial";
import { refrescarMonotributo, sincronizarRevisionesCliente } from "@/lib/monotributoServer";
import {
  ERROR_TELEFONOS_DETALLE,
  columnasContacto,
  emailsDeCliente,
  limpiarEmails,
  limpiarTelefonos,
  telefonosDeCliente,
} from "@/lib/contactos";
import type { EmailContacto, TelefonoContacto } from "@/types";

/** Puede editar los contactos del cliente: admin y administrativo (como en Panel General), o
 * quien edita alguno de los módulos en los que el cliente tiene un servicio activo.
 * Cobranzas y "Solo lectura" no. */
async function permisoContactos(clienteId: string): Promise<{ id: string } | null> {
  const [yo, areas] = await Promise.all([getCurrentLiquidadora(), getAreasDelUsuario()]);
  if (!yo || yo.esCobranzas || yo.rol === "viewer") return null;
  if (yo.isAdmin || yo.esAdministrativo) return { id: yo.id };
  const { data } = await createAdminClient().from("servicios_cliente").select("servicio").eq("cliente_id", clienteId).eq("estado", true);
  const servicios = ((data ?? []) as { servicio: string }[]).map((s) => s.servicio);
  return servicios.some((s) => areas.includes(s)) ? { id: yo.id } : null;
}

export async function puedeEditarContactos(clienteId: string): Promise<boolean> {
  return !!(await permisoContactos(clienteId));
}

/** Guarda mails y teléfonos del cliente: la misma lista para todo el sistema. Si el cliente es de
 * Monotributo, el cambio queda en su historial (con Deshacer) y se recalculan sus marcas. */
export async function guardarContactosCliente(
  clienteId: string,
  emails: EmailContacto[],
  telefonos: TelefonoContacto[]
): Promise<{ error: string } | { ok: true; historialIds: string[] }> {
  const yo = await permisoContactos(clienteId);
  if (!yo) return { error: "No tenés permiso para editar los contactos de este cliente." };

  const nuevosEmails = limpiarEmails(emails);
  const nuevosTels = limpiarTelefonos(telefonos);
  const malo = nuevosEmails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email));
  if (malo) return { error: `Mail inválido: ${malo.email}` };

  const admin = createAdminClient();
  const { data: antes } = await admin.from("clientes").select("*").eq("id", clienteId).maybeSingle();
  if (!antes) return { error: "No se encontró el cliente." };
  const emailsAntes = emailsDeCliente(antes);
  const telsAntes = telefonosDeCliente(antes);

  const { error } = await admin.from("clientes")
    .update({ ...columnasContacto(nuevosEmails, nuevosTels), fecha_modificacion: new Date().toISOString() })
    .eq("id", clienteId);
  if (error) return { error: error.message.includes("telefonos_detalle") ? ERROR_TELEFONOS_DETALLE : error.message };

  let historialIds: string[] = [];
  const { data: mono } = await admin.from("servicios_cliente").select("cliente_id").eq("cliente_id", clienteId).eq("servicio", "monotributo").limit(1);
  if (mono?.length) {
    const entradas = [];
    if (JSON.stringify(emailsAntes) !== JSON.stringify(nuevosEmails)) {
      entradas.push({ cliente_id: clienteId, entidad: "ficha" as const, campo: "emails_contacto_detalle", valor_anterior: emailsAntes, valor_nuevo: nuevosEmails, usuario_id: yo.id });
    }
    if (JSON.stringify(telsAntes) !== JSON.stringify(nuevosTels)) {
      entradas.push({ cliente_id: clienteId, entidad: "ficha" as const, campo: "telefonos_detalle", valor_anterior: telsAntes, valor_nuevo: nuevosTels, usuario_id: yo.id });
    }
    historialIds = await registrarHistorial(admin, entradas);
    await sincronizarRevisionesCliente(admin, clienteId, yo.id).catch(() => undefined);
  }
  refrescarMonotributo("/");
  return { ok: true, historialIds };
}
