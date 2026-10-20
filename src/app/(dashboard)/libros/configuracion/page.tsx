import { redirect } from "next/navigation";
import { getCurrentLiquidadora } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { configLibros } from "@/lib/librosAutomaticos";
import type { LibroEstado } from "@/types";
import { ConfiguracionClient, type PersonaMail } from "./ConfiguracionClient";

export default async function ConfiguracionLibrosPage() {
  const yo = await getCurrentLiquidadora();
  if (!yo?.isAdmin) redirect("/libros");

  const admin = createAdminClient();
  const [{ data: estadosRaw }, config, { data: personasRaw }, { data: modulosRaw }] = await Promise.all([
    admin.from("libros_estados").select("*").order("orden"),
    configLibros(admin),
    admin.from("liquidadoras").select("id, nombre, email, rol").eq("activa", true).order("nombre"),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "libros"),
  ]);

  // Para los mails: el equipo de Libros y los administradores.
  const enLibros = new Set((modulosRaw ?? []).map((m) => m.equipo_id as string));
  const personas: PersonaMail[] = ((personasRaw ?? []) as { id: string; nombre: string; email: string | null; rol: string }[])
    .filter((p) => enLibros.has(p.id) || p.rol === "admin")
    .map((p) => ({ id: p.id, nombre: p.nombre, email: p.email, enLibros: enLibros.has(p.id), esAdmin: p.rol === "admin" }));

  return (
    <ConfiguracionClient
      estados={(estadosRaw ?? []) as LibroEstado[]}
      umbralInicial={config.umbralFolios}
      avisosMandato={config.avisosMandato}
      fechaMeta={config.fechaMeta}
      personas={personas}
      mails={{ diarioExcluidos: config.mailDiarioExcluidos, semanalIds: config.mailSemanalIds, semanalDia: config.mailSemanalDia }}
    />
  );
}
