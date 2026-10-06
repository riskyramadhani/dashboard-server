import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runPrtgSync } from "@/lib/sync";

export async function POST(request: Request) {
  try {
    const session = await auth();
    const authHeader = request.headers.get("authorization");
    const internalSecret = process.env.INTERNAL_CRON_SECRET;

    // Allowed if authenticated as ADMIN/NOC or with internal cron secret
    const isCron = internalSecret && authHeader === `Bearer ${internalSecret}`;
    const isUser = session?.user && ["ADMIN", "NOC_OPERATOR"].includes((session.user as any)?.role);

    if (!isCron && !isUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runPrtgSync();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Sync API error:", error);
    return NextResponse.json({ error: error.message || "Sync failed" }, { status: 500 });
  }
}
