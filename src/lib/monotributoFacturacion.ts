// Facturación de Monotributo: funciones puras (sirven en el servidor y en el navegador).
// El parámetro de ARCA es la facturación bruta de los ÚLTIMOS 12 MESES.

export const CATEGORIAS_MONO = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;
export type CategoriaMono = (typeof CATEGORIAS_MONO)[number];

export interface FilaCategoria {
  categoria: CategoriaMono;
  tope_anual: number;
  cuota_servicios: number | null;
  cuota_venta: number | null;
}

export interface Control {
  id: string;
  anio: number;
  mes: number;
  fecha_corte: string; // aaaa-mm-dd
  es_cierre_semestre: boolean;
  nota: string | null;
}

/** Meses de control por defecto; junio y diciembre son los cierres de semestre. */
export const MESES_CONTROL_DEFECTO = [2, 5, 6, 8, 11, 12];
export const MESES_CIERRE = [6, 12];

const pad = (n: number) => String(n).padStart(2, "0");
const ultimoDia = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

/** Fecha de corte por defecto: el último día del mes anterior; en los cierres de semestre, el último día del mismo mes. */
export function corteDefecto(anio: number, mes: number): string {
  if (MESES_CIERRE.includes(mes)) return `${anio}-${pad(mes)}-${pad(ultimoDia(anio, mes))}`;
  const a = mes === 1 ? anio - 1 : anio;
  const m = mes === 1 ? 12 : mes - 1;
  return `${a}-${pad(m)}-${pad(ultimoDia(a, m))}`;
}

/** Ventana de 12 meses que termina en la fecha de corte: desde = corte − 12 meses + 1 día. */
export function ventana12(fechaCorte: string): { desde: string; hasta: string } {
  const [y, m, d] = fechaCorte.split("-").map(Number);
  const desde = new Date(Date.UTC(y - 1, m - 1, d));
  desde.setUTCDate(desde.getUTCDate() + 1);
  return { desde: desde.toISOString().slice(0, 10), hasta: fechaCorte };
}

export function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function fmtPesos(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return "$ " + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Lee un importe "12.009.410,45", "$ 12.009.410,45", "12009410.45" o "12009410". */
export function leerImporte(texto: string): number | null {
  let t = texto.replace(/\$|\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export type Semaforo = "verde" | "amarillo" | "rojo" | "sin_dato";

/** Verde por debajo del umbral, amarillo desde el umbral hasta el 100 %, rojo si lo supera. */
export function semaforo(pct: number | null, umbral: number): Semaforo {
  if (pct === null || pct === undefined) return "sin_dato";
  if (pct > 100) return "rojo";
  if (pct >= umbral) return "amarillo";
  return "verde";
}

/** Categoría que correspondería: la más baja cuyo tope alcance. */
export function categoriaCorrespondiente(total: number, filas: FilaCategoria[]): CategoriaMono | null {
  const orden = [...filas].sort((a, b) => a.tope_anual - b.tope_anual);
  return orden.find((f) => f.tope_anual >= total)?.categoria ?? null;
}

/**
 * Lee la tabla tal como se copia de la página de categorías de ARCA (o del PDF).
 * Toma las líneas que empiezan con una categoría A–K; ignora el resto (títulos, referencias).
 * De cada línea: el primer importe es el tope de ingresos brutos y, si hay 3 o más importes,
 * los dos últimos son el total mensual (servicios y venta de cosas muebles). Las columnas de
 * superficie, energía y alquileres se ignoran.
 */
export function leerTablaCategorias(texto: string): {
  filas: FilaCategoria[];
  errores: string[];
  ignoradas: number;
  vigenteDetectada: string | null;
} {
  const filas: FilaCategoria[] = [];
  const errores: string[] = [];
  let ignoradas = 0;

  // "Valores de aplicación desde el 1/08/2026" / "Vigentes desde el 01/02/2026"
  const fecha = texto.match(/desde\s+el\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const vigenteDetectada = fecha ? `${fecha[3]}-${pad(Number(fecha[2]))}-${pad(Number(fecha[1]))}` : null;

  for (const linea of unirCeldasSueltas(texto)) {
    const m = linea.match(/^([A-Ka-k])(?=[\s\t;|]|$)/);
    if (!m) { ignoradas++; continue; }
    const categoria = m[1].toUpperCase() as CategoriaMono;
    const resto = linea.slice(1);
    // Importes con $ (formato ARCA); si no hay ninguno, cualquier número con decimales o miles.
    let tokens = resto.match(/\$\s*\d[\d.]*(?:,\d+)?/g) ?? [];
    if (!tokens.length) tokens = resto.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+|\d{5,}(?:\.\d+)?/g) ?? [];
    const importes = tokens.map(leerImporte);
    if (!importes.length || importes[0] === null) {
      errores.push(`Categoría ${categoria}: no se encontró el tope de ingresos brutos.`);
      continue;
    }
    if (filas.some((f) => f.categoria === categoria)) {
      errores.push(`Categoría ${categoria}: aparece dos veces.`);
      continue;
    }
    filas.push({
      categoria,
      tope_anual: importes[0],
      cuota_servicios: importes.length >= 3 ? importes[importes.length - 2] : null,
      cuota_venta: importes.length >= 3 ? importes[importes.length - 1] : null,
    });
  }

  filas.sort((a, b) => CATEGORIAS_MONO.indexOf(a.categoria) - CATEGORIAS_MONO.indexOf(b.categoria));
  errores.push(...validarCategorias(filas));
  return { filas, errores, ignoradas, vigenteDetectada };
}

/** Algunos navegadores copian cada celda en su propia línea: si una línea es solo la letra
 * de la categoría, se le pegan las líneas siguientes hasta la próxima categoría. */
function unirCeldasSueltas(texto: string): string[] {
  const out: string[] = [];
  let abierta = false;
  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea) continue;
    if (/^[A-Ka-k](?=[\s;|]|$)/.test(linea)) {
      out.push(linea);
      abierta = /^[A-Ka-k]$/.test(linea);
    } else if (abierta && !/^(referencias|\(\*)/i.test(linea)) {
      out[out.length - 1] += "\t" + linea;
    } else {
      abierta = false;
      out.push(linea);
    }
  }
  return out;
}

/** Las 11 categorías, con topes que crecen de A a K. */
export function validarCategorias(filas: FilaCategoria[]): string[] {
  const errores: string[] = [];
  const faltan = CATEGORIAS_MONO.filter((c) => !filas.some((f) => f.categoria === c));
  if (faltan.length) errores.push(`Faltan categorías: ${faltan.join(", ")}.`);
  const orden = CATEGORIAS_MONO.map((c) => filas.find((f) => f.categoria === c)).filter((f): f is FilaCategoria => !!f);
  for (let i = 1; i < orden.length; i++) {
    if (orden[i].tope_anual <= orden[i - 1].tope_anual) {
      errores.push(`El tope de ${orden[i].categoria} tiene que ser mayor que el de ${orden[i - 1].categoria}.`);
    }
  }
  for (const f of filas) {
    if (!(f.tope_anual > 0)) errores.push(`Categoría ${f.categoria}: el tope tiene que ser mayor que cero.`);
  }
  return errores;
}
