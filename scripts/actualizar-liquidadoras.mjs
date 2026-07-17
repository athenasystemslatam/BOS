/**
 * Actualiza emails reales de liquidadoras existentes (y sube a Giuliana a
 * rol admin) + da de baja a Santiago (activa=false, fecha_baja=hoy).
 *
 * Por default corre en modo dry-run: busca los matches por nombre y muestra
 * qué cambiaría, sin escribir nada. Recién escribe en la base si se lo llama
 * con --apply.
 *
 * Uso:
 *   node scripts/actualizar-liquidadoras.mjs            (dry-run, solo muestra)
 *   node scripts/actualizar-liquidadoras.mjs --apply     (aplica los cambios)
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
const APPLY = process.argv.includes("--apply");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// ── Qué hay que cambiar ──────────────────────────────────────────────────────

const ACTUALIZACIONES = [
  { match: "giuliana", email: "giulianatignanelli@kmaconsultores.com.ar", rol: "admin" },
  { match: "romina", email: "payroll@kmaconsultores.com.ar" },
  { match: "anabella", email: "sueldoskma@kmaconsultores.com.ar" },
  { match: "maria de los angeles", email: "sueldos@kmaconsultores.com.ar" },
  { match: "carla", email: "carlaalvarez@kmaconsultores.com.ar" },
];

const BAJAS = ["santiago"];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { data: liquidadoras, error } = await supabase
    .from("liquidadoras")
    .select("id, nombre, email, rol, activa");

  if (error) {
    console.error("❌  Error al leer liquidadoras:", error.message);
    process.exit(1);
  }

  console.log(`📋  ${liquidadoras.length} liquidadora(s) en la base.\n`);

  const acciones = [];
  let huboProblema = false;

  for (const cambio of ACTUALIZACIONES) {
    const matches = liquidadoras.filter((l) => normalize(l.nombre).includes(cambio.match));
    if (matches.length === 0) {
      console.warn(`⚠️   Sin match para "${cambio.match}" — se salta.`);
      huboProblema = true;
      continue;
    }
    if (matches.length > 1) {
      console.warn(
        `⚠️   "${cambio.match}" matchea ${matches.length} liquidadoras (${matches
          .map((m) => m.nombre)
          .join(", ")}) — ambiguo, se salta.`
      );
      huboProblema = true;
      continue;
    }
    const liq = matches[0];
    const update = { email: cambio.email };
    if (cambio.rol) update.rol = cambio.rol;
    acciones.push({ liq, update, tipo: "update" });

    console.log(`✏️   ${liq.nombre}`);
    console.log(`     email: ${liq.email ?? "(vacío)"} → ${cambio.email}`);
    if (cambio.rol) console.log(`     rol:   ${liq.rol} → ${cambio.rol}`);
    console.log();
  }

  for (const nombreBaja of BAJAS) {
    const matches = liquidadoras.filter((l) => normalize(l.nombre).includes(nombreBaja));
    if (matches.length === 0) {
      console.warn(`⚠️   Sin match para baja de "${nombreBaja}" — se salta.`);
      huboProblema = true;
      continue;
    }
    if (matches.length > 1) {
      console.warn(
        `⚠️   Baja "${nombreBaja}" matchea ${matches.length} liquidadoras (${matches
          .map((m) => m.nombre)
          .join(", ")}) — ambiguo, se salta.`
      );
      huboProblema = true;
      continue;
    }
    const liq = matches[0];
    const hoy = new Date().toISOString().split("T")[0];
    const update = { activa: false, fecha_baja: hoy };
    acciones.push({ liq, update, tipo: "baja" });

    console.log(`🔻  Baja: ${liq.nombre}`);
    console.log(`     activa: ${liq.activa} → false`);
    console.log(`     fecha_baja: ${hoy}`);
    console.log();
  }

  if (acciones.length === 0) {
    console.log("Nada para hacer.");
    return;
  }

  if (!APPLY) {
    console.log(
      `🔎  Dry-run: ${acciones.length} cambio(s) arriba. Nada se escribió todavía.\n` +
        `    Corré con --apply para aplicarlos.`
    );
    if (huboProblema) {
      console.log("\n⚠️   Hay matches sin resolver — revisalos antes de aplicar.");
    }
    return;
  }

  console.log(`🚀  Aplicando ${acciones.length} cambio(s)...\n`);
  let ok = 0, errores = 0;
  for (const { liq, update, tipo } of acciones) {
    const { error: updError } = await supabase.from("liquidadoras").update(update).eq("id", liq.id);
    if (updError) {
      console.error(`  ❌  ${liq.nombre}: ${updError.message}`);
      errores++;
    } else {
      console.log(`  ✅  ${liq.nombre} (${tipo === "baja" ? "dada de baja" : "actualizada"})`);
      ok++;
    }
  }

  console.log(`\n🏁  Listo: ${ok} aplicados, ${errores} con error.`);
}

main().catch((e) => { console.error("❌  Error inesperado:", e); process.exit(1); });
