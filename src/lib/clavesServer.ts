import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import type { ClaveAcceso } from "@/types";

// Claves de clientes y CUIL de ARCA: nunca viajan en las listas. Se piden de
// a un cliente (llave, ficha, editar) y el servidor entrega solo lo que la
// persona puede ver:
// - admin: todo;
// - quien participa de un módulo (equipo_modulos): las claves de ese módulo y
//   las generales; el CUIL de ARCA solo si es de Sueldos;
// - Cobranzas, Administrativo, modo consulta o dada de baja: nada.

export type AlcanceClaves = { todas: boolean; modulos: Set<string>; quien: string } | null;

export async function alcanceClaves(): Promise<AlcanceClaves> {
  const yo = await getCurrentLiquidadora();
  if (!yo || yo.esCobranzas || yo.esAdministrativo) return null;
  if (yo.isAdmin) return { todas: true, modulos: new Set(), quien: yo.nombre };
  const areas = await getAreasDelUsuario();
  if (!areas.length) return null;
  return { todas: false, modulos: new Set(["", ...areas]), quien: yo.nombre };
}

export function claveVisible(c: ClaveAcceso, alcance: AlcanceClaves): boolean {
  return !!alcance && (alcance.todas || alcance.modulos.has(c.modulo ?? ""));
}

export function puedeVerCuil(alcance: AlcanceClaves): boolean {
  return !!alcance && (alcance.todas || alcance.modulos.has("sueldos"));
}

function lista(v: unknown): ClaveAcceso[] {
  return Array.isArray(v) ? (v as ClaveAcceso[]) : [];
}

/** Saca claves y CUIL de una fila de cliente antes de mandarla al navegador. */
export function sinSensibles<T extends object>(c: T): Omit<T, "claves_acceso" | "cuil_arca"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { claves_acceso, cuil_arca, ...resto } = c as T & { claves_acceso?: unknown; cuil_arca?: unknown };
  return resto;
}

export function cantidadClaves(c: { claves_acceso?: unknown } | null | undefined, modulo?: string): number {
  const todas = lista(c?.claves_acceso);
  return modulo === undefined ? todas.length : todas.filter((k) => (k.modulo ?? "") === modulo).length;
}

/** Deja en la fila solo las claves (y el CUIL) que la persona puede ver, y
 * anota en los registros de Vercel quién vio claves de qué cliente. */
export async function protegerCliente<T extends { id?: string; claves_acceso?: unknown; cuil_arca?: unknown }>(
  cliente: T,
  donde: string,
  alcance?: AlcanceClaves
): Promise<T & { claves_ocultas: number; cuil_oculto: boolean }> {
  const a = alcance === undefined ? await alcanceClaves() : alcance;
  const todas = lista(cliente.claves_acceso);
  const visibles = todas.filter((c) => claveVisible(c, a));
  const verCuil = puedeVerCuil(a);
  if (visibles.length || (verCuil && cliente.cuil_arca)) {
    console.log(`[claves] ${a?.quien} vio ${visibles.length} clave(s)${verCuil && cliente.cuil_arca ? " y el CUIL ARCA" : ""} del cliente ${cliente.id} (${donde})`);
  }
  return {
    ...cliente,
    claves_acceso: visibles,
    cuil_arca: verCuil ? cliente.cuil_arca ?? null : null,
    claves_ocultas: todas.length - visibles.length,
    cuil_oculto: !verCuil && !!cliente.cuil_arca,
  };
}

/** Al guardar desde un editor que solo mostró parte de las claves: conserva
 * las que la persona no podía ver y reemplaza el resto por lo enviado. */
export function fusionarClaves(anteriores: unknown, enviadas: ClaveAcceso[], alcance: AlcanceClaves): ClaveAcceso[] {
  const ocultas = lista(anteriores).filter((c) => !claveVisible(c, alcance));
  return [...ocultas, ...enviadas];
}
