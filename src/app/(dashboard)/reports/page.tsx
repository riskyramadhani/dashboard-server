"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  FileBarChart,
  Download,
  FileText,
  Calendar,
  Filter,
  TrendingUp,
  Clock,
  AlertTriangle,
  AlertOctagon,
  CheckCircle,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Period = "daily" | "weekly" | "monthly" | "custom";

interface ReportData {
  summary: {
    totalSensors: number;
    slaUptime: number;
    healthScore: number;
    avgValue: number;
    peakValue: number;
    incidentCount: number;
    warningCount: number;
    downCount: number;
  };
  perSite: {
    probeName: string;
    sensorCount: number;
    slaUptime: number;
    healthScore: number;
    avgValue: number;
    peakValue: number;
    warningCount: number;
    downCount: number;
    incidentCount: number;
  }[];
  perSensor: {
    sensorId: number;
    probeName: string;
    deviceName: string;
    sensorName: string;
    sensorType: string;
    avgValue: number;
    minValue: number;
    maxValue: number;
    unit: string;
    slaUptime?: number;
    healthScore?: number;
    okCount: number;
    warningCount: number;
    downCount: number;
  }[];
}

export default function ReportsPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "STAFF";

  const [period, setPeriod] = useState<Period>("weekly");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [selectedProbe, setSelectedProbe] = useState("all");
  const [selectedType, setSelectedType] = useState("all");

  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ["report", period, startDate, endDate, selectedProbe, selectedType],
    queryFn: async () => {
      const params = new URLSearchParams({
        period,
        startDate,
        endDate,
        probe: selectedProbe,
        sensorType: selectedType,
      });
      const res = await fetch(`/api/reports/generate?${params}`);
      if (!res.ok) throw new Error("Failed to generate report");
      return res.json();
    },
    refetchInterval: false,
  });

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    const now = new Date();
    switch (p) {
      case "daily":
        setStartDate(now.toISOString().split("T")[0]);
        setEndDate(now.toISOString().split("T")[0]);
        break;
      case "weekly":
        const w = new Date(now);
        w.setDate(w.getDate() - 7);
        setStartDate(w.toISOString().split("T")[0]);
        setEndDate(now.toISOString().split("T")[0]);
        break;
      case "monthly":
        const m = new Date(now);
        m.setDate(m.getDate() - 30);
        setStartDate(m.toISOString().split("T")[0]);
        setEndDate(now.toISOString().split("T")[0]);
        break;
    }
  };

  const handleExport = async (format: "csv" | "xlsx" | "pdf") => {
    const params = new URLSearchParams({
      period,
      startDate,
      endDate,
      probe: selectedProbe,
      sensorType: selectedType,
      format,
    });
    if (format === "pdf") {
      window.open(`/api/reports/export?${params}`, "_blank");
      return;
    }
    const res = await fetch(`/api/reports/export?${params}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bss-report-${startDate}-${endDate}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-noc-text-primary flex items-center gap-2">
            <FileBarChart className="w-7 h-7 text-brand-primary" />
            {role === "STAFF" ? "IT Performance Report" : "Sensor Reports & Analytics"}
          </h1>
          <p className="text-sm text-noc-text-muted mt-1">
            {role === "STAFF"
              ? "Infrastructure performance summary and SLA reporting"
              : "Detailed sensor metrics, aggregations, and trend analysis"}
          </p>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="glass-card p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-noc-text-muted" />
          <h2 className="text-sm font-semibold text-noc-text-primary">
            Report Filters
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Period Selector */}
          <div>
            <label className="block text-xs text-noc-text-muted mb-1.5 font-medium">
              Period
            </label>
            <div className="flex gap-1">
              {(["daily", "weekly", "monthly", "custom"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => handlePeriodChange(p)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize",
                    period === p
                      ? "bg-brand-primary text-white"
                      : "bg-noc-bg text-noc-text-secondary hover:bg-noc-hover"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-xs text-noc-text-muted mb-1.5 font-medium">
              Date Range
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-noc-bg border border-noc-border rounded-lg text-xs text-noc-text-primary focus:ring-2 focus:ring-brand-primary/50"
              />
              <Calendar className="w-3.5 h-3.5 text-noc-text-muted flex-shrink-0" />
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-noc-bg border border-noc-border rounded-lg text-xs text-noc-text-primary focus:ring-2 focus:ring-brand-primary/50"
              />
            </div>
          </div>

          {/* Site/Probe */}
          <div>
            <label className="block text-xs text-noc-text-muted mb-1.5 font-medium">
              Site / Probe
            </label>
            <select
              value={selectedProbe}
              onChange={(e) => setSelectedProbe(e.target.value)}
              className="w-full px-3 py-1.5 bg-noc-bg border border-noc-border rounded-lg text-xs text-noc-text-primary focus:ring-2 focus:ring-brand-primary/50"
            >
              <option value="all">All Sites</option>
              <option value="Local Probe - Server JKT">Local Probe - Server JKT</option>
              <option value="PROBE-BSSMHU">PROBE-BSSMHU</option>
              <option value="PROBE-BSSBAYAN">PROBE-BSSBAYAN</option>
              <option value="PROBE-BSSCDI">PROBE-BSSCDI</option>
              <option value="PROBE-EPROC">PROBE-EPROC</option>
            </select>
          </div>

          {/* Sensor Type */}
          <div>
            <label className="block text-xs text-noc-text-muted mb-1.5 font-medium">
              Sensor Type
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-1.5 bg-noc-bg border border-noc-border rounded-lg text-xs text-noc-text-primary focus:ring-2 focus:ring-brand-primary/50"
            >
              <option value="all">All Types</option>
              <option value="CPU Load">CPU Load</option>
              <option value="Memory">Memory</option>
              <option value="Disk Free">Disk Free</option>
              <option value="Ping">Ping / Latency</option>
            </select>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-noc-border">
          <button
            onClick={() => handleExport("csv")}
            className="flex items-center gap-2 px-4 py-2 bg-noc-hover text-noc-text-primary rounded-lg text-sm font-medium hover:bg-noc-border transition-all"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => handleExport("xlsx")}
            className="flex items-center gap-2 px-4 py-2 bg-noc-hover text-noc-text-primary rounded-lg text-sm font-medium hover:bg-noc-border transition-all"
          >
            <Download className="w-4 h-4 text-status-ok" />
            Export Excel (XLSX)
          </button>
          <button
            onClick={() => handleExport("pdf")}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg text-sm font-medium hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20"
          >
            <FileText className="w-4 h-4" />
            Laporan Resmi PDF / Cetak (Kop BSS)
          </button>
        </div>
      </div>

      {/* Report Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-4 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin" />
        </div>
      ) : data ? (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="kpi-card">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-status-ok" />
                <span className="text-xs text-noc-text-muted font-medium">SLA Uptime</span>
              </div>
              <p className={cn(
                "text-2xl font-bold",
                data.summary.slaUptime >= 99.5 ? "text-status-ok" : "text-status-warning"
              )}>
                {data.summary.slaUptime.toFixed(2)}%
              </p>
              <span className="text-[11px] text-noc-text-muted">Ketersediaan sistem murni</span>
            </div>
            <div className="kpi-card">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-brand-primary" />
                <span className="text-xs text-noc-text-muted font-medium">Health Score</span>
              </div>
              <p className={cn(
                "text-2xl font-bold",
                data.summary.healthScore >= 95 ? "text-status-ok" : "text-status-warning"
              )}>
                {data.summary.healthScore.toFixed(2)}%
              </p>
              <span className="text-[11px] text-noc-text-muted">Sensor kondisi optimal</span>
            </div>
            <div className="kpi-card">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-status-warning" />
                <span className="text-xs text-noc-text-muted font-medium">Peringatan (Warning)</span>
              </div>
              <p className="text-2xl font-bold text-status-warning">
                {data.summary.warningCount.toLocaleString()}
              </p>
              <span className="text-[11px] text-noc-text-muted">Ambang batas / beban</span>
            </div>
            <div className="kpi-card">
              <div className="flex items-center gap-2 mb-2">
                <AlertOctagon className="w-4 h-4 text-status-down" />
                <span className="text-xs text-noc-text-muted font-medium">Insiden Down</span>
              </div>
              <p className={cn(
                "text-2xl font-bold",
                data.summary.downCount > 0 ? "text-status-down" : "text-status-ok"
              )}>
                {data.summary.downCount.toLocaleString()}
              </p>
              <span className="text-[11px] text-noc-text-muted">Downtime pemadaman</span>
            </div>
            <div className="kpi-card">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-brand-accent" />
                <span className="text-xs text-noc-text-muted font-medium">Avg / Peak Metrik</span>
              </div>
              <p className="text-2xl font-bold text-noc-text-primary">
                {data.summary.avgValue.toFixed(1)} <span className="text-xs font-normal text-noc-text-muted">/ {data.summary.peakValue.toFixed(1)}</span>
              </p>
              <span className="text-[11px] text-noc-text-muted">Rata-rata & puncak</span>
            </div>
          </div>

          {/* Per-Site Table (shown for both roles) */}
          <div className="glass-card overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-noc-border">
              <h3 className="text-sm font-semibold text-noc-text-primary">
                {role === "STAFF" ? "Site Performance Summary" : "Per-Site Breakdown"}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-noc-border bg-noc-bg/50">
                    <th className="text-left py-3 px-4 text-noc-text-muted font-medium">Site</th>
                    <th className="text-left py-3 px-4 text-noc-text-muted font-medium">Sensors</th>
                    <th className="text-left py-3 px-4 text-noc-text-muted font-medium">SLA Uptime</th>
                    <th className="text-left py-3 px-4 text-noc-text-muted font-medium">Health Score</th>
                    <th className="text-left py-3 px-4 text-noc-text-muted font-medium">Avg Value</th>
                    <th className="text-left py-3 px-4 text-noc-text-muted font-medium">Peak</th>
                    <th className="text-left py-3 px-4 text-noc-text-muted font-medium">Warning</th>
                    <th className="text-left py-3 px-4 text-noc-text-muted font-medium">Down</th>
                  </tr>
                </thead>
                <tbody>
                  {data.perSite.map((site) => (
                    <tr key={site.probeName} className="border-b border-noc-border/50 hover:bg-noc-hover/30">
                      <td className="py-3 px-4 font-medium text-noc-text-primary">{site.probeName}</td>
                      <td className="py-3 px-4 text-noc-text-secondary">{site.sensorCount}</td>
                      <td className="py-3 px-4">
                        <span className={cn(
                          "font-mono font-bold",
                          site.slaUptime >= 99.5 ? "text-status-ok" : site.slaUptime >= 95 ? "text-status-warning" : "text-status-down"
                        )}>
                          {site.slaUptime.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn(
                          "font-mono font-bold",
                          site.healthScore >= 95 ? "text-status-ok" : site.healthScore >= 80 ? "text-status-warning" : "text-status-down"
                        )}>
                          {site.healthScore.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-noc-text-secondary font-mono">{site.avgValue.toFixed(1)}</td>
                      <td className="py-3 px-4 text-noc-text-secondary font-mono">{site.peakValue.toFixed(1)}</td>
                      <td className="py-3 px-4">
                        {site.warningCount > 0 ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-status-warning-bg text-status-warning">
                            {site.warningCount}
                          </span>
                        ) : (
                          <span className="text-xs text-noc-text-muted">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {site.downCount > 0 ? (
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-status-down-bg text-status-down">
                            {site.downCount}
                          </span>
                        ) : (
                          <span className="text-xs text-noc-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Technical Detail Table (NOC/Admin only) */}
          {role !== "STAFF" && data.perSensor && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-4 border-b border-noc-border">
                <h3 className="text-sm font-semibold text-noc-text-primary">
                  Detailed Sensor Metrics
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-noc-border bg-noc-bg/50">
                      <th className="text-left py-3 px-4 text-noc-text-muted font-medium">Probe</th>
                      <th className="text-left py-3 px-4 text-noc-text-muted font-medium">Device</th>
                      <th className="text-left py-3 px-4 text-noc-text-muted font-medium">Sensor</th>
                      <th className="text-left py-3 px-4 text-noc-text-muted font-medium">Type</th>
                      <th className="text-right py-3 px-4 text-noc-text-muted font-medium">Min</th>
                      <th className="text-right py-3 px-4 text-noc-text-muted font-medium">Avg</th>
                      <th className="text-right py-3 px-4 text-noc-text-muted font-medium">Max</th>
                      <th className="text-right py-3 px-4 text-noc-text-muted font-medium">OK</th>
                      <th className="text-right py-3 px-4 text-noc-text-muted font-medium">Warn</th>
                      <th className="text-right py-3 px-4 text-noc-text-muted font-medium">Down</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.perSensor.slice(0, 30).map((sensor) => (
                      <tr key={sensor.sensorId} className="border-b border-noc-border/50 hover:bg-noc-hover/30">
                        <td className="py-2 px-4 text-noc-text-muted text-xs">{sensor.probeName}</td>
                        <td className="py-2 px-4 text-noc-text-primary text-xs">{sensor.deviceName}</td>
                        <td className="py-2 px-4 text-noc-text-primary text-xs font-medium">{sensor.sensorName}</td>
                        <td className="py-2 px-4 text-noc-text-muted text-xs">{sensor.sensorType}</td>
                        <td className="py-2 px-4 text-right font-mono text-xs text-noc-text-secondary">
                          {sensor.minValue.toFixed(1)} {sensor.unit}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-xs text-noc-text-primary font-medium">
                          {sensor.avgValue.toFixed(1)} {sensor.unit}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-xs text-noc-text-secondary">
                          {sensor.maxValue.toFixed(1)} {sensor.unit}
                        </td>
                        <td className="py-2 px-4 text-right text-xs text-status-ok">{sensor.okCount}</td>
                        <td className="py-2 px-4 text-right text-xs text-status-warning">{sensor.warningCount}</td>
                        <td className="py-2 px-4 text-right text-xs text-status-down">{sensor.downCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Executive Summary (Staff only) */}
          {role === "STAFF" && (
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-noc-text-primary mb-3">
                Executive Summary
              </h3>
              <div className="text-sm text-noc-text-secondary leading-relaxed space-y-2">
                <p>
                  Selama periode {startDate} hingga {endDate}, infrastruktur IT PT. Bina Sarana Sukses
                  mencatat rata-rata SLA uptime sebesar <strong className={cn(
                    data.summary.slaUptime >= 99.5 ? "text-status-ok" : "text-status-warning"
                  )}>{data.summary.slaUptime.toFixed(2)}%</strong> dengan rata-rata Health Score <strong className={cn(
                    data.summary.healthScore >= 95 ? "text-status-ok" : "text-status-warning"
                  )}>{data.summary.healthScore.toFixed(2)}%</strong>.
                </p>
                <p>
                  Total sensor yang dimonitor: <strong className="text-noc-text-primary">{data.summary.totalSensors}</strong> sensor
                  di {data.perSite.length} lokasi.
                  {data.summary.downCount > 0
                    ? ` Tercatat ${data.summary.downCount} insiden downtime dan ${data.summary.warningCount} event peringatan operasional (warning) selama periode ini.`
                    : data.summary.warningCount > 0
                    ? ` Tidak ada insiden downtime (0 down) dengan ${data.summary.warningCount} event peringatan operasional (warning) selama periode ini.`
                    : " Seluruh sistem berjalan 100% normal tanpa insiden atau peringatan selama periode ini."}
                </p>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
