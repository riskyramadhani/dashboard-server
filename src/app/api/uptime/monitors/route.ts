import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runSingleUptimeCheck } from "@/lib/uptime-sync";

// GET /api/uptime/monitors — list all monitors with stats
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const monitors = await prisma.uptimeMonitor.findMany({
      orderBy: { createdAt: "asc" },
    });

    // Get 24h check counts per monitor
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const stats = await Promise.all(
      monitors.map(async (m) => {
        const [total, upCount, last24h] = await Promise.all([
          prisma.uptimeCheckResult.count({ where: { monitorId: m.id } }),
          prisma.uptimeCheckResult.count({ where: { monitorId: m.id, status: { in: ["UP", "WARNING"] } } }),
          prisma.uptimeCheckResult.findMany({
            where: { monitorId: m.id, checkedAt: { gte: since24h } },
            orderBy: { checkedAt: "desc" },
            select: { status: true, responseMs: true, checkedAt: true },
            take: 288, // 24h at 5min interval
          }),
        ]);

        const uptime24h =
          last24h.length === 0
            ? null
            : Math.round(
                (last24h.filter((r) => r.status === "UP" || r.status === "WARNING").length / last24h.length) * 10000
              ) / 100;

        const avgResponse =
          last24h.length === 0
            ? null
            : Math.round(
                last24h.filter((r) => r.responseMs !== null).reduce((s, r) => s + (r.responseMs ?? 0), 0) /
                  (last24h.filter((r) => r.responseMs !== null).length || 1)
              );

        return {
          ...m,
          totalChecks: total,
          totalUp: upCount,
          uptime24h,
          avgResponseMs: avgResponse,
          recentChecks: last24h.slice(0, 60),
        };
      })
    );

    return NextResponse.json({ monitors: stats });
  } catch (err: any) {
    console.error("[Uptime GET] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

function validateAndCleanMonitorInput(
  item: any,
  globalWarningThreshold: number,
  globalTimeout: number
) {
  const {
    name,
    checkType,
    target,
    port,
    intervalSeconds,
    timeoutMs,
    warningThresholdMs,
    expectedStatus,
    keyword,
    category,
  } = item;

  if (!name || !checkType || !target) {
    throw new Error("Nama layanan, tipe pengujian, dan target host/URL harus diisi");
  }

  const validTypes = ["HTTP", "HTTPS", "PING", "TCP_PORT"];
  if (!validTypes.includes(checkType)) {
    throw new Error(`Tipe pengujian '${checkType}' tidak valid`);
  }

  const parsedPort = port ? parseInt(port) : null;
  if (checkType === "TCP_PORT" && (!parsedPort || parsedPort < 1 || parsedPort > 65535)) {
    throw new Error(`TCP_PORT pada '${name}' memerlukan port yang valid (1-65535)`);
  }

  const validCategories = ["Web Server", "Application Server", "Database Server (ERP)"];
  const finalCategory = validCategories.includes(category) ? category : "Web Server";

  let cleanTarget = String(target).trim();
  if (checkType === "HTTP" || checkType === "HTTPS") {
    if (
      cleanTarget.includes("://") &&
      !cleanTarget.startsWith("http://") &&
      !cleanTarget.startsWith("https://")
    ) {
      throw new Error(`Target URL '${cleanTarget}' harus berprotokol HTTP atau HTTPS`);
    }
    if (!cleanTarget.startsWith("http://") && !cleanTarget.startsWith("https://")) {
      cleanTarget = `${checkType.toLowerCase()}://${cleanTarget}`;
    }
    try {
      const parsed = new URL(cleanTarget);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`Target URL '${cleanTarget}' harus berprotokol HTTP atau HTTPS`);
      }
    } catch {
      throw new Error(`Format URL '${cleanTarget}' tidak valid`);
    }
  } else {
    if (cleanTarget.startsWith("-") || !/^[a-zA-Z0-9.:_-]+$/.test(cleanTarget)) {
      throw new Error(`Format target host/IP '${cleanTarget}' tidak valid`);
    }
  }

  return {
    name: String(name).trim(),
    category: finalCategory,
    checkType,
    target: cleanTarget,
    port: parsedPort,
    intervalSeconds: Math.max(60, parseInt(intervalSeconds) || 300),
    timeoutMs: Math.max(1000, Math.min(30000, parseInt(timeoutMs) || globalTimeout)),
    warningThresholdMs:
      warningThresholdMs !== undefined && warningThresholdMs !== null && warningThresholdMs !== ""
        ? Math.max(100, Math.min(30000, parseInt(warningThresholdMs)))
        : globalWarningThreshold,
    expectedStatus: expectedStatus ? parseInt(expectedStatus) : null,
    keyword: keyword ? String(keyword).trim() : null,
  };
}

// POST /api/uptime/monitors — create a new monitor or batch monitors
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = (session.user as any)?.role;
    if (role !== "ADMIN" && role !== "NOC_OPERATOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    // Support both single object and batch array / { monitors: [...] }
    const isBatch = Array.isArray(body) || (body.monitors && Array.isArray(body.monitors));
    const rawItems: any[] = isBatch
      ? (Array.isArray(body) ? body : body.monitors)
      : [body];

    if (rawItems.length === 0) {
      return NextResponse.json({ error: "Daftar monitor tidak boleh kosong" }, { status: 400 });
    }

    const prtgSetting = await prisma.prtgSetting.findFirst({ where: { id: 1 } });
    const globalWarningThreshold = prtgSetting?.uptimeWarningLatencyMs ?? 1000;
    const globalTimeout = prtgSetting?.uptimeTimeoutMs ?? 5000;

    const validatedData = rawItems.map((item, idx) => {
      try {
        return validateAndCleanMonitorInput(item, globalWarningThreshold, globalTimeout);
      } catch (err: any) {
        throw new Error(isBatch ? `Baris ${idx + 1}: ${err.message}` : err.message);
      }
    });

    // Create in database transaction
    const createdMonitors = await prisma.$transaction(
      validatedData.map((data) => prisma.uptimeMonitor.create({ data }))
    );

    // Trigger immediate first check for all created monitors (non-blocking)
    for (const monitor of createdMonitors) {
      runSingleUptimeCheck(monitor.id).catch((err) => {
        console.warn("[Uptime] First check failed for new monitor:", monitor.id, err.message);
      });
    }

    if (isBatch) {
      return NextResponse.json(
        { success: true, count: createdMonitors.length, monitors: createdMonitors },
        { status: 201 }
      );
    }

    return NextResponse.json({ monitor: createdMonitors[0] }, { status: 201 });
  } catch (err: any) {
    console.error("[Uptime POST] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 400 });
  }
}
