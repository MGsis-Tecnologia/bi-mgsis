import { NextResponse } from "next/server";
import { isDbConfigured, getDatabaseUrl } from "@/lib/server/db-config";
import { testConnection } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = await isDbConfigured();
  if (!configured) {
    return NextResponse.json({ configured: false, connected: false });
  }

  try {
    const url = (await getDatabaseUrl())!;
    await testConnection(url);
    return NextResponse.json({ configured: true, connected: true });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      connected: false,
      error: (err as Error).message,
    });
  }
}
