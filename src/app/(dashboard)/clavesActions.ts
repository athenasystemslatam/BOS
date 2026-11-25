"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { alcanceClaves, protegerCliente } from "@/lib/clavesServer";
import type { ClaveAcceso, ModuloClave } from "@/types";

// Claves de un cliente, a pedido (llave, editar, recuadro de Seguimiento).
// Las listas ya no las traen: ver lib/clavesServer.ts.

export type SensiblesCliente = {
  claves_acceso: ClaveAcceso[];
  cuil_arca: string | null;
  claves_ocultas: number;
  cuil_oculto: boolean;
};

export async function leerSensiblesCliente(clienteId: string, donde: string): Promise<SensiblesCliente | { error: string }> {
  const alcance = await alcanceClaves();
  const { data } = await createAdminClient()
    .from("clientes")
    .select("id, claves_acceso, cuil_arca")
    .eq("id", clienteId)
    .maybeSingle();
  if (!data) return { error: "No se encontró el cliente." };
  const p = await protegerCliente(data, donde.slice(0, 40), alcance);
  return {
    claves_acceso: p.claves_acceso as ClaveAcceso[],
    cuil_arca: (p.cuil_arca as string | null) ?? null,
    claves_ocultas: p.claves_ocultas,
    cuil_oculto: p.cuil_oculto,
  };
}

export async function leerClavesModulo(clienteId: string, modulo: ModuloClave): Promise<ClaveAcceso[] | { error: string }> {
  const alcance = await alcanceClaves();
  if (!alcance || (!alcance.todas && !alcance.modulos.has(modulo))) {
    return { error: "Las claves solo las ve quien trabaja en este módulo." };
  }
  const r = await leerSensiblesCliente(clienteId, `llave ${modulo}`);
  if ("error" in r) return r;
  return r.claves_acceso.filter((c) => (c.modulo ?? "") === modulo);
}
