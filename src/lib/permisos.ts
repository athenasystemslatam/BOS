import { cache } from "react";
import { getAreasDelUsuario, getCurrentLiquidadora } from "@/lib/auth";
import { MODULOS_VALIDOS, type ModuloId } from "@/lib/modulos";

// "Ver todo, editar solo lo propio" (DIAGNOSTICO D1), en un solo lugar:
// - ver: todo el equipo (quien tiene ficha activa) ve el seguimiento de
//   todos los módulos;
// - editar: solo quien participa del módulo (equipo_modulos) o admin.
//   Cobranzas y solo lectura (viewer) nunca; Administrativo solo Libros;
// - sensibles (claves, CUIL ARCA, importes): quien participa del módulo o
//   admin. Las claves tienen su propia regla más estricta en clavesServer.ts.
// Las acciones de guardar lo vuelven a chequear con requireAreaOrAdmin.

export const permisos = cache(async () => {
  const yo = await getCurrentLiquidadora();
  const areas = yo ? await getAreasDelUsuario() : [];
  const editor = !!yo && !yo.esCobranzas && yo.rol !== "viewer";
  return {
    yo,
    areas,
    puedeVer: () => !!yo,
    puedeEditar: (modulo: ModuloId) =>
      editor && (yo!.isAdmin || (areas.includes(modulo) && (!yo!.esAdministrativo || modulo === "libros"))),
    puedeVerSensibles: (modulo: ModuloId) => !!yo && (yo.isAdmin || areas.includes(modulo)),
  };
});

/** Módulos donde la persona trabaja de verdad (no los que ve por su rol). */
export async function misModulos(): Promise<ModuloId[]> {
  const { yo, areas } = await permisos();
  if (!yo || yo.isAdmin || yo.esCobranzas || yo.esAdministrativo) return [];
  return MODULOS_VALIDOS.filter((m) => areas.includes(m));
}

const INICIO_MODULO: Record<ModuloId, string> = {
  sueldos: "/seguimiento",
  impuestos: "/impuestos",
  contable: "/contable",
  monotributo: "/monotributo",
  libros: "/libros",
};

/** Pantalla de inicio (DIAGNOSTICO D2): el Seguimiento de su primer módulo;
 * admin, Cobranzas, Administrativo y modo consulta, el Panel General. */
export async function inicioDelUsuario(): Promise<string> {
  const mios = await misModulos();
  return mios.length ? INICIO_MODULO[mios[0]] : "/panel-general";
}

/** Destino seguro después del login: solo rutas internas. */
export function destinoSeguro(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login") || next.startsWith("/auth")) return null;
  return next;
}
