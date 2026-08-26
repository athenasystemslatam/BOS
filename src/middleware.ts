import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { esDominioPermitido } from "@/lib/dominio";

/** Por qué se le corta el paso a un usuario ya autenticado en Supabase Auth.
 * "bloqueado" = está en accesos_bloqueados (se le revocó el acceso a mano).
 * "dominio" = su email no es del estudio y tampoco tiene fila en liquidadoras
 * (o sea, ni siquiera califica para el modo consulta). */
async function getBlockReason(
  email: string,
  userId: string
): Promise<"bloqueado" | "dominio" | null> {
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const [{ data: bloqueado }, { data: liquidadora }] = await Promise.all([
    admin.from("accesos_bloqueados").select("email").eq("email", email).maybeSingle(),
    admin.from("liquidadoras").select("id").eq("user_id", userId).maybeSingle(),
  ]);

  if (bloqueado) return "bloqueado";
  if (!esDominioPermitido(email) && !liquidadora) return "dominio";
  return null;
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /auth/callback intercambia el code por sesión — no tiene user todavía
  const isAuthCallback = request.nextUrl.pathname.startsWith("/auth/callback");
  const isLogin = request.nextUrl.pathname.startsWith("/login");

  let blockReason: "bloqueado" | "dominio" | null = null;
  if (user?.email && !isAuthCallback) {
    blockReason = await getBlockReason(user.email.toLowerCase(), user.id);
    if (blockReason) {
      // Corta la sesión ahí mismo — aunque tuviera cookie válida, no vuelve a pasar.
      await supabase.auth.signOut();
    }
  }

  const autenticadoYPermitido = !!user && !blockReason;

  // Sin sesión válida y no está en /login ni en el callback → redirigir al login
  if (!autenticadoYPermitido && !isLogin && !isAuthCallback) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (blockReason) url.searchParams.set("error", blockReason);
    return NextResponse.redirect(url);
  }

  // Si ya tiene sesión válida y va al login → redirigir al dashboard
  if (autenticadoYPermitido && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
