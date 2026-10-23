import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getContextoVencimientos } from "@/lib/vencimientosContablesServer";
import { aFecha } from "@/lib/vencimientosContables";
import { cuentaBalance } from "../../contable/semaforo";
import { ContableProductividadClient, FilaResponsableContable } from "./ContableProductividadClient";

function diffDias(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / 86400000);
}

function promedio(valores: number[]): number | null {
  return valores.length > 0 ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
}

// Ítem 50: formularios derivados del balance — se miden juntos (sin contar
// los que no aplican), salvo el F.855 que además se mide en término contra
// su propio vencimiento (cierre + 25 días sobre el VTO del balance).
const CAMPOS_FORM = [
  { campo: "f855_estado", presentadoVal: "presentado" },
  { campo: "f899_estado", presentadoVal: "presentado" },
  { campo: "f713_estado", presentadoVal: "presentado" },
  { campo: "f657_estado", presentadoVal: "presentado" },
  { campo: "igj_presentacion", presentadoVal: "presentado" },
  { campo: "igj_tasa", presentadoVal: "enviada" },
] as const;

export default async function ProductividadContablePage() {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/contable");

  const admin = createAdminClient();

  const [{ data: balancesRaw }, { data: liquidadoras }, vencimientos] = await Promise.all([
    admin
      .from("balances")
      .select(
        "id, cliente_id, anio_fiscal, fecha_cierre, estado, responsable_id, responsable2_id, " +
        "envio1_fecha, info_recibida_fecha, legalizado_fecha, presentado_fecha, " +
        "f855_estado, f899_estado, f713_estado, f657_estado, igj_presentacion, igj_tasa, f855_fecha"
      ),
    // Ítem 118: todas las personas, no solo las activas — los dados de baja
    // siguen apareciendo con sus balances históricos, marcados "(inactivo)".
    admin.from("liquidadoras").select("id, nombre, activa").order("nombre"),
    getContextoVencimientos(),
  ]);
  const { data: modulosContable } = await admin.from("equipo_modulos").select("equipo_id").eq("modulo", "contable");
  const idsContable = new Set((modulosContable ?? []).map((m) => m.equipo_id));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const balances = (balancesRaw as any[] | null)?.filter(cuentaBalance) ?? null;

  if (!balances || !liquidadoras) {
    return <div className="p-8 text-gray-400 text-sm">Sin datos suficientes.</div>;
  }

  if (balances.length === 0) {
    return <div className="p-8 text-gray-400 text-sm">Todavía no hay balances cargados.</div>;
  }

  const hoy = new Date();

  // Días frenado acumulados (ítem 34/47): un balance se puede frenar y
  // destrabar varias veces, así que el total real sale del historial
  // (balance_frenados), no solo del ciclo que está abierto ahora mismo.
  const idsFrenados = balances.filter((b) => b.estado === "frenado").map((b) => b.id);
  const diasFrenadoAcumPorBalance = new Map<string, number>();
  if (idsFrenados.length > 0) {
    const { data: ciclosFrenado } = await admin
      .from("balance_frenados")
      .select("balance_id, desde, hasta")
      .in("balance_id", idsFrenados);
    for (const c of ciclosFrenado ?? []) {
      const dias = diffDias(new Date(c.desde), c.hasta ? new Date(c.hasta) : hoy);
      diasFrenadoAcumPorBalance.set(c.balance_id, (diasFrenadoAcumPorBalance.get(c.balance_id) ?? 0) + dias);
    }
  }
  const anios = Array.from(new Set(balances.map((b) => b.anio_fiscal))).sort((a, b) => a - b);

  const filaMap = new Map<string, FilaResponsableContable>();
  for (const l of liquidadoras) {
    const activo = l.activa && idsContable.has(l.id);
    filaMap.set(l.id, { id: l.id, nombre: activo ? l.nombre : `${l.nombre} (inactivo)`, anios: [] });
  }

  for (const anio of anios) {
    const delAnio = balances.filter((b) => b.anio_fiscal === anio);
    const porResp = new Map<string, typeof delAnio>();

    for (const b of delAnio) {
      const responsables = [b.responsable_id, b.responsable2_id].filter(Boolean) as string[];
      for (const respId of responsables) {
        if (!porResp.has(respId)) porResp.set(respId, []);
        porResp.get(respId)!.push(b);
      }
    }

    for (const [respId, items] of Array.from(porResp.entries())) {
      const fila = filaMap.get(respId);
      if (!fila) continue;

      // Punto 1: % en término + margen — nunca contra los frenados.
      const sinFrenar = items.filter((b) => b.estado !== "frenado");
      const terminados = sinFrenar.filter((b) => b.estado === "finalizado");
      const margenes: number[] = [];
      let terminadosEnTermino = 0;
      for (const b of terminados) {
        if (!b.presentado_fecha) continue;
        const vto = aFecha(vencimientos.resolver(b).balance.fecha);
        const margen = diffDias(new Date(b.presentado_fecha), vto);
        margenes.push(margen);
        if (margen >= 0) terminadosEnTermino++;
      }

      // Puntos 2 y 3: demora del cliente y tiempo interno.
      const demorasCliente: number[] = [];
      const tiemposInternos: number[] = [];
      for (const b of items) {
        if (b.envio1_fecha && b.info_recibida_fecha) {
          demorasCliente.push(diffDias(new Date(b.envio1_fecha), new Date(b.info_recibida_fecha)));
        }
        if (b.info_recibida_fecha && b.legalizado_fecha) {
          tiemposInternos.push(diffDias(new Date(b.info_recibida_fecha), new Date(b.legalizado_fecha)));
        }
      }

      // Punto 4: frenados aparte, con cuántos días llevan frenados en total
      // (suma de todos sus ciclos de freno, no solo el que está abierto).
      const frenados = items.filter((b) => b.estado === "frenado");
      const diasFrenado = frenados
        .map((b) => diasFrenadoAcumPorBalance.get(b.id))
        .filter((d): d is number => d != null);

      // Ítem 50: formularios derivados, juntos (sin contar N/A).
      let formAplican = 0;
      let formPresentados = 0;
      for (const b of items) {
        for (const { campo, presentadoVal } of CAMPOS_FORM) {
          const valor = (b as unknown as Record<string, string>)[campo];
          if (valor === "no_corresponde") continue;
          formAplican++;
          if (valor === presentadoVal) formPresentados++;
        }
      }

      // F.855 en término, aparte (mismo criterio que la tarjeta de objetivo
      // del dashboard pero acotado a este contador/año).
      const vtoF855 = (b: { id: string; fecha_cierre: string; cliente_id: string }) =>
        aFecha(vencimientos.resolver(b).f855.fecha);
      const f855Vencidos = items.filter((b) => {
        if (b.f855_estado === "no_corresponde") return false;
        return hoy > vtoF855(b);
      });
      const f855EnTermino = f855Vencidos.filter((b) => {
        if (b.f855_estado !== "presentado" || !b.f855_fecha) return false;
        return new Date(b.f855_fecha) <= vtoF855(b);
      }).length;

      fila.anios.push({
        anio,
        total: sinFrenar.length,
        terminadosEnTermino,
        margenProm: promedio(margenes),
        demoraClienteProm: promedio(demorasCliente),
        tiempoInternoProm: promedio(tiemposInternos),
        frenados: frenados.length,
        diasFrenadoProm: diasFrenado.length > 0 ? Math.round(promedio(diasFrenado)!) : null,
        pctFormularios: formAplican > 0 ? Math.round((formPresentados / formAplican) * 100) : null,
        f855EnTermino,
        f855Total: f855Vencidos.length,
      });
    }
  }

  const filas = Array.from(filaMap.values()).filter((f) => f.anios.some((a) => a.total > 0 || a.frenados > 0));

  return <ContableProductividadClient filas={filas} />;
}
