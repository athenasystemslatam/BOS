import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { Rol } from "@/types";
import { MODULOS_VALIDOS } from "@/lib/modulos";

export interface CurrentLiquidadora {
  id: string;
  nombre: string;
  rol: Rol;
  activa: boolean;
  isAdmin: boolean;
  // Ve todos los módulos (getAreasDelUsuario le devuelve todos) pero no
  // puede editar nada — requireLiquidadoraOrAdmin/requireAreaOrAdmin la
  // rechazan igual que a alguien en modo consulta.
  esCobranzas: boolean;
  // Ítem 119: consulta (solo lectura) en Contable, acceso completo a Libros
  // (depende de equipo_modulos, como liquidadora/viewer) y edita Panel
  // General como un admin — ver requireAreaOrAdmin y
  // requireAdminOrAdministrativo más abajo.
  esAdministrativo: boolean;
}

// Usuario logueado, una sola vez por request: getCurrentLiquidadora y
// getAreasDelUsuario lo necesitan las dos y antes cada una le preguntaba
// al servidor de Auth por su cuenta (un viaje de red más en cada click).
const getUsuario = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Liquidadora asociada al usuario de Supabase Auth logueado, o null si no hay
 * sesión, si el usuario no tiene una fila vinculada en `liquidadoras`, o si
 * esa fila está marcada `activa: false` (baja). En ese último caso el usuario
 * sigue autenticado pero pasa a modo consulta (o queda afuera del todo si
 * además está en `accesos_bloqueados` — eso lo corta middleware.ts).
 */
export const getCurrentLiquidadora = cache(async (): Promise<CurrentLiquidadora | null> => {
  const user = await getUsuario();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("liquidadoras")
    .select("id, nombre, rol, activa")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data || !data.activa) return null;

  return {
    ...data,
    isAdmin: data.rol === "admin",
    esCobranzas: data.rol === "cobranzas",
    esAdministrativo: data.rol === "administrativo",
  };
});

/** Tira error si el usuario logueado no es admin. Para usar en Server Actions
 * que operan con el admin client, donde RLS no puede proteger la operación. */
export async function requireAdmin(): Promise<CurrentLiquidadora> {
  const liquidadora = await getCurrentLiquidadora();
  if (!liquidadora?.isAdmin) {
    throw new Error("Solo un admin puede realizar esta acción.");
  }
  return liquidadora;
}

/** Tira error si el usuario logueado no es admin ni tiene el rol
 * "administrativo" (ítem 119: edita Panel General igual que un admin, pero
 * no el resto de las acciones exclusivas de admin en otros módulos). Para
 * las Server Actions de Panel General. */
export async function requireAdminOrAdministrativo(): Promise<CurrentLiquidadora> {
  const liquidadora = await getCurrentLiquidadora();
  if (!liquidadora || (!liquidadora.isAdmin && !liquidadora.esAdministrativo)) {
    throw new Error("No tenés permiso para realizar esta acción.");
  }
  return liquidadora;
}

/** Tira error si el usuario logueado no tiene fila activa en `liquidadoras`
 * (o sea, si está en modo consulta). Para las Server Actions de escritura de
 * seguimiento — marcar tareas, sync de Drive, etc. */
export async function requireLiquidadoraOrAdmin(): Promise<CurrentLiquidadora> {
  const liquidadora = await getCurrentLiquidadora();
  if (!liquidadora || liquidadora.esCobranzas) {
    throw new Error("No tenés permiso para editar — estás en modo consulta.");
  }
  return liquidadora;
}

/** Áreas (equipo_modulos.modulo) a las que pertenece el usuario logueado.
 * Fuente de verdad de "a qué módulo pertenece cada persona" — reemplaza el
 * chequeo implícito de antes ("está en liquidadoras" = "es de Sueldos"). */
export const getAreasDelUsuario = cache(async (): Promise<string[]> => {
  // Misma fila que getCurrentLiquidadora (activa, vinculada al login): se
  // reutiliza en vez de volver a consultarla.
  const liq = await getCurrentLiquidadora();
  if (!liq) return [];

  // Cobranzas ve todos los módulos sin que haga falta anotarla módulo por
  // módulo en equipo_modulos — no puede editar nada de todos modos
  // (requireLiquidadoraOrAdmin/requireAreaOrAdmin la rechazan).
  if (liq.rol === "cobranzas") return [...MODULOS_VALIDOS];

  const supabase = await createClient();
  const { data } = await supabase
    .from("equipo_modulos")
    .select("modulo")
    .eq("equipo_id", liq.id);

  return (data ?? []).map((m) => m.modulo);
});

/** Tira error si el usuario logueado no es admin ni pertenece al área
 * `modulo` (equipo_modulos). Mismo criterio que requireLiquidadoraOrAdmin,
 * generalizado a Impuestos/Contable/Monotributo. */
export async function requireAreaOrAdmin(modulo: string): Promise<CurrentLiquidadora> {
  const liquidadora = await getCurrentLiquidadora();
  if (!liquidadora || liquidadora.esCobranzas) {
    throw new Error("No tenés permiso para editar — estás en modo consulta.");
  }
  // Ítem 119: administrativo tiene consulta (solo lectura) específicamente
  // en Contable, a diferencia del resto de los módulos donde si tiene el
  // área asignada edita como cualquiera (ej. Libros).
  if (liquidadora.esAdministrativo && modulo === "contable") {
    throw new Error("No tenés permiso para editar — tu rol es de consulta en Contable.");
  }
  if (liquidadora.isAdmin) return liquidadora;

  const areas = await getAreasDelUsuario();
  if (!areas.includes(modulo)) {
    throw new Error("No tenés permiso para editar en este módulo.");
  }
  return liquidadora;
}
