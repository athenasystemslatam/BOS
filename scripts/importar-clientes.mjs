/**
 * Importa clientes desde ESTATUS SUELDOS 2026 new (1).xlsx → Supabase
 * Uso: node scripts/importar-clientes.mjs
 */

import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ── Configuración ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

// Leer .env.local manualmente
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split("=").map((s) => s.trim()))
);

const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const SERVICE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];
const EXCEL_PATH = resolve(
  process.env.HOME,
  "Downloads/ESTATUS SUELDOS 2026 new (1).xlsx"
);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function cellStr(row, col) {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v.richText) return v.richText.map((r) => r.text).join("").trim();
  return String(v).trim();
}

function siNo(val) {
  return val.toLowerCase() === "si" || val.toLowerCase() === "sí";
}

function normalizeCuit(raw) {
  return String(raw).replace(/\D/g, "");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("📂  Leyendo Excel:", EXCEL_PATH);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);

  const sheet = wb.getWorksheet("CLIENTES");
  if (!sheet) {
    console.error("❌  No se encontró la hoja 'CLIENTES'");
    process.exit(1);
  }

  // ── 1. Recopilar datos del Excel ──────────────────────────────────────────
  const rows = [];
  sheet.eachRow((row, rowNum) => {
    if (rowNum < 4) return; // título + vacía + encabezados
    const nombre = cellStr(row, 3);
    if (!nombre) return;
    const estado = cellStr(row, 14).toLowerCase();
    if (estado !== "activo") return; // solo activos

    rows.push({
      nombre,
      cuit:             normalizeCuit(cellStr(row, 4)),
      terminacion_cuit: parseInt(cellStr(row, 5)) || 0,
      liquidadora_nombre: cellStr(row, 7),
      es_quincenal:     cellStr(row, 8).toLowerCase() === "quincenal",
      jurisdiccion:     cellStr(row, 9) || null,
      art:              cellStr(row, 10) || null,
      red_bancaria:     cellStr(row, 11) || null,
      tiene_rubrica_lsd: siNo(cellStr(row, 12)),
      tiene_sindicato:   siNo(cellStr(row, 13)),
      observaciones:    cellStr(row, 15) || null,
    });
  });

  console.log(`✅  ${rows.length} clientes activos leídos`);

  // ── 2. Liquidadoras: traer las existentes ─────────────────────────────────
  const { data: existentes, error: errLiq } = await supabase
    .from("liquidadoras")
    .select("id, nombre");

  if (errLiq) { console.error("❌  Error al leer liquidadoras:", errLiq.message); process.exit(1); }

  const liqMap = new Map(
    existentes.map((l) => [l.nombre.toLowerCase().trim(), l.id])
  );

  // ── 3. Crear las liquidadoras que faltan ──────────────────────────────────
  const nombresExcel = [...new Set(rows.map((r) => r.liquidadora_nombre).filter(Boolean))];
  const faltantes = nombresExcel.filter((n) => !liqMap.has(n.toLowerCase()));

  if (faltantes.length > 0) {
    console.log(`\n🆕  Creando ${faltantes.length} liquidadora(s) nuevas: ${faltantes.join(", ")}`);
    // Generamos email placeholder — se puede actualizar desde la UI
    const { data: nuevas, error: errNuevas } = await supabase
      .from("liquidadoras")
      .insert(
        faltantes.map((nombre) => ({
          nombre,
          rol: "liquidadora",
          email: `${nombre.toLowerCase().replace(/\s+/g, ".")}@kma.internal`,
        }))
      )
      .select("id, nombre");

    if (errNuevas) {
      console.error("❌  Error al crear liquidadoras:", errNuevas.message);
      process.exit(1);
    }
    for (const l of nuevas) liqMap.set(l.nombre.toLowerCase().trim(), l.id);
  } else {
    console.log("✅  Todas las liquidadoras ya existen");
  }

  // ── 4. Insertar clientes (upsert por CUIT) ────────────────────────────────
  const clientes = rows.map((r) => ({
    nombre:           r.nombre,
    cuit:             r.cuit,
    terminacion_cuit: r.terminacion_cuit,
    liquidador_id:    liqMap.get(r.liquidadora_nombre.toLowerCase().trim()) ?? null,
    tipo_contribuyente: "empresa",
    es_quincenal:     r.es_quincenal,
    jurisdiccion:     r.jurisdiccion,
    art:              r.art,
    red_bancaria:     r.red_bancaria,
    tiene_rubrica_lsd: r.tiene_rubrica_lsd,
    tiene_sindicato:   r.tiene_sindicato,
    observaciones:    r.observaciones,
    estado:           "activo",
  }));

  console.log(`\n📤  Importando ${clientes.length} clientes…`);

  // Procesar en lotes de 20 para no saturar
  const BATCH = 20;
  let ok = 0, errores = 0;
  for (let i = 0; i < clientes.length; i += BATCH) {
    const lote = clientes.slice(i, i + BATCH);
    const { error } = await supabase
      .from("clientes")
      .upsert(lote, { onConflict: "cuit" });

    if (error) {
      console.error(`  ❌  Lote ${i / BATCH + 1} error:`, error.message);
      errores += lote.length;
    } else {
      ok += lote.length;
      console.log(`  ✅  ${Math.min(i + BATCH, clientes.length)}/${clientes.length}`);
    }
  }

  console.log(`\n🏁  Importación terminada: ${ok} ok, ${errores} con error`);

  if (errores === 0) {
    console.log("🎉  Todos los clientes importados correctamente.");
  }
}

main().catch((e) => { console.error("❌  Error inesperado:", e); process.exit(1); });
