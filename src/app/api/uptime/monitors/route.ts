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

// POST /api/uptime/monitors — create a new monitor
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = (session.user as any)?.role;
    if (role !== "ADMIN" && role !== "NOC_OPERATOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, checkType, target, port, intervalSeconds, timeoutMs, warningThresholdMs, expectedStatus, keyword, category } = body;

    if (!name || !checkType || !target) {
      return NextResponse.json({ error: "name, checkType, and target are required" }, { status: 400 });
    }

    const validTypes = ["HTTP", "HTTPS", "PING", "TCP_PORT"];
    if (!validTypes.includes(checkType)) {
      return NextResponse.json({ error: "Invalid checkType" }, { status: 400 });
    }

    if (checkType === "TCP_PORT" && (!port || port < 1 || port > 65535)) {
      return NextResponse.json({ error: "TCP_PORT check requires a valid port (1-65535)" }, { status: 400 });
    }

    const validCategories = ["Web Server", "Application Server", "Database Server (ERP)"];
    const finalCategory = validCategories.includes(category) ? category : "Web Server";

    let cleanTarget = target.trim();
    if (checkType === "HTTP" || checkType === "HTTPS") {
      // Tolak jika sudah membawa protokol selain http/https (misal file://, javascript://, ftp://)
      if (cleanTarget.includes("://") && !cleanTarget.startsWith("http://") && !cleanTarget.startsWith("https://")) {
        return NextResponse.json({ error: "Target URL harus berprotokol HTTP atau HTTPS" }, { status: 400 });
      }
      if (!cleanTarget.startsWith("http://") && !cleanTarget.startsWith("https://")) {
        cleanTarget = `${checkType.toLowerCase()}://${cleanTarget}`;
      }
      try {
        const parsed = new URL(cleanTarget);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return NextResponse.json({ error: "Target URL harus berprotokol HTTP atau HTTPS" }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: "Format URL tidak valid" }, { status: 400 });
      }
    } else {
      if (cleanTarget.startsWith("-") || !/^[a-zA-Z0-9.:_-]+$/.test(cleanTarget)) {
        return NextResponse.json({ error: "Format target host/IP tidak valid" }, { status: 400 });
      }
    }

    const prtgSetting = await prisma.prtgSetting.findFirst({ where: { id: 1 } });
    const globalWarningThreshold = prtgSetting?.uptimeWarningLatencyMs ?? 1000;
    const globalTimeout = prtgSetting?.uptimeTimeoutMs ?? 5000;

    const monitor = await prisma.uptimeMonitor.create({
      data: {
        name: name.trim(),
        category: finalCategory,
        checkType,
        target: cleanTarget,
        port: port ? parseInt(port) : null,
        intervalSeconds: Math.max(60, parseInt(intervalSeconds) || 300),
        timeoutMs: Math.max(1000, Math.min(30000, parseInt(timeoutMs) || globalTimeout)),
        warningThresholdMs:
          warningThresholdMs !== undefined && warningThresholdMs !== null && warningThresholdMs !== ""
            ? Math.max(100, Math.min(30000, parseInt(warningThresholdMs)))
            : globalWarningThreshold,
        expectedStatus: expectedStatus ? parseInt(expectedStatus) : null,
        keyword: keyword?.trim() || null,
      },
    });

    // Run immediate first check (non-blocking)
    runSingleUptimeCheck(monitor.id).catch((err) => {
      console.warn("[Uptime] First check failed for new monitor:", err.message);
    });

    // Return immediately without waiting for the check
    return NextResponse.json({ monitor }, { status: 201 });
  } catch (err: any) {
    console.error("[Uptime POST] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
