import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentLiquidadora, getAreasDelUsuario } from "@/lib/auth";
import type { ClienteSocietario, Libro, LibroCatalogo } from "@/types";
import { FichaSocietarioClient } from "./FichaSocietarioClient";

export default async function FichaLibrosPage({ params }: { params: { id: string } }) {
  const admin = createAdminClient();
  const yo = await getCurrentLiquidadora();
  const areas = await getAreasDelUsuario();

  const [{ data: cliente }, { data: servicio }, { data: societario }, { data: catalogo }, { data: libros }] =
    await Promise.all([
      admin.from("clientes").select("id, nombre, cuit, jurisdiccion_legal").eq("id", params.id).maybeSingle(),
      admin
        .from("servicios_cliente")
        .select("estado, responsable:liquidadoras(nombre)")
        .eq("cliente_id", params.id)
        .eq("servicio", "libros")
        .eq("subtipo", "general")
        .maybeSingle(),
      admin.from("clientes_societario").select("*").eq("cliente_id", params.id).maybeSingle(),
      admin.from("libros_catalogo").select("*").eq("activo", true).order("orden"),
      admin.from("libros").select("*").eq("cliente_id", params.id).order("tomo"),
    ]);

  if (!cliente) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const responsable = (servicio as any)?.responsable?.nombre ?? null;

  return (
    <FichaSocietarioClient
      cliente={cliente}
      responsable={responsable}
      servicioActivo={servicio?.estado === true}
      societario={(societario as ClienteSocietario) ?? null}
      catalogo={(catalogo ?? []) as LibroCatalogo[]}
      libros={(libros ?? []) as Libro[]}
      puedeEditar={!yo?.esCobranzas && (!!yo?.isAdmin || areas.includes("libros"))}
    />
  );
}
