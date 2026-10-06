"use client";

import { useState, useEffect } from "react";
import {
  X,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  ShieldAlert,
  Loader2,
  Server,
} from "lucide-react";
import { cn, getStatusDotClass } from "@/lib/utils";

interface SensorModalProps {
  sensorId: number | null;
  onClose: () => void;
  userRole?: string;
  onAlertAcknowledged?: () => void;
}

interface HistoryData {
  sensor: {
    id: number;
    probeName: string;
    groupName: string;
    deviceName: string;
    sensorName: string;
    sensorType: string;
    lastStatus: string;
    lastValue: string | null;
    lastMessage: string | null;
    acknowledgedBy: string | null;
    acknowledgedAt: string | null;
    lastUpdated: string;
  };
  metrics: {
    time: string;
    displayTime: string;
    value: number;
    status: string;
  }[];
  stats: {
    avg: number;
    min: number;
    max: number;
    totalPoints: number;
  };
}

export function SensorDetailModal({
  sensorId,
  onClose,
  userRole = "STAFF",
  onAlertAcknowledged,
}: SensorModalProps) {
  const [range, setRange] = useState<"1h" | "6h" | "24h" | "7d" | "30d">("24h");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HistoryData | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    val: number;
    time: string;
    status: string;
  } | null>(null);

  // Acknowledge state
  const [ackMessage, setAckMessage] = useState("");
  const [acknowledging, setAcknowledging] = useState(false);
  const [ackSuccess, setAckSuccess] = useState(false);

  useEffect(() => {
    if (!sensorId) return;

    let isMounted = true;
    setLoading(true);

    fetch(`/api/prtg/history/${sensorId}?range=${range}`)
      .then((res) => res.json())
      .then((resData) => {
        if (isMounted) {
          setData(resData);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [sensorId, range]);

  if (!sensorId) return null;

  const handleAcknowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sensorId) return;
    setAcknowledging(true);

    try {
      const res = await fetch(`/api/prtg/sensors/${sensorId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: ackMessage || "Telah diinspeksi oleh NOC" }),
      });

      if (res.ok) {
        setAckSuccess(true);
        if (onAlertAcknowledged) onAlertAcknowledged();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAcknowledging(false);
    }
  };

  // SVG Chart rendering calculation
  const metrics = data?.metrics || [];
  const minVal = data?.stats?.min ?? 0;
  const maxVal = Math.max(data?.stats?.max ?? 100, minVal + 1);
  const valSpan = maxVal - minVal || 1;

  const chartWidth = 640;
  const chartHeight = 220;
  const padX = 40;
  const padY = 25;
  const plotW = chartWidth - padX * 2;
  const plotH = chartHeight - padY * 2;

  const points = metrics.map((m, idx) => {
    const x = padX + (idx / Math.max(metrics.length - 1, 1)) * plotW;
    const y = padY + plotH - ((m.value - minVal) / valSpan) * plotH;
    return { x, y, ...m };
  });

  const pathD =
    points.length > 0
      ? `M ${points[0].x} ${points[0].y} ` +
        points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ")
      : "";

  const areaD =
    points.length > 0
      ? `${pathD} L ${points[points.length - 1].x} ${padY + plotH} L ${points[0].x} ${padY + plotH} Z`
      : "";

  const isWarnOrDown =
    data?.sensor.lastStatus === "Warning" || data?.sensor.lastStatus === "Down";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="glass-card max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-noc-border">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={getStatusDotClass(data?.sensor.lastStatus || "OK")} />
              <span className="text-xs font-bold uppercase tracking-wider text-noc-text-muted">
                {data?.sensor.sensorType || "Sensor"} · ID #{sensorId}
              </span>
            </div>
            <h2 className="text-xl font-bold text-noc-text-primary">
              {data?.sensor.sensorName || "Memuat rincian sensor..."}
            </h2>
            <p className="text-xs text-noc-text-secondary mt-0.5">
              {data?.sensor.probeName} &rsaquo; {data?.sensor.deviceName}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {data?.sensor.lastValue && (
              <div className="text-right">
                <span className="text-[10px] text-noc-text-muted block uppercase font-semibold">
                  Nilai Saat Ini
                </span>
                <span className="text-lg font-mono font-bold text-brand-primary">
                  {data.sensor.lastValue}
                </span>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Message / Notice */}
        {data?.sensor.lastMessage && (
          <div
            className={cn(
              "p-3 rounded-xl text-xs flex items-center gap-2 border",
              isWarnOrDown
                ? "bg-status-warning-bg/50 border-status-warning/30 text-status-warning"
                : "bg-noc-bg border-noc-border text-noc-text-secondary"
            )}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Pesan Sensor:</strong> {data.sensor.lastMessage}
            </span>
          </div>
        )}

        {/* Range Selector & Chart Header */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-noc-text-primary flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-brand-primary" />
              Riwayat Metrik Sensor
            </h3>
            <div className="flex gap-1 bg-noc-bg p-1 rounded-xl border border-noc-border">
              {(["1h", "6h", "24h", "7d", "30d"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all",
                    range === r
                      ? "bg-brand-primary text-white"
                      : "text-noc-text-secondary hover:text-noc-text-primary"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Metric Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-noc-bg/50 rounded-xl border border-noc-border">
              <span className="text-[11px] text-noc-text-muted">Rata-rata</span>
              <p className="text-base font-bold text-noc-text-primary mt-0.5">
                {data?.stats?.avg ?? "—"}
              </p>
            </div>
            <div className="p-3 bg-noc-bg/50 rounded-xl border border-noc-border">
              <span className="text-[11px] text-noc-text-muted">Minimum</span>
              <p className="text-base font-bold text-status-ok mt-0.5">
                {data?.stats?.min ?? "—"}
              </p>
            </div>
            <div className="p-3 bg-noc-bg/50 rounded-xl border border-noc-border">
              <span className="text-[11px] text-noc-text-muted">Maksimum / Peak</span>
              <p className="text-base font-bold text-status-warning mt-0.5">
                {data?.stats?.max ?? "—"}
              </p>
            </div>
            <div className="p-3 bg-noc-bg/50 rounded-xl border border-noc-border">
              <span className="text-[11px] text-noc-text-muted">Sampel Data</span>
              <p className="text-base font-bold text-noc-text-secondary mt-0.5">
                {data?.stats?.totalPoints ?? 0}
              </p>
            </div>
          </div>

          {/* Interactive SVG Chart */}
          <div className="p-4 bg-noc-bg/60 rounded-2xl border border-noc-border relative overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-52">
                <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
              </div>
            ) : metrics.length === 0 ? (
              <div className="flex items-center justify-center h-52 text-noc-text-muted text-xs">
                Tidak ada data metrik tercatat untuk rentang ini.
              </div>
            ) : (
              <div className="relative">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-56 select-none"
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  <defs>
                    <linearGradient id="metricGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0284c7" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Grid Lines */}
                  <line
                    x1={padX}
                    y1={padY}
                    x2={chartWidth - padX}
                    y2={padY}
                    stroke="rgba(255,255,255,0.06)"
                    strokeDasharray="4 4"
                  />
                  <line
                    x1={padX}
                    y1={padY + plotH / 2}
                    x2={chartWidth - padX}
                    y2={padY + plotH / 2}
                    stroke="rgba(255,255,255,0.06)"
                    strokeDasharray="4 4"
                  />
                  <line
                    x1={padX}
                    y1={padY + plotH}
                    x2={chartWidth - padX}
                    y2={padY + plotH}
                    stroke="rgba(255,255,255,0.1)"
                  />

                  {/* Axis Value Labels */}
                  <text
                    x={padX - 8}
                    y={padY + 4}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {Math.round(maxVal)}
                  </text>
                  <text
                    x={padX - 8}
                    y={padY + plotH / 2 + 3}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {Math.round((maxVal + minVal) / 2)}
                  </text>
                  <text
                    x={padX - 8}
                    y={padY + plotH}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="10"
                    fontFamily="monospace"
                  >
                    {Math.round(minVal)}
                  </text>

                  {/* Area fill */}
                  <path d={areaD} fill="url(#metricGrad)" />

                  {/* Line stroke */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Interactive Points / Hover Targets */}
                  {points.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r="4"
                      className="cursor-pointer transition-all fill-brand-primary opacity-0 hover:opacity-100 hover:r-6"
                      onMouseEnter={() =>
                        setHoveredPoint({
                          x: p.x,
                          y: p.y,
                          val: p.value,
                          time: p.displayTime,
                          status: p.status,
                        })
                      }
                    />
                  ))}

                  {/* Active Tooltip Anchor */}
                  {hoveredPoint && (
                    <g>
                      <line
                        x1={hoveredPoint.x}
                        y1={padY}
                        x2={hoveredPoint.x}
                        y2={padY + plotH}
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                      <circle
                        cx={hoveredPoint.x}
                        cy={hoveredPoint.y}
                        r="5"
                        fill="#38bdf8"
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                    </g>
                  )}
                </svg>

                {/* Floating Tooltip HTML Overlay */}
                {hoveredPoint && (
                  <div
                    className="absolute pointer-events-none -top-1 px-3 py-1.5 rounded-lg bg-noc-surface border border-brand-primary/40 shadow-xl text-xs"
                    style={{
                      left: Math.min(Math.max(hoveredPoint.x - 50, 10), chartWidth - 110),
                    }}
                  >
                    <span className="text-[10px] text-noc-text-muted block">
                      {hoveredPoint.time}
                    </span>
                    <strong className="text-brand-primary font-mono text-sm">
                      {hoveredPoint.val}
                    </strong>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Alert Acknowledgment Section (For NOC & Admin) */}
        {(userRole === "ADMIN" || userRole === "NOC_OPERATOR") && isWarnOrDown && (
          <div className="p-4 rounded-xl bg-status-warning-bg/30 border border-status-warning/30 space-y-3">
            <div className="flex items-center gap-2 text-status-warning font-semibold text-xs">
              <ShieldAlert className="w-4 h-4" />
              <span>Acknowledge / Konfirmasi Penanganan Insiden</span>
            </div>

            {ackSuccess ? (
              <div className="p-3 bg-status-ok-bg text-status-ok rounded-lg text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Alert telah berhasil di-acknowledge. Status tercatat pada audit log.
              </div>
            ) : (
              <form onSubmit={handleAcknowledge} className="flex gap-2">
                <input
                  type="text"
                  value={ackMessage}
                  onChange={(e) => setAckMessage(e.target.value)}
                  placeholder="Catatan penanganan NOC (contoh: Sedang dilakukan investigasi utilitas CPU)"
                  className="flex-1 px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-xs text-noc-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
                />
                <button
                  type="submit"
                  disabled={acknowledging}
                  className="px-4 py-2 bg-status-warning text-slate-900 rounded-lg text-xs font-bold hover:bg-status-warning/90 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {acknowledging && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Acknowledge
                </button>
              </form>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-noc-border text-xs text-noc-text-muted">
          <span>
            Terakhir diperbarui:{" "}
            {data?.sensor.lastUpdated
              ? new Date(data.sensor.lastUpdated).toLocaleString("id-ID")
              : "—"}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-noc-hover text-noc-text-primary rounded-lg font-medium hover:bg-noc-border transition-all"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
