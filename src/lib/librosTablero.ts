import { createAdminClient } from "@/lib/supabase/admin";
import { atrasoLibro, hoyISO, mesIndice, type EstadoAtraso } from "@/lib/libros";
import type { EstadoLibro, PeriodicidadLibro } from "@/types";

type Admin = ReturnType<typeof createAdminClient>;

export type CategoriaLibro = "actas" | "inventario_balance" | "diario" | "iva" | "registros";

export const CATEGORIAS_LIBRO: { id: CategoriaLibro; label: string; codigos: string[] }[] = [
  { id: "actas", label: "Actas", codigos: ["actas_directorio", "actas_asamblea", "libro_actas", "consejo_administracion", "consejo_directivo"] },
  { id: "inventario_balance", label: "Inv. y Balance", codigos: ["inventario_balance"] },
  { id: "diario", label: "Diario", codigos: ["diario", "subdiario_caja_bancos"] },
  { id: "iva", label: "IVA", codigos: ["iva_ventas", "iva_compras"] },
  { id: "registros", label: "Registros", codigos: ["registro_acciones", "deposito_acciones_aaa", "libro_acciones", "asistencia_asamblea", "registro_asociados"] },
];

export function categoriaDe(codigo: string): CategoriaLibro | null {
  return CATEGORIAS_LIBRO.find((c) => c.codigos.includes(codigo))?.id ?? null;
}

export type GrupoSocietario = "SA" | "SRL" | "SAS" | "Otros";
export const GRUPOS_SOCIETARIOS: GrupoSocietario[] = ["SA", "SRL", "SAS", "Otros"];
export function grupoSocietario(tipo: string | null | undefined): GrupoSocietario {
  return tipo === "SA" || tipo === "SRL" || tipo === "SAS" ? tipo : "Otros";
}

/** Estado del sheet importado: la línea base del objetivo de puesta al día. */
export const FECHA_BASE = "2026-10-16";

export type LibroAtraso = {
  libroId: string;
  clienteId: string;
  clienteNombre: string;
  responsableId: string | null;
  responsableNombre: string | null;
  libroNombre: string;
  codigo: string;
  tipoSocietario: string;
  periodicidad: PeriodicidadLibro;
  estado: EstadoAtraso;
  periodos: number;
};

export type EnvioAnual = {
  clienteId: string;
  nombre: string;
  anio: number;
  legalizado: boolean;
  faltan: number;
};

export type Atraso = {
  libros: LibroAtraso[];
  /** Clientes con el último balance legalizado o finalizado y su envío anual. */
  envios: EnvioAnual[];
  sinCargar: number;
};

type ServicioRaw = {
  cliente_id: string;
  responsable_id: string | null;
  responsable: { nombre: string } | null;
  clientes: { id: string; nombre: string; cierre_ejercicio_mes: number | null; cierre_ejercicio_dia: number | null } | null;
};
type LibroRaw = {
  id: string;
  cliente_id: string;
  catalogo_id: string;
  tomo: number;
  estado: EstadoLibro;
  periodicidad: PeriodicidadLibro | null;
  ultimo_periodo_copiado: string | null;
};
type CatalogoRaw = {
  id: string;
  codigo: string;
  nombre: string;
  tipo_societario: string;
  periodicidad: PeriodicidadLibro;
  dispara_con_balance: boolean;
  activo: boolean;
};

/**
 * Atraso de cada libro que le corresponde al cliente por su tipo societario
 * (un libro = un ítem del catálogo, sumando todos sus tomos), al día `hoy`.
 * Mismo criterio que la Puesta al día de Seguimiento.
 */
export async function calcularAtraso(admin: Admin, hoy: string = hoyISO()): Promise<Atraso> {
  const [{ data: serviciosRaw }, { data: societariosRaw }, { data: catalogoRaw }, { data: librosRaw }, { data: balancesRaw }] =
    await Promise.all([
      admin
        .from("servicios_cliente")
        .select("cliente_id, responsable_id, responsable:liquidadoras(nombre), clientes!inner(id, nombre, estado, cierre_ejercicio_mes, cierre_ejercicio_dia)")
        .eq("servicio", "libros")
        .eq("clientes.estado", "activo")
        .eq("estado", true),
      admin.from("clientes_societario").select("cliente_id, tipo_societario"),
      admin.from("libros_catalogo").select("id, codigo, nombre, tipo_societario, periodicidad, dispara_con_balance, activo"),
      admin.from("libros").select("id, cliente_id, catalogo_id, tomo, estado, periodicidad, ultimo_periodo_copiado"),
      admin.from("balances").select("cliente_id, anio_fiscal, fecha_cierre, estado").order("fecha_cierre", { ascending: false }),
    ]);

  const tipos = new Map((societariosRaw ?? []).map((s) => [s.cliente_id as string, s.tipo_societario as string | null]));
  const catalogo = ((catalogoRaw ?? []) as CatalogoRaw[]).filter((k) => k.activo);
  const librosPorCliente = new Map<string, LibroRaw[]>();
  for (const l of (librosRaw ?? []) as LibroRaw[]) {
    librosPorCliente.set(l.cliente_id, [...(librosPorCliente.get(l.cliente_id) ?? []), l]);
  }
  const ultimoBalance = new Map<string, { anio_fiscal: number; fecha_cierre: string; estado: string }>();
  for (const b of (balancesRaw ?? []) as { cliente_id: string; anio_fiscal: number; fecha_cierre: string; estado: string }[]) {
    if (!ultimoBalance.has(b.cliente_id) && b.fecha_cierre <= hoy) ultimoBalance.set(b.cliente_id, b);
  }

  const libros: LibroAtraso[] = [];
  const envios: EnvioAnual[] = [];
  let sinCargar = 0;
  for (const s of ((serviciosRaw ?? []) as unknown as ServicioRaw[]).filter((x) => x.clientes)) {
    const c = s.clientes!;
    const tipo = tipos.get(c.id);
    if (!tipo) continue;
    const cierre = { mes: c.cierre_ejercicio_mes, dia: c.cierre_ejercicio_dia };
    const delCliente = librosPorCliente.get(c.id) ?? [];
    const balance = ultimoBalance.get(c.id);
    const conEnvio = balance && (balance.estado === "legalizado" || balance.estado === "finalizado");
    let faltanEnvio = 0;

    for (const item of catalogo.filter((k) => k.tipo_societario === tipo)) {
      const tomos = delCliente.filter((l) => l.catalogo_id === item.id).sort((a, b) => b.tomo - a.tomo);
      const vigente = tomos.find((l) => l.estado === "activo") ?? tomos.find((l) => l.estado === "sin_libro");
      if (!vigente) {
        sinCargar++;
        continue;
      }
      const ultimo = tomos.map((l) => l.ultimo_periodo_copiado).filter((v): v is string => !!v).sort().at(-1) ?? null;
      const periodicidad = vigente.periodicidad ?? item.periodicidad;
      const r = atrasoLibro(vigente, ultimo, periodicidad, cierre, hoy);
      if (r.estado !== "no_aplica") {
        libros.push({
          libroId: vigente.id,
          clienteId: c.id,
          clienteNombre: c.nombre,
          responsableId: s.responsable_id,
          responsableNombre: s.responsable?.nombre ?? null,
          libroNombre: item.nombre,
          codigo: item.codigo,
          tipoSocietario: tipo,
          periodicidad,
          estado: r.estado,
          periodos: r.periodos,
        });
      }
      if (conEnvio && item.dispara_con_balance && vigente.estado === "activo") {
        if (!ultimo || mesIndice(ultimo) < mesIndice(balance!.fecha_cierre)) faltanEnvio++;
      }
    }
    if (conEnvio) {
      envios.push({
        clienteId: c.id,
        nombre: c.nombre,
        anio: balance!.anio_fiscal,
        legalizado: balance!.estado === "legalizado",
        faltan: faltanEnvio,
      });
    }
  }
  return { libros, envios, sinCargar };
}

export type Snapshot = {
  fecha: string;
  es_base: boolean;
  periodos_pendientes: number;
  libros_atrasados: number;
  libros_al_dia: number;
  libros_sin_dato: number;
  libros_sin_libro: number;
  envios_pendientes: number;
  por_libro: Record<string, number>;
};

export function armarSnapshot(fecha: string, atraso: Atraso, esBase = false): Snapshot {
  const cuenta = (e: EstadoAtraso) => atraso.libros.filter((l) => l.estado === e).length;
  return {
    fecha,
    es_base: esBase,
    periodos_pendientes: atraso.libros.reduce((n, l) => n + l.periodos, 0),
    libros_atrasados: cuenta("atrasado"),
    libros_al_dia: cuenta("al_dia"),
    libros_sin_dato: cuenta("sin_dato"),
    libros_sin_libro: cuenta("sin_libro"),
    envios_pendientes: atraso.envios.filter((e) => e.faltan > 0).length,
    por_libro: Object.fromEntries(
      atraso.libros.map((l) => [l.libroId, l.estado === "sin_dato" ? -1 : l.estado === "sin_libro" ? -2 : l.periodos])
    ),
  };
}

/**
 * Guarda la foto del día (la pisa si ya había una) y, la primera vez, la línea
 * base del 16-oct. La base se calcula con los datos actuales a esa fecha: es el
 * estado del sheet importado mientras no se hayan registrado copiados desde la
 * app antes de la primera corrida (el módulo arrancó el 19-oct).
 * Devuelve false si la tabla todavía no existe (etapa 7 sin correr).
 */
export async function guardarSnapshots(admin: Admin, hoy: string = hoyISO(), atrasoHoy?: Atraso): Promise<boolean> {
  try {
    const { data: base, error } = await admin.from("libros_snapshot").select("fecha").eq("es_base", true).maybeSingle();
    if (error) return false;
    if (!base) {
      const fila = armarSnapshot(FECHA_BASE, await calcularAtraso(admin, FECHA_BASE), true);
      await admin.from("libros_snapshot").upsert(fila);
    }
    if (hoy !== FECHA_BASE) {
      const fila = armarSnapshot(hoy, atrasoHoy ?? (await calcularAtraso(admin, hoy)));
      const { error: errHoy } = await admin.from("libros_snapshot").upsert({ ...fila, actualizado_en: new Date().toISOString() });
      if (errHoy) console.error("[libros] snapshot:", errHoy.message);
    }
    return true;
  } catch (e) {
    console.error("[libros] guardarSnapshots:", e);
    return false;
  }
}
