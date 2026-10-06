import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (role === "STAFF") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const settings = await prisma.prtgSetting.findFirst({
      where: { id: 1 },
    });

    return NextResponse.json({
      connected: settings?.connectionStatus === "connected",
      lastSyncAt: settings?.lastSyncAt?.toISOString() || null,
    });
  } catch {
    return NextResponse.json({
      connected: false,
      lastSyncAt: null,
    });
  }
}
