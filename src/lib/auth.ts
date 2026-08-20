import { createClient } from "@/lib/supabase/server";
import { Rol } from "@/types";

export interface CurrentLiquidadora {
  id: string;
  nombre: string;
  rol: Rol;
  activa: boolean;
  isAdmin: boolean;
}

/**
 * Liquidadora asociada al usuario de Supabase Auth logueado, o null si no hay
 * sesión, si el usuario no tiene una fila vinculada en `liquidadoras`, o si
 * esa fila está marcada `activa: false` (baja). En ese último caso el usuario
 * sigue autenticado pero pasa a modo consulta (o queda afuera del todo si
 * además está en `accesos_bloqueados` — eso lo corta middleware.ts).
 */
export async function getCurrentLiquidadora(): Promise<CurrentLiquidadora | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("liquidadoras")
    .select("id, nombre, rol, activa")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data || !data.activa) return null;

  return { ...data, isAdmin: data.rol === "admin" };
}

/** Tira error si el usuario logueado no es admin. Para usar en Server Actions
 * que operan con el admin client, donde RLS no puede proteger la operación. */
export async function requireAdmin(): Promise<CurrentLiquidadora> {
  const liquidadora = await getCurrentLiquidadora();
  if (!liquidadora?.isAdmin) {
    throw new Error("Solo un admin puede realizar esta acción.");
  }
  return liquidadora;
}

/** Tira error si el usuario logueado no tiene fila activa en `liquidadoras`
 * (o sea, si está en modo consulta). Para las Server Actions de escritura de
 * seguimiento — marcar tareas, sync de Drive, etc. */
export async function requireLiquidadoraOrAdmin(): Promise<CurrentLiquidadora> {
  const liquidadora = await getCurrentLiquidadora();
  if (!liquidadora) {
    throw new Error("No tenés permiso para editar — estás en modo consulta.");
  }
  return liquidadora;
}

/** Áreas (equipo_modulos.modulo) a las que pertenece el usuario logueado.
 * Fuente de verdad de "a qué módulo pertenece cada persona" — reemplaza el
 * chequeo implícito de antes ("está en liquidadoras" = "es de Sueldos"). */
export async function getAreasDelUsuario(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: liq } = await supabase
    .from("liquidadoras")
    .select("id")
    .eq("user_id", user.id)
    .eq("activa", true)
    .maybeSingle();
  if (!liq) return [];

  const { data } = await supabase
    .from("equipo_modulos")
    .select("modulo")
    .eq("equipo_id", liq.id);

  return (data ?? []).map((m) => m.modulo);
}

/** Tira error si el usuario logueado no es admin ni pertenece al área
 * `modulo` (equipo_modulos). Mismo criterio que requireLiquidadoraOrAdmin,
 * generalizado a Impuestos/Contable/Monotributo. */
export async function requireAreaOrAdmin(modulo: string): Promise<CurrentLiquidadora> {
  const liquidadora = await getCurrentLiquidadora();
  if (!liquidadora) {
    throw new Error("No tenés permiso para editar — estás en modo consulta.");
  }
  if (liquidadora.isAdmin) return liquidadora;

  const areas = await getAreasDelUsuario();
  if (!areas.includes(modulo)) {
    throw new Error("No tenés permiso para editar en este módulo.");
  }
  return liquidadora;
}
