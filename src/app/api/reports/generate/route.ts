import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { SensorStatus } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const probeFilter = searchParams.get("probe") || "all";
    const sensorTypeFilter = searchParams.get("sensorType") || "all";

    const now = new Date();
    const startDate = startDateParam ? new Date(startDateParam) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const endDate = endDateParam ? new Date(`${endDateParam}T23:59:59.999Z`) : now;

    // RBAC probe filtering
    const allowedProbes = (session.user as any)?.allowedProbes as string[] | undefined;
    const hasWildcard = allowedProbes?.includes("*");

    // Build sensor query
    const sensorWhere: any = { isActive: true };
    if (!hasWildcard && allowedProbes && allowedProbes.length > 0) {
      sensorWhere.probeName = { in: allowedProbes };
    }
    if (probeFilter !== "all") {
      sensorWhere.probeName = probeFilter;
    }
    if (sensorTypeFilter !== "all") {
      sensorWhere.sensorType = sensorTypeFilter;
    }

    const sensors = await prisma.sensor.findMany({
      where: sensorWhere,
      orderBy: [{ probeName: "asc" }, { deviceName: "asc" }, { sensorName: "asc" }],
    });

    if (sensors.length === 0) {
      return NextResponse.json({
        summary: {
          totalSensors: 0,
          slaUptime: 100,
          healthScore: 100,
          avgValue: 0,
          peakValue: 0,
          incidentCount: 0,
          warningCount: 0,
          downCount: 0,
        },
        perSite: [],
        perSensor: [],
      });
    }

    const sensorIds = sensors.map((s) => s.id);

    // Aggregate metrics using Prisma groupBy
    const metricAggs = await prisma.sensorMetricHistory.groupBy({
      by: ["sensorId"],
      where: {
        sensorId: { in: sensorIds },
        recordedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _avg: { metricValue: true },
      _min: { metricValue: true },
      _max: { metricValue: true },
      _count: { _all: true },
    });

    // Count status occurrences per sensor
    const statusCounts = await prisma.sensorMetricHistory.groupBy({
      by: ["sensorId", "status"],
      where: {
        sensorId: { in: sensorIds },
        recordedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _count: { _all: true },
    });

    const statusMap = new Map<number, { ok: number; warning: number; down: number; other: number }>();
    for (const sc of statusCounts) {
      if (!statusMap.has(sc.sensorId)) {
        statusMap.set(sc.sensorId, { ok: 0, warning: 0, down: 0, other: 0 });
      }
      const entry = statusMap.get(sc.sensorId)!;
      if (sc.status === SensorStatus.OK) {
        entry.ok += sc._count._all;
      } else if (sc.status === SensorStatus.Warning) {
        entry.warning += sc._count._all;
      } else if (sc.status === SensorStatus.Down) {
        entry.down += sc._count._all;
      } else {
        entry.other += sc._count._all;
      }
    }

    const aggMap = new Map(metricAggs.map((a) => [a.sensorId, a]));

    // Construct perSensor data
    let totalAllMetrics = 0;
    let totalOkMetrics = 0;
    let totalWarningMetrics = 0;
    let totalDownMetrics = 0;
    let sumValues = 0;
    let countValues = 0;
    let overallPeak = 0;

    const perSensor = sensors.map((sensor) => {
      const agg = aggMap.get(sensor.id);
      const counts = statusMap.get(sensor.id) || { ok: 0, warning: 0, down: 0, other: 0 };
      const avg = agg?._avg.metricValue ? Math.round(agg._avg.metricValue * 100) / 100 : 0;
      const min = agg?._min.metricValue ? Math.round(agg._min.metricValue * 100) / 100 : 0;
      const max = agg?._max.metricValue ? Math.round(agg._max.metricValue * 100) / 100 : 0;

      let unit = "";
      if (sensor.lastValue) {
        const parts = sensor.lastValue.trim().split(" ");
        if (parts.length > 1) {
          unit = parts.slice(1).join(" ");
        }
      }

      // Hanya metrik aktif (OK, Warning, Down) yang dihitung ke total SLA pengujian
      totalAllMetrics += counts.ok + counts.warning + counts.down;
      totalOkMetrics += counts.ok;
      totalWarningMetrics += counts.warning;
      totalDownMetrics += counts.down;
      if (agg?._avg.metricValue !== null && agg?._avg.metricValue !== undefined) {
        sumValues += agg._avg.metricValue;
        countValues++;
      }
      if (max > overallPeak) overallPeak = max;

      const sensorActive = counts.ok + counts.warning + counts.down;
      const sensorSla = sensorActive > 0
        ? Math.round(((sensorActive - counts.down) / sensorActive) * 10000) / 100
        : 100;
      const sensorHealth = sensorActive > 0
        ? Math.round((counts.ok / sensorActive) * 10000) / 100
        : 100;

      return {
        sensorId: sensor.id,
        probeName: sensor.probeName,
        deviceName: sensor.deviceName,
        sensorName: sensor.sensorName,
        sensorType: sensor.sensorType,
        avgValue: avg,
        minValue: min,
        maxValue: max,
        unit,
        slaUptime: sensorSla,
        healthScore: sensorHealth,
        okCount: counts.ok,
        warningCount: counts.warning,
        downCount: counts.down,
      };
    });

    // Construct perSite data
    const sitesMap = new Map<
      string,
      {
        probeName: string;
        sensorCount: number;
        okCount: number;
        totalCount: number;
        warningCount: number;
        downCount: number;
        sumAvg: number;
        peak: number;
      }
    >();

    for (const ps of perSensor) {
      if (!sitesMap.has(ps.probeName)) {
        sitesMap.set(ps.probeName, {
          probeName: ps.probeName,
          sensorCount: 0,
          okCount: 0,
          totalCount: 0,
          warningCount: 0,
          downCount: 0,
          sumAvg: 0,
          peak: 0,
        });
      }
      const s = sitesMap.get(ps.probeName)!;
      s.sensorCount++;
      s.okCount += ps.okCount;
      s.warningCount += ps.warningCount;
      s.downCount += ps.downCount;
      s.totalCount += ps.okCount + ps.warningCount + ps.downCount;
      s.sumAvg += ps.avgValue;
      if (ps.maxValue > s.peak) s.peak = ps.maxValue;
    }

    const perSite = Array.from(sitesMap.values()).map((s) => {
      const activeTotal = s.okCount + s.warningCount + s.downCount;
      // SLA Uptime: Ketersediaan (hanya down yang memotong ketersediaan)
      const slaUptime = activeTotal > 0
        ? Math.round(((activeTotal - s.downCount) / activeTotal) * 10000) / 100
        : 100;
      // Health Score: Persentase pengukuran yang murni prima / OK
      const healthScore = activeTotal > 0
        ? Math.round((s.okCount / activeTotal) * 10000) / 100
        : 100;

      return {
        probeName: s.probeName,
        sensorCount: s.sensorCount,
        slaUptime,
        healthScore,
        avgValue: s.sensorCount > 0 ? Math.round((s.sumAvg / s.sensorCount) * 100) / 100 : 0,
        peakValue: s.peak,
        warningCount: s.warningCount,
        downCount: s.downCount,
        incidentCount: s.downCount, // Hanya down yang dihitung insiden downtime
      };
    });

    const totalMeasurements = totalAllMetrics > 0 ? totalAllMetrics : 1;
    // SLA Uptime: Ketersediaan murni (Total Aktif - Down) / Total Aktif
    const overallSla = Math.round(((totalMeasurements - totalDownMetrics) / totalMeasurements) * 10000) / 100;
    // Health Score: Rasio pengukuran yang murni OK
    const overallHealthScore = Math.round((totalOkMetrics / totalMeasurements) * 10000) / 100;
    const overallAvg = countValues > 0 ? Math.round((sumValues / countValues) * 100) / 100 : 0;

    return NextResponse.json({
      summary: {
        totalSensors: sensors.length,
        slaUptime: overallSla,
        healthScore: overallHealthScore,
        avgValue: overallAvg,
        peakValue: overallPeak,
        incidentCount: totalDownMetrics, // Outages kritis
        warningCount: totalWarningMetrics,
        downCount: totalDownMetrics,
      },
      perSite,
      perSensor,
    });
  } catch (error) {
    console.error("Error generating report data:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
