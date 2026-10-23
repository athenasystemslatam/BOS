import { createAdminClient } from "@/lib/supabase/admin";
import { getObjetivoContable, getExcepcionesCliente } from "@/lib/objetivos";
import {
  calcularVencimientos,
  resolverReglas,
  type ManualesBalance,
  type Prorroga,
  type TipoVto,
  type VtosBalance,
} from "@/lib/vencimientosContables";

async function cargarProrrogas(): Promise<Prorroga[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("contable_vto_prorrogas").select("*");
  // Sin la tabla (o si falla la consulta) se sigue con la regla general: es
  // preferible mostrar la fecha por regla a dejar la pantalla vacía.
  if (error) return [];
  return (data ?? []) as Prorroga[];
}

async function cargarManuales(): Promise<Map<string, ManualesBalance>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("contable_vto_manual").select("balance_id, tipo, fecha, motivo");
  const mapa = new Map<string, ManualesBalance>();
  if (error) return mapa;
  for (const fila of data ?? []) {
    const actual = mapa.get(fila.balance_id) ?? {};
    actual[fila.tipo as TipoVto] = { fecha: fila.fecha, motivo: fila.motivo };
    mapa.set(fila.balance_id, actual);
  }
  return mapa;
}

export async function getContextoVencimientos() {
  const [general, excepciones, prorrogas, manuales] = await Promise.all([
    getObjetivoContable(),
    getExcepcionesCliente("contable"),
    cargarProrrogas(),
    cargarManuales(),
  ]);

  function resolver(b: {
    id: string;
    cliente_id: string;
    fecha_cierre: string;
    vto_ganancias?: string | null;
  }): VtosBalance {
    const reglas = resolverReglas(general, excepciones.get(b.cliente_id));
    let propios = manuales.get(b.id);
    // balances.vto_ganancias (23-oct) quedó reemplazada por contable_vto_manual;
    // se respeta solo si ese balance no tiene su fecha manual de Ganancias.
    if (b.vto_ganancias && !propios?.ganancias) {
      propios = { ...propios, ganancias: { fecha: b.vto_ganancias, motivo: "Cargado antes del cambio" } };
    }
    return calcularVencimientos(b, reglas, prorrogas, propios);
  }

  return { general, excepciones, prorrogas, manuales, reglasGenerales: resolverReglas(general), resolver };
}
