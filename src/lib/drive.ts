import { google, drive_v3 } from "googleapis";

// ─── Constants ────────────────────────────────────────────────────────────────

const FOLDER_MIME = "application/vnd.google-apps.folder";

const DRIVE_ROOTS = [
  // Principal: Root → categorías (EMPRESAS / INSCRIPTOS / MONOTRIBUTISTAS) → carpeta cliente
  { id: "1KK1vUTfbPwo5lQTYnOnY3bh9ig6haxad", depth: 2 },
  // Secundaria: Root → carpeta cliente directamente
  { id: "1jM2_e47EiZ5eX4qHfjN2RXL9Osvouoty", depth: 1 },
];

const SUELDOS_KEYS = ["sueldos", "sueldo", "liquidaciones", "liquidacion", "liq"];

const MONTHS: Record<number, string[]> = {
  1:  ["01", "1", "enero", "ene"],
  2:  ["02", "2", "febrero", "feb"],
  3:  ["03", "3", "marzo", "mar"],
  4:  ["04", "4", "abril", "abr"],
  5:  ["05", "5", "mayo", "may"],
  6:  ["06", "6", "junio", "jun"],
  7:  ["07", "7", "julio", "jul"],
  8:  ["08", "8", "agosto", "ago"],
  9:  ["09", "9", "septiembre", "sep", "sept"],
  10: ["10", "octubre", "oct"],
  11: ["11", "noviembre", "nov"],
  12: ["12", "diciembre", "dic"],
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type CampoManual = "rec_q1" | "recibos" | "f931" | "bol_sind" | "rub_lsd" | "sac";

type DriveFile = { id: string; name: string; url: string };

export type ClienteScanResult = {
  clienteId: string;
  encontrados: Map<CampoManual, DriveFile>;
  errorCode?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalize string: lowercase, strip accents and non-alphanum */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesMonth(name: string, mes: number, anio: number): boolean {
  const n = norm(name);
  const y4 = String(anio);
  const y2 = y4.slice(-2);
  const mp = String(mes).padStart(2, "0");
  const mu = String(mes);

  for (const v of MONTHS[mes] ?? []) {
    if (n === v) return true;
    if (n === `${v} ${y4}` || n === `${v} ${y2}`) return true;
    if (n === `${y4} ${v}` || n === `${y2} ${v}`) return true;
  }
  if (n === `${mp} ${y4}` || n === `${mu} ${y4}`) return true;
  if (n === `${y4} ${mp}` || n === `${y4} ${mu}`) return true;
  return false;
}

/** Fuzzy similarity [0..1] between client name and folder name */
function similarity(clientName: string, folderName: string): number {
  const cn = norm(clientName);
  const fn = norm(folderName);
  if (cn === fn) return 1;
  if (fn.includes(cn) || cn.includes(fn)) return 0.85;

  const cnWords = cn.split(" ").filter((w) => w.length > 2);
  const fnSet = new Set(fn.split(" ").filter((w) => w.length > 2));
  if (cnWords.length === 0 || fnSet.size === 0) return 0;
  const overlap = cnWords.filter((w) => fnSet.has(w)).length;
  return overlap / Math.max(cnWords.length, fnSet.size);
}

/** Map filename to task field */
function classifyFile(filename: string): CampoManual | null {
  const n = norm(filename);
  if (/f\.?9\.?3\.?1|formulario.?931|form.?931/.test(n)) return "f931";
  if (/\bsac\b|aguinaldo/.test(n)) return "sac";
  if (/\bq1\b|quincena.?1|primera.?quincena|1ra.?quincena/.test(n)) return "rec_q1";
  if (/rubric|rub.?lsd|\blsd\b/.test(n)) return "rub_lsd";
  if (
    /boleta|sindicato|\bsmata\b|\buocra\b|\bfatlyf\b|\bugl\b|\batilra\b|\bsatsaid\b|camionero|gastronomic|textil|aceitero/.test(
      n
    )
  )
    return "bol_sind";
  if (/\brecibo|\brecibos/.test(n)) return "recibos";
  return null;
}

/** Run N async tasks with at-most `limit` concurrently */
async function concurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (e) {
        results[i] = { status: "rejected", reason: e };
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ─── Drive API helpers ────────────────────────────────────────────────────────

function createDriveClient(): drive_v3.Drive {
  const credJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no configurada");

  let credentials: Record<string, string>;
  try {
    credentials = JSON.parse(credJson);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido");
  }

  console.log("[Drive] createDriveClient — email:", credentials.client_email ?? "(no encontrado)");
  console.log("[Drive] private_key empieza con:", JSON.stringify((credentials.private_key ?? "").slice(0, 30)));

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

async function listChildren(
  drive: drive_v3.Drive,
  parentId: string,
  foldersOnly = false
): Promise<drive_v3.Schema$File[]> {
  let q = `'${parentId}' in parents and trashed = false`;
  if (foldersOnly) q += ` and mimeType = '${FOLDER_MIME}'`;
  try {
    const res = await drive.files.list({
      q,
      fields: "files(id, name, mimeType)",
      pageSize: 1000,
    });
    return res.data.files ?? [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Drive] listChildren ERROR parentId=${parentId}:`, msg);
    return [];
  }
}

/** Find first subfolder where predicate returns true */
async function findFolder(
  drive: drive_v3.Drive,
  parentId: string,
  predicate: (name: string) => boolean
): Promise<string | null> {
  const folders = await listChildren(drive, parentId, true);
  const match = folders.find((f) => predicate(f.name ?? ""));
  return match?.id ?? null;
}

/** Recursively list all non-folder files, up to maxDepth levels */
async function listFilesRecursive(
  drive: drive_v3.Drive,
  parentId: string,
  depth = 0,
  maxDepth = 3
): Promise<DriveFile[]> {
  if (depth > maxDepth) return [];
  const children = await listChildren(drive, parentId);
  const files: DriveFile[] = [];
  const subPromises: Promise<DriveFile[]>[] = [];

  for (const child of children) {
    if (!child.id) continue;
    if (child.mimeType === FOLDER_MIME) {
      if (depth < maxDepth)
        subPromises.push(listFilesRecursive(drive, child.id, depth + 1, maxDepth));
    } else {
      files.push({
        id: child.id,
        name: child.name ?? "",
        url: `https://drive.google.com/file/d/${child.id}/view`,
      });
    }
  }

  const nested = await Promise.all(subPromises);
  return [...files, ...nested.flat()];
}

// ─── Build client folder map ──────────────────────────────────────────────────

type FolderEntry = { name: string; id: string };

async function collectClientFolders(drive: drive_v3.Drive): Promise<FolderEntry[]> {
  const all: FolderEntry[] = [];

  for (const root of DRIVE_ROOTS) {
    console.log(`[Drive] collectClientFolders — root ${root.id} (depth=${root.depth})`);

    if (root.depth === 1) {
      const items = await listChildren(drive, root.id, true);
      console.log(`[Drive] root ${root.id} → ${items.length} carpetas directas`);
      if (items.length > 0) console.log("[Drive] primeras 5:", items.slice(0, 5).map((f) => f.name));
      all.push(...items.filter((f) => f.id && f.name).map((f) => ({ id: f.id!, name: f.name! })));
    } else {
      const categories = await listChildren(drive, root.id, true);
      console.log(`[Drive] root ${root.id} → ${categories.length} categorías:`, categories.map((c) => c.name));
      const clientLists = await Promise.all(
        categories.map((cat) => listChildren(drive, cat.id!, true))
      );
      for (let i = 0; i < categories.length; i++) {
        const list = clientLists[i];
        console.log(`[Drive] categoría "${categories[i].name}" → ${list.length} clientes`);
        if (list.length > 0) console.log("[Drive] primeros 3:", list.slice(0, 3).map((f) => f.name));
        all.push(...list.filter((f) => f.id && f.name).map((f) => ({ id: f.id!, name: f.name! })));
      }
    }
  }

  console.log(`[Drive] collectClientFolders total: ${all.length} carpetas`);
  return all;
}

function findBestFolder(
  clientName: string,
  folders: FolderEntry[],
  logMiss = false
): FolderEntry | null {
  let best: FolderEntry | null = null;
  let bestScore = 0.4;
  let bestName = "";

  for (const folder of folders) {
    const score = similarity(clientName, folder.name);
    if (score > bestScore) {
      bestScore = score;
      best = folder;
      bestName = folder.name;
    }
  }

  if (!best && logMiss) {
    // find top candidate even below threshold
    let topScore = 0;
    let topName = "";
    for (const folder of folders) {
      const score = similarity(clientName, folder.name);
      if (score > topScore) { topScore = score; topName = folder.name; }
    }
    console.log(`[Drive] no-match: "${clientName}" → mejor candidato: "${topName}" (score=${topScore.toFixed(2)})`);
  } else if (best) {
    console.log(`[Drive] match: "${clientName}" → "${bestName}" (score=${bestScore.toFixed(2)})`);
  }

  return best;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function scanClientesForMonth(
  clientes: { id: string; nombre: string }[],
  mes: number,
  anio: number
): Promise<ClienteScanResult[]> {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON no configurada");
  }

  console.log(`[Drive] scanClientesForMonth — mes=${mes} anio=${anio} clientes=${clientes.length}`);

  const drive = createDriveClient();
  const allFolders = await collectClientFolders(drive);

  if (allFolders.length === 0) {
    console.error("[Drive] ALERTA: collectClientFolders devolvió 0 carpetas — probable problema de auth o permisos");
  } else {
    console.log("[Drive] carpetas en Drive:", JSON.stringify(allFolders.map(f => f.name)));
  }

  const settled = await concurrent(clientes, 15, async (cliente) => {
    const folder = findBestFolder(cliente.nombre, allFolders, true);
    if (!folder) {
      return { clienteId: cliente.id, encontrados: new Map(), errorCode: "no-folder" } as ClienteScanResult;
    }

    const sueldosId = await findFolder(drive, folder.id, (n) =>
      SUELDOS_KEYS.some((k) => norm(n).includes(k))
    );
    if (!sueldosId) {
      console.log(`[Drive] no-sueldos: "${cliente.nombre}" (carpeta Drive: "${folder.name}")`);
      return { clienteId: cliente.id, encontrados: new Map(), errorCode: "no-sueldos" } as ClienteScanResult;
    }

    const anioId = await findFolder(drive, sueldosId, (n) => {
      const nn = norm(n);
      return nn === String(anio) || nn === String(anio).slice(-2);
    });
    if (!anioId) {
      console.log(`[Drive] no-anio: "${cliente.nombre}" — buscando "${anio}" dentro de sueldos`);
      return { clienteId: cliente.id, encontrados: new Map(), errorCode: "no-anio" } as ClienteScanResult;
    }

    const mesId = await findFolder(drive, anioId, (n) => matchesMonth(n, mes, anio));
    if (!mesId) {
      console.log(`[Drive] no-mes: "${cliente.nombre}" — buscando mes ${mes} dentro de ${anio}`);
      return { clienteId: cliente.id, encontrados: new Map(), errorCode: "no-mes" } as ClienteScanResult;
    }

    const files = await listFilesRecursive(drive, mesId);
    const encontrados = new Map<CampoManual, DriveFile>();
    for (const file of files) {
      const campo = classifyFile(file.name);
      if (campo && !encontrados.has(campo)) {
        encontrados.set(campo, file);
      }
    }

    console.log(`[Drive] OK: "${cliente.nombre}" — ${encontrados.size} archivos: [${Array.from(encontrados.keys()).join(", ")}]`);
    return { clienteId: cliente.id, encontrados } as ClienteScanResult;
  });

  const results = settled
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<ClienteScanResult>).value);

  const errorCounts = results.reduce((acc, r) => {
    const k = r.errorCode ?? "ok";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log("[Drive] resumen errorCodes:", JSON.stringify(errorCounts));

  return results;
}
