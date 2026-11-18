// Contactos del cliente (mails y teléfonos), uno solo para todo el sistema: Panel General,
// Clientes, Seguimiento de Sueldos y Monotributo leen y escriben lo mismo (tabla clientes).
// Sin imports de servidor: lo usan tanto las Server Actions como la UI.
import type { EmailContacto, TelefonoContacto } from "@/types";

export const MAX_EMAILS_CONTACTO = 10;
export const MAX_TELEFONOS_CONTACTO = 10;

export function limpiarEmails(raw: unknown): EmailContacto[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  return raw
    .map((e) => ({ email: String(e?.email ?? "").trim(), aclaracion: String(e?.aclaracion ?? "").trim() }))
    .filter((e) => e.email && !vistos.has(e.email.toLowerCase()) && vistos.add(e.email.toLowerCase()))
    .slice(0, MAX_EMAILS_CONTACTO);
}

export function limpiarTelefonos(raw: unknown): TelefonoContacto[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  return raw
    .map((t) => ({ telefono: String(t?.telefono ?? "").trim(), aclaracion: String(t?.aclaracion ?? "").trim() }))
    .filter((t) => {
      const d = t.telefono.replace(/\D/g, "");
      if (!t.telefono || (d && vistos.has(d))) return false;
      if (d) vistos.add(d);
      return true;
    })
    .slice(0, MAX_TELEFONOS_CONTACTO);
}

/** Mails del cliente: la lista con aclaración; si está vacía, la columna vieja (solo direcciones). */
export function emailsDeCliente(c: { emails_contacto?: string[] | null; emails_contacto_detalle?: EmailContacto[] | null }): EmailContacto[] {
  if (Array.isArray(c.emails_contacto_detalle) && c.emails_contacto_detalle.length) return limpiarEmails(c.emails_contacto_detalle);
  return limpiarEmails((c.emails_contacto ?? []).map((email) => ({ email, aclaracion: "" })));
}

/** Teléfonos del cliente: la lista con aclaración; si está vacía, el teléfono viejo (uno solo). */
export function telefonosDeCliente(c: { telefono?: string | null; telefonos_detalle?: TelefonoContacto[] | null }): TelefonoContacto[] {
  if (Array.isArray(c.telefonos_detalle) && c.telefonos_detalle.length) return limpiarTelefonos(c.telefonos_detalle);
  return c.telefono ? limpiarTelefonos([{ telefono: c.telefono, aclaracion: "" }]) : [];
}

/** El teléfono para WhatsApp: el que diga "whatsapp" en la aclaración; si ninguno, el primero. */
export function telefonoWhatsapp(tels: TelefonoContacto[]): string | null {
  return (tels.find((t) => /whats|wsp|wpp/i.test(t.aclaracion)) ?? tels[0])?.telefono ?? null;
}

/** Columnas a guardar en clientes. Las viejas (emails_contacto, telefono) se siguen completando
 * para que lo que ya las lee (Excel, tarjetas) no cambie. */
export function columnasContacto(emails: EmailContacto[], telefonos: TelefonoContacto[]) {
  return {
    emails_contacto_detalle: emails,
    emails_contacto: emails.map((e) => e.email),
    telefonos_detalle: telefonos,
    telefono: telefonos[0]?.telefono ?? null,
  };
}

/** Lee la lista de un formulario (JSON en un campo oculto). Si el formulario es de antes y solo
 * trae "telefono", lo toma como lista de uno. */
export function telefonosDelForm(formData: FormData): TelefonoContacto[] {
  const raw = formData.get("telefonos_detalle");
  if (typeof raw === "string") {
    try {
      return limpiarTelefonos(JSON.parse(raw || "[]"));
    } catch {
      return [];
    }
  }
  const uno = (formData.get("telefono") as string | null)?.trim();
  return uno ? [{ telefono: uno, aclaracion: "" }] : [];
}

export const ERROR_TELEFONOS_DETALLE =
  "Falta correr el SQL de contactos (add_contactos_unificados.sql) para guardar varios teléfonos.";
