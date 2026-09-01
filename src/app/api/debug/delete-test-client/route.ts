import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";

// Ruta temporal de un solo uso: borra el registro de prueba "ZZZ PRUEBA BORRAR"
// (creado para verificar el fix de sincronización liquidador_id) directamente
// de la base. Acotada por nombre + CUIT exactos para no poder tocar nada más.
// Se elimina este archivo apenas se use.
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No autorizado." }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: encontrados, error: findError } = await supabase
    .from("clientes")
    .select("id, nombre, cuit, estado")
    .eq("nombre", "ZZZ PRUEBA BORRAR")
    .eq("cuit", "20999999996");

  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 });
  if (!encontrados || encontrados.length === 0) {
    return NextResponse.json({ error: "No se encontró el registro de prueba." }, { status: 404 });
  }

  const ids = encontrados.map((c) => c.id);
  const { error: delError } = await supabase.from("clientes").delete().in("id", ids);

  if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

  return NextResponse.json({ success: true, borrados: encontrados });
}
