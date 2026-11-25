import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { destinoSeguro } from "@/lib/permisos";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Vuelve a la pantalla que quería abrir (favorito con sesión vencida) o al inicio de la persona.
      return NextResponse.redirect(`${origin}${destinoSeguro(searchParams.get("next")) ?? "/"}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=link_invalido`);
}
