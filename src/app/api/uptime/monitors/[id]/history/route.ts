import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/uptime/monitors/[id]/history — get check history for a monitor
export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const hours = Math.min(168, parseInt(searchParams.get("hours") || "24"));

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [monitor, results] = await Promise.all([
    prisma.uptimeMonitor.findUnique({ where: { id } }),
    prisma.uptimeCheckResult.findMany({
      where: { monitorId: id, checkedAt: { gte: since } },
      orderBy: { checkedAt: "asc" },
      select: {
        id: true,
        status: true,
        responseMs: true,
        statusCode: true,
        error: true,
        checkedAt: true,
      },
    }),
  ]);

  if (!monitor) return NextResponse.json({ error: "Monitor not found" }, { status: 404 });

  const upCount = results.filter((r) => r.status === "UP" || r.status === "WARNING").length;
  const warningCount = results.filter((r) => r.status === "WARNING").length;
  const downCount = results.filter((r) => r.status === "DOWN").length;
  const uptime = results.length === 0 ? null : Math.round((upCount / results.length) * 10000) / 100;

  const responseTimes = results
    .filter((r) => r.responseMs !== null)
    .map((r) => r.responseMs as number);

  const avgResponse =
    responseTimes.length === 0
      ? null
      : Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);

  const minResponse = responseTimes.length === 0 ? null : Math.min(...responseTimes);
  const maxResponse = responseTimes.length === 0 ? null : Math.max(...responseTimes);

  return NextResponse.json({
    monitor,
    results,
    stats: {
      total: results.length,
      upCount,
      warningCount,
      downCount,
      uptime,
      avgResponse,
      minResponse,
      maxResponse,
    },
  });
}
