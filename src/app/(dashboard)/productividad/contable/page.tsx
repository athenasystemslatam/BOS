import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ContableProductividadClient, FilaResponsableContable } from "./ContableProductividadClient";

const DIAS_VTO_BALANCE = 135;

export default async function ProductividadContablePage() {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/contable");

  const admin = createAdminClient();

  const [{ data: balances }, { data: liquidadoras }] = await Promise.all([
    admin
      .from("balances")
      .select("anio_fiscal, fecha_cierre, estado, avance, responsable_id, responsable2_id"),
    admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre"),
  ]);

  if (!balances || !liquidadoras) {
    return <div className="p-8 text-gray-400 text-sm">Sin datos suficientes.</div>;
  }

  if (balances.length === 0) {
    return <div className="p-8 text-gray-400 text-sm">Todavía no hay balances cargados.</div>;
  }

  const hoy = new Date();
  const anios = Array.from(new Set(balances.map((b) => b.anio_fiscal))).sort((a, b) => a - b);

  const filaMap = new Map<string, FilaResponsableContable>();
  for (const l of liquidadoras) filaMap.set(l.id, { id: l.id, nombre: l.nombre, anios: [] });

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

      const finalizados = items.filter((b) => b.estado === "finalizado").length;
      const enProceso = items.filter((b) => b.estado === "en_proceso").length;
      const frenados = items.filter((b) => b.estado === "frenado").length;
      const sinEmpezar = items.filter((b) => b.estado === "sin_asignar" || b.estado === "asignado").length;
      const avancePromedio = items.length > 0
        ? Math.round(items.reduce((acc, b) => acc + (b.avance ?? 0), 0) / items.length)
        : 0;
      const vencidos = items.filter((b) => {
        if (b.estado === "finalizado") return false;
        const vto = new Date(b.fecha_cierre);
        vto.setDate(vto.getDate() + DIAS_VTO_BALANCE);
        return hoy > vto;
      }).length;

      fila.anios.push({
        anio,
        total: items.length,
        finalizados,
        enProceso,
        frenados,
        sinEmpezar,
        avancePromedio,
        vencidos,
      });
    }
  }

  const filas = Array.from(filaMap.values()).filter((f) => f.anios.some((a) => a.total > 0));

  return <ContableProductividadClient filas={filas} />;
}
