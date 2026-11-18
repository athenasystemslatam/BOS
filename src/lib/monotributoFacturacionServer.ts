// Facturación de Monotributo: lecturas y escrituras del lado del servidor (sin "use server":
// nada de esto es una acción que el navegador pueda llamar directo).
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarHistorial, type EntradaHistorial } from "@/lib/monotributoHistorial";
import {
  CATEGORIAS_MONO,
  MESES_CONTROL_DEFECTO,
  MESES_CIERRE,
  corteDefecto,
  type Control,
  type FilaCategoria,
} from "@/lib/monotributoFacturacion";

type Admin = ReturnType<typeof createAdminClient>;

export interface VersionCategorias {
  id: string;
  vigente_desde: string;
  fuente: string | null;
  nota: string | null;
  creado_por: string | null;
  creado_en: string;
  filas: FilaCategoria[];
}

/** Error de "falta correr el SQL": la pantalla avisa en vez de romperse. */
export function faltaSql(error: { message?: string; code?: string } | null): boolean {
  return !!error && (error.code === "42P01" || error.code === "42883" || /does not exist|schema cache/i.test(error.message ?? ""));
}

export async function leerVersiones(admin: Admin): Promise<{ versiones: VersionCategorias[]; disponible: boolean }> {
  const [{ data: vs, error }, { data: cs }] = await Promise.all([
    admin.from("monotributo_categorias_versiones").select("*").order("vigente_desde", { ascending: false }),
    admin.from("monotributo_categorias").select("version_id, categoria, tope_anual, cuota_servicios, cuota_venta"),
  ]);
  if (error) return { versiones: [], disponible: !faltaSql(error) };
  type C = FilaCategoria & { version_id: string };
  const porVersion = new Map<string, FilaCategoria[]>();
  for (const c of (cs ?? []) as C[]) {
    const fila: FilaCategoria = {
      categoria: c.categoria,
      tope_anual: Number(c.tope_anual),
      cuota_servicios: c.cuota_servicios === null ? null : Number(c.cuota_servicios),
      cuota_venta: c.cuota_venta === null ? null : Number(c.cuota_venta),
    };
    porVersion.set(c.version_id, [...(porVersion.get(c.version_id) ?? []), fila]);
  }
  return {
    disponible: true,
    versiones: ((vs ?? []) as Omit<VersionCategorias, "filas">[]).map((v) => ({
      ...v,
      filas: (porVersion.get(v.id) ?? []).sort((a, b) => CATEGORIAS_MONO.indexOf(a.categoria) - CATEGORIAS_MONO.indexOf(b.categoria)),
    })),
  };
}

/** Versión vigente en una fecha: la de "vigente desde" más reciente que no sea posterior. */
export function versionVigente(versiones: VersionCategorias[], fecha: string): VersionCategorias | null {
  return versiones.filter((v) => v.vigente_desde <= fecha).sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0] ?? null;
}

export async function leerUmbral(admin: Admin): Promise<number> {
  const { data } = await admin.from("monotributo_config").select("valor").eq("clave", "umbral_amarillo").maybeSingle();
  const n = Number((data as { valor: unknown } | null)?.valor);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : 85;
}

/** Controles de los años pedidos. Si un año todavía no tiene ninguno, crea los de por defecto
 * (febrero, mayo, junio, agosto, noviembre y diciembre) para que se puedan cargar datos; quedan
 * en el historial como "creados por defecto" y se editan desde Controles. */
export async function leerControles(admin: Admin, anios: number[], crearSiFaltan: number[] = []): Promise<{ controles: Control[]; disponible: boolean }> {
  const { data, error } = await admin.from("monotributo_controles").select("id, anio, mes, fecha_corte, es_cierre_semestre, nota").in("anio", anios);
  if (error) return { controles: [], disponible: !faltaSql(error) };
  let controles = (data ?? []) as Control[];
  const faltan = crearSiFaltan.filter((a) => !controles.some((c) => c.anio === a));
  if (faltan.length) {
    const nuevos = faltan.flatMap((anio) => MESES_CONTROL_DEFECTO.map((mes) => ({
      anio, mes, fecha_corte: corteDefecto(anio, mes), es_cierre_semestre: MESES_CIERRE.includes(mes),
    })));
    const { data: creados } = await admin.from("monotributo_controles")
      .upsert(nuevos, { onConflict: "anio,mes", ignoreDuplicates: true })
      .select("id, anio, mes, fecha_corte, es_cierre_semestre, nota");
    const filas = (creados ?? []) as Control[];
    if (filas.length) {
      await registrarHistorial(admin, filas.map((c) => ({
        cliente_id: null, anio: c.anio, mes: c.mes, entidad: "control" as EntradaHistorial["entidad"], campo: "alta",
        valor_anterior: null, valor_nuevo: { fecha_corte: c.fecha_corte, es_cierre_semestre: c.es_cierre_semestre },
        usuario_id: null, ref_id: c.id, nota: "Creado por defecto",
      })));
    }
    controles = [...controles, ...filas];
  }
  controles.sort((a, b) => a.anio * 100 + a.mes - (b.anio * 100 + b.mes));
  return { controles, disponible: true };
}

/** Control "en curso": el último cuyo mes ya llegó. */
export function controlEnCurso(controles: Control[], hoy: string): Control | null {
  const ref = Number(hoy.slice(0, 4)) * 100 + Number(hoy.slice(5, 7));
  return [...controles].reverse().find((c) => c.anio * 100 + c.mes <= ref) ?? null;
}

/** El control siguiente a uno dado (puede ser del año que viene; si no está cargado, el de por defecto). */
export function controlSiguiente(controles: Control[], actual: { anio: number; mes: number }): { anio: number; mes: number; es_cierre_semestre: boolean } {
  const ref = actual.anio * 100 + actual.mes;
  const sig = controles.find((c) => c.anio * 100 + c.mes > ref);
  if (sig) return sig;
  const mesSig = MESES_CONTROL_DEFECTO.find((m) => m > actual.mes);
  const anio = mesSig ? actual.anio : actual.anio + 1;
  const mes = mesSig ?? MESES_CONTROL_DEFECTO[0];
  return { anio, mes, es_cierre_semestre: MESES_CIERRE.includes(mes) };
}

export interface FilaFacturacion {
  cliente_id: string;
  nombre: string;
  cuit: string | null;
  responsable_id: string | null;
  categoria: string | null;
  tope: number | null;
  total_facturado: number | null;
  pct: number | null;
  margen: number | null;
  categoria_correspondiente: string | null;
  ficha_enviada: boolean;
  ficha_enviada_fecha: string | null;
  nota: string | null;
  origen: string | null;
  updated_at: string | null;
  cargado: boolean;
}

/** Todos los clientes activos para un control, calculado en la base (una sola consulta). */
export async function filasDelControl(admin: Admin, controlId: string, hoy: string): Promise<FilaFacturacion[]> {
  const { data, error } = await admin.rpc("monotributo_facturacion_control", { p_control: controlId, p_hoy: hoy });
  if (error) throw new Error(error.message);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as FilaFacturacion),
    tope: num(r.tope),
    total_facturado: num(r.total_facturado),
    pct: num(r.pct),
    margen: num(r.margen),
  }));
}

export async function resumenDelControl(admin: Admin, controlId: string, hoy: string, umbral: number) {
  const { data, error } = await admin.rpc("monotributo_facturacion_resumen", { p_control: controlId, p_hoy: hoy, p_umbral: umbral });
  if (error) return null;
  return ((data ?? []) as { total: number; cargados: number; fichas_enviadas: number; cerca_tope: number; sobre_tope: number }[])[0] ?? null;
}

// ── Revertir / Deshacer (lo llama historialActions, que ya validó al usuario) ──

interface EntradaVista {
  id: string;
  cliente_id: string | null;
  anio: number | null;
  mes: number | null;
  entidad: string;
  campo: string;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  ref_id: string | null;
  creado_en: string;
}

const CAMPOS_CARGA = new Set(["total_facturado", "ficha_enviada", "ficha_enviada_fecha", "nota"]);
const CAMPOS_CONTROL = new Set(["fecha_corte", "es_cierre_semestre", "nota"]);
const iguales = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function revertirFacturacion(
  admin: Admin,
  e: EntradaVista,
  yo: { id: string; isAdmin: boolean },
  forzar: boolean
): Promise<{ error: string } | { conflicto: true; actual: unknown } | { ok: true; historialIds: string[] }> {
  const ahora = new Date().toISOString();
  const base = { cliente_id: e.cliente_id, anio: e.anio, mes: e.mes, entidad: e.entidad as EntradaHistorial["entidad"], campo: e.campo, usuario_id: yo.id, revierte_id: e.id, ref_id: e.ref_id, nota: "Revertido" };

  if (e.entidad === "facturacion") {
    if (!e.ref_id || !CAMPOS_CARGA.has(e.campo)) return { error: "Ese cambio no se puede revertir desde acá." };
    const { data } = await admin.from("monotributo_facturacion").select(e.campo).eq("id", e.ref_id).maybeSingle();
    if (!data) return { error: "La carga ya no existe." };
    const actual = (data as unknown as Record<string, unknown>)[e.campo] ?? null;
    if (!iguales(actual, e.valor_nuevo) && !forzar) return { conflicto: true, actual };
    const nuevo = e.valor_anterior ?? (e.campo === "ficha_enviada" ? false : null);
    const { error } = await admin.from("monotributo_facturacion").update({ [e.campo]: nuevo, updated_at: ahora, updated_por: yo.id }).eq("id", e.ref_id);
    if (error) return { error: error.message };
    return { ok: true, historialIds: await registrarHistorial(admin, [{ ...base, valor_anterior: actual, valor_nuevo: nuevo }]) };
  }

  if (e.entidad === "control") {
    if (!e.ref_id) return { error: "Ese cambio no se puede revertir desde acá." };
    if (e.campo === "alta") {
      const { count } = await admin.from("monotributo_facturacion").select("id", { count: "exact", head: true }).eq("control_id", e.ref_id);
      if ((count ?? 0) > 0 && !yo.isAdmin) return { error: "Ese control ya tiene datos cargados: solo un administrador lo puede borrar." };
      const { error } = await admin.from("monotributo_controles").delete().eq("id", e.ref_id);
      if (error) return { error: error.message };
      return { ok: true, historialIds: await registrarHistorial(admin, [{ ...base, campo: "baja", valor_anterior: e.valor_nuevo, valor_nuevo: null }]) };
    }
    if (e.campo === "baja") {
      const v = e.valor_anterior as { anio: number; mes: number; fecha_corte: string; es_cierre_semestre: boolean; nota: string | null; cargas?: Record<string, unknown>[] } | null;
      if (!v) return { error: "No hay datos para volver a crear el control." };
      const { data: creado, error } = await admin.from("monotributo_controles")
        .insert({ anio: v.anio, mes: v.mes, fecha_corte: v.fecha_corte, es_cierre_semestre: v.es_cierre_semestre, nota: v.nota, updated_por: yo.id })
        .select("id").single();
      if (error) return { error: error.message };
      const nuevoId = (creado as { id: string }).id;
      if (v.cargas?.length) {
        const { error: errCargas } = await admin.from("monotributo_facturacion").insert(v.cargas.map((c) => ({ ...c, control_id: nuevoId, updated_por: yo.id })));
        if (errCargas) return { error: `Se restauró el control pero no sus cargas: ${errCargas.message}` };
      }
      const { cargas: _c, ...sinCargas } = v;
      void _c;
      return { ok: true, historialIds: await registrarHistorial(admin, [{ ...base, campo: "alta", ref_id: nuevoId, valor_anterior: null, valor_nuevo: sinCargas }]) };
    }
    if (!CAMPOS_CONTROL.has(e.campo)) return { error: "Ese cambio no se puede revertir desde acá." };
    const { data } = await admin.from("monotributo_controles").select(e.campo).eq("id", e.ref_id).maybeSingle();
    if (!data) return { error: "El control ya no existe." };
    const actual = (data as unknown as Record<string, unknown>)[e.campo] ?? null;
    if (!iguales(actual, e.valor_nuevo) && !forzar) return { conflicto: true, actual };
    const nuevo = e.valor_anterior ?? (e.campo === "es_cierre_semestre" ? false : null);
    if (e.campo === "fecha_corte" && !nuevo) return { error: "La fecha de corte no puede quedar vacía." };
    const { error } = await admin.from("monotributo_controles").update({ [e.campo]: nuevo, updated_at: ahora, updated_por: yo.id }).eq("id", e.ref_id);
    if (error) return { error: error.message };
    return { ok: true, historialIds: await registrarHistorial(admin, [{ ...base, valor_anterior: actual, valor_nuevo: nuevo }]) };
  }

  if (e.entidad === "categorias") {
    if (e.campo === "version_alta") {
      // Deshacer una versión recién cargada: quien la cargó (en los 30 minutos siguientes) o un administrador.
      const reciente = Date.now() - Date.parse(e.creado_en) < 30 * 60_000;
      const { data: v } = await admin.from("monotributo_categorias_versiones").select("id, creado_por").eq("id", e.ref_id ?? "").maybeSingle();
      if (!v) return { error: "Esa versión ya no existe." };
      if (!yo.isAdmin && !((v as { creado_por: string | null }).creado_por === yo.id && reciente)) {
        return { error: "Borrar una versión de la tabla de categorías queda solo para administradores." };
      }
      return borrarVersion(admin, e.ref_id!, yo.id, e.id);
    }
    if (e.campo === "version_baja") {
      if (!yo.isAdmin) return { error: "Solo un administrador restaura una versión borrada." };
      const v = e.valor_anterior as { vigente_desde: string; fuente: string | null; nota: string | null; filas: FilaCategoria[] } | null;
      if (!v) return { error: "No hay datos para restaurar la versión." };
      const r = await crearVersion(admin, v.vigente_desde, v.filas, v.fuente, v.nota, yo.id, e.id);
      return "error" in r ? r : { ok: true, historialIds: r.historialIds };
    }
    return { error: "Ese cambio no se puede revertir desde acá." };
  }

  if (e.entidad === "config") {
    const { data } = await admin.from("monotributo_config").select("valor").eq("clave", e.campo).maybeSingle();
    const actual = (data as { valor: unknown } | null)?.valor ?? null;
    if (!iguales(actual, e.valor_nuevo) && !forzar) return { conflicto: true, actual };
    if (e.valor_anterior === null || e.valor_anterior === undefined) return { error: "No hay un valor anterior para volver." };
    const { error } = await admin.from("monotributo_config").upsert({ clave: e.campo, valor: e.valor_anterior, updated_at: ahora, updated_por: yo.id });
    if (error) return { error: error.message };
    return { ok: true, historialIds: await registrarHistorial(admin, [{ ...base, valor_anterior: actual, valor_nuevo: e.valor_anterior }]) };
  }

  return { error: "Ese cambio no se puede revertir desde acá." };
}

/** Crea una versión de la tabla de categorías (nunca pisa otra: la fecha "vigente desde" es única). */
export async function crearVersion(
  admin: Admin,
  vigenteDesde: string,
  filas: FilaCategoria[],
  fuente: string | null,
  nota: string | null,
  yoId: string,
  revierteId: string | null = null
): Promise<{ error: string } | { ok: true; id: string; historialIds: string[] }> {
  const { data: existe } = await admin.from("monotributo_categorias_versiones").select("id").eq("vigente_desde", vigenteDesde).maybeSingle();
  if (existe) return { error: "Ya hay una versión vigente desde esa fecha. Para reemplazarla, un administrador tiene que borrarla primero." };
  const { data: v, error } = await admin.from("monotributo_categorias_versiones")
    .insert({ vigente_desde: vigenteDesde, fuente, nota, creado_por: yoId }).select("id").single();
  if (error) return { error: error.message };
  const id = (v as { id: string }).id;
  const { error: errFilas } = await admin.from("monotributo_categorias").insert(filas.map((f) => ({ version_id: id, ...f })));
  if (errFilas) {
    await admin.from("monotributo_categorias_versiones").delete().eq("id", id);
    return { error: errFilas.message };
  }
  const historialIds = await registrarHistorial(admin, [{
    cliente_id: null, anio: Number(vigenteDesde.slice(0, 4)), mes: Number(vigenteDesde.slice(5, 7)),
    entidad: "categorias" as EntradaHistorial["entidad"], campo: "version_alta", valor_anterior: null,
    valor_nuevo: { vigente_desde: vigenteDesde, fuente, nota, filas }, usuario_id: yoId, ref_id: id, revierte_id: revierteId,
    nota: revierteId ? "Revertido" : null,
  }]);
  return { ok: true, id, historialIds };
}

/** Borra una versión completa (solo administradores; queda guardada en el historial para restaurarla). */
export async function borrarVersion(admin: Admin, id: string, yoId: string, revierteId: string | null = null): Promise<{ error: string } | { ok: true; historialIds: string[] }> {
  const { versiones } = await leerVersiones(admin);
  const v = versiones.find((x) => x.id === id);
  if (!v) return { error: "Esa versión ya no existe." };
  const { error } = await admin.from("monotributo_categorias_versiones").delete().eq("id", id);
  if (error) return { error: error.message };
  const historialIds = await registrarHistorial(admin, [{
    cliente_id: null, anio: Number(v.vigente_desde.slice(0, 4)), mes: Number(v.vigente_desde.slice(5, 7)),
    entidad: "categorias" as EntradaHistorial["entidad"], campo: "version_baja",
    valor_anterior: { vigente_desde: v.vigente_desde, fuente: v.fuente, nota: v.nota, filas: v.filas }, valor_nuevo: null,
    usuario_id: yoId, ref_id: id, revierte_id: revierteId, nota: revierteId ? "Revertido" : null,
  }]);
  return { ok: true, historialIds };
}

/** Totales del control en curso (para la tarjeta del Dashboard y el aviso de Alertas). Null si no hay datos. */
export async function resumenControlEnCurso(admin: Admin, hoy: string) {
  try {
    const { controles } = await leerControles(admin, [Number(hoy.slice(0, 4))]);
    const c = controlEnCurso(controles, hoy);
    if (!c) return null;
    const umbral = await leerUmbral(admin);
    const r = await resumenDelControl(admin, c.id, hoy, umbral);
    return r ? { ...r, anio: c.anio, mes: c.mes, umbral } : null;
  } catch {
    return null;
  }
}
