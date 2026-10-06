import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { stripHtml, parseNumericValue } from "@/lib/utils";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowedProbes = (session.user as any).allowedProbes as string[];
    const hasFullAccess = allowedProbes.includes("*");

    // Fetch all sensors with probe filtering
    const sensors = await prisma.sensor.findMany({
      where: {
        isActive: true,
        ...(hasFullAccess
          ? {}
          : { probeName: { in: allowedProbes } }),
      },
      orderBy: [
        { lastStatus: "asc" }, // Down first, then Warning, then OK
        { lastUpdated: "desc" },
      ],
    });

    // Build summary
    const summary = {
      total: sensors.length,
      ok: sensors.filter((s) => s.lastStatus === "OK").length,
      warning: sensors.filter((s) => s.lastStatus === "Warning").length,
      down: sensors.filter((s) => s.lastStatus === "Down").length,
      paused: sensors.filter((s) => s.lastStatus === "Paused").length,
      active: sensors.filter((s) => s.lastStatus !== "Paused").length,
    };

    // Helper to resolve device category/group
    function resolveDeviceCategory(probeName: string, deviceName: string, rawGroupName?: string): string {
      if (rawGroupName && rawGroupName !== "Servers" && rawGroupName !== probeName && rawGroupName !== "Root" && rawGroupName !== "General") {
        return rawGroupName;
      }
      const dev = deviceName.toLowerCase();
      if (dev.includes("database") || dev.includes("db") || dev.includes("sql")) return "Database Server";
      if (dev.includes("web") || (dev.includes("ubuntu") && !dev.includes("15")) || dev.includes("windows")) return "Web Server";
      if (dev.includes("15") || dev.includes("additional")) return "Additional Server";
      if (dev.includes("prtg") || dev.includes("probe")) return "PRTG & Infrastructure";
      return rawGroupName || "General";
    }

    // Group by probe
    const probeMap = new Map<string, typeof sensors>();
    for (const sensor of sensors) {
      const group = probeMap.get(sensor.probeName) || [];
      group.push(sensor);
      probeMap.set(sensor.probeName, group);
    }

    const probes = Array.from(probeMap.entries()).map(
      ([probeName, probeSensors]) => {
        // Group by device within probe
        const deviceMap = new Map<string, typeof probeSensors>();
        for (const sensor of probeSensors) {
          const group = deviceMap.get(sensor.deviceName) || [];
          group.push(sensor);
          deviceMap.set(sensor.deviceName, group);
        }

        const devices = Array.from(deviceMap.entries()).map(
          ([deviceName, deviceSensors]) => {
            const rawGroupName = deviceSensors[0]?.groupName;
            const category = resolveDeviceCategory(probeName, deviceName, rawGroupName);

            return {
              deviceName,
              groupName: category,
              sensors: deviceSensors.map((s) => ({
                id: s.id,
                sensorName: s.sensorName,
                sensorType: s.sensorType,
                lastStatus: s.lastStatus,
                lastValue: s.lastValue,
                lastMessage: stripHtml(s.lastMessage),
                lastUpdated: s.lastUpdated.toISOString(),
                consecutiveWarnings: s.consecutiveWarnings,
              })),
            };
          }
        );

        const groups = Array.from(new Set(devices.map((d) => d.groupName)));

        const probeSummary = {
          total: probeSensors.length,
          ok: probeSensors.filter((s) => s.lastStatus === "OK").length,
          warning: probeSensors.filter((s) => s.lastStatus === "Warning").length,
          down: probeSensors.filter((s) => s.lastStatus === "Down").length,
          paused: probeSensors.filter((s) => s.lastStatus === "Paused").length,
        };

        return { probeName, groups, devices, summary: probeSummary };
      }
    );

    // Site Summary Matrix
    const siteSummary = Array.from(probeMap.entries()).map(
      ([probeName, probeSensors]) => {
        const activeSensors = probeSensors.filter((s) => s.lastStatus !== "Paused");
        const total = activeSensors.length;
        const ok = activeSensors.filter((s) => s.lastStatus === "OK").length;
        const warning = activeSensors.filter((s) => s.lastStatus === "Warning").length;
        const down = activeSensors.filter((s) => s.lastStatus === "Down").length;
        const healthPct = total > 0 ? (ok / total) * 100 : 100;
        const slaUptimePct = total > 0 ? ((total - down) / total) * 100 : 100;
        return { probeName, total, ok, warning, down, healthPct, slaUptimePct };
      }
    );

    // Recent alerts (non-OK sensors) with sanitized messages
    const recentAlerts = sensors
      .filter((s) => s.lastStatus === "Down" || s.lastStatus === "Warning")
      .sort((a, b) => {
        if (a.lastStatus === "Down" && b.lastStatus !== "Down") return -1;
        if (a.lastStatus !== "Down" && b.lastStatus === "Down") return 1;
        return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
      })
      .slice(0, 30)
      .map((s) => ({
        id: s.id,
        deviceName: s.deviceName,
        sensorName: s.sensorName,
        sensorType: s.sensorType,
        lastStatus: s.lastStatus,
        lastValue: s.lastValue,
        lastMessage: stripHtml(s.lastMessage),
        lastUpdated: s.lastUpdated.toISOString(),
        probeName: s.probeName,
      }));

    // BSS Business Portals & Web Applications
    const businessPortals = sensors
      .filter((s) => {
        const name = s.sensorName.toLowerCase();
        return (
          name.includes("binasaranasukses.co.id") ||
          name.includes("binasaranasukses.com") ||
          name.includes("smartform") ||
          name.includes("helpdesk") ||
          name.includes("elearning") ||
          name.includes("portal")
        );
      })
      .map((s) => {
        let cleanName = s.sensorName.replace(/\.binasaranasukses\.co\.id$/i, "").toUpperCase();
        if (cleanName === "BINASARANASUKSES.CO.ID") cleanName = "MAIN CORPORATE PORTAL";
        const latency = parseNumericValue(s.lastValue || "");

        return {
          id: s.id,
          name: cleanName,
          domain: s.sensorName,
          deviceName: s.deviceName,
          probeName: s.probeName,
          status: s.lastStatus,
          lastValue: s.lastValue,
          latencyMs: latency,
          lastUpdated: s.lastUpdated.toISOString(),
        };
      })
      .sort((a, b) => (b.latencyMs || 0) - (a.latencyMs || 0));

    // Storage & Capacity Watchlist (Disk sensors - hanya sensor aktif)
    const storageWatchlist = sensors
      .filter((s) => {
        if (s.lastStatus === "Paused") return false;
        const name = s.sensorName.toLowerCase();
        return name.includes("disk") || name.includes("free space") || name.includes("drive");
      })
      .map((s) => {
        const isPercent = s.lastValue?.includes("%") ?? false;
        const numValue = parseNumericValue(s.lastValue || "");
        const freePct = isPercent ? numValue : null;

        // Disk alert is high priority if status is not OK or free % <= 25%
        const isWarning = s.lastStatus === "Warning" || (freePct !== null && freePct <= 25);
        const isDown = s.lastStatus === "Down" || (freePct !== null && freePct <= 10);

        return {
          id: s.id,
          sensorName: s.sensorName,
          deviceName: s.deviceName,
          probeName: s.probeName,
          status: s.lastStatus,
          lastValue: s.lastValue || "-",
          freePct,
          isWarning,
          isDown,
          lastMessage: stripHtml(s.lastMessage),
          lastUpdated: s.lastUpdated.toISOString(),
        };
      })
      .sort((a, b) => {
        // Warning/Down first, then lowest percentage
        if (a.isDown && !b.isDown) return -1;
        if (!a.isDown && b.isDown) return 1;
        if (a.isWarning && !b.isWarning) return -1;
        if (!a.isWarning && b.isWarning) return 1;
        if (a.freePct !== null && b.freePct !== null) return a.freePct - b.freePct;
        return 0;
      });

    // Calculate SLA Ketersediaan (Uptime): Hanya status Down yang mengurangi ketersediaan.
    // Sensor yang di-Paused (maintenance) dikeluarkan dari pembagi.
    const activeTotal = summary.total - summary.paused;
    const slaUptime = activeTotal > 0
      ? ((activeTotal - summary.down) / activeTotal) * 100
      : 100;

    // Health Score: Mengukur persentase sensor aktif yang optimal (OK)
    const healthScore = activeTotal > 0
      ? (summary.ok / activeTotal) * 100
      : 100;

    // Average response time from Ping / HTTP sensors
    const latencySensors = sensors.filter(
      (s) => (s.sensorType === "Ping" || s.sensorName.includes(".co.id")) && s.lastValue
    );
    let avgResponseTime = 0;
    if (latencySensors.length > 0) {
      const totalMs = latencySensors.reduce((acc, s) => {
        const val = parseNumericValue(s.lastValue || "");
        return acc + (val || 0);
      }, 0);
      avgResponseTime = totalMs / latencySensors.length;
    }

    const incidentCount = summary.warning + summary.down;

    // Distinct list of categories across all probes
    const availableCategories = Array.from(
      new Set(
        sensors.map((s) => resolveDeviceCategory(s.probeName, s.deviceName, s.groupName))
      )
    );

    return NextResponse.json({
      summary,
      probes,
      availableCategories,
      siteSummary,
      recentAlerts,
      businessPortals,
      storageWatchlist,
      slaUptime,
      healthScore,
      avgResponseTime,
      incidentCount,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
