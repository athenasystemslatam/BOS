import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import { configLibros } from "@/lib/librosAutomaticos";
import type { ClienteSocietario, Libro, LibroCatalogo } from "@/types";
import { FichaSocietarioClient } from "./FichaSocietarioClient";

export default async function FichaLibrosPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();
  const areas = await getAreasDelUsuario();

  const [
    { data: cliente },
    { data: servicio },
    { data: societario },
    { data: catalogo },
    { data: libros },
    { data: tareas },
    { data: finales },
    { data: equipoRaw },
    { data: modulosRaw },
    { data: balance },
    config,
  ] = await Promise.all([
    admin
      .from("clientes")
      .select("id, nombre, cuit, jurisdiccion_legal, cierre_ejercicio_mes, cierre_ejercicio_dia")
      .eq("id", params.id)
      .maybeSingle(),
    admin
      .from("servicios_cliente")
      .select("estado, responsable_id, responsable:liquidadoras(nombre)")
      .eq("cliente_id", params.id)
      .eq("servicio", "libros")
      .eq("subtipo", "general")
      .maybeSingle(),
    admin.from("clientes_societario").select("*").eq("cliente_id", params.id).maybeSingle(),
    admin.from("libros_catalogo").select("*").eq("activo", true).order("orden"),
    admin.from("libros").select("*").eq("cliente_id", params.id).order("tomo"),
    admin.from("libros_tareas").select("libro_id, estado_id").eq("cliente_id", params.id),
    admin.from("libros_estados").select("id").eq("es_final", true),
    admin.from("liquidadoras").select("id, nombre").eq("activa", true).order("nombre"),
    admin.from("equipo_modulos").select("equipo_id").eq("modulo", "libros"),
    admin
      .from("balances")
      .select("anio_fiscal, estado")
      .eq("cliente_id", params.id)
      .order("fecha_cierre", { ascending: false })
      .limit(1)
      .maybeSingle(),
    configLibros(admin),
  ]);

  if (!cliente) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const responsable = (servicio as any)?.responsable?.nombre ?? null;
  const idsFinales = new Set((finales ?? []).map((e) => e.id as string));
  const enCola = (tareas ?? []).filter((t) => !idsFinales.has(t.estado_id as string)).map((t) => t.libro_id as string);
  const idsEquipo = new Set((modulosRaw ?? []).map((m) => m.equipo_id as string));
  const equipo = ((equipoRaw ?? []) as { id: string; nombre: string }[]).filter((p) => idsEquipo.has(p.id));

  return (
    <FichaSocietarioClient
      cliente={cliente}
      responsable={responsable}
      responsableId={servicio?.responsable_id ?? null}
      servicioActivo={servicio?.estado === true}
      societario={(societario as ClienteSocietario) ?? null}
      catalogo={(catalogo ?? []) as LibroCatalogo[]}
      libros={(libros ?? []) as Libro[]}
      enCola={enCola}
      equipo={equipo}
      balance={(balance as { anio_fiscal: number; estado: string } | null) ?? null}
      umbralFolios={config.umbralFolios}
      primerAvisoMandato={config.avisosMandato[0] ?? 90}
      puedeEditar={!yo?.esCobranzas && (!!yo?.isAdmin || areas.includes("libros"))}
    />
  );
}
