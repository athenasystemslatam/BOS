import { NextRequest, NextResponse } from "next/server";
import { sendAlertasLibros } from "@/lib/email";
import { sincronizarLibrosAutomaticos } from "@/lib/librosAutomaticos";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await sincronizarLibrosAutomaticos();
    const result = await sendAlertasLibros();
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
