import { NextRequest, NextResponse } from "next/server";
import { sendAlertaF931, sendTestEmail } from "@/lib/email";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isTest = req.nextUrl.searchParams.get("test") === "true";

  try {
    if (isTest) {
      const result = await sendTestEmail();
      return NextResponse.json(result);
    }
    const result = await sendAlertaF931();
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
