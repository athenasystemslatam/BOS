"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/**
 * Crea el usuario de Supabase Auth para un email nuevo (dispara el email de
 * invitación). Si el email ya existe en Auth, en cambio recupera su user_id
 * con generateLink y reenvía un magic link normal por signInWithOtp.
 */
async function inviteOrResend(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
  redirectTo: string
): Promise<{ userId: string | null; error: string | null }> {
  const invite = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (!invite.error && invite.data.user) {
    return { userId: invite.data.user.id, error: null };
  }

  const link = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || !link.data.user) {
    return {
      userId: null,
      error: invite.error?.message ?? link.error?.message ?? "No se pudo crear el acceso.",
    };
  }

  await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  return { userId: link.data.user.id, error: null };
}

export async function crearLiquidadora(formData: FormData) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const supabase = createAdminClient();

  const nombre = (formData.get("nombre") as string)?.trim();
  const emailRaw = (formData.get("email") as string)?.trim().toLowerCase();
  const rol = formData.get("rol") as string;

  if (!nombre || !rol) return { error: "El nombre es obligatorio." };
  if (!emailRaw) return { error: "El email es obligatorio para enviar el acceso." };

  const { userId, error: authError } = await inviteOrResend(
    supabase,
    emailRaw,
    `${siteUrl()}/auth/callback`
  );
  if (authError) return { error: `No se pudo crear el acceso: ${authError}` };

  const { error } = await supabase
    .from("liquidadoras")
    .insert({ nombre, email: emailRaw, rol, user_id: userId });

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una liquidadora con ese email." };
    return { error: error.message };
  }

  revalidatePath("/liquidadoras");
  revalidatePath("/empresas");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function editarLiquidadora(formData: FormData) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const supabase = createAdminClient();

  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string)?.trim();
  const emailRaw = (formData.get("email") as string)?.trim().toLowerCase();
  const email = emailRaw || null;
  const rol = formData.get("rol") as string;
  const activa = formData.get("activa") !== "false";
  const fecha_baja_raw = (formData.get("fecha_baja") as string)?.trim() || null;

  if (!id || !nombre || !rol) return { error: "El nombre es obligatorio." };

  const update: Record<string, unknown> = {
    nombre,
    email,
    rol,
    activa,
    fecha_baja: activa ? null : fecha_baja_raw,
  };

  const { error } = await supabase.from("liquidadoras").update(update).eq("id", id);

  if (error) {
    if (error.code === "23505") return { error: "Ya existe una liquidadora con ese email." };
    if (error.message.includes("fecha_baja")) {
      // Reintentar sin fecha_baja si la columna no existe aún
      const { error: e2 } = await supabase
        .from("liquidadoras")
        .update({ nombre, email, rol, activa })
        .eq("id", id);
      if (e2) return { error: e2.message };
    } else {
      return { error: error.message };
    }
  }

  revalidatePath("/liquidadoras");
  revalidatePath("/dashboard");
  return { success: true };
}

/** Reenvía el acceso (magic link) a una liquidadora existente. Si todavía no
 * tenía user_id vinculado, lo completa de paso. */
export async function reenviarInvitacion(liquidadoraId: string) {
  try {
    await requireAdmin();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const supabase = createAdminClient();

  const { data: liq, error: liqError } = await supabase
    .from("liquidadoras")
    .select("email")
    .eq("id", liquidadoraId)
    .single();

  if (liqError || !liq?.email) return { error: "La liquidadora no tiene email cargado." };

  const { userId, error } = await inviteOrResend(supabase, liq.email, `${siteUrl()}/auth/callback`);
  if (error) return { error };

  if (userId) {
    await supabase.from("liquidadoras").update({ user_id: userId }).eq("id", liquidadoraId);
  }

  return { success: true };
}
