/**
 * Vincula las liquidadoras ya cargadas (sin user_id) a un usuario de
 * Supabase Auth, creándolo si hace falta y enviando el magic link de acceso.
 * También asegura que exista la cuenta admin (rol='admin') si se pasan
 * BOS_ADMIN_EMAIL / BOS_ADMIN_NOMBRE en .env.local.
 *
 * Uso: node scripts/vincular-liquidadoras.mjs
 * Se corre una sola vez (es idempotente: ignora las liquidadoras que ya
 * tienen user_id).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];
const SITE_URL =
  env["NEXT_PUBLIC_SITE_URL"] ?? "http://localhost:3000";
const ADMIN_EMAIL = env["BOS_ADMIN_EMAIL"]?.toLowerCase() || null;
const ADMIN_NOMBRE = env["BOS_ADMIN_NOMBRE"] || ADMIN_EMAIL;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const redirectTo = `${SITE_URL}/auth/callback`;

async function inviteOrResend(email) {
  const invite = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (!invite.error && invite.data.user) {
    return { userId: invite.data.user.id, error: null };
  }

  const link = await supabase.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error || !link.data.user) {
    return {
      userId: null,
      error: invite.error?.message ?? link.error?.message ?? "error desconocido",
    };
  }
  await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  return { userId: link.data.user.id, error: null };
}

async function main() {
  // 1. Asegurar la cuenta admin
  if (ADMIN_EMAIL) {
    const { data: existente } = await supabase
      .from("liquidadoras")
      .select("id, rol, user_id")
      .eq("email", ADMIN_EMAIL)
      .maybeSingle();

    if (!existente) {
      console.log(`\n🆕  Creando cuenta admin para ${ADMIN_EMAIL}…`);
      const { userId, error } = await inviteOrResend(ADMIN_EMAIL);
      if (error) {
        console.error(`  ❌  ${ADMIN_EMAIL}: ${error}`);
      } else {
        const { error: insErr } = await supabase.from("liquidadoras").insert({
          nombre: ADMIN_NOMBRE,
          email: ADMIN_EMAIL,
          rol: "admin",
          user_id: userId,
        });
        if (insErr) console.error(`  ❌  Error al crear liquidadora admin:`, insErr.message);
        else console.log(`  ✅  Cuenta admin creada y vinculada.`);
      }
    } else if (existente.rol !== "admin") {
      console.log(`\n⬆️   Ascendiendo ${ADMIN_EMAIL} a rol admin…`);
      await supabase.from("liquidadoras").update({ rol: "admin" }).eq("id", existente.id);
    } else {
      console.log(`\n✅  Cuenta admin (${ADMIN_EMAIL}) ya existe.`);
    }
  } else {
    console.log("\nℹ️   BOS_ADMIN_EMAIL no está en .env.local — no se toca la cuenta admin.");
  }

  // 2. Vincular liquidadoras existentes sin user_id
  const { data: pendientes, error: fetchError } = await supabase
    .from("liquidadoras")
    .select("id, nombre, email")
    .is("user_id", null)
    .not("email", "is", null);

  if (fetchError) {
    console.error("❌  Error al leer liquidadoras:", fetchError.message);
    process.exit(1);
  }

  console.log(`\n📋  ${pendientes.length} liquidadora(s) sin vincular.`);

  let ok = 0, errores = 0, saltadas = 0;
  for (const liq of pendientes) {
    if (liq.email.endsWith("@kma.internal")) {
      console.log(`  ⏭️   ${liq.nombre} — email placeholder, se salta (actualizar email real primero)`);
      saltadas++;
      continue;
    }
    const { userId, error } = await inviteOrResend(liq.email);
    if (error) {
      console.error(`  ❌  ${liq.nombre} (${liq.email}): ${error}`);
      errores++;
      continue;
    }
    const { error: updError } = await supabase
      .from("liquidadoras")
      .update({ user_id: userId })
      .eq("id", liq.id);
    if (updError) {
      console.error(`  ❌  ${liq.nombre} — no se pudo guardar user_id:`, updError.message);
      errores++;
    } else {
      console.log(`  ✅  ${liq.nombre} (${liq.email}) vinculada, magic link enviado.`);
      ok++;
    }
  }

  console.log(`\n🏁  Listo: ${ok} vinculadas, ${saltadas} saltadas, ${errores} con error.`);
}

main().catch((e) => { console.error("❌  Error inesperado:", e); process.exit(1); });
