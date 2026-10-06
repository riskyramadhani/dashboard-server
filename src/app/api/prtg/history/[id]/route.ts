import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const sensorId = parseInt(id);
    if (isNaN(sensorId)) {
      return NextResponse.json({ error: "Invalid sensor ID" }, { status: 400 });
    }

    const sensor = await prisma.sensor.findUnique({
      where: { id: sensorId },
    });

    if (!sensor) {
      return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
    }

    // RBAC check
    const allowedProbes = (session.user as any)?.allowedProbes as string[] | undefined;
    if (allowedProbes && !allowedProbes.includes("*") && !allowedProbes.includes(sensor.probeName)) {
      return NextResponse.json({ error: "Access denied for this probe" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "24h";

    const now = new Date();
    let startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    if (range === "1h") startTime = new Date(now.getTime() - 60 * 60 * 1000);
    else if (range === "6h") startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    else if (range === "24h") startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    else if (range === "7d") startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (range === "30d") startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const metrics = await prisma.sensorMetricHistory.findMany({
      where: {
        sensorId,
        recordedAt: { gte: startTime },
      },
      orderBy: { recordedAt: "asc" },
    });

    // Sample data points if there are too many points for smooth UI charting (e.g. max 150 points)
    const maxPoints = 120;
    let sampledMetrics = metrics;
    if (metrics.length > maxPoints) {
      const step = Math.ceil(metrics.length / maxPoints);
      sampledMetrics = metrics.filter((_, idx) => idx % step === 0 || idx === metrics.length - 1);
    }

    const formattedPoints = sampledMetrics.map((m) => ({
      time: m.recordedAt.toISOString(),
      displayTime:
        range === "1h" || range === "6h"
          ? m.recordedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
          : range === "24h"
          ? m.recordedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
          : m.recordedAt.toLocaleDateString("id-ID", { month: "short", day: "numeric", hour: "2-digit" }),
      value: Math.round(m.metricValue * 100) / 100,
      status: m.status,
    }));

    // Stats
    const values = metrics.map((m) => m.metricValue);
    const avg = values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : 0;
    const min = values.length > 0 ? Math.round(Math.min(...values) * 100) / 100 : 0;
    const max = values.length > 0 ? Math.round(Math.max(...values) * 100) / 100 : 0;

    return NextResponse.json({
      sensor,
      metrics: formattedPoints,
      stats: {
        avg,
        min,
        max,
        totalPoints: metrics.length,
      },
    });
  } catch (error: any) {
    console.error("Error fetching sensor history:", error);
    return NextResponse.json({ error: "Failed to load sensor history" }, { status: 500 });
  }
}
