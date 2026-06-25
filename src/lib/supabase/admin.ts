import { createClient } from "@supabase/supabase-js";

// Cliente con service role — solo para Server Components y Server Actions.
// El middleware ya garantiza que solo usuarios autenticados llegan aquí.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
