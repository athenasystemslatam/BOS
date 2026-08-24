/**
 * Vista previa (SOLO LECTURA) de la integración de los archivos ESTATUS
 * (Impuestos, Balances, Monotributo) contra la base real de BOS.
 *
 * No escribe nada en Supabase. Genera un Excel de vista previa en Downloads
 * con una fila por (cliente, servicio, subtipo) encontrado en los archivos,
 * marcando: nuevo / ya existe, responsable matcheado o no, y tipo de
 * contribuyente faltante.
 *
 * Uso: node scripts/preview-import-modulos.mjs
 */

import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

// Node trae un parser de .env nativo (loadEnvFile) desde la v20.6 — evita
// bugs de parseo manual de comillas/CRLF. Si el Node instalado es viejo y no
// lo tiene, caemos a un parser simple de respaldo.
try {
  process.loadEnvFile(envPath);
} catch (e) {
  if (e.code === "ERR_INVALID_ARG_VALUE" || e.message?.includes("loadEnvFile is not a function")) {
    for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } else {
    throw e;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Faltan credenciales de Supabase en .env.local (¿corriste 'npx vercel env pull .env.local --environment=production' antes?)");
  process.exit(1);
}
if (!/^https?:\/\//i.test(SUPABASE_URL)) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL en .env.local no parece una URL válida. Volvé a correr:");
  console.error("   npx vercel env pull .env.local --environment=production");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const DOWNLOADS = resolve(process.env.USERPROFILE || process.env.HOME, "Downloads");

// ── Helpers ──────────────────────────────────────────────────────────────

function cellStr(row, col) {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v.richText) return v.richText.map((r) => r.text).join("").trim();
  if (typeof v === "object" && v.result !== undefined) return String(v.result).trim(); // fórmulas
  return String(v).trim();
}

function normalizeCuit(raw) {
  if (raw === null || raw === undefined) return "";
  const digits = String(raw).replace(/\D/g, "");
  return digits;
}

function normNombre(s) {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // sin tildes
    .replace(/\s+/g, " ")
    .trim();
}

// ── 1. Traer estado actual de la base ───────────────────────────────────

async function cargarBase() {
  const { data: clientes, error: e1 } = await supabase
    .from("clientes")
    .select("id, nombre, cuit, tipo_contribuyente, estado");
  if (e1) throw e1;

  const { data: liquidadoras, error: e2 } = await supabase
    .from("liquidadoras")
    .select("id, nombre, activa");
  if (e2) throw e2;

  const { data: servicios, error: e3 } = await supabase
    .from("servicios_cliente")
    .select("cliente_id, servicio, subtipo, responsable_id, estado");
  if (e3) throw e3;

  const clientePorCuit = new Map();
  for (const c of clientes) {
    const cuit = normalizeCuit(c.cuit);
    if (cuit) clientePorCuit.set(cuit, c);
  }

  const liqPorNombreNorm = new Map();
  for (const l of liquidadoras) {
    liqPorNombreNorm.set(normNombre(l.nombre), l);
  }

  const servicioSet = new Set(
    servicios.map((s) => `${s.cliente_id}|${s.servicio}|${s.subtipo}`)
  );

  const clientePorNombreNorm = new Map();
  for (const c of clientes) {
    const key = normNombre(c.nombre);
    if (!clientePorNombreNorm.has(key)) clientePorNombreNorm.set(key, c);
    else clientePorNombreNorm.set(key, "AMBIGUO");
  }

  return { clientes, liquidadoras, servicios, clientePorCuit, liqPorNombreNorm, servicioSet, clientePorNombreNorm };
}

function matchResponsable(nombreExcel, liqPorNombreNorm) {
  if (!nombreExcel) return { match: null, motivo: "vacío" };
  const norm = normNombre(nombreExcel);
  if (liqPorNombreNorm.has(norm)) return { match: liqPorNombreNorm.get(norm), motivo: "exacto" };
  // match parcial: el nombre del excel es el primer nombre de alguien en la base
  const candidatos = [...liqPorNombreNorm.entries()].filter(
    ([k]) => k.startsWith(norm + " ") || k === norm
  );
  if (candidatos.length === 1) return { match: candidatos[0][1], motivo: "parcial" };
  if (candidatos.length > 1) return { match: null, motivo: `ambiguo (${candidatos.length} candidatos)` };
  return { match: null, motivo: "sin match" };
}

// ── 2. Parsers por archivo ──────────────────────────────────────────────

async function leerImpuestos(base) {
  const path = resolve(DOWNLOADS, "ESTATUS IMPUESTOS 2026.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);

  const filas = [];

  // IVA: CLIENTE(1) TIPO(2) CUIT(3) TERMINACION(4) RESPONSABLE(5) ...
  const ivaSheet = wb.getWorksheet("IVA");
  ivaSheet.eachRow((row, rowNum) => {
    if (rowNum < 3) return; // 2 filas de encabezado
    const nombre = cellStr(row, 1);
    if (!nombre) return;
    filas.push({
      servicio: "impuestos", subtipo: "iva",
      nombre, tipo: cellStr(row, 2), cuit: normalizeCuit(cellStr(row, 3)),
      responsable: cellStr(row, 5), rowNum, hoja: "IVA",
    });
  });

  // IIBB: CLIENTE(1) CUIT(2) TERMINACION(3) TIPO(4) RESPONSABLE(5) ...
  const iibbSheet = wb.getWorksheet("IIBB");
  iibbSheet.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const nombre = cellStr(row, 1);
    if (!nombre) return;
    filas.push({
      servicio: "impuestos", subtipo: "iibb",
      nombre, tipo: cellStr(row, 4), cuit: normalizeCuit(cellStr(row, 2)),
      responsable: cellStr(row, 5), rowNum, hoja: "IIBB",
    });
  });

  // SEG E HIG: CLIENTE(1) MUNICIPIO(2) USUARIO(3) CLAVE(4) IMPUESTO(5) RESPONSABLE(6) ...
  const sehSheet = wb.getWorksheet("SEG E HIG");
  let sospechosasSeh = 0;
  sehSheet.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const nombre = cellStr(row, 1);
    if (!nombre) return;
    // fila sospechosa: "nombre" es puramente numérico → probablemente
    // arrastre de celda combinada rota, no un cliente real.
    const esSospechosa = /^\d+([.,]\d+)?$/.test(nombre);
    if (esSospechosa) sospechosasSeh++;
    filas.push({
      servicio: "impuestos", subtipo: "seh",
      nombre, tipo: "", cuit: "",
      responsable: cellStr(row, 6), rowNum, hoja: "SEG E HIG",
      sospechosa: esSospechosa,
    });
  });

  return { filas, sospechosasSeh };
}

async function leerBalances() {
  const path = resolve(DOWNLOADS, "ESTATUS BALANCES .xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const sheet = wb.getWorksheet("2026");
  const filas = [];
  sheet.eachRow((row, rowNum) => {
    if (rowNum < 3) return;
    const nombre = cellStr(row, 1);
    if (!nombre) return;
    filas.push({
      servicio: "contable", subtipo: "general",
      nombre, tipo: "", cuit: normalizeCuit(cellStr(row, 2)),
      responsable: cellStr(row, 13), rowNum, hoja: "2026",
    });
  });
  return { filas };
}

async function leerMonotributo() {
  const path = resolve(DOWNLOADS, "ESTATUS MONOTRIBUTISTAS.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const sheet = wb.getWorksheet("ESTATUS");
  const filas = [];
  sheet.eachRow((row, rowNum) => {
    if (rowNum < 2) return; // 1 fila de encabezado
    const nombre = cellStr(row, 1);
    if (!nombre) return;
    filas.push({
      servicio: "monotributo", subtipo: "general",
      nombre, tipo: cellStr(row, 3) /* categoría, no es "tipo contribuyente" pero se guarda */,
      cuit: normalizeCuit(cellStr(row, 2)),
      responsable: cellStr(row, 8), rowNum, hoja: "ESTATUS",
    });
  });
  return { filas };
}

// ── 3. Cruce contra la base ─────────────────────────────────────────────

function evaluarFila(f, base) {
  let clienteExistente = f.cuit ? base.clientePorCuit.get(f.cuit) : null;
  let matchPorNombre = false;
  if (!clienteExistente) {
    const porNombre = base.clientePorNombreNorm.get(normNombre(f.nombre));
    if (porNombre && porNombre !== "AMBIGUO") {
      clienteExistente = porNombre;
      matchPorNombre = true;
    }
  }
  const { match: responsableMatch, motivo: motivoResp } = matchResponsable(f.responsable, base.liqPorNombreNorm);

  let estadoCliente;
  if (clienteExistente) estadoCliente = matchPorNombre ? "existe (por nombre, sin CUIT)" : "existe";
  else if (!f.cuit) estadoCliente = "SIN CUIT — sin match por nombre";
  else estadoCliente = "ALTA NUEVA";

  let yaEtiquetado = false;
  if (clienteExistente) {
    yaEtiquetado = base.servicioSet.has(`${clienteExistente.id}|${f.servicio}|${f.subtipo}`);
  }

  const tipoFaltante = f.servicio === "impuestos" && !f.tipo;

  return {
    ...f,
    estadoCliente,
    clienteId: clienteExistente?.id ?? null,
    tipoContribuyenteActual: clienteExistente?.tipo_contribuyente ?? null,
    yaEtiquetado,
    responsableMatch: responsableMatch?.nombre ?? null,
    motivoResp,
    tipoFaltante,
  };
}

// ── 4. Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log("📥 Cargando estado actual de la base (solo lectura)...");
  const base = await cargarBase();
  console.log(`   ${base.clientes.length} clientes, ${base.liquidadoras.length} personas en equipo, ${base.servicios.length} filas de servicios_cliente`);

  console.log("📂 Leyendo archivos ESTATUS...");
  const { filas: filasImpuestos, sospechosasSeh } = await leerImpuestos(base);
  const { filas: filasBalances } = await leerBalances();
  const { filas: filasMonotributo } = await leerMonotributo();

  const todas = [...filasImpuestos, ...filasBalances, ...filasMonotributo];
  console.log(`   ${filasImpuestos.length} filas Impuestos (IVA+IIBB+SEH), ${filasBalances.length} filas Balances, ${filasMonotributo.length} filas Monotributo`);
  if (sospechosasSeh > 0) console.log(`   ⚠️  ${sospechosasSeh} filas de SEG E HIG parecen corridas/rotas (nombre puramente numérico) — se incluyen marcadas para revisión, no se filtran solas.`);

  const evaluadas = todas.filter((f) => !f.sospechosa).map((f) => evaluarFila(f, base));
  const sospechosas = todas.filter((f) => f.sospechosa).map((f) => evaluarFila(f, base));

  // ── Resumen en consola ──
  const altaNueva = evaluadas.filter((f) => f.estadoCliente === "ALTA NUEVA");
  const sinCuit = evaluadas.filter((f) => f.estadoCliente.startsWith("SIN CUIT"));
  const yaEtiquetadas = evaluadas.filter((f) => f.yaEtiquetado);
  const paraEtiquetar = evaluadas.filter((f) => f.estadoCliente.startsWith("existe") && !f.yaEtiquetado);
  const sinTipo = evaluadas.filter((f) => f.tipoFaltante);
  const respSinMatch = evaluadas.filter((f) => !f.responsableMatch && f.responsable);

  console.log("\n── Resumen ──");
  console.log(`Total filas cliente×servicio en los 3 archivos: ${evaluadas.length} (+ ${sospechosas.length} sospechosas de SEG E HIG)`);
  console.log(`  Ya existen en clientes y ya están etiquetados en servicios_cliente: ${yaEtiquetadas.length}`);
  console.log(`  Existen en clientes pero falta etiquetar el servicio: ${paraEtiquetar.length}`);
  console.log(`  Alta nueva (no están en clientes por CUIT): ${altaNueva.length}`);
  console.log(`  Sin CUIT utilizable en el archivo: ${sinCuit.length}`);
  console.log(`  Tipo de contribuyente sin asignar: ${sinTipo.length}`);
  console.log(`  Responsable del archivo sin match en el equipo: ${respSinMatch.length}`);

  // ── Excel de salida ──
  const out = new ExcelJS.Workbook();
  const cols = [
    { header: "Servicio", key: "servicio", width: 12 },
    { header: "Subtipo", key: "subtipo", width: 10 },
    { header: "Cliente (Excel)", key: "nombre", width: 32 },
    { header: "CUIT", key: "cuit", width: 14 },
    { header: "Tipo contribuyente", key: "tipo", width: 16 },
    { header: "Estado cliente", key: "estadoCliente", width: 14 },
    { header: "Ya etiquetado", key: "yaEtiquetado", width: 13 },
    { header: "Responsable (Excel)", key: "responsable", width: 18 },
    { header: "Responsable match", key: "responsableMatch", width: 18 },
    { header: "Motivo match", key: "motivoResp", width: 16 },
    { header: "Tipo faltante", key: "tipoFaltante", width: 12 },
    { header: "Hoja", key: "hoja", width: 10 },
    { header: "Fila origen", key: "rowNum", width: 10 },
  ];

  for (const [nombreHoja, filas] of [
    ["A revisar", evaluadas.filter((f) => f.tipoFaltante || !f.responsableMatch || f.estadoCliente === "SIN CUIT")],
    ["Altas nuevas", altaNueva],
    ["Para etiquetar (ya existen)", paraEtiquetar],
    ["Ya etiquetados", yaEtiquetadas],
    ["SEG E HIG sospechosas", sospechosas],
  ]) {
    const sheet = out.addWorksheet(nombreHoja.slice(0, 31));
    sheet.columns = cols;
    sheet.getRow(1).font = { bold: true };
    for (const f of filas) {
      sheet.addRow({
        ...f,
        yaEtiquetado: f.yaEtiquetado ? "sí" : "no",
        tipoFaltante: f.tipoFaltante ? "SIN ASIGNAR" : "",
      });
    }
    // resaltar tipo faltante en rojo
    filas.forEach((f, i) => {
      if (f.tipoFaltante) {
        sheet.getRow(i + 2).getCell("tipoFaltante").font = { color: { argb: "FFCC0000" }, bold: true };
      }
    });
  }

  const outPath = resolve(DOWNLOADS, "BOS - vista previa integracion modulos.xlsx");
  await out.xlsx.writeFile(outPath);
  console.log(`\n📄 Vista previa guardada en: ${outPath}`);
}

main().catch((e) => { console.error("❌ Error:", e); process.exit(1); });
