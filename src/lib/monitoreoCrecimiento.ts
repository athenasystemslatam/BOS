// Chequeo semanal de crecimiento: cuenta las filas de cada tabla, las
// compara contra la última foto guardada (tabla monitoreo_crecimiento, ver
// supabase/crear_tabla_monitoreo_crecimiento.sql) y devuelve qué tablas
// crecieron o cayeron de forma rara. Lo usa
// src/app/api/cron/chequeo-crecimiento/route.ts.
import { createAdminClient } from "@/lib/supabase/admin";

// Una tabla con pocas filas puede duplicarse o vaciarse de un día para el
// otro sin que signifique nada (ej. una tabla de configuración con 3 filas)
// — por debajo de este piso no tiene sentido evaluar porcentajes.
const PISO_FILAS_PARA_EVALUAR = 10;
const UMBRAL_CRECIMIENTO = 0.5; // +50% desde la última foto
const UMBRAL_CAIDA = 0.2; // -20% desde la última foto

export type Anomalia = {
  tabla: string;
  anterior: number;
  actual: number;
  cambioPct: number;
  tipo: "crecimiento" | "caida";
};

async function contarFilas(admin: ReturnType<typeof createAdminClient>, tabla: string): Promise<number> {
  const { count, error } = await admin.from(tabla).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return count ?? 0;
}

export async function contarTodasLasTablas(
  admin: ReturnType<typeof createAdminClient>,
  tablas: string[]
): Promise<Record<string, number>> {
  const conteos: Record<string, number> = {};
  for (const tabla of tablas) {
    conteos[tabla] = await contarFilas(admin, tabla);
  }
  return conteos;
}

/** Última foto guardada de cada tabla (una sola fila por tabla, la más
 * reciente) — se trae todo el historial y se reduce en JS porque son pocas
 * filas por corrida (una por tabla por semana), no hace falta una consulta
 * más elaborada. */
async function obtenerUltimaFoto(
  admin: ReturnType<typeof createAdminClient>
): Promise<Record<string, number>> {
  const { data, error } = await admin
    .from("monitoreo_crecimiento")
    .select("tabla, filas, creado_en")
    .order("creado_en", { ascending: false });
  if (error) throw new Error(`No se pudo leer el historial de monitoreo: ${error.message}`);

  const ultima: Record<string, number> = {};
  for (const fila of data ?? []) {
    // Como viene ordenado de más nuevo a más viejo, la primera vez que
    // aparece cada tabla ya es su foto más reciente.
    if (!(fila.tabla in ultima)) ultima[fila.tabla] = fila.filas;
  }
  return ultima;
}

function detectarAnomalias(
  anteriores: Record<string, number>,
  actuales: Record<string, number>
): Anomalia[] {
  const anomalias: Anomalia[] = [];
  for (const [tabla, actual] of Object.entries(actuales)) {
    const anterior = anteriores[tabla];
    // Tabla nueva (sin foto previa): recién arranca su historial, nada para comparar todavía.
    if (anterior === undefined || anterior < PISO_FILAS_PARA_EVALUAR) continue;

    const cambioPct = (actual - anterior) / anterior;
    if (cambioPct >= UMBRAL_CRECIMIENTO) {
      anomalias.push({ tabla, anterior, actual, cambioPct, tipo: "crecimiento" });
    } else if (cambioPct <= -UMBRAL_CAIDA) {
      anomalias.push({ tabla, anterior, actual, cambioPct, tipo: "caida" });
    }
  }
  return anomalias.sort((a, b) => Math.abs(b.cambioPct) - Math.abs(a.cambioPct));
}

/** Compara contra la foto anterior y siempre guarda la de hoy (haya o no
 * anomalías), para que la próxima corrida tenga con qué comparar. */
export async function compararYGuardarFoto(
  admin: ReturnType<typeof createAdminClient>,
  conteosActuales: Record<string, number>
): Promise<Anomalia[]> {
  const anteriores = await obtenerUltimaFoto(admin);
  const anomalias = detectarAnomalias(anteriores, conteosActuales);

  const nuevaFoto = Object.entries(conteosActuales).map(([tabla, filas]) => ({ tabla, filas }));
  const { error } = await admin.from("monitoreo_crecimiento").insert(nuevaFoto);
  if (error) throw new Error(`No se pudo guardar la foto de monitoreo: ${error.message}`);

  return anomalias;
}
