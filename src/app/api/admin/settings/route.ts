import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    let settings = await prisma.prtgSetting.findFirst({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.prtgSetting.create({
        data: {
          id: 1,
          baseUrl: "https://prtg.bss.local",
          retentionDays: 90,
          pollIntervalSeconds: 60,
          ignoreSsl: true,
          connectionStatus: "unknown",
        },
      });
    }

    return NextResponse.json({
      id: settings.id,
      baseUrl: settings.baseUrl,
      hasToken: Boolean(settings.apiTokenEncrypted && settings.apiTokenIv),
      ignoreSsl: settings.ignoreSsl,
      pollIntervalSeconds: settings.pollIntervalSeconds,
      retentionDays: settings.retentionDays,
      uptimeWarningLatencyMs: settings.uptimeWarningLatencyMs ?? 1000,
      uptimeTimeoutMs: settings.uptimeTimeoutMs ?? 5000,
      connectionStatus: settings.connectionStatus,
      lastSyncAt: settings.lastSyncAt,
      lastCleanupAt: settings.lastCleanupAt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load settings" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { baseUrl, apiToken, ignoreSsl, pollIntervalSeconds, retentionDays, uptimeWarningLatencyMs, uptimeTimeoutMs, applyToAllMonitors } = body;

    const updateData: any = {
      baseUrl: (baseUrl || "").trim(),
      ignoreSsl: Boolean(ignoreSsl),
      pollIntervalSeconds: Math.max(parseInt(pollIntervalSeconds) || 60, 10),
      retentionDays: Math.max(parseInt(retentionDays) || 90, 7),
      uptimeWarningLatencyMs: Math.max(100, parseInt(uptimeWarningLatencyMs) || 1000),
      uptimeTimeoutMs: Math.max(1000, parseInt(uptimeTimeoutMs) || 5000),
    };

    // If new apiToken is provided, encrypt it
    if (apiToken && apiToken.trim().length > 0) {
      const encrypted = encrypt(apiToken.trim());
      updateData.apiTokenEncrypted = encrypted.ciphertext;
      updateData.apiTokenIv = encrypted.iv;
      updateData.apiTokenAuthTag = encrypted.authTag;
    }

    const settings = await prisma.prtgSetting.upsert({
      where: { id: 1 },
      update: updateData,
      create: {
        id: 1,
        ...updateData,
      },
    });

    // Mass-apply to existing monitors if requested
    let updatedMonitorsCount = 0;
    if (applyToAllMonitors) {
      const res = await prisma.uptimeMonitor.updateMany({
        data: {
          warningThresholdMs: updateData.uptimeWarningLatencyMs,
          timeoutMs: updateData.uptimeTimeoutMs,
        },
      });
      updatedMonitorsCount = res.count;
    }

    // Audit log
    try {
      const dbUser = await prisma.user.findFirst({
        where: { employeeId: (session.user as any)?.employeeId || "" },
      });
      if (dbUser) {
        await prisma.auditLog.create({
          data: {
            userId: dbUser.id,
            action: "UPDATE_SETTINGS",
            target: "PRTG & Uptime SLA Settings",
            detail: `Updated settings (PRTG URL: ${baseUrl}, interval: ${pollIntervalSeconds}s, retention: ${retentionDays}d, warning latency: ${updateData.uptimeWarningLatencyMs}ms, timeout: ${updateData.uptimeTimeoutMs}ms, applied to: ${updatedMonitorsCount} monitors)`,
          },
        });
      }
    } catch (e) {
      console.warn("Audit log error:", e);
    }

    return NextResponse.json({
      success: true,
      updatedMonitorsCount,
      settings: {
        id: settings.id,
        baseUrl: settings.baseUrl,
        hasToken: Boolean(settings.apiTokenEncrypted),
        ignoreSsl: settings.ignoreSsl,
        pollIntervalSeconds: settings.pollIntervalSeconds,
        retentionDays: settings.retentionDays,
        uptimeWarningLatencyMs: settings.uptimeWarningLatencyMs,
        uptimeTimeoutMs: settings.uptimeTimeoutMs,
        connectionStatus: settings.connectionStatus,
        lastSyncAt: settings.lastSyncAt,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save settings" }, { status: 500 });
  }
}
