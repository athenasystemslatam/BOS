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
 * sesión o si el usuario no tiene una fila vinculada en `liquidadoras`.
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

  if (!data) return null;

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
