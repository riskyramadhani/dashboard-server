"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Server,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Activity,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  ArrowLeft,
  Clock,
  Radio,
  Wifi,
  RadioTower,
  BellRing,
  Globe,
  Network,
  Zap,
  TrendingUp,
  CheckCircle2,
  Layers,
  Cpu,
  HardDrive,
  Gauge,
  RotateCw,
  Eye,
  ChevronRight,
  Database,
  Check,
  PauseCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface SensorItem {
  id: number;
  sensorName: string;
  sensorType: string;
  lastStatus: string;
  lastValue: string | null;
  lastMessage: string | null;
  lastUpdated: string;
  consecutiveWarnings: number;
}

interface DeviceGroup {
  deviceName: string;
  groupName?: string;
  sensors: SensorItem[];
  isPaused?: boolean;
}

interface ProbeGroup {
  probeName: string;
  devices: DeviceGroup[];
  isPaused?: boolean;
  pausedCount?: number;
  summary: {
    total: number;
    ok: number;
    warning: number;
    down: number;
    paused: number;
  };
  healthPct?: number | null;
}

interface DashboardData {
  summary: {
    total: number;
    ok: number;
    warning: number;
    down: number;
    paused: number;
  };
  probes: ProbeGroup[];
  recentAlerts: {
    id: number;
    deviceName: string;
    sensorName: string;
    sensorType: string;
    lastStatus: string;
    lastValue: string | null;
    lastMessage: string | null;
    lastUpdated: string;
    probeName: string;
  }[];
  slaUptime: number;
  avgResponseTime: number;
  incidentCount: number;
}

interface UptimeMonitorItem {
  id: string;
  name: string;
  category?: string;
  checkType: "HTTP" | "HTTPS" | "PING" | "TCP_PORT";
  target: string;
  port: number | null;
  isActive: boolean;
  lastStatus: "UP" | "WARNING" | "DOWN" | "UNKNOWN";
  lastCheckedAt: string | null;
  lastResponseMs: number | null;
  uptime24h: number | null;
  avgResponseMs: number | null;
}

// ─────────────────────────────────────────────────────────────
// Utility Helpers
// ─────────────────────────────────────────────────────────────

function parseGaugePct(val: string | null): number | null {
  if (!val) return null;
  const match = val.match(/([\d.]+)\s*%/);
  if (match) return parseFloat(match[1]);
  return null;
}

function formatRelTime(iso: string | null): string {
  if (!iso) return "Baru saja";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return "Baru saja";
  if (diff < 60) return `${diff}s lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m lalu`;
  return `${Math.floor(diff / 3600)}j lalu`;
}

function getCheckTypeIcon(type: string) {
  switch (type) {
    case "HTTP":
    case "HTTPS":
      return Globe;
    case "PING":
      return Wifi;
    case "TCP_PORT":
      return Network;
    default:
      return Activity;
  }
}

function extractNodeMetrics(sensors: SensorItem[]) {
  const cpuSensor = sensors.find((s) => s.sensorName.toLowerCase().includes("cpu"));
  const cpuPct = cpuSensor ? parseGaugePct(cpuSensor.lastValue) : null;
  const cpuText = cpuSensor?.lastValue || (cpuSensor ? cpuSensor.lastStatus : null);

  // Prioritize "Physical memory" / "Memory: Physical memory" and avoid Meminfo
  const physicalMemSensors = sensors.filter((s) => s.sensorName.toLowerCase().includes("physical memory"));
  const memSensor =
    physicalMemSensors.find((s) => s.lastStatus !== "Down" && s.lastValue) ||
    physicalMemSensors[0] ||
    sensors.find(
      (s) =>
        !s.sensorName.toLowerCase().includes("meminfo") &&
        (s.sensorName.toLowerCase().includes("memory") ||
          s.sensorName.toLowerCase().includes("ram"))
    ) ||
    sensors.find((s) => !s.sensorName.toLowerCase().includes("meminfo") && s.sensorName.toLowerCase().includes("mem"));
  const memPct = memSensor ? parseGaugePct(memSensor.lastValue) : null;
  const memText = memSensor?.lastValue || (memSensor ? memSensor.lastStatus : null);

  const diskSensors = sensors.filter((s) => s.sensorName.toLowerCase().includes("disk"));
  const primaryDisk = diskSensors[0];
  const diskPct = primaryDisk ? parseGaugePct(primaryDisk.lastValue) : null;
  const diskText = primaryDisk?.lastValue || (primaryDisk ? primaryDisk.lastStatus : null);

  const pingSensor = sensors.find(
    (s) => s.sensorName.toLowerCase().includes("ping") || s.sensorName.toLowerCase().includes("traffic")
  );
  const pingText = pingSensor?.lastValue || (pingSensor ? pingSensor.lastStatus : null);

  return {
    cpuSensor,
    cpuPct,
    cpuText,
    memSensor,
    memPct,
    memText,
    diskSensors,
    primaryDisk,
    diskPct,
    diskText,
    pingSensor,
    pingText,
  };
}

// ─────────────────────────────────────────────────────────────
// Main Component: WallboardPage
// ─────────────────────────────────────────────────────────────

export default function WallboardPage() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>("all");
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [rotateCountdown, setRotateCountdown] = useState<number>(15);

  const audioContextRef = useRef<AudioContext | null>(null);

  // Live Digital Clock (every 1s)
  useEffect(() => {
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Live Query PRTG Sensors (every 10s)
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["wallboard-data"],
    queryFn: async () => {
      const res = await fetch("/api/prtg/sensors");
      if (!res.ok) throw new Error("Failed to fetch wallboard data");
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Live Query Uptime Monitors (every 10s)
  const { data: uptimeData } = useQuery<{ monitors: UptimeMonitorItem[] }>({
    queryKey: ["wallboard-uptime-monitors"],
    queryFn: async () => {
      const res = await fetch("/api/uptime/monitors");
      if (!res.ok) return { monitors: [] };
      return res.json();
    },
    refetchInterval: 10000,
  });

  // Process probes with proper active & paused detection
  const cleanProbes = useMemo(() => {
    if (!data?.probes) return [];
    return data.probes
      .map((probe) => {
        const allSensors = probe.devices.flatMap((d) => d.sensors);
        const totalRaw = allSensors.length;
        const pausedSensors = allSensors.filter((s) => s.lastStatus === "Paused");
        const isProbePaused = totalRaw > 0 && pausedSensors.length === totalRaw;

        const processedDevices = probe.devices
          .map((device) => {
            const isDevicePaused =
              device.sensors.length > 0 && device.sensors.every((s) => s.lastStatus === "Paused");
            const activeSensors = device.sensors.filter((s) => s.lastStatus !== "Paused");

            return {
              ...device,
              sensors: isDevicePaused ? device.sensors : activeSensors,
              isPaused: isDevicePaused || isProbePaused,
            };
          })
          .filter((d) => d.sensors.length > 0);

        const allActiveSensors = processedDevices
          .flatMap((d) => d.sensors)
          .filter((s) => s.lastStatus !== "Paused");
        const ok = allActiveSensors.filter((s) => s.lastStatus === "OK").length;
        const warning = allActiveSensors.filter((s) => s.lastStatus === "Warning").length;
        const down = allActiveSensors.filter((s) => s.lastStatus === "Down").length;
        const total = allActiveSensors.length;
        const healthPct = isProbePaused ? null : total > 0 ? Math.round((ok / total) * 100) : 100;

        return {
          ...probe,
          devices: processedDevices,
          isPaused: isProbePaused,
          pausedCount: pausedSensors.length,
          summary: {
            total,
            ok,
            warning,
            down,
            paused: pausedSensors.length,
          },
          healthPct,
        };
      })
      .filter((p) => p.devices.length > 0);
  }, [data?.probes]);

  // Overall PRTG Active Sensors calculation
  const totalActiveSensors = useMemo(() => {
    return cleanProbes.reduce((sum, p) => sum + p.summary.total, 0);
  }, [cleanProbes]);

  const totalOkSensors = useMemo(() => {
    return cleanProbes.reduce((sum, p) => sum + p.summary.ok, 0);
  }, [cleanProbes]);

  const totalWarningSensors = useMemo(() => {
    return cleanProbes.reduce((sum, p) => sum + p.summary.warning, 0);
  }, [cleanProbes]);

  const totalDownSensors = useMemo(() => {
    return cleanProbes.reduce((sum, p) => sum + p.summary.down, 0);
  }, [cleanProbes]);

  const totalPausedSensors = useMemo(() => {
    return cleanProbes.reduce((sum, p) => sum + (p.pausedCount || 0), 0);
  }, [cleanProbes]);

  // Uptime monitors data
  const uptimeMonitors = uptimeData?.monitors || [];
  const uptimeUpCount = uptimeMonitors.filter(
    (m) => m.isActive && (m.lastStatus === "UP" || m.lastStatus === "WARNING")
  ).length;
  const uptimeWarningCount = uptimeMonitors.filter((m) => m.isActive && m.lastStatus === "WARNING").length;
  const uptimeDownCount = uptimeMonitors.filter((m) => m.isActive && m.lastStatus === "DOWN").length;
  const downMonitors = uptimeMonitors.filter((m) => m.isActive && m.lastStatus === "DOWN");

  // Critical status detection
  const hasPrtgDown = totalDownSensors > 0;
  const hasUptimeDown = uptimeDownCount > 0;
  const hasAnyCritical = hasPrtgDown || hasUptimeDown;
  const hasWarning = totalWarningSensors > 0 || uptimeWarningCount > 0;

  // Sound Siren using Web Audio API
  const playSiren = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.45);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (e) {
      console.warn("Audio siren error:", e);
    }
  };

  useEffect(() => {
    if (audioEnabled && hasAnyCritical) {
      playSiren();
    }
  }, [hasAnyCritical, audioEnabled]);

  // Fullscreen Handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  // Auto-Rotation Timer through sites (15 seconds)
  useEffect(() => {
    if (!autoRotate || cleanProbes.length <= 1) return;

    const interval = setInterval(() => {
      setRotateCountdown((prev) => {
        if (prev <= 1) {
          // Switch to next site
          setSelectedSiteFilter((current) => {
            const siteNames = ["all", ...cleanProbes.map((p) => p.probeName)];
            const currentIndex = siteNames.indexOf(current);
            const nextIndex = (currentIndex + 1) % siteNames.length;
            return siteNames[nextIndex];
          });
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [autoRotate, cleanProbes]);

  // Active displayed probes based on site filter
  const displayedProbes = useMemo(() => {
    if (selectedSiteFilter === "all") return cleanProbes;
    return cleanProbes.filter((p) => p.probeName === selectedSiteFilter);
  }, [cleanProbes, selectedSiteFilter]);

  // Overall Health Score (0-100%)
  const overallHealth = useMemo(() => {
    const totalAll = totalActiveSensors + uptimeMonitors.length;
    if (totalAll === 0) return 100;
    const okAll = totalOkSensors + uptimeUpCount;
    return Math.round((okAll / totalAll) * 1000) / 10;
  }, [totalActiveSensors, uptimeMonitors.length, totalOkSensors, uptimeUpCount]);

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden bg-[#07090e] text-slate-100 flex flex-col p-3 sm:p-4 select-none relative font-sans">
      {/* Background ambient radial glow */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(14,165,233,0.12),rgba(7,9,14,0))]" />

      {/* ───────────────────────────────────────────────────────── */}
      {/* 1. TOP COMMAND BAR (Fixed Height ~52px)                    */}
      {/* ───────────────────────────────────────────────────────── */}
      <header className="h-[52px] shrink-0 flex items-center justify-between gap-3 px-3.5 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-xl relative z-10">
        {/* Left: Branding & Organization */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-brand-primary to-sky-400 shadow-md shadow-brand-primary/30">
            <Server className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-extrabold tracking-wider text-white block">
              DASHBOARD-SERVER
            </span>
            <p className="text-[10px] text-slate-400 font-medium leading-none mt-0.5 hidden md:block">
              PT. Bina Sarana Sukses · Enterprise Infrastructure Telemetry
            </p>
          </div>
        </div>

        {/* Center: Dual Timezone Digital Clocks (WIB & WITA) */}
        <div className="flex items-center gap-4 px-4 py-1 rounded-xl bg-black/40 border border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase text-slate-400 font-mono tracking-wider">
              WIB
            </span>
            <span className="text-sm font-mono font-bold text-sky-400">
              {currentTime
                ? currentTime.toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    timeZone: "Asia/Jakarta",
                  })
                : "--:--:--"}
            </span>
          </div>

          <div className="w-px h-5 bg-white/15" />

          <div className="flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase text-slate-400 font-mono tracking-wider">
              WITA
            </span>
            <span className="text-sm font-mono font-bold text-amber-400">
              {currentTime
                ? currentTime.toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    timeZone: "Asia/Makassar",
                  })
                : "--:--:--"}
            </span>
          </div>
        </div>

        {/* Right: Controls & Navigation */}
        <div className="flex items-center gap-2">
          {/* Live Pulse Indicator */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-[10px] font-mono text-emerald-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>LIVE (10s)</span>
          </div>

          {/* Auto-Rotate Toggle */}
          <button
            type="button"
            onClick={() => setAutoRotate(!autoRotate)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer",
              autoRotate
                ? "bg-sky-500/15 text-sky-400 border-sky-500/40"
                : "bg-white/5 text-slate-400 border-white/10 hover:text-white"
            )}
            title={autoRotate ? `Auto-Rotate Aktif (${rotateCountdown}s)` : "Aktifkan Auto-Rotate Site"}
          >
            <RotateCw className={cn("w-3 h-3", autoRotate && "animate-spin")} style={{ animationDuration: "6s" }} />
            <span className="hidden sm:inline">
              {autoRotate ? `Rotate ${rotateCountdown}s` : "Rotate Off"}
            </span>
          </button>

          {/* Audio Siren Toggle */}
          <button
            type="button"
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all cursor-pointer",
              audioEnabled
                ? "bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse"
                : "bg-white/5 text-slate-400 border-white/10 hover:text-white"
            )}
            title={audioEnabled ? "Audio Alarm Aktif saat Down" : "Aktifkan Alarm Suara"}
          >
            {audioEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{audioEnabled ? "Siren ON" : "Siren OFF"}</span>
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 hover:text-white transition-all cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Back to Standard Dashboard */}
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 px-3 py-1 bg-brand-primary text-white rounded-lg text-[11px] font-semibold hover:bg-brand-primary/90 transition-all shadow-md shadow-brand-primary/20"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Kembali</span>
          </Link>
        </div>
      </header>

      {/* ───────────────────────────────────────────────────────── */}
      {/* 2. TOP METRIC STRIP (Compact KPI Row ~58px)                */}
      {/* ───────────────────────────────────────────────────────── */}
      <section className="h-[58px] shrink-0 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-2.5 relative z-10">
        {/* KPI 1: Overall Health Score */}
        <div className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Health Score
            </span>
            <p className={cn("text-lg font-black font-mono leading-none mt-1", overallHealth >= 98 ? "text-emerald-400" : overallHealth >= 90 ? "text-amber-400" : "text-rose-400")}>
              {overallHealth}%
            </p>
          </div>
          <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono", overallHealth >= 98 ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/15 text-amber-400 border border-amber-500/30")}>
            {overallHealth >= 98 ? "OPTIMAL" : "WARN"}
          </span>
        </div>

        {/* KPI 2: PRTG Sensors Status */}
        <div className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Sensor PRTG
            </span>
            <p className="text-lg font-black font-mono text-white leading-none mt-1">
              {totalOkSensors} <span className="text-xs text-slate-400 font-normal">/ {totalActiveSensors}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5 text-[9px] font-mono">
            <span className="text-emerald-400 font-bold">{totalOkSensors} OK</span>
            {totalPausedSensors > 0 && (
              <span className="text-sky-400 font-medium">{totalPausedSensors} Paused</span>
            )}
            {totalDownSensors > 0 && (
              <span className="text-rose-400 font-bold animate-pulse">{totalDownSensors} DOWN</span>
            )}
          </div>
        </div>

        {/* KPI 3: Web & Enterprise Portals */}
        <div className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md flex items-center justify-between">
          <div>
            <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider flex items-center gap-1">
              <Globe className="w-3 h-3" /> Web & DB
            </span>
            <p className="text-lg font-black font-mono text-emerald-400 leading-none mt-1">
              {uptimeUpCount} <span className="text-xs text-slate-400 font-normal">/ {uptimeMonitors.length}</span>
            </p>
          </div>
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            {uptimeDownCount > 0 ? `${uptimeDownCount} Down` : "100% UP"}
          </span>
        </div>

        {/* KPI 4: SLA Uptime Target */}
        <div className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              SLA Uptime
            </span>
            <p className="text-lg font-black font-mono text-sky-400 leading-none mt-1">
              {data ? `${data.slaUptime.toFixed(1)}%` : "100%"}
            </p>
          </div>
          <span className="text-[9px] font-mono text-slate-400">
            Target &ge;99.5%
          </span>
        </div>

        {/* KPI 5: Average Latency */}
        <div className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-md flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Avg Latency
            </span>
            <p className="text-lg font-black font-mono text-white leading-none mt-1">
              {data?.avgResponseTime ? `${Math.round(data.avgResponseTime)} ms` : "1.8 ms"}
            </p>
          </div>
          <span className="text-[9px] font-mono font-semibold text-emerald-400">
            FAST
          </span>
        </div>

        {/* KPI 6: Critical Incidents (P1) */}
        <div
          className={cn(
            "px-3 py-1.5 rounded-xl border backdrop-blur-md flex items-center justify-between transition-all",
            hasAnyCritical
              ? "bg-rose-950/40 border-rose-500/80 shadow-lg shadow-rose-950/60 animate-pulse"
              : "bg-white/[0.03] border-white/10"
          )}
        >
          <div>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Incident P1
            </span>
            <p
              className={cn(
                "text-lg font-black font-mono leading-none mt-1",
                hasAnyCritical ? "text-rose-400" : "text-emerald-400"
              )}
            >
              {totalDownSensors + uptimeDownCount}
            </p>
          </div>
          <span
            className={cn(
              "text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase",
              hasAnyCritical
                ? "bg-rose-500 text-white animate-bounce"
                : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
            )}
          >
            {hasAnyCritical ? "ALARM" : "ZERO P1"}
          </span>
        </div>
      </section>

      {/* ───────────────────────────────────────────────────────── */}
      {/* 3. SITE NAVIGATION & SELECTOR BAR (~34px)                  */}
      {/* ───────────────────────────────────────────────────────── */}
      <nav className="h-[34px] shrink-0 flex items-center justify-between gap-2 mt-2 px-1 relative z-10 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <RadioTower className="w-3 h-3 text-brand-primary" /> Site:
          </span>

          {/* All Sites Pill */}
          <button
            type="button"
            onClick={() => setSelectedSiteFilter("all")}
            className={cn(
              "px-2.5 py-0.5 rounded-lg text-[10px] font-semibold transition-all border cursor-pointer flex items-center gap-1.5 shrink-0",
              selectedSiteFilter === "all"
                ? "bg-brand-primary text-white border-brand-primary shadow-sm shadow-brand-primary/30"
                : "bg-white/[0.02] text-slate-400 border-white/10 hover:text-white hover:bg-white/5"
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Semua Site ({cleanProbes.length})</span>
          </button>

          {/* Individual Probe Site Pills */}
          {cleanProbes.map((probe) => {
            const isPaused = (probe as any).isPaused;
            const isDown = !isPaused && probe.summary.down > 0;
            const isWarn = !isPaused && probe.summary.warning > 0;
            const isSelected = selectedSiteFilter === probe.probeName;

            return (
              <button
                key={probe.probeName}
                type="button"
                onClick={() => setSelectedSiteFilter(probe.probeName)}
                className={cn(
                  "px-2.5 py-0.5 rounded-lg text-[10px] font-semibold transition-all border cursor-pointer flex items-center gap-1.5 shrink-0",
                  isSelected
                    ? "bg-brand-primary text-white border-brand-primary shadow-sm"
                    : isPaused
                    ? "bg-sky-500/10 text-sky-300 border-sky-500/30"
                    : isDown
                    ? "bg-rose-950/40 text-rose-300 border-rose-500/50 animate-pulse"
                    : isWarn
                    ? "bg-amber-950/30 text-amber-300 border-amber-500/40"
                    : "bg-white/[0.02] text-slate-400 border-white/10 hover:text-white hover:bg-white/5"
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isPaused ? "bg-sky-400" : isDown ? "bg-rose-500 animate-ping" : isWarn ? "bg-amber-400" : "bg-emerald-400"
                  )}
                />
                <span className="truncate max-w-[140px]">{probe.probeName}</span>
                <span className="font-mono text-[9px] opacity-75">
                  {isPaused ? "(Paused)" : `(${probe.devices.length})`}
                </span>
              </button>
            );
          })}
        </div>

        {/* Live Filter Indicator */}
        <div className="text-[10px] font-mono text-slate-500 hidden md:block shrink-0">
          Tampilan: <span className="text-slate-300 font-bold">{selectedSiteFilter === "all" ? "Seluruh Site" : selectedSiteFilter}</span>
        </div>
      </nav>

      {/* ───────────────────────────────────────────────────────── */}
      {/* 4. MAIN COMMAND CENTER (FLEX-1, FIT TO SCREEN, NO SCROLL)  */}
      {/* ───────────────────────────────────────────────────────── */}
      <main className="flex-1 min-h-0 grid grid-cols-12 gap-3 mt-2 relative z-10">
        {/* ── LEFT COLUMN (4 Cols): WEB & ENTERPRISE PORTALS ── */}
        <section className="col-span-12 lg:col-span-4 flex flex-col min-h-0 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl p-3 shadow-xl">
          {/* Section Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Web & Layanan Bisnis
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold">
                {uptimeUpCount}/{uptimeMonitors.length} Online
              </span>
            </div>
          </div>

          {/* Monitor Cards List (Scrollable internally if many, page stays fixed) */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent">
            {uptimeMonitors.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center p-6 text-slate-500 text-xs">
                Belum ada monitor web aktif.
              </div>
            ) : (
              uptimeMonitors.map((m) => {
                const isUp = m.lastStatus === "UP";
                const isWarning = m.lastStatus === "WARNING";
                const isDown = m.lastStatus === "DOWN";
                const Icon = getCheckTypeIcon(m.checkType);

                return (
                  <div
                    key={m.id}
                    className={cn(
                      "p-2.5 rounded-xl border transition-all flex flex-col justify-between",
                      isUp
                        ? "bg-white/[0.02] border-emerald-500/20 hover:border-emerald-500/40"
                        : isWarning
                        ? "bg-amber-950/20 border-amber-500/40 shadow-md shadow-amber-950/30"
                        : isDown
                        ? "bg-rose-950/30 border-rose-500/60 shadow-lg shadow-rose-950/40 animate-pulse"
                        : "bg-white/[0.02] border-white/10"
                    )}
                  >
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            isUp
                              ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                              : isWarning
                              ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] animate-pulse"
                              : isDown
                              ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-ping"
                              : "bg-slate-500"
                          )}
                        />
                        <span className="text-xs font-bold text-white truncate" title={m.name}>
                          {m.name}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-slate-300 flex items-center gap-1 shrink-0">
                        <Icon className="w-2.5 h-2.5 text-emerald-400" />
                        {m.checkType}
                      </span>
                    </div>

                    {/* URL Target */}
                    <p className="text-[10px] text-slate-400 font-mono truncate mt-1">
                      {m.target}{m.port ? `:${m.port}` : ""}
                    </p>

                    {/* Latency Gauge & Uptime Bar */}
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-1.5 border-t border-white/5 text-[10px]">
                      <div>
                        <span className="text-[9px] text-slate-500 block">Latency</span>
                        <div className="flex items-center gap-1 font-mono font-bold">
                          <span
                            className={cn(
                              (m.lastResponseMs ?? 0) > 800
                                ? "text-amber-400"
                                : (m.lastResponseMs ?? 0) > 1500
                                ? "text-rose-400"
                                : "text-sky-400"
                            )}
                          >
                            {m.lastResponseMs !== null ? `${m.lastResponseMs} ms` : "—"}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[9px] text-slate-500 block">Uptime 24h</span>
                        <span
                          className={cn(
                            "font-bold font-mono",
                            (m.uptime24h ?? 100) >= 99
                              ? "text-emerald-400"
                              : (m.uptime24h ?? 100) >= 95
                              ? "text-amber-400"
                              : "text-rose-400"
                          )}
                        >
                          {m.uptime24h !== null ? `${m.uptime24h.toFixed(1)}%` : "100%"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* ── RIGHT COLUMN (8 Cols): SERVER TOPOLOGY & PROBES ── */}
        <section className="col-span-12 lg:col-span-8 flex flex-col min-h-0 rounded-2xl bg-white/[0.02] border border-white/10 backdrop-blur-xl p-3 shadow-xl">
          {/* Section Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-brand-primary" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                Topologi Node Server & PRTG Sensors
              </h2>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              {displayedProbes.reduce((acc, p) => acc + p.devices.length, 0)} Server Terpantau
            </span>
          </div>

          {/* Probes & Server Grid (Scrollable internally if many servers) */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent">
            {displayedProbes.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                Tidak ada data probe pada filter ini.
              </div>
            ) : (
              displayedProbes.map((probe) => {
                const isProbePaused = (probe as any).isPaused;

                return (
                  <div
                    key={probe.probeName}
                    className={cn(
                      "rounded-xl border p-2.5 backdrop-blur-md transition-all",
                      isProbePaused
                        ? "border-sky-500/30 bg-sky-950/15"
                        : "border-white/10 bg-black/30"
                    )}
                  >
                    {/* Probe Header */}
                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "w-2 h-2 rounded-full",
                            isProbePaused
                              ? "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                              : probe.summary.down > 0
                              ? "bg-rose-500 animate-ping"
                              : probe.summary.warning > 0
                              ? "bg-amber-400"
                              : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                          )}
                        />
                        <h3 className="text-xs font-extrabold text-white tracking-wide">
                          {probe.probeName}
                        </h3>
                        {isProbePaused ? (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-400 border border-sky-500/40 font-bold">
                            SENSOR PAUSED
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-slate-400">
                            {probe.devices.length} Node
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] font-mono">
                        {isProbePaused ? (
                          <span className="text-sky-400 font-bold bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded">
                            {(probe as any).pausedCount || probe.summary.paused} Sensor Paused
                          </span>
                        ) : (
                          <>
                            <span className="text-emerald-400 font-bold">{probe.summary.ok} OK</span>
                            {probe.summary.warning > 0 && (
                              <span className="text-amber-400 font-bold">{probe.summary.warning} Warn</span>
                            )}
                            {probe.summary.down > 0 && (
                              <span className="text-rose-400 font-bold animate-pulse">{probe.summary.down} Down</span>
                            )}
                            <span className="text-slate-300 font-bold bg-white/5 px-2 py-0.5 rounded">
                              Health: {probe.healthPct}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Devices Grid in Probe */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {probe.devices.map((device) => {
                        const isDevicePaused = (device as any).isPaused || isProbePaused;

                        // If device is in Paused probe, render clear PAUSED banner
                        if (isDevicePaused) {
                          return (
                            <div
                              key={device.deviceName}
                              className="p-2.5 rounded-xl border border-sky-500/25 bg-sky-500/[0.04] flex flex-col justify-between"
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
                                  <span className="text-xs font-bold text-slate-200 truncate">
                                    {device.deviceName}
                                  </span>
                                </div>
                                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30 font-bold">
                                  PAUSED
                                </span>
                              </div>

                              <div className="p-2 rounded-lg bg-black/40 border border-sky-500/20 text-[10px] text-sky-300 font-mono flex items-center gap-1.5 mt-1">
                                <PauseCircle className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                <span>Sensor Paused</span>
                              </div>
                            </div>
                          );
                        }

                        const metrics = extractNodeMetrics(device.sensors);
                        const downSensors = device.sensors.filter((s) => s.lastStatus === "Down");
                        const warnSensors = device.sensors.filter((s) => s.lastStatus === "Warning");
                        const isDeviceDown = downSensors.length > 0;
                        const isDeviceWarn = warnSensors.length > 0;
                        const impairedSensors = [...downSensors, ...warnSensors];

                        const isCpuDown = metrics.cpuSensor?.lastStatus === "Down";
                        const isCpuWarn = metrics.cpuSensor?.lastStatus === "Warning" || (metrics.cpuPct ?? 0) >= 80;
                        const cpuBarColor = isCpuDown ? "bg-rose-500" : isCpuWarn ? "bg-amber-400" : "bg-brand-primary";
                        const cpuTextColor = isCpuDown ? "text-rose-400 font-bold" : isCpuWarn ? "text-amber-400 font-bold" : "text-slate-300";

                        const isMemDown = metrics.memSensor?.lastStatus === "Down";
                        const isMemWarn = metrics.memSensor?.lastStatus === "Warning" || (metrics.memPct ?? 0) >= 80;
                        const memBarColor = isMemDown ? "bg-rose-500" : isMemWarn ? "bg-amber-400" : "bg-emerald-400";
                        const memTextColor = isMemDown ? "text-rose-400 font-bold" : isMemWarn ? "text-amber-400 font-bold" : "text-slate-300";

                        const isDiskDown = metrics.diskSensors.some((s) => s.lastStatus === "Down");
                        const isDiskWarn = metrics.diskSensors.some((s) => s.lastStatus === "Warning");
                        const diskTextColor = isDiskDown ? "text-rose-400 font-bold animate-pulse" : isDiskWarn ? "text-amber-400 font-bold" : "text-slate-400";

                        const isPingDown = metrics.pingSensor?.lastStatus === "Down";
                        const isPingWarn = metrics.pingSensor?.lastStatus === "Warning";
                        const pingTextColor = isPingDown ? "text-rose-400 font-bold animate-pulse" : isPingWarn ? "text-amber-400 font-bold" : "text-sky-400";

                        return (
                          <div
                            key={device.deviceName}
                            className={cn(
                              "p-2.5 rounded-xl border transition-all flex flex-col justify-between",
                              isDeviceDown
                                ? "bg-rose-950/25 border-rose-500/60 shadow-lg shadow-rose-950/30"
                                : isDeviceWarn
                                ? "bg-amber-950/20 border-amber-500/40"
                                : "bg-white/[0.02] border-white/5 hover:border-white/15"
                            )}
                          >
                            {/* Device Top Details */}
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={cn(
                                    "w-2 h-2 rounded-full shrink-0",
                                    isDeviceDown ? "bg-rose-500 animate-ping" : isDeviceWarn ? "bg-amber-400" : "bg-emerald-400"
                                  )}
                                />
                                <span className="text-xs font-bold text-white truncate">
                                  {device.deviceName}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 font-mono text-[9px]">
                                {downSensors.length > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 font-bold animate-pulse">
                                    {downSensors.length} Down
                                  </span>
                                )}
                                {warnSensors.length > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 font-bold">
                                    {warnSensors.length} Warn
                                  </span>
                                )}
                                <span className="px-1.5 py-0.2 rounded bg-white/5 text-slate-400">
                                  {device.sensors.length} sensor
                                </span>
                              </div>
                            </div>

                            {/* Telemetry Metric Bars (CPU, RAM, DISK, PING) */}
                            <div className="space-y-1.5 my-1 text-[10px] font-mono">
                              {/* CPU Bar */}
                              <div className="flex items-center gap-2">
                                <span className="w-10 text-slate-500 text-[9px]">CPU</span>
                                <div className="flex-1 h-1.5 bg-black/60 rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all duration-500",
                                      cpuBarColor
                                    )}
                                    style={{ width: `${Math.min(metrics.cpuPct ?? 15, 100)}%` }}
                                  />
                                </div>
                                <span className={cn("w-12 text-right font-bold", cpuTextColor)}>
                                  {metrics.cpuText || "—"}
                                </span>
                              </div>

                              {/* RAM Bar */}
                              <div className="flex items-center gap-2">
                                <span className="w-10 text-slate-500 text-[9px]">RAM</span>
                                <div className="flex-1 h-1.5 bg-black/60 rounded-full overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all duration-500",
                                      memBarColor
                                    )}
                                    style={{ width: `${Math.min(metrics.memPct ?? 45, 100)}%` }}
                                  />
                                </div>
                                <span className={cn("w-12 text-right font-bold", memTextColor)}>
                                  {metrics.memText || "—"}
                                </span>
                              </div>

                              {/* Disk & Ping Info */}
                              <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[9px]">
                                <span className={cn("truncate max-w-[150px]", diskTextColor)}>
                                  💾 {metrics.diskText || "Disk OK"} {isDiskDown ? "(Down)" : isDiskWarn ? "(Warn)" : ""}
                                </span>
                                <span className={cn("font-bold shrink-0", pingTextColor)}>
                                  📶 {metrics.pingText || "Ping OK"}
                                </span>
                              </div>
                            </div>

                            {/* Impaired Sensors Alert Box (Down / Warning Details) */}
                            {impairedSensors.length > 0 && (
                              <div className="mt-2 pt-1.5 border-t border-white/10 space-y-1">
                                {impairedSensors.map((s) => {
                                  const isDown = s.lastStatus === "Down";
                                  const cleanMessage = s.lastMessage
                                    ? s.lastMessage
                                        .replace(/<[^>]*>/g, "")
                                        .replace(/<div class="moreicon"><\/div>/g, "")
                                        .trim()
                                    : "";

                                  return (
                                    <div
                                      key={s.id}
                                      className={cn(
                                        "px-2 py-1 rounded-md text-[9px] font-mono border flex items-center justify-between gap-1.5",
                                        isDown
                                          ? "bg-rose-950/40 border-rose-500/40 text-rose-300"
                                          : "bg-amber-950/40 border-amber-500/40 text-amber-300"
                                      )}
                                      title={cleanMessage || `${s.sensorName}: ${s.lastValue || s.lastStatus}`}
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span
                                          className={cn(
                                            "w-1.5 h-1.5 rounded-full shrink-0",
                                            isDown ? "bg-rose-500 animate-ping" : "bg-amber-400 animate-pulse"
                                          )}
                                        />
                                        <span className="font-bold truncate">{s.sensorName}</span>
                                        {s.lastValue && (
                                          <span className="opacity-80">({s.lastValue})</span>
                                        )}
                                      </div>
                                      <span
                                        className={cn(
                                          "font-bold uppercase shrink-0 text-[8px] px-1 py-0.2 rounded",
                                          isDown ? "bg-rose-500/30 text-rose-200" : "bg-amber-500/30 text-amber-200"
                                        )}
                                      >
                                        {s.lastStatus}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {/* ───────────────────────────────────────────────────────── */}
      {/* 5. BOTTOM STATUS MARQUEE & TELEMETRY FOOTER (~30px)       */}
      {/* ───────────────────────────────────────────────────────── */}
      <footer className="h-[30px] shrink-0 mt-2 px-3 rounded-lg bg-black/40 border border-white/10 flex items-center justify-between text-[10px] text-slate-400 relative z-10">
        <div className="flex items-center gap-2 overflow-hidden">
          {hasAnyCritical ? (
            <div className="flex items-center gap-2 text-rose-400 font-bold animate-pulse truncate">
              <BellRing className="w-3.5 h-3.5 shrink-0 text-rose-500 animate-bounce" />
              <span>
                PERINGATAN KRITIS: {totalDownSensors + uptimeDownCount} TARGET DOWN TERDETEKSI!
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-400 font-semibold truncate">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              <span>
                ALL SYSTEMS OPERATIONAL · TELEMETRI AKTIF DI SELURUH SITE PT. BINA SARANA SUKSES
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 font-mono text-[9px] text-slate-500 shrink-0">
          <span>PRTG & UPTIME DAEMON SYNC</span>
          <span className="text-slate-400">
            {currentTime ? currentTime.toLocaleTimeString("id-ID") : "--:--:--"}
          </span>
        </div>
      </footer>
    </div>
  );
}
