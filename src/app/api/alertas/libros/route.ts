import { NextRequest, NextResponse } from "next/server";
import { sincronizarLibrosAutomaticosAhora } from "@/lib/librosAutomaticos";
import { guardarSnapshots } from "@/lib/librosTablero";
import { enviarMailsLibros } from "@/lib/librosMails";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await sincronizarLibrosAutomaticosAhora();
    await guardarSnapshots(createAdminClient());
    const result = await enviarMailsLibros();
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
