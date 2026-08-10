// Sin imports a propósito — este archivo lo usa middleware.ts (runtime Edge)
// y lib/auth.ts (runtime Node), así que tiene que ser liviano para los dos.

export const DOMINIO_PERMITIDO = "@kmaconsultores.com.ar";

/** Cualquiera con este dominio puede loguearse y queda en modo consulta
 * (solo lectura) hasta que un admin lo dé de alta como liquidadora/admin
 * desde `/liquidadoras`. Gente con fila propia en `liquidadoras` entra
 * igual aunque su email no sea de este dominio (ver middleware.ts). */
export function esDominioPermitido(email: string | null | undefined): boolean {
  return (email ?? "").toLowerCase().endsWith(DOMINIO_PERMITIDO);
}
