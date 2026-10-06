import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PrtgClient } from "@/lib/prtg";
import { decrypt } from "@/lib/crypto";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    let { baseUrl, apiToken, ignoreSsl } = body;

    // Fall back to stored config if not provided in test payload
    if (!baseUrl || !apiToken) {
      const stored = await prisma.prtgSetting.findFirst({ where: { id: 1 } });
      if (stored) {
        baseUrl = baseUrl || stored.baseUrl;
        if (!apiToken && stored.apiTokenEncrypted && stored.apiTokenIv && stored.apiTokenAuthTag) {
          try {
            apiToken = decrypt(stored.apiTokenEncrypted, stored.apiTokenIv, stored.apiTokenAuthTag);
          } catch (e) {
            console.error("Failed to decrypt stored token for test:", e);
          }
        }
        if (ignoreSsl === undefined) ignoreSsl = stored.ignoreSsl;
      }
    }

    const client = new PrtgClient({
      baseUrl,
      apiToken,
      ignoreSsl: ignoreSsl ?? true,
    });

    const result = await client.testConnection();

    // Update connectionStatus in DB
    await prisma.prtgSetting.update({
      where: { id: 1 },
      data: {
        connectionStatus: result.ok ? "connected" : "disconnected",
      },
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error.message || "Test connection failed" }, { status: 500 });
  }
}
