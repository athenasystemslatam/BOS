// Calendario ARCA de Monotributo: tipos y cálculos puros (sin base de datos;
// los usa también la pantalla de carga). Las fechas reales salen de la tabla
// calendario_arca; esto solo resuelve lo que falta con un valor por defecto.

import { esDiaHabil } from "@/lib/vencimientos";

export interface MesCalendario {
  anio: number;
  mes: number;
  vencimiento: string;
  recatLimite: string | null;
  recatDesde: string | null;
  nota: string | null;
  /** false = no está cargado en la tabla: se usa el valor por defecto. */
  cargado: boolean;
}

export type CalendarioArca = Map<string, MesCalendario>;

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Corre una fecha al siguiente día hábil (lunes a viernes; los feriados se corrigen a mano en la pantalla). */
export function aDiaHabil(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const f = new Date(y, m - 1, d);
  while (!esDiaHabil(f)) f.setDate(f.getDate() + 1);
  return iso(f);
}

/** Valor por defecto si el año no está cargado: día 20 corrido a hábil;
 * recategorización con límite el 5 de febrero y de agosto. */
export function mesPorDefecto(anio: number, mes: number): MesCalendario {
  const recat = mes === 2 || mes === 8;
  return {
    anio,
    mes,
    vencimiento: aDiaHabil(`${anio}-${pad(mes)}-20`),
    recatLimite: recat ? aDiaHabil(`${anio}-${pad(mes)}-05`) : null,
    recatDesde: recat ? `${anio}-${pad(mes - 1)}-01` : null,
    nota: null,
    cargado: false,
  };
}

export function mesDe(cal: CalendarioArca, anio: number, mes: number): MesCalendario {
  return cal.get(`${anio}-${mes}`) ?? mesPorDefecto(anio, mes);
}

export function vencimientoDe(cal: CalendarioArca, anio: number, mes: number): string {
  return mesDe(cal, anio, mes).vencimiento;
}

/** El mes (anio, mes) toca alguna ventana de recategorización (desde → límite) del calendario. */
export function enVentanaRecategorizacion(cal: CalendarioArca, anio: number, mes: number): boolean {
  const ini = `${anio}-${pad(mes)}-01`;
  const fin = `${anio}-${pad(mes)}-31`;
  for (let m = 1; m <= 12; m++) {
    const c = mesDe(cal, anio, m);
    if (!c.recatLimite) continue;
    const desde = c.recatDesde ?? c.recatLimite.slice(0, 8) + "01";
    if (ini <= c.recatLimite && fin >= desde) return true;
  }
  return false;
}

export function anioCargado(cal: CalendarioArca, anio: number): boolean {
  for (let m = 1; m <= 12; m++) if (cal.get(`${anio}-${m}`)?.cargado) return true;
  return false;
}

/** Aviso para administradores: falta el año en curso, o es diciembre y falta el siguiente. */
export function avisoCalendarioFaltante(cal: CalendarioArca, hoy: string): string | null {
  const [y, m] = hoy.split("-").map(Number);
  if (!anioCargado(cal, y)) return `Falta cargar el calendario ARCA ${y}: mientras tanto se usa el día 20 corrido a día hábil.`;
  if (m === 12 && !anioCargado(cal, y + 1)) return `Falta cargar el calendario ARCA ${y + 1}.`;
  return null;
}

/** "Copiar desde el año anterior y ajustar fechas": mismo día del mes, un año después, corrido a hábil. */
export function copiarAnioAnterior(anterior: MesCalendario[], anio: number): MesCalendario[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const prev = anterior.find((p) => p.mes === mes);
    if (!prev) return { ...mesPorDefecto(anio, mes), cargado: true };
    const mover = (f: string | null, habil: boolean) => {
      if (!f) return null;
      const nueva = `${Number(f.slice(0, 4)) + 1}${f.slice(4)}`;
      return habil ? aDiaHabil(nueva) : nueva;
    };
    // El vencimiento original es el 20 (o el 5 en la recategorización): se parte del día nominal.
    const vtoNominal = `${anio}-${pad(mes)}-20`;
    return {
      anio,
      mes,
      vencimiento: aDiaHabil(vtoNominal),
      recatLimite: prev.recatLimite ? aDiaHabil(`${anio}-${prev.recatLimite.slice(5, 7)}-05`) : null,
      recatDesde: mover(prev.recatDesde, false),
      nota: null,
      cargado: true,
    };
  });
}

const MESES_TXT: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Fecha en dd/mm/aaaa, d/m/aaaa o aaaa-mm-dd → aaaa-mm-dd (o null si no es válida). */
export function leerFecha(txt: string): string | null {
  const t = txt.trim();
  let y: number, m: number, d: number;
  let r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else if ((r = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) { d = +r[1]; m = +r[2]; y = +r[3]; }
  else return null;
  const f = new Date(y, m - 1, d);
  if (f.getFullYear() !== y || f.getMonth() !== m - 1 || f.getDate() !== d) return null;
  return iso(f);
}

/** Pegar una tabla (mes, vencimiento, límite de recategorización) separada por tabulador, ; o ,.
 * Devuelve las filas válidas y los errores por línea, para mostrar antes de guardar. */
export function leerTablaPegada(texto: string, anio: number): { filas: { mes: number; vencimiento: string; recatLimite: string | null }[]; errores: string[] } {
  const filas: { mes: number; vencimiento: string; recatLimite: string | null }[] = [];
  const errores: string[] = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    const cols = linea.split(/\t|;|,(?!\d{2}\b)/).map((c) => c.trim());
    const mesTxt = (cols[0] ?? "").toLowerCase();
    if (i === 0 && /mes/.test(mesTxt) && !MESES_TXT[mesTxt]) return; // encabezado
    const mes = MESES_TXT[mesTxt] ?? Number(mesTxt);
    if (!(mes >= 1 && mes <= 12)) return void errores.push(`Línea ${i + 1}: mes "${cols[0]}" no reconocido.`);
    const vto = leerFecha(cols[1] ?? "");
    if (!vto) return void errores.push(`Línea ${i + 1}: vencimiento "${cols[1] ?? ""}" no es una fecha.`);
    if (Number(vto.slice(0, 4)) !== anio) return void errores.push(`Línea ${i + 1}: el vencimiento ${vto} no es de ${anio}.`);
    let limite: string | null = null;
    if (cols[2]) {
      limite = leerFecha(cols[2]);
      if (!limite) return void errores.push(`Línea ${i + 1}: límite de recategorización "${cols[2]}" no es una fecha.`);
    }
    if (filas.some((f) => f.mes === mes)) return void errores.push(`Línea ${i + 1}: el mes ${mes} está repetido.`);
    filas.push({ mes, vencimiento: vto, recatLimite: limite });
  });
  return { filas, errores };
}
