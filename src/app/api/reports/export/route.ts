import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import * as XLSX from "xlsx";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
    const format = searchParams.get("format") || "csv";

    const now = new Date();
    const startDate = startDateParam ? new Date(startDateParam) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const endDate = endDateParam ? new Date(`${endDateParam}T23:59:59.999Z`) : now;

    // RBAC probe filtering
    const allowedProbes = (session.user as any)?.allowedProbes as string[] | undefined;
    const hasWildcard = allowedProbes?.includes("*");

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

    const sensorIds = sensors.map((s) => s.id);

    const metricAggs = await prisma.sensorMetricHistory.groupBy({
      by: ["sensorId"],
      where: {
        sensorId: { in: sensorIds },
        recordedAt: { gte: startDate, lte: endDate },
      },
      _avg: { metricValue: true },
      _min: { metricValue: true },
      _max: { metricValue: true },
      _count: { _all: true },
    });

    const statusCounts = await prisma.sensorMetricHistory.groupBy({
      by: ["sensorId", "status"],
      where: {
        sensorId: { in: sensorIds },
        recordedAt: { gte: startDate, lte: endDate },
      },
      _count: { _all: true },
    });

    const statusMap = new Map<number, { ok: number; warning: number; down: number; paused: number; totalActive: number }>();
    for (const sc of statusCounts) {
      if (!statusMap.has(sc.sensorId)) {
        statusMap.set(sc.sensorId, { ok: 0, warning: 0, down: 0, paused: 0, totalActive: 0 });
      }
      const entry = statusMap.get(sc.sensorId)!;
      if (sc.status === "OK") {
        entry.ok += sc._count._all;
        entry.totalActive += sc._count._all;
      } else if (sc.status === "Warning") {
        entry.warning += sc._count._all;
        entry.totalActive += sc._count._all;
      } else if (sc.status === "Down") {
        entry.down += sc._count._all;
        entry.totalActive += sc._count._all;
      } else if (sc.status === "Paused") {
        entry.paused += sc._count._all;
        // Paused tidak dihitung ke totalActive agar tidak mengurangi SLA uptime
      }
    }

    const aggMap = new Map(metricAggs.map((a) => [a.sensorId, a]));

    const rows = sensors.map((sensor) => {
      const agg = aggMap.get(sensor.id);
      const counts = statusMap.get(sensor.id) || { ok: 0, warning: 0, down: 0, paused: 0, totalActive: 0 };
      const avg = agg?._avg.metricValue ? Math.round(agg._avg.metricValue * 100) / 100 : 0;
      const min = agg?._min.metricValue ? Math.round(agg._min.metricValue * 100) / 100 : 0;
      const max = agg?._max.metricValue ? Math.round(agg._max.metricValue * 100) / 100 : 0;

      let unit = "";
      if (sensor.lastValue) {
        const parts = sensor.lastValue.trim().split(" ");
        if (parts.length > 1) unit = parts.slice(1).join(" ");
      }

      // SLA Uptime: Ketersediaan murni (Hanya Down yang memotong Uptime, Paused diabaikan)
      const uptimePct = counts.totalActive > 0
        ? (((counts.totalActive - counts.down) / counts.totalActive) * 100).toFixed(2)
        : "100.00";
      // Health Score: Persentase pengukuran yang murni prima (OK)
      const healthPct = counts.totalActive > 0
        ? ((counts.ok / counts.totalActive) * 100).toFixed(2)
        : "100.00";

      return {
        id: sensor.id,
        probe: sensor.probeName,
        device: sensor.deviceName,
        sensor: sensor.sensorName,
        type: sensor.sensorType,
        avg,
        min,
        max,
        unit,
        uptime: `${uptimePct}%`,
        healthScore: `${healthPct}%`,
        okCount: counts.ok,
        warningCount: counts.warning,
        downCount: counts.down,
        pausedCount: counts.paused,
        lastStatus: sensor.lastStatus,
      };
    });

    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    // CSV format
    if (format === "csv") {
      const headers = [
        "Sensor ID",
        "Site / Probe",
        "Device",
        "Sensor Name",
        "Sensor Type",
        "Average Value",
        "Min Value",
        "Max Value",
        "Unit",
        "SLA Uptime",
        "Health Score",
        "OK Count",
        "Warning Count",
        "Down Count",
        "Current Status",
      ];

      const csvLines = [
        headers.join(","),
        ...rows.map((r) =>
          [
            r.id,
            `"${r.probe.replace(/"/g, '""')}"`,
            `"${r.device.replace(/"/g, '""')}"`,
            `"${r.sensor.replace(/"/g, '""')}"`,
            `"${r.type.replace(/"/g, '""')}"`,
            r.avg,
            r.min,
            r.max,
            `"${r.unit}"`,
            `"${r.uptime}"`,
            `"${r.healthScore}"`,
            r.okCount,
            r.warningCount,
            r.downCount,
            `"${r.lastStatus}"`,
          ].join(",")
        ),
      ];

      return new NextResponse(csvLines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="bss-report-${startStr}-to-${endStr}.csv"`,
        },
      });
    }

    // Excel XLSX format
    if (format === "xlsx") {
      const wb = XLSX.utils.book_new();

      const excelData = rows.map((r) => ({
        "ID": r.id,
        "Site / Probe": r.probe,
        "Device": r.device,
        "Sensor Name": r.sensor,
        "Type": r.type,
        "Average": r.avg,
        "Minimum": r.min,
        "Maximum": r.max,
        "Unit": r.unit,
        "SLA Uptime": r.uptime,
        "Health Score": r.healthScore,
        "OK": r.okCount,
        "Warning": r.warningCount,
        "Down": r.downCount,
        "Status": r.lastStatus,
      }));

      const ws = XLSX.utils.json_to_sheet(excelData);
      XLSX.utils.book_append_sheet(wb, ws, "Sensor Metrics");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      return new NextResponse(buf, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="bss-report-${startStr}-to-${endStr}.xlsx"`,
        },
      });
    }

    // PDF / HTML Printable Report with official BSS Letterhead
    const totalSensors = rows.length;
    const okTotal = rows.reduce((acc, r) => acc + r.okCount, 0);
    const measureTotal = rows.reduce((acc, r) => acc + r.okCount + r.warningCount + r.downCount, 0);
    const totalWarnings = rows.reduce((acc, r) => acc + r.warningCount, 0);
    const totalDowns = rows.reduce((acc, r) => acc + r.downCount, 0);
    // SLA Uptime: Ketersediaan (hanya down yang memotong ketersediaan)
    const overallSla = measureTotal > 0 ? (((measureTotal - totalDowns) / measureTotal) * 100).toFixed(2) : "100.00";
    // Health Score: Rasio pengukuran yang murni OK
    const overallHealth = measureTotal > 0 ? ((okTotal / measureTotal) * 100).toFixed(2) : "100.00";

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Laporan Infrastruktur Server - PT. Bina Sarana Sukses</title>
  <style>
    @page { size: A4 portrait; margin: 15mm 15mm 20mm 15mm; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; margin: 0; padding: 20px; font-size: 12px; }
    .header-table { width: 100%; border-bottom: 3px double #0284c7; padding-bottom: 12px; margin-bottom: 20px; }
    .logo-box { font-size: 24px; font-weight: 800; color: #0284c7; letter-spacing: -1px; }
    .company-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
    .report-title { font-size: 16px; font-weight: 700; color: #0f172a; text-align: right; text-transform: uppercase; letter-spacing: 0.5px; }
    .report-meta { font-size: 11px; color: #64748b; text-align: right; margin-top: 4px; }
    .kpi-row { display: flex; gap: 12px; margin-bottom: 20px; }
    .kpi-box { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; text-align: center; }
    .kpi-label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .kpi-val { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 4px; }
    .status-badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px; }
    .status-ok { background: #dcfce7; color: #166534; }
    .status-warn { background: #fef3c7; color: #92400e; }
    .status-down { background: #fee2e2; color: #991b1b; }
    .status-paused { background: #e0f2fe; color: #0284c7; }
    table.data-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
    table.data-table th { background: #0f172a; color: #ffffff; text-align: left; padding: 8px 10px; font-weight: 600; border: 1px solid #334155; }
    table.data-table td { padding: 6px 10px; border: 1px solid #e2e8f0; }
    table.data-table tr:nth-child(even) { background: #f8fafc; }
    .footer-sign { margin-top: 40px; width: 100%; display: flex; justify-content: space-between; page-break-inside: avoid; }
    .sign-box { text-align: center; width: 200px; }
    .sign-line { border-bottom: 1px solid #94a3b8; height: 60px; margin-bottom: 6px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; text-align: right;">
    <button onclick="window.print()" style="background: #0284c7; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">🖨️ Cetak / Simpan sebagai PDF</button>
  </div>

  <table class="header-table">
    <tr>
      <td style="vertical-align: middle;">
        <div class="logo-box">PT. BINA SARANA SUKSES</div>
        <div class="company-sub">Divisi Teknologi Informasi & Infrastruktur Jaringan</div>
        <div class="company-sub">Sistem Monitoring Terpusat: Dashboard-Server (PRTG Integrated)</div>
      </td>
      <td style="vertical-align: middle;">
        <div class="report-title">LAPORAN KINERJA INFRASTRUKTUR</div>
        <div class="report-meta">Periode: <strong>${startStr}</strong> s/d <strong>${endStr}</strong></div>
        <div class="report-meta">Dicetak oleh: <strong>${escapeHtml(session.user?.name || "System")}</strong> (${escapeHtml((session.user as any)?.role || "USER")})</div>
        <div class="report-meta">Tanggal Cetak: ${now.toLocaleString("id-ID")}</div>
      </td>
    </tr>
  </table>

  <div class="kpi-row">
    <div class="kpi-box">
      <div class="kpi-label">Total Sensor Terpantau</div>
      <div class="kpi-val">${totalSensors}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">SLA Uptime (Ketersediaan)</div>
      <div class="kpi-val" style="color: #16a34a;">${overallSla}%</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Health Score (Prima)</div>
      <div class="kpi-val" style="color: #0284c7;">${overallHealth}%</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Peringatan (Warning)</div>
      <div class="kpi-val" style="color: #d97706;">${totalWarnings.toLocaleString()}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Insiden Kritis (Down)</div>
      <div class="kpi-val" style="color: #dc2626;">${totalDowns.toLocaleString()}</div>
    </div>
  </div>

  <h3 style="margin-top: 24px; margin-bottom: 8px; color: #0f172a; font-size: 13px;">Daftar Status Sensor & Metrik Perangkat</h3>
  <table class="data-table">
    <thead>
      <tr>
        <th>Probe / Site</th>
        <th>Perangkat</th>
        <th>Sensor</th>
        <th>Tipe</th>
        <th>Rata-rata</th>
        <th>Maksimum</th>
        <th>SLA Uptime</th>
        <th>Health Score</th>
        <th>Status Terakhir</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (r) => `<tr>
        <td><strong>${escapeHtml(r.probe)}</strong></td>
        <td>${escapeHtml(r.device)}</td>
        <td>${escapeHtml(r.sensor)}</td>
        <td>${escapeHtml(r.type)}</td>
        <td>${r.avg} ${escapeHtml(r.unit)}</td>
        <td>${r.max} ${escapeHtml(r.unit)}</td>
        <td>${r.uptime}</td>
        <td>${r.healthScore}</td>
        <td>
          <span class="status-badge ${
            r.lastStatus === "OK"
              ? "status-ok"
              : r.lastStatus === "Warning"
              ? "status-warn"
              : r.lastStatus === "Paused"
              ? "status-paused"
              : "status-down"
          }">
            ${escapeHtml(r.lastStatus)}
          </span>
        </td>
      </tr>`
        )
        .join("")}
    </tbody>
  </table>

  <div class="footer-sign">
    <div class="sign-box">
      <div>Dibuat oleh,</div>
      <div class="sign-line"></div>
      <div><strong>${escapeHtml(session.user?.name || "NOC Operator")}</strong></div>
      <div style="font-size: 10px; color: #64748b;">IT Infrastructure Specialist</div>
    </div>
    <div class="sign-box">
      <div>Disetujui oleh,</div>
      <div class="sign-line"></div>
      <div><strong>Manager IT</strong></div>
      <div style="font-size: 10px; color: #64748b;">PT. Bina Sarana Sukses</div>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="bss-report-${startStr}-to-${endStr}.html"`,
      },
    });
  } catch (error) {
    console.error("Error exporting report:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
