"use client";

import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Server,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Activity,
  TrendingUp,
  Clock,
  Shield,
  MousePointerClick,
  Search,
  Globe,
  HardDrive,
  Layers,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Database,
  Filter,
  X,
  Gauge,
  Wifi,
  FolderOpen,
  MonitorCog,
  Cpu,
  MemoryStick,
  MapPin,
  Table,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn, getStatusDotClass, getStatusBgColor, timeAgo } from "@/lib/utils";
import { SensorDetailModal } from "@/components/dashboard/sensor-modal";

// Types
interface SensorSummary {
  total: number;
  ok: number;
  warning: number;
  down: number;
  paused: number;
  active?: number;
}

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
}

interface ProbeGroup {
  probeName: string;
  groups?: string[];
  devices: DeviceGroup[];
  summary: SensorSummary;
  categoryLabel?: string;
  categoryIcon?: string;
}

interface BusinessPortal {
  id: number;
  name: string;
  domain: string;
  deviceName: string;
  probeName: string;
  status: string;
  lastValue: string | null;
  latencyMs: number | null;
  lastUpdated: string;
}

interface StorageWatchItem {
  id: number;
  sensorName: string;
  deviceName: string;
  probeName: string;
  status: string;
  lastValue: string;
  freePct: number | null;
  isWarning: boolean;
  isDown: boolean;
  lastMessage: string | null;
  lastUpdated: string;
}

interface SiteSummaryItem {
  probeName: string;
  total: number;
  ok: number;
  warning: number;
  down: number;
  healthPct: number;
}

interface DashboardData {
  summary: SensorSummary;
  probes: ProbeGroup[];
  availableCategories?: string[];
  siteSummary?: SiteSummaryItem[];
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
  businessPortals?: BusinessPortal[];
  storageWatchlist?: StorageWatchItem[];
  slaUptime: number;
  healthScore?: number;
  avgResponseTime: number;
  incidentCount: number;
}

// Category icon & label mapping
const CATEGORY_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  "Web Server": { icon: Globe, label: "Web Application Cluster", color: "text-sky-400" },
  "Database Server": { icon: Database, label: "Database Server Cluster", color: "text-amber-400" },
  "Additional Server": { icon: Server, label: "Additional Server", color: "text-purple-400" },
  "PRTG & Infrastructure": { icon: MonitorCog, label: "Core Infra & Monitoring", color: "text-emerald-400" },
  "PRTG": { icon: MonitorCog, label: "Core Monitoring", color: "text-emerald-400" },
};

// Parse structured device names like "Database01|PROD|192.168.3.252|jkt1.bss.com"
function parseDeviceName(raw: string): { name: string; env?: string; ip?: string; hostname?: string } {
  const parts = raw.split("|").map((p) => p.trim());
  if (parts.length >= 2) {
    return {
      name: parts[0],
      env: parts.length >= 2 ? parts[1] : undefined,
      ip: parts.length >= 3 ? parts[2] : undefined,
      hostname: parts.length >= 4 ? parts[3] : undefined,
    };
  }
  return { name: raw };
}

// Classify sensors into functional groups for PRTG-style display
interface ClassifiedSensors {
  cpu: SensorItem[];
  memory: SensorItem[];
  disk: SensorItem[];
  services: SensorItem[];
  network: SensorItem[];
  web: SensorItem[];
  hardware: SensorItem[];
  other: SensorItem[];
}

function classifySensors(sensors: SensorItem[]): ClassifiedSensors {
  const result: ClassifiedSensors = { cpu: [], memory: [], disk: [], services: [], network: [], web: [], hardware: [], other: [] };
  for (const s of sensors) {
    const n = s.sensorName.toLowerCase();
    if (n.includes("binasaranasukses") || n.includes("dashboardweb") || (n.includes(".") && (n.includes(".co") || n.includes(".id") || n.includes(".com")))) {
      result.web.push(s);
    } else if (n.includes("cpu") || n === "cpu load") {
      result.cpu.push(s);
    } else if (n.includes("mem") || n.includes("ram") || n.includes("physical memory")) {
      // Prioritize Physical Memory at the front, Meminfo at the back
      if (n.includes("physical memory")) {
        result.memory.unshift(s);
      } else if (n.includes("meminfo")) {
        result.memory.push(s);
      } else {
        result.memory.splice(result.memory.filter((m) => m.sensorName.toLowerCase().includes("physical memory")).length, 0, s);
      }
    } else if (n.includes("disk")) {
      result.disk.push(s);
    } else if (n.includes("service:") || n.includes("system health") || n.includes("probe health") || n.includes("sql agent") || n.includes("event log")) {
      result.services.push(s);
    } else if (n.includes("traffic") || n.includes("snmp") || n.includes("ping") || n.includes("network") || n.includes("npm")) {
      result.network.push(s);
    } else if (n.includes("temperature") || n.includes("fan") || n.includes("power supply") || n.includes("disk i/o")) {
      result.hardware.push(s);
    } else {
      result.other.push(s);
    }
  }
  return result;
}

// Parse numeric percentage from sensor value strings like "14 %", "80 %", "120 GB"
function parseGaugeValue(val: string | null): number | null {
  if (!val) return null;
  const match = val.match(/([\d.]+)\s*%/);
  if (match) return parseFloat(match[1]);
  return null;
}

// Resource Gauge Bar — visual progress bar for CPU/Memory/Disk
function ResourceGaugeBar({ sensor, onSelect, label }: { sensor: SensorItem; onSelect: (id: number) => void; label?: string }) {
  const pct = parseGaugeValue(sensor.lastValue);
  const isDown = sensor.lastStatus === "Down";
  const isWarning = sensor.lastStatus === "Warning";
  // For disk free sensors and Linux Meminfo (available memory), the percentage represents FREE/AVAILABLE
  const isMeminfo = sensor.sensorName.toLowerCase().includes("meminfo");
  const isFreeMetric =
    sensor.sensorName.toLowerCase().includes("disk free") ||
    isMeminfo ||
    sensor.sensorName.toLowerCase().includes("available") ||
    sensor.sensorName.toLowerCase().includes("free");

  const hasPct = pct !== null;
  const effectivePct = hasPct ? pct : 100;
  // For free metrics, high % is good (green), low % (<=20%) is warning/down
  // For usage metrics, high % (>=80%) is warning/down
  const barColor = isDown
    ? "bg-status-down"
    : isWarning
    ? "bg-status-warning"
    : !hasPct
    ? "bg-status-ok"
    : isFreeMetric
    ? effectivePct <= 10
      ? "bg-status-down"
      : effectivePct <= 20
      ? "bg-status-warning"
      : "bg-status-ok"
    : effectivePct >= 90
    ? "bg-status-down"
    : effectivePct >= 80
    ? "bg-status-warning"
    : "bg-status-ok";

  const textColor = isDown
    ? "text-status-down"
    : isWarning
    ? "text-status-warning"
    : !hasPct
    ? "text-status-ok"
    : isFreeMetric
    ? effectivePct <= 20
      ? "text-status-warning"
      : "text-noc-text-secondary"
    : effectivePct >= 80
    ? "text-status-warning"
    : "text-noc-text-secondary";

  // Shorten label
  const displayLabel = label || (isMeminfo ? "RAM (Free)" : sensor.sensorName
    .replace(/^Disk Free:\s*/, "")
    .replace(/^Memory:\s*/, "")
    .replace(/^CPU\s*/i, "CPU")
    .replace(/Label:/i, "")
    .replace(/Serial Number.*$/i, "")
    .trim());

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(sensor.id); }}
      className="w-full flex items-center gap-2 group cursor-pointer hover:bg-noc-hover/50 rounded px-1 py-0.5 transition-colors"
      title={`${sensor.sensorName}: ${sensor.lastValue || sensor.lastStatus}`}
    >
      <span className="text-[10px] text-noc-text-muted w-[90px] truncate text-left shrink-0 group-hover:text-noc-text-primary">{displayLabel}</span>
      <div className="flex-1 h-2 bg-noc-bg rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: hasPct ? `${Math.min(Math.max(pct, 0), 100)}%` : isDown ? "0%" : "100%" }}
        />
      </div>
      <span className={cn("text-[10px] font-mono font-bold shrink-0 text-right min-w-[48px]", textColor)}>
        {sensor.lastValue || sensor.lastStatus}
      </span>
    </button>
  );
}

// Service Status Chip — compact running/stopped indicator
function ServiceStatusChip({ sensor, onSelect }: { sensor: SensorItem; onSelect: (id: number) => void }) {
  const isOk = sensor.lastStatus === "OK";
  const isDown = sensor.lastStatus === "Down";
  const val = sensor.lastValue || sensor.lastStatus;

  // Shorten service names
  const shortName = sensor.sensorName
    .replace(/^Service:\s*/i, "")
    .replace(/^System\s*/i, "Sys ")
    .replace(/^Probe\s*/i, "")
    .trim();

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(sensor.id); }}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-all cursor-pointer",
        isDown
          ? "bg-status-down-bg border-status-down/30 text-status-down animate-pulse"
          : isOk
          ? "bg-status-ok-bg/50 border-status-ok/20 text-status-ok"
          : "bg-status-warning-bg border-status-warning/20 text-status-warning"
      )}
      title={`${sensor.sensorName}: ${val}`}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", isDown ? "bg-status-down" : isOk ? "bg-status-ok" : "bg-status-warning")} />
      <span className="truncate max-w-[80px]">{shortName}</span>
      <span className="font-mono text-[9px] opacity-70 shrink-0">{val}</span>
    </button>
  );
}

// Compact Metric Chip — for network, hardware, and other sensors
function MetricChip({ sensor, onSelect }: { sensor: SensorItem; onSelect: (id: number) => void }) {
  const isOk = sensor.lastStatus === "OK";
  const isDown = sensor.lastStatus === "Down";
  const isWarning = sensor.lastStatus === "Warning";
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(sensor.id); }}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-all cursor-pointer",
        isDown
          ? "bg-status-down-bg border-status-down/30 text-status-down"
          : isWarning
          ? "bg-status-warning-bg border-status-warning/30 text-status-warning"
          : "bg-noc-surface/60 border-noc-border/40 text-noc-text-secondary hover:text-noc-text-primary hover:border-brand-primary/30"
      )}
      title={`${sensor.sensorName}: ${sensor.lastValue || sensor.lastStatus}`}
    >
      <span className="truncate max-w-[100px] font-medium">{sensor.sensorName}</span>
      {sensor.lastValue && <span className="font-mono font-bold text-[9px] shrink-0">{sensor.lastValue}</span>}
    </button>
  );
}

// Dual Timezone Clock — Jakarta (WIB) & Site Tambang (WITA)
function DualTimezoneClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (tz: string) => {
    return now.toLocaleTimeString("id-ID", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).replace(/:/g, ".");
  };

  const formatDate = (tz: string) => {
    return now.toLocaleDateString("id-ID", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="flex items-stretch gap-0 rounded-2xl border border-noc-border bg-noc-surface/80 overflow-hidden shadow-sm">
      {/* Jakarta WIB */}
      <div className="flex-1 flex items-center gap-3 px-5 py-3">
        <MapPin className="w-4 h-4 text-brand-primary shrink-0" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-noc-text-muted">Jakarta (WIB)</p>
          <p className="text-xl font-mono font-bold text-brand-primary tracking-wider tabular-nums">
            {formatTime("Asia/Jakarta")}
          </p>
          <p className="text-[10px] text-noc-text-muted">{formatDate("Asia/Jakarta")}</p>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-noc-border self-stretch" />

      {/* Site Tambang WITA */}
      <div className="flex-1 flex items-center gap-3 px-5 py-3">
        <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-noc-text-muted">Site Tambang (WITA)</p>
          <p className="text-xl font-mono font-bold text-amber-400 tracking-wider tabular-nums">
            {formatTime("Asia/Makassar")}
          </p>
          <p className="text-[10px] text-noc-text-muted">{formatDate("Asia/Makassar")}</p>
        </div>
      </div>
    </div>
  );
}

// Split a multi-group probe into separate virtual probe cards
function splitProbeByCategory(probe: ProbeGroup): ProbeGroup[] {
  const groups = probe.groups || [];
  // If probe has <=1 unique group, or doesn't have the groupName field on devices, keep it whole
  if (groups.length <= 1 || !probe.devices.some((d) => d.groupName)) {
    return [probe];
  }

  const groupMap = new Map<string, DeviceGroup[]>();
  for (const device of probe.devices) {
    const cat = device.groupName || "General";
    const list = groupMap.get(cat) || [];
    list.push(device);
    groupMap.set(cat, list);
  }

  // Merge small categories (< 2 devices) into "Core Infra & Utility"
  const MERGE_THRESHOLD = 1;
  const mergedDevices: DeviceGroup[] = [];
  const result: ProbeGroup[] = [];

  for (const [cat, devices] of groupMap.entries()) {
    if (devices.length <= MERGE_THRESHOLD && cat !== "Web Server" && cat !== "Database Server") {
      mergedDevices.push(...devices);
    } else {
      const allSensors = devices.flatMap((d) => d.sensors);
      const meta = CATEGORY_META[cat];
      const shortProbe = probe.probeName.replace(/^Local Probe - /, "").replace(/ ?Server ?/i, "").trim();

      result.push({
        probeName: `${shortProbe || probe.probeName} — ${meta?.label || cat}`,
        categoryLabel: meta?.label || cat,
        categoryIcon: cat,
        devices,
        summary: {
          total: allSensors.length,
          ok: allSensors.filter((s) => s.lastStatus === "OK").length,
          warning: allSensors.filter((s) => s.lastStatus === "Warning").length,
          down: allSensors.filter((s) => s.lastStatus === "Down").length,
          paused: allSensors.filter((s) => s.lastStatus === "Paused").length,
        },
      });
    }
  }

  // Merge remainder into a single "Core Infra" card
  if (mergedDevices.length > 0) {
    const allSensors = mergedDevices.flatMap((d) => d.sensors);
    const shortProbe = probe.probeName.replace(/^Local Probe - /, "").replace(/ ?Server ?/i, "").trim();
    result.push({
      probeName: `${shortProbe || probe.probeName} — Core Infra & Utility`,
      categoryLabel: "Core Infra & Utility",
      categoryIcon: "PRTG & Infrastructure",
      devices: mergedDevices,
      summary: {
        total: allSensors.length,
        ok: allSensors.filter((s) => s.lastStatus === "OK").length,
        warning: allSensors.filter((s) => s.lastStatus === "Warning").length,
        down: allSensors.filter((s) => s.lastStatus === "Down").length,
        paused: allSensors.filter((s) => s.lastStatus === "Paused").length,
      },
    });
  }

  return result;
}

// KPI Card Component
function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
  badgeText,
  badgeColor,
  glowClass,
  progressPct,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
  badgeText?: string;
  badgeColor?: string;
  glowClass?: string;
  progressPct?: number;
}) {
  return (
    <div className={cn("kpi-card relative overflow-hidden transition-all hover:border-noc-border-strong", glowClass)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0 pr-2">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-noc-text-muted font-medium uppercase tracking-wider">{title}</p>
            {badgeText && (
              <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap", badgeColor || "bg-noc-surface text-noc-text-secondary")}>
                {badgeText}
              </span>
            )}
          </div>
          <p className={cn("text-2xl lg:text-3xl font-bold mt-1.5 tracking-tight", color)}>{value}</p>
          {subtitle && (
            <p className="text-xs text-noc-text-secondary mt-1 truncate">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            "p-3 rounded-xl shrink-0 flex items-center justify-center",
            color.replace("text-", "bg-").replace(/\d+$/, "500") + "/10"
          )}
        >
          <Icon className={cn("w-5 h-5 lg:w-6 lg:h-6", color)} />
        </div>
      </div>

      {progressPct !== undefined && (
        <div className="mt-3 w-full bg-noc-bg/80 h-1.5 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              progressPct >= 95 ? "bg-status-ok" : progressPct >= 85 ? "bg-status-warning" : "bg-status-down"
            )}
            style={{ width: `${Math.min(Math.max(progressPct, 0), 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// Compact Sensor Badge with Value
function SensorPill({
  sensor,
  onSelect,
}: {
  sensor: SensorItem;
  onSelect: (id: number) => void;
}) {
  const isDown = sensor.lastStatus === "Down";
  const isWarning = sensor.lastStatus === "Warning";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(sensor.id);
      }}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all text-left group cursor-pointer",
        isDown
          ? "bg-status-down-bg border-status-down/40 text-status-down hover:bg-status-down/20 shadow-sm shadow-status-down/10 animate-pulse"
          : isWarning
          ? "bg-status-warning-bg border-status-warning/40 text-status-warning hover:bg-status-warning/20 shadow-sm shadow-status-warning/10"
          : "bg-noc-surface border-noc-border/60 text-noc-text-secondary hover:text-noc-text-primary hover:border-brand-primary/40 hover:bg-noc-hover"
      )}
      title={`${sensor.sensorName}: ${sensor.lastValue || sensor.lastStatus}`}
    >
      <div className={getStatusDotClass(sensor.lastStatus)} />
      <span className="truncate max-w-[130px] sm:max-w-[160px] font-normal">{sensor.sensorName}</span>
      {sensor.lastValue && (
        <span
          className={cn(
            "text-[10px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0",
            isDown || isWarning ? "bg-black/30 text-white" : "bg-noc-bg/80 text-noc-text-primary group-hover:text-brand-primary"
          )}
        >
          {sensor.lastValue}
        </span>
      )}
    </button>
  );
}

// Enhanced Probe Card Component with Category Split & Smart Server Headers
function EnhancedProbeCard({
  probe,
  onSelectSensor,
  searchQuery,
  statusFilter,
  hidePaused = true,
}: {
  probe: ProbeGroup;
  onSelectSensor: (id: number) => void;
  searchQuery: string;
  statusFilter: string;
  hidePaused?: boolean;
}) {
  // Filter devices & sensors
  const filteredDevices = useMemo(() => {
    return probe.devices
      .map((device) => {
        const matchingSensors = device.sensors.filter((s) => {
          if (hidePaused && s.lastStatus === "Paused") return false;
          if (statusFilter === "down" && s.lastStatus !== "Down") return false;
          if (statusFilter === "warning" && s.lastStatus !== "Warning") return false;
          if (statusFilter === "attention" && s.lastStatus !== "Down" && s.lastStatus !== "Warning") return false;
          if (statusFilter === "ok" && s.lastStatus !== "OK") return false;
          if (statusFilter === "paused" && s.lastStatus !== "Paused") return false;
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (
            s.sensorName.toLowerCase().includes(q) ||
            device.deviceName.toLowerCase().includes(q) ||
            probe.probeName.toLowerCase().includes(q) ||
            (s.lastValue && s.lastValue.toLowerCase().includes(q))
          );
        });
        return { ...device, sensors: matchingSensors };
      })
      .filter((d) => d.sensors.length > 0);
  }, [probe, searchQuery, statusFilter, hidePaused]);

  if (filteredDevices.length === 0) return null;

  const totalFilteredSensors = filteredDevices.reduce((acc, d) => acc + d.sensors.length, 0);
  const activeSensors = probe.summary.ok + probe.summary.warning + probe.summary.down;
  const healthPct = activeSensors > 0 ? (probe.summary.ok / activeSensors) * 100 : 100;
  const worstStatus = probe.summary.down > 0 ? "Down" : probe.summary.warning > 0 ? "Warning" : "OK";

  // Determine category icon
  const catMeta = CATEGORY_META[probe.categoryIcon || ""];
  const CatIcon = catMeta?.icon || Layers;
  const catColor = catMeta?.color || "text-brand-primary";

  return (
    <div
      className={cn(
        "probe-card border transition-all duration-200",
        worstStatus === "Down"
          ? "border-status-down/30 shadow-lg shadow-status-down/5"
          : worstStatus === "Warning"
          ? "border-status-warning/20 shadow-lg shadow-status-warning/5"
          : "border-noc-border hover:border-noc-border-strong"
      )}
    >
      {/* Probe Header */}
      <div className="flex items-center justify-between pb-3 border-b border-noc-border/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn("p-1.5 rounded-lg", catColor.replace("text-", "bg-") + "/10")}>
            <CatIcon className={cn("w-4 h-4", catColor)} />
          </div>
          <div>
            <h3 className="font-bold text-sm text-noc-text-primary truncate" title={probe.probeName}>
              {probe.probeName}
            </h3>
            <p className="text-[11px] text-noc-text-muted">
              {filteredDevices.length} Server • {totalFilteredSensors} Sensor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {probe.summary.ok > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-ok-bg text-status-ok border border-status-ok/20">
              {probe.summary.ok} OK
            </span>
          )}
          {probe.summary.warning > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-warning-bg text-status-warning border border-status-warning/20">
              {probe.summary.warning} WARN
            </span>
          )}
          {probe.summary.down > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-down-bg text-status-down border border-status-down/20 animate-pulse">
              {probe.summary.down} DOWN
            </span>
          )}
        </div>
      </div>

      {/* Mini Health Bar */}
      <div className="py-2 flex items-center justify-between gap-3 text-[11px] text-noc-text-muted">
        <span>Health Score</span>
        <div className="flex items-center gap-2 flex-1 max-w-[140px]">
          <div className="flex-1 h-1.5 bg-noc-bg rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                healthPct >= 95 ? "bg-status-ok" : healthPct >= 80 ? "bg-status-warning" : "bg-status-down"
              )}
              style={{ width: `${healthPct}%` }}
            />
          </div>
          <span className="font-mono text-[10px] font-bold text-noc-text-secondary">{healthPct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Devices List — PRTG-Style Server Nodes */}
      <div className="space-y-3 pt-1">
        {filteredDevices.map((device) => {
          const parsed = parseDeviceName(device.deviceName);
          const classified = classifySensors(device.sensors);
          const hasResources = classified.cpu.length > 0 || classified.memory.length > 0 || classified.disk.length > 0;
          const hasServices = classified.services.length > 0;
          const hasNetwork = classified.network.length > 0;
          const hasWeb = classified.web.length > 0;
          const hasHardware = classified.hardware.length > 0;
          const hasOther = classified.other.length > 0;

          // Device-level worst status
          const deviceDown = device.sensors.some((s) => s.lastStatus === "Down");
          const deviceWarn = device.sensors.some((s) => s.lastStatus === "Warning");

          return (
            <div
              key={device.deviceName}
              className={cn(
                "bg-noc-bg/60 rounded-xl border overflow-hidden transition-all",
                deviceDown
                  ? "border-status-down/30"
                  : deviceWarn
                  ? "border-status-warning/20"
                  : "border-noc-border/40"
              )}
            >
              {/* Device Header */}
              <div className="flex items-start justify-between px-3 pt-2.5 pb-2 gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className={cn("w-2 h-2 rounded-full shrink-0", deviceDown ? "bg-status-down animate-pulse" : deviceWarn ? "bg-status-warning" : "bg-status-ok")} />
                    <span className="text-xs font-bold text-noc-text-primary" title={device.deviceName}>
                      {parsed.name}
                    </span>
                    {parsed.env && (
                      <span
                        className={cn(
                          "px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider",
                          parsed.env === "PROD"
                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            : parsed.env === "DEV"
                            ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                            : "bg-noc-surface text-noc-text-muted border border-noc-border"
                        )}
                      >
                        {parsed.env}
                      </span>
                    )}
                  </div>
                  {(parsed.ip || parsed.hostname) && (
                    <p className="text-[10px] text-noc-text-muted mt-0.5 font-mono pl-3.5">
                      {parsed.ip}{parsed.hostname ? ` • ${parsed.hostname}` : ""}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-noc-text-muted font-mono shrink-0">{device.sensors.length} sensor</span>
              </div>

              {/* Resource Gauges — CPU / Memory / Disk */}
              {hasResources && (
                <div className="px-3 pb-2">
                  <p className="text-[9px] uppercase tracking-widest text-noc-text-muted font-semibold mb-1 flex items-center gap-1">
                    <Gauge className="w-3 h-3" /> Resources
                  </p>
                  <div className="space-y-0.5">
                    {classified.cpu.map((s) => (
                      <ResourceGaugeBar key={s.id} sensor={s} onSelect={onSelectSensor} label="CPU" />
                    ))}
                    {classified.memory.map((s) => (
                      <ResourceGaugeBar key={s.id} sensor={s} onSelect={onSelectSensor} label={s.sensorName.replace(/Physical\s*/i, "").replace(/Memory/i, "Memory")} />
                    ))}
                    {classified.disk.map((s) => (
                      <ResourceGaugeBar key={s.id} sensor={s} onSelect={onSelectSensor} />
                    ))}
                  </div>
                </div>
              )}

              {/* Services & Infrastructure */}
              {(hasServices || hasHardware || hasNetwork || hasOther) && (
                <div className="px-3 pb-2">
                  {(hasServices || hasHardware) && (
                    <>
                      <p className="text-[9px] uppercase tracking-widest text-noc-text-muted font-semibold mb-1 flex items-center gap-1">
                        <Activity className="w-3 h-3" /> Services
                      </p>
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {classified.services.map((s) => (
                          <ServiceStatusChip key={s.id} sensor={s} onSelect={onSelectSensor} />
                        ))}
                        {classified.hardware.map((s) => (
                          <MetricChip key={s.id} sensor={s} onSelect={onSelectSensor} />
                        ))}
                      </div>
                    </>
                  )}
                  {(hasNetwork || hasOther) && (
                    <div className="flex flex-wrap gap-1">
                      {classified.network.map((s) => (
                        <MetricChip key={s.id} sensor={s} onSelect={onSelectSensor} />
                      ))}
                      {classified.other.map((s) => (
                        <MetricChip key={s.id} sensor={s} onSelect={onSelectSensor} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Web Applications */}
              {hasWeb && (
                <div className="px-3 pb-2.5">
                  <p className="text-[9px] uppercase tracking-widest text-noc-text-muted font-semibold mb-1 flex items-center gap-1">
                    <Globe className="w-3 h-3" /> Web Applications
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {classified.web.map((s) => (
                      <SensorPill key={s.id} sensor={s} onSelect={onSelectSensor} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Table Grid Row for a single Server/Node
function ServerTableRow({
  device,
  probeName,
  onSelectSensor,
}: {
  device: DeviceGroup;
  probeName: string;
  onSelectSensor: (id: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const parsed = parseDeviceName(device.deviceName);
  const classified = classifySensors(device.sensors);

  const deviceDown = device.sensors.some((s) => s.lastStatus === "Down");
  const deviceWarn = device.sensors.some((s) => s.lastStatus === "Warning");
  const okCount = device.sensors.filter((s) => s.lastStatus === "OK").length;
  const warnCount = device.sensors.filter((s) => s.lastStatus === "Warning").length;
  const downCount = device.sensors.filter((s) => s.lastStatus === "Down").length;
  const activeSensors = device.sensors.filter((s) => s.lastStatus !== "Paused").length;
  const serverHealth = activeSensors > 0 ? Math.round((okCount / activeSensors) * 100) : 100;

  // Primary CPU
  const primaryCpu = classified.cpu[0];
  const cpuPct = primaryCpu ? parseGaugeValue(primaryCpu.lastValue) : null;

  // Primary Memory: Prioritize valid Physical Memory and avoid Meminfo
  const physicalMemSensors = classified.memory.filter((s) => s.sensorName.toLowerCase().includes("physical memory"));
  const primaryMem =
    physicalMemSensors.find((s) => s.lastStatus !== "Down" && s.lastValue) ||
    physicalMemSensors[0] ||
    classified.memory.find((s) => !s.sensorName.toLowerCase().includes("meminfo")) ||
    classified.memory[0];
  const isMeminfo = primaryMem?.sensorName.toLowerCase().includes("meminfo");
  const rawMemPct = primaryMem ? parseGaugeValue(primaryMem.lastValue) : null;
  const usedMemPct = isMeminfo && rawMemPct !== null ? Math.max(0, 100 - rawMemPct) : rawMemPct;

  return (
    <>
      <tr
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "border-b border-noc-border/40 hover:bg-noc-hover/50 transition-colors cursor-pointer group",
          deviceDown
            ? "bg-status-down/5 hover:bg-status-down/10"
            : deviceWarn
            ? "bg-status-warning/5 hover:bg-status-warning/10"
            : ""
        )}
      >
        {/* Status Indicator */}
        <td className="py-3 px-3.5 w-10 text-center">
          <div
            className={cn(
              "w-2.5 h-2.5 rounded-full mx-auto transition-transform group-hover:scale-125",
              deviceDown
                ? "bg-status-down animate-pulse shadow-sm shadow-status-down"
                : deviceWarn
                ? "bg-status-warning shadow-sm shadow-status-warning"
                : "bg-status-ok"
            )}
            title={deviceDown ? "Server memiliki sensor Down" : deviceWarn ? "Server memiliki peringatan (Warning)" : "Seluruh sensor Server Normal / OK"}
          />
        </td>

        {/* Server / Host */}
        <td className="py-3 px-3.5 min-w-[190px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-xs text-noc-text-primary group-hover:text-brand-primary transition-colors" title={device.deviceName}>
              {parsed.name}
            </span>
            {parsed.env && (
              <span
                className={cn(
                  "px-1.5 py-0.2 text-[9px] font-bold rounded uppercase tracking-wider",
                  parsed.env === "PROD"
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                    : parsed.env === "DEV"
                    ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                    : "bg-noc-surface text-noc-text-muted border border-noc-border"
                )}
              >
                {parsed.env}
              </span>
            )}
          </div>
          {(parsed.ip || parsed.hostname) && (
            <div className="text-[11px] text-noc-text-muted font-mono mt-0.5">
              {parsed.ip}{parsed.hostname ? ` • ${parsed.hostname}` : ""}
            </div>
          )}
        </td>

        {/* Health Score */}
        <td className="py-3 px-3.5 min-w-[130px]">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span
                className={cn(
                  "font-mono font-bold text-xs",
                  serverHealth >= 95 ? "text-status-ok" : serverHealth >= 80 ? "text-status-warning" : "text-status-down"
                )}
              >
                {serverHealth}%
              </span>
              <span
                className={cn(
                  "text-[9px] font-semibold px-1.5 py-0.2 rounded",
                  serverHealth === 100
                    ? "bg-status-ok-bg text-status-ok"
                    : deviceDown
                    ? "bg-status-down-bg text-status-down animate-pulse"
                    : "bg-status-warning-bg text-status-warning"
                )}
              >
                {serverHealth === 100 ? "Optimal" : deviceDown ? "Kritis" : "Warning"}
              </span>
            </div>
            <div className="w-full h-1.5 bg-noc-bg rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  serverHealth >= 95 ? "bg-status-ok" : serverHealth >= 80 ? "bg-status-warning" : "bg-status-down"
                )}
                style={{ width: `${serverHealth}%` }}
              />
            </div>
          </div>
        </td>

        {/* CPU Gauge */}
        <td className="py-3 px-3.5 min-w-[130px]">
          {primaryCpu ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectSensor(primaryCpu.id);
              }}
              className="w-full text-left group/metric cursor-pointer"
              title={`${primaryCpu.sensorName}: ${primaryCpu.lastValue || primaryCpu.lastStatus}`}
            >
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-noc-text-muted group-hover/metric:text-brand-primary font-mono">CPU</span>
                <span
                  className={cn(
                    "font-mono font-bold",
                    primaryCpu.lastStatus === "Down"
                      ? "text-status-down"
                      : primaryCpu.lastStatus === "Warning"
                      ? "text-status-warning"
                      : (cpuPct || 0) >= 85
                      ? "text-status-warning"
                      : "text-noc-text-secondary"
                  )}
                >
                  {primaryCpu.lastValue || primaryCpu.lastStatus}
                </span>
              </div>
              <div className="w-full h-1.5 bg-noc-bg rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    primaryCpu.lastStatus === "Down"
                      ? "bg-status-down"
                      : (cpuPct || 0) >= 85
                      ? "bg-status-down"
                      : (cpuPct || 0) >= 70
                      ? "bg-status-warning"
                      : "bg-status-ok"
                  )}
                  style={{ width: `${Math.min(Math.max(cpuPct || 0, 0), 100)}%` }}
                />
              </div>
            </button>
          ) : (
            <span className="text-[11px] text-noc-text-muted font-mono">-</span>
          )}
        </td>

        {/* Memory Gauge */}
        <td className="py-3 px-3.5 min-w-[140px]">
          {primaryMem ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectSensor(primaryMem.id);
              }}
              className="w-full text-left group/metric cursor-pointer"
              title={`${primaryMem.sensorName}: ${primaryMem.lastValue || primaryMem.lastStatus}${isMeminfo && rawMemPct !== null ? ` (Terpakai ${usedMemPct}%)` : ""}`}
            >
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-noc-text-muted group-hover/metric:text-brand-primary font-mono">
                  {isMeminfo ? "RAM (Free)" : "RAM"}
                </span>
                <span
                  className={cn(
                    "font-mono font-bold truncate max-w-[85px]",
                    primaryMem.lastStatus === "Down"
                      ? "text-status-down"
                      : primaryMem.lastStatus === "Warning"
                      ? "text-status-warning"
                      : isMeminfo
                      ? (rawMemPct || 0) <= 20
                        ? "text-status-warning"
                        : "text-noc-text-secondary"
                      : (usedMemPct || 0) >= 90
                      ? "text-status-warning"
                      : "text-noc-text-secondary"
                  )}
                >
                  {primaryMem.lastValue || primaryMem.lastStatus}
                </span>
              </div>
              <div className="w-full h-1.5 bg-noc-bg rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    primaryMem.lastStatus === "Down"
                      ? "bg-status-down"
                      : primaryMem.lastStatus === "Warning"
                      ? "bg-status-warning"
                      : isMeminfo
                      ? (rawMemPct || 0) <= 10
                        ? "bg-status-down"
                        : (rawMemPct || 0) <= 20
                        ? "bg-status-warning"
                        : "bg-status-ok"
                      : (usedMemPct || 0) >= 90
                      ? "bg-status-down"
                      : (usedMemPct || 0) >= 80
                      ? "bg-status-warning"
                      : "bg-status-ok"
                  )}
                  style={{
                    width: `${Math.min(
                      Math.max(isMeminfo ? (rawMemPct || 0) : (usedMemPct || 0), 0),
                      100
                    )}%`,
                  }}
                />
              </div>
            </button>
          ) : (
            <span className="text-[11px] text-noc-text-muted font-mono">-</span>
          )}
        </td>

        {/* Storage / Disks */}
        <td className="py-3 px-3.5 min-w-[170px]">
          {classified.disk.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {classified.disk.slice(0, 3).map((disk) => {
                const isDown = disk.lastStatus === "Down";
                const isWarn = disk.lastStatus === "Warning";
                const diskName = disk.sensorName
                  .replace(/^Disk Free:\s*/i, "")
                  .replace(/Label:.*$/i, "")
                  .replace(/Serial Number.*$/i, "")
                  .trim();
                return (
                  <button
                    key={disk.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSensor(disk.id);
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border transition-all cursor-pointer",
                      isDown
                        ? "bg-status-down-bg border-status-down/30 text-status-down font-bold animate-pulse"
                        : isWarn
                        ? "bg-status-warning-bg border-status-warning/30 text-status-warning font-bold"
                        : "bg-noc-bg/80 border-noc-border/60 text-noc-text-secondary hover:text-brand-primary hover:border-brand-primary/40"
                    )}
                    title={`${disk.sensorName}: ${disk.lastValue || disk.lastStatus}`}
                  >
                    <span>{diskName || "Disk"}</span>
                    <span className="opacity-85 font-semibold">{disk.lastValue || disk.lastStatus}</span>
                  </button>
                );
              })}
              {classified.disk.length > 3 && (
                <span className="text-[10px] text-noc-text-muted font-mono self-center">
                  +{classified.disk.length - 3}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-noc-text-muted font-mono">-</span>
          )}
        </td>

        {/* Services & Network */}
        <td className="py-3 px-3.5 min-w-[160px]">
          {classified.services.length > 0 || classified.network.length > 0 || classified.web.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {classified.services.slice(0, 2).map((s) => (
                <ServiceStatusChip key={s.id} sensor={s} onSelect={onSelectSensor} />
              ))}
              {classified.network.slice(0, 1).map((s) => (
                <MetricChip key={s.id} sensor={s} onSelect={onSelectSensor} />
              ))}
              {classified.web.slice(0, 1).map((s) => (
                <SensorPill key={s.id} sensor={s} onSelect={onSelectSensor} />
              ))}
              {classified.services.length + classified.network.length + classified.web.length > 3 && (
                <span className="text-[10px] text-noc-text-muted font-mono self-center">
                  +{classified.services.length + classified.network.length + classified.web.length - 3} lagi
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-noc-text-muted font-mono">-</span>
          )}
        </td>

        {/* Sensor Counts */}
        <td className="py-3 px-3.5 text-center min-w-[100px]">
          <div className="inline-flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-noc-text-primary font-bold">{device.sensors.length}</span>
            <span className="text-noc-text-muted text-[10px]">sensor</span>
          </div>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            {downCount > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-status-down-bg text-status-down animate-pulse">
                {downCount} D
              </span>
            )}
            {warnCount > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-status-warning-bg text-status-warning">
                {warnCount} W
              </span>
            )}
            {okCount > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-status-ok-bg text-status-ok">
                {okCount} OK
              </span>
            )}
          </div>
        </td>

        {/* Expand Action */}
        <td className="py-3 px-3 text-right">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="p-1.5 rounded-lg text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-surface transition-colors cursor-pointer"
            title={isExpanded ? "Tutup detail sensor server" : "Buka rincian lengkap sensor server"}
          >
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-brand-primary" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </td>
      </tr>

      {/* Expandable Sub-Row */}
      {isExpanded && (
        <tr className="bg-noc-bg/90 border-b border-noc-border/80">
          <td colSpan={9} className="p-3.5 sm:p-4">
            <div className="bg-noc-surface/90 rounded-xl border border-noc-border/60 p-4 shadow-inner">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-noc-border/60 text-xs flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Server className="w-4 h-4 text-brand-primary" />
                  <span className="font-bold text-noc-text-primary">
                    Daftar Lengkap Sensor: {parsed.name}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border",
                      serverHealth >= 95
                        ? "bg-status-ok-bg text-status-ok border-status-ok/25"
                        : serverHealth >= 80
                        ? "bg-status-warning-bg text-status-warning border-status-warning/25"
                        : "bg-status-down-bg text-status-down border-status-down/25"
                    )}
                  >
                    Health: {serverHealth}% ({okCount}/{device.sensors.length} Sensor OK)
                  </span>
                </div>
                <span className="text-[11px] text-brand-primary font-medium flex items-center gap-1">
                  <MousePointerClick className="w-3.5 h-3.5" /> Klik sensor untuk grafik & riwayat
                </span>
              </div>

              {/* Grid of Classified Sensors */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Resources */}
                {(classified.cpu.length > 0 || classified.memory.length > 0 || classified.disk.length > 0) && (
                  <div className="bg-noc-bg/70 rounded-xl p-3 border border-noc-border/40">
                    <p className="text-[10px] font-bold text-noc-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-brand-primary" /> Resources (CPU / RAM / Disk)
                    </p>
                    <div className="space-y-1">
                      {classified.cpu.map((s) => (
                        <ResourceGaugeBar key={s.id} sensor={s} onSelect={onSelectSensor} label="CPU" />
                      ))}
                      {classified.memory.map((s) => (
                        <ResourceGaugeBar key={s.id} sensor={s} onSelect={onSelectSensor} label={s.sensorName.replace(/Physical\s*/i, "").replace(/Memory/i, "RAM")} />
                      ))}
                      {classified.disk.map((s) => (
                        <ResourceGaugeBar key={s.id} sensor={s} onSelect={onSelectSensor} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Services & Hardware */}
                {(classified.services.length > 0 || classified.hardware.length > 0) && (
                  <div className="bg-noc-bg/70 rounded-xl p-3 border border-noc-border/40">
                    <p className="text-[10px] font-bold text-noc-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-brand-accent" /> Layanan Sistem & Hardware
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {classified.services.map((s) => (
                        <ServiceStatusChip key={s.id} sensor={s} onSelect={onSelectSensor} />
                      ))}
                      {classified.hardware.map((s) => (
                        <MetricChip key={s.id} sensor={s} onSelect={onSelectSensor} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Network & Web */}
                {(classified.network.length > 0 || classified.web.length > 0 || classified.other.length > 0) && (
                  <div className="bg-noc-bg/70 rounded-xl p-3 border border-noc-border/40">
                    <p className="text-[10px] font-bold text-noc-text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Wifi className="w-3.5 h-3.5 text-sky-400" /> Jaringan & Aplikasi Web
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {classified.web.map((s) => (
                        <SensorPill key={s.id} sensor={s} onSelect={onSelectSensor} />
                      ))}
                      {classified.network.map((s) => (
                        <MetricChip key={s.id} sensor={s} onSelect={onSelectSensor} />
                      ))}
                      {classified.other.map((s) => (
                        <MetricChip key={s.id} sensor={s} onSelect={onSelectSensor} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Topology Table Grid Component
function TopologyTableGrid({
  probes,
  onSelectSensor,
  searchQuery,
  statusFilter,
  hidePaused = true,
}: {
  probes: ProbeGroup[];
  onSelectSensor: (id: number) => void;
  searchQuery: string;
  statusFilter: string;
  hidePaused?: boolean;
}) {
  // Filter devices & sensors inside each probe
  const processedProbes = useMemo(() => {
    return probes
      .map((probe) => {
        const filteredDevices = probe.devices
          .map((device) => {
            const matchingSensors = device.sensors.filter((s) => {
              if (hidePaused && s.lastStatus === "Paused") return false;
              if (statusFilter === "down" && s.lastStatus !== "Down") return false;
              if (statusFilter === "warning" && s.lastStatus !== "Warning") return false;
              if (statusFilter === "attention" && s.lastStatus !== "Down" && s.lastStatus !== "Warning") return false;
              if (statusFilter === "ok" && s.lastStatus !== "OK") return false;
              if (statusFilter === "paused" && s.lastStatus !== "Paused") return false;
              if (!searchQuery) return true;
              const q = searchQuery.toLowerCase();
              return (
                s.sensorName.toLowerCase().includes(q) ||
                device.deviceName.toLowerCase().includes(q) ||
                probe.probeName.toLowerCase().includes(q) ||
                (s.lastValue && s.lastValue.toLowerCase().includes(q))
              );
            });
            return { ...device, sensors: matchingSensors };
          })
          .filter((d) => d.sensors.length > 0);

        return { ...probe, devices: filteredDevices };
      })
      .filter((p) => p.devices.length > 0);
  }, [probes, searchQuery, statusFilter, hidePaused]);

  if (processedProbes.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <Server className="w-10 h-10 text-noc-text-muted mx-auto mb-3" />
        <p className="text-sm text-noc-text-secondary font-medium">
          Tidak ada server yang sesuai dengan filter atau pencarian saat ini
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cluster Health Score Summary Strip */}
      {processedProbes.length > 1 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-noc-text-muted px-1">
            <span className="font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-brand-primary" /> Ringkasan Health Score Per Cluster
            </span>
            <span className="text-[10px] font-mono">{processedProbes.length} Cluster Aktif</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {processedProbes.map((p) => {
              const pTotal = p.devices.reduce((acc, d) => acc + d.sensors.length, 0);
              const pActive = p.devices.reduce((acc, d) => acc + d.sensors.filter((s) => s.lastStatus !== "Paused").length, 0);
              const pOk = p.devices.reduce((acc, d) => acc + d.sensors.filter((s) => s.lastStatus === "OK").length, 0);
              const pHealth = pActive > 0 ? (pOk / pActive) * 100 : 100;
              const pMeta = CATEGORY_META[p.categoryIcon || ""];
              const PIcon = pMeta?.icon || Layers;
              const pColor = pMeta?.color || "text-brand-primary";
              const pDown = p.devices.some((d) => d.sensors.some((s) => s.lastStatus === "Down"));
              const pWarn = p.devices.some((d) => d.sensors.some((s) => s.lastStatus === "Warning"));

              return (
                <div
                  key={p.probeName}
                  className={cn(
                    "glass-card p-3 flex items-center justify-between gap-3 border transition-all",
                    pDown
                      ? "border-status-down/30 shadow-sm shadow-status-down/5"
                      : pWarn
                      ? "border-status-warning/20 shadow-sm shadow-status-warning/5"
                      : "border-noc-border/60 hover:border-brand-primary/40"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn("p-2 rounded-xl shrink-0", pColor.replace("text-", "bg-") + "/15")}>
                      <PIcon className={cn("w-4 h-4", pColor)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-noc-text-primary truncate" title={p.probeName}>
                        {p.probeName}
                      </p>
                      <p className="text-[10px] text-noc-text-muted">
                        {p.devices.length} Node • {pTotal} Sensor
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={cn(
                        "text-xs font-mono font-bold",
                        pHealth >= 95 ? "text-status-ok" : pHealth >= 80 ? "text-status-warning" : "text-status-down"
                      )}
                    >
                      {pHealth.toFixed(0)}%
                    </span>
                    <div className="w-12 h-1.5 bg-noc-bg rounded-full overflow-hidden mt-1">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          pHealth >= 95 ? "bg-status-ok" : pHealth >= 80 ? "bg-status-warning" : "bg-status-down"
                        )}
                        style={{ width: `${pHealth}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {processedProbes.map((probe) => {
        const totalSensors = probe.devices.reduce((acc, d) => acc + d.sensors.length, 0);
        const activeSensors = probe.devices.reduce((acc, d) => acc + d.sensors.filter((s) => s.lastStatus !== "Paused").length, 0);
        const clusterOk = probe.devices.reduce((acc, d) => acc + d.sensors.filter((s) => s.lastStatus === "OK").length, 0);
        const clusterWarn = probe.devices.reduce((acc, d) => acc + d.sensors.filter((s) => s.lastStatus === "Warning").length, 0);
        const clusterDown = probe.devices.reduce((acc, d) => acc + d.sensors.filter((s) => s.lastStatus === "Down").length, 0);
        const clusterHealthPct = activeSensors > 0 ? (clusterOk / activeSensors) * 100 : 100;
        const catMeta = CATEGORY_META[probe.categoryIcon || ""];
        const CatIcon = catMeta?.icon || Layers;
        const catColor = catMeta?.color || "text-brand-primary";
        const worstStatus = clusterDown > 0 ? "Down" : clusterWarn > 0 ? "Warning" : "OK";

        return (
          <div
            key={probe.probeName}
            className={cn(
              "glass-card overflow-hidden border transition-all duration-200",
              worstStatus === "Down"
                ? "border-status-down/30 shadow-lg shadow-status-down/5"
                : worstStatus === "Warning"
                ? "border-status-warning/20 shadow-lg shadow-status-warning/5"
                : "border-noc-border hover:border-noc-border-strong"
            )}
          >
            {/* Probe Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 border-b border-noc-border/60 bg-noc-surface/70">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-xl shrink-0", catColor.replace("text-", "bg-") + "/15")}>
                  <CatIcon className={cn("w-5 h-5", catColor)} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm text-noc-text-primary">
                      {probe.probeName}
                    </h3>
                    <span
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-mono font-bold rounded-full border",
                        clusterHealthPct >= 95
                          ? "bg-status-ok-bg text-status-ok border-status-ok/25"
                          : clusterHealthPct >= 80
                          ? "bg-status-warning-bg text-status-warning border-status-warning/25"
                          : "bg-status-down-bg text-status-down border-status-down/25"
                      )}
                    >
                      Cluster Health: {clusterHealthPct.toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-noc-text-muted mt-0.5">
                    {probe.devices.length} Server Node • {totalSensors} Sensor Terpantau
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Health Meter */}
                <div className="flex items-center gap-2 text-xs bg-noc-bg/60 px-3 py-1.5 rounded-xl border border-noc-border/40">
                  <span className="text-noc-text-muted hidden sm:inline font-medium">Health:</span>
                  <div className="w-20 sm:w-28 h-2 bg-noc-bg rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        clusterHealthPct >= 95 ? "bg-status-ok" : clusterHealthPct >= 80 ? "bg-status-warning" : "bg-status-down"
                      )}
                      style={{ width: `${clusterHealthPct}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "font-mono text-xs font-bold",
                      clusterHealthPct >= 95 ? "text-status-ok" : clusterHealthPct >= 80 ? "text-status-warning" : "text-status-down"
                    )}
                  >
                    {clusterHealthPct.toFixed(1)}%
                  </span>
                </div>

                {/* Status Badges */}
                <div className="flex items-center gap-1.5">
                  {clusterOk > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-ok-bg text-status-ok border border-status-ok/20">
                      {clusterOk} OK
                    </span>
                  )}
                  {clusterWarn > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-warning-bg text-status-warning border border-status-warning/20">
                      {clusterWarn} WARN
                    </span>
                  )}
                  {clusterDown > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-down-bg text-status-down border border-status-down/20 animate-pulse">
                      {clusterDown} DOWN
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Table Grid View */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-noc-border/60 bg-noc-bg/40 text-[10px] uppercase tracking-wider text-noc-text-muted font-semibold">
                    <th className="py-2.5 px-3.5 text-center w-10">Status</th>
                    <th className="py-2.5 px-3.5 min-w-[190px]">Server / Host</th>
                    <th className="py-2.5 px-3.5 min-w-[130px]">Health Score</th>
                    <th className="py-2.5 px-3.5 min-w-[125px]">CPU Load</th>
                    <th className="py-2.5 px-3.5 min-w-[130px]">Memory / RAM</th>
                    <th className="py-2.5 px-3.5 min-w-[160px]">Storage / Disk</th>
                    <th className="py-2.5 px-3.5 min-w-[150px]">Layanan Utama</th>
                    <th className="py-2.5 px-3.5 text-center min-w-[90px]">Sensors</th>
                    <th className="py-2.5 px-3 text-right w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {probe.devices.map((device) => (
                    <ServerTableRow
                      key={device.deviceName}
                      device={device}
                      probeName={probe.probeName}
                      onSelectSensor={onSelectSensor}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// BSS Business Applications Grid Component
function BusinessPortalsView({
  portals,
  onSelectSensor,
  searchQuery,
}: {
  portals: BusinessPortal[];
  onSelectSensor: (id: number) => void;
  searchQuery: string;
}) {
  const filtered = useMemo(() => {
    if (!searchQuery) return portals;
    const q = searchQuery.toLowerCase();
    return portals.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.domain.toLowerCase().includes(q) ||
        p.deviceName.toLowerCase().includes(q) ||
        p.probeName.toLowerCase().includes(q)
    );
  }, [portals, searchQuery]);

  if (filtered.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <Globe className="w-10 h-10 text-noc-text-muted mx-auto mb-3" />
        <p className="text-sm text-noc-text-secondary font-medium">Tidak ada portal bisnis yang sesuai dengan filter pencarian</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-noc-text-primary flex items-center gap-2">
            <Globe className="w-5 h-5 text-brand-primary" />
            Portal & Layanan Bisnis PT. Bina Sarana Sukses
          </h2>
          <p className="text-xs text-noc-text-muted mt-0.5">
            Monitoring latensi respons HTTP dan ketersediaan layanan korporat internal
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-status-ok-bg text-status-ok border border-status-ok/20">
          {filtered.filter((p) => p.status === "OK").length} / {filtered.length} Online
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((portal) => {
          const isFast = portal.latencyMs !== null && portal.latencyMs < 100;
          const isModerate = portal.latencyMs !== null && portal.latencyMs >= 100 && portal.latencyMs < 300;

          return (
            <div
              key={portal.id}
              onClick={() => onSelectSensor(portal.id)}
              className="glass-card p-4 hover:border-brand-primary/40 transition-all cursor-pointer group relative overflow-hidden"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <div className={getStatusDotClass(portal.status)} />
                    <h3 className="font-bold text-sm text-noc-text-primary group-hover:text-brand-primary transition-colors truncate">
                      {portal.name}
                    </h3>
                  </div>
                  <p className="text-xs font-mono text-noc-text-muted mt-1 truncate" title={portal.domain}>
                    {portal.domain}
                  </p>
                </div>

                <span
                  className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border",
                    portal.status === "OK"
                      ? "bg-status-ok-bg text-status-ok border-status-ok/20"
                      : portal.status === "Warning"
                      ? "bg-status-warning-bg text-status-warning border-status-warning/20"
                      : "bg-status-down-bg text-status-down border-status-down/20"
                  )}
                >
                  {portal.status.toUpperCase()}
                </span>
              </div>

              {/* Latency meter */}
              <div className="bg-noc-bg/60 p-2.5 rounded-xl border border-noc-border/40 mb-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-noc-text-muted text-[11px] flex items-center gap-1">
                    <Activity className="w-3 h-3 text-brand-primary" /> Latensi Respons
                  </span>
                  <span
                    className={cn(
                      "font-mono font-bold text-xs",
                      isFast ? "text-status-ok" : isModerate ? "text-amber-400" : "text-status-down"
                    )}
                  >
                    {portal.lastValue || "-"}
                  </span>
                </div>

                <div className="w-full bg-noc-bg h-1.5 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isFast ? "bg-status-ok" : isModerate ? "bg-amber-400" : "bg-status-down"
                    )}
                    style={{
                      width: portal.latencyMs ? `${Math.min((portal.latencyMs / 500) * 100, 100)}%` : "10%",
                    }}
                  />
                </div>
              </div>

              {/* Meta footer */}
              <div className="flex items-center justify-between text-[11px] text-noc-text-muted pt-1">
                <span className="truncate max-w-[170px]" title={portal.deviceName}>
                  {portal.deviceName}
                </span>
                <span className="flex items-center gap-1 text-brand-primary group-hover:translate-x-0.5 transition-transform font-medium">
                  Inspeksi <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Storage & Capacity Watchlist Component
function StorageWatchlistView({
  disks,
  onSelectSensor,
  searchQuery,
}: {
  disks: StorageWatchItem[];
  onSelectSensor: (id: number) => void;
  searchQuery: string;
}) {
  const filtered = useMemo(() => {
    if (!searchQuery) return disks;
    const q = searchQuery.toLowerCase();
    return disks.filter(
      (d) =>
        d.sensorName.toLowerCase().includes(q) ||
        d.deviceName.toLowerCase().includes(q) ||
        d.probeName.toLowerCase().includes(q)
    );
  }, [disks, searchQuery]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-noc-text-primary flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-amber-400" />
            Watchlist Kapasitas Storage & Partisi Disk Server
          </h2>
          <p className="text-xs text-noc-text-muted mt-0.5">
            Daftar sensor penyimpanan diurutkan dari sisa kapasitas terendah / membutuhkan tindakan pembersihan
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-status-warning-bg text-status-warning border border-status-warning/20">
          {disks.filter((d) => d.isWarning || d.isDown).length} Partisi Perhatian
        </span>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-noc-border bg-noc-bg/40 text-noc-text-muted text-xs">
                <th className="text-left py-3 px-4 font-semibold">Server & Site</th>
                <th className="text-left py-3 px-4 font-semibold">Partisi / Drive Disk</th>
                <th className="text-left py-3 px-4 font-semibold min-w-[180px]">Sisa Kapasitas (Free Space)</th>
                <th className="text-left py-3 px-4 font-semibold">Pesan Analisis PRTG</th>
                <th className="text-right py-3 px-4 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((disk) => {
                const isCritical = disk.isDown || (disk.freePct !== null && disk.freePct <= 10);
                const isWarn = disk.isWarning || (disk.freePct !== null && disk.freePct <= 25);

                return (
                  <tr
                    key={disk.id}
                    onClick={() => onSelectSensor(disk.id)}
                    className="border-b border-noc-border/50 hover:bg-noc-hover/50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <p className="font-semibold text-noc-text-primary text-xs truncate max-w-[200px]" title={disk.deviceName}>
                        {disk.deviceName}
                      </p>
                      <p className="text-[11px] text-noc-text-muted truncate max-w-[200px]" title={disk.probeName}>
                        {disk.probeName}
                      </p>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className={getStatusDotClass(disk.status)} />
                        <span className="font-medium text-xs text-noc-text-secondary truncate max-w-[220px]" title={disk.sensorName}>
                          {disk.sensorName}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {disk.freePct !== null ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span
                              className={cn(
                                "font-mono font-bold",
                                isCritical ? "text-status-down" : isWarn ? "text-status-warning" : "text-status-ok"
                              )}
                            >
                              {disk.freePct}% Free
                            </span>
                            <span className="text-[10px] text-noc-text-muted">
                              {isCritical ? "Kritis (<10%)" : isWarn ? "Peringatan (<25%)" : "Optimal"}
                            </span>
                          </div>
                          <div className="h-2 w-full bg-noc-bg rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                isCritical ? "bg-status-down" : isWarn ? "bg-status-warning" : "bg-status-ok"
                              )}
                              style={{ width: `${Math.max(disk.freePct, 4)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="font-mono text-xs font-bold text-noc-text-primary">{disk.lastValue}</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <p className="text-xs text-noc-text-muted max-w-[280px] truncate" title={disk.lastMessage || "Normal"}>
                        {disk.lastMessage || "Operasional normal"}
                      </p>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSensor(disk.id);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-all cursor-pointer"
                      >
                        Detail &rsaquo;
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Active Alerts Table Component with Clean Messages
function AlertQueueView({
  alerts,
  onSelectSensor,
  searchQuery,
}: {
  alerts: DashboardData["recentAlerts"];
  onSelectSensor: (id: number) => void;
  searchQuery: string;
}) {
  const filtered = useMemo(() => {
    if (!searchQuery) return alerts;
    const q = searchQuery.toLowerCase();
    return alerts.filter(
      (a) =>
        a.sensorName.toLowerCase().includes(q) ||
        a.deviceName.toLowerCase().includes(q) ||
        a.probeName.toLowerCase().includes(q) ||
        (a.lastMessage && a.lastMessage.toLowerCase().includes(q))
    );
  }, [alerts, searchQuery]);

  if (filtered.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <CheckCircle2 className="w-12 h-12 text-status-ok mx-auto mb-3" />
        <h3 className="text-base font-bold text-noc-text-primary">Tidak Ada Insiden Aktif</h3>
        <p className="text-xs text-noc-text-muted mt-1">Seluruh sensor pada filter saat ini beroperasi dengan status normal (OK).</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-noc-text-primary flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-status-warning" />
            Antrean Insiden Aktif (NOC Action Desk)
          </h2>
          <p className="text-xs text-noc-text-muted mt-0.5">
            Daftar sensor dengan status DOWN atau WARNING yang memerlukan tindak lanjut / perbaikan
          </p>
        </div>
        <span className="text-xs font-bold px-3 py-1 rounded-full bg-status-down-bg text-status-down border border-status-down/20 animate-pulse">
          {filtered.length} Insiden Terdeteksi
        </span>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-noc-border bg-noc-bg/40 text-noc-text-muted text-xs">
                <th className="text-left py-3 px-4 font-semibold">Tingkat Keparahan</th>
                <th className="text-left py-3 px-4 font-semibold">Server & Probe Site</th>
                <th className="text-left py-3 px-4 font-semibold">Sensor Terkendala</th>
                <th className="text-left py-3 px-4 font-semibold">Nilai Terakhir</th>
                <th className="text-left py-3 px-4 font-semibold">Penyebab / Pesan PRTG</th>
                <th className="text-left py-3 px-4 font-semibold">Terdeteksi Sejak</th>
                <th className="text-right py-3 px-4 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((alert) => (
                <tr
                  key={alert.id}
                  onClick={() => onSelectSensor(alert.id)}
                  className="border-b border-noc-border/50 hover:bg-noc-hover/50 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className={getStatusDotClass(alert.lastStatus)} />
                      <span
                        className={cn(
                          "text-xs font-bold px-2 py-0.5 rounded-full border",
                          alert.lastStatus === "Down"
                            ? "bg-status-down-bg text-status-down border-status-down/30"
                            : "bg-status-warning-bg text-status-warning border-status-warning/30"
                        )}
                      >
                        {alert.lastStatus.toUpperCase()}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <p className="text-xs font-bold text-noc-text-primary truncate max-w-[180px]" title={alert.deviceName}>
                      {alert.deviceName}
                    </p>
                    <p className="text-[11px] text-noc-text-muted truncate max-w-[180px]" title={alert.probeName}>
                      {alert.probeName}
                    </p>
                  </td>

                  <td className="py-3 px-4 text-xs font-medium text-noc-text-secondary truncate max-w-[180px]" title={alert.sensorName}>
                    {alert.sensorName}
                  </td>

                  <td className="py-3 px-4">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-noc-bg text-noc-text-primary">
                      {alert.lastValue || "-"}
                    </span>
                  </td>

                  <td className="py-3 px-4">
                    <p className="text-xs text-noc-text-muted max-w-[260px] truncate" title={alert.lastMessage || "Threshold tercapai"}>
                      {alert.lastMessage || "Melebihi batas ambang peringatan PRTG"}
                    </p>
                  </td>

                  <td className="py-3 px-4 text-xs text-noc-text-muted font-mono whitespace-nowrap">
                    {timeAgo(alert.lastUpdated)}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSensor(alert.id);
                      }}
                      className="px-3 py-1 rounded-lg text-xs font-semibold bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 transition-all cursor-pointer"
                    >
                      Inspeksi &rsaquo;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Executive View (for STAFF role)
function ExecutiveView({
  data,
  onSelectSensor,
}: {
  data: DashboardData;
  onSelectSensor: (id: number) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Executive KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="SLA Ketersediaan (Uptime)"
          value={`${data.slaUptime.toFixed(1)}%`}
          icon={Shield}
          color={data.slaUptime >= 99.5 ? "text-status-ok" : "text-status-warning"}
          subtitle={
            data.slaUptime >= 99.5
              ? "Memenuhi target korporat ✓"
              : data.summary.down > 0
              ? `${data.summary.down} sensor mengalami downtime`
              : "Di bawah target 99.5%"
          }
          badgeText="Target: 99.5%"
          badgeColor="bg-status-ok-bg text-status-ok"
          progressPct={data.slaUptime}
        />
        <KpiCard
          title="Rata-rata Respon Sistem"
          value={`${data.avgResponseTime.toFixed(0)} ms`}
          icon={Activity}
          color="text-brand-accent"
          subtitle="Latensi rata-rata seluruh portal BSS"
          badgeText="Optimal"
          badgeColor="bg-brand-accent/20 text-brand-accent"
        />
        <KpiCard
          title="Insiden Berjalan"
          value={data.incidentCount}
          icon={AlertTriangle}
          color={data.incidentCount > 0 ? "text-status-warning" : "text-status-ok"}
          subtitle={data.incidentCount === 0 ? "Semua site normal" : "Memerlukan perhatian tim IT"}
          badgeText={data.summary.down > 0 ? `${data.summary.down} Kritis` : "0 Kritis"}
          badgeColor={data.summary.down > 0 ? "bg-status-down-bg text-status-down" : "bg-status-ok-bg text-status-ok"}
        />
        <KpiCard
          title="Total Sensor PRTG"
          value={data.summary.total}
          icon={Server}
          color="text-brand-primary"
          subtitle={`${data.summary.active ?? (data.summary.total - data.summary.paused)} Sensor Aktif Terpantau`}
          badgeText={data.healthScore !== undefined ? `${data.healthScore.toFixed(0)}% Sehat` : "Live Sync"}
          badgeColor="bg-brand-primary/20 text-brand-primary"
        />
      </div>

      {/* Site Health Matrix */}
      <div className="glass-card p-5">
        <h2 className="text-base font-bold text-noc-text-primary mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-brand-primary" />
          Kesehatan Infrastruktur Per Site Tambang & Head Office
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-noc-border text-xs text-noc-text-muted">
                <th className="text-left py-3 px-4 font-semibold">Site / Probe</th>
                <th className="text-left py-3 px-4 font-semibold">Status Operasional</th>
                <th className="text-left py-3 px-4 font-semibold">Total Sensor</th>
                <th className="text-left py-3 px-4 font-semibold">Insiden / Alert</th>
                <th className="text-left py-3 px-4 font-semibold">Persentase Sehat</th>
              </tr>
            </thead>
            <tbody>
              {data.probes.map((probe) => {
                const healthPct =
                  (probe.summary.ok / Math.max(probe.summary.ok + probe.summary.warning + probe.summary.down, 1)) * 100;
                const worstStatus = probe.summary.down > 0 ? "Down" : probe.summary.warning > 0 ? "Warning" : "OK";

                return (
                  <tr key={probe.probeName} className="border-b border-noc-border/50 hover:bg-noc-hover/30 transition-colors">
                    <td className="py-3 px-4 font-semibold text-noc-text-primary text-xs">{probe.probeName}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className={getStatusDotClass(worstStatus)} />
                        <span className="text-xs text-noc-text-secondary">{worstStatus}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-noc-text-secondary font-mono">{probe.summary.total}</td>
                    <td className="py-3 px-4">
                      {probe.summary.warning + probe.summary.down > 0 ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-status-warning-bg text-status-warning">
                          {probe.summary.warning + probe.summary.down} isu
                        </span>
                      ) : (
                        <span className="text-xs text-noc-text-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 max-w-[160px]">
                        <div className="flex-1 h-2 bg-noc-bg rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              healthPct >= 99 ? "bg-status-ok" : healthPct >= 90 ? "bg-status-warning" : "bg-status-down"
                            )}
                            style={{ width: `${healthPct}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono font-bold text-noc-text-secondary">{healthPct.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Narrative */}
      <div className="glass-card p-5 border-l-4 border-l-brand-primary">
        <h3 className="text-sm font-bold text-noc-text-primary mb-2 flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand-primary" />
          Ringkasan Eksekutif & Tindakan Rekomendasi
        </h3>
        <p className="text-xs leading-relaxed text-noc-text-secondary">
          {data.summary.down === 0 && data.summary.warning === 0
            ? "Seluruh infrastruktur server dan probe site PT. Bina Sarana Sukses beroperasi optimal tanpa ada kendala aktif. Seluruh portal bisnis dan database berjalan dengan latensi normal."
            : data.summary.down === 0
            ? `Infrastruktur beroperasi aman dengan ${data.summary.warning} peringatan ambang batas (mayoritas utilitas storage/disk di atas 75% kapasitas). Tidak ada layanan bisnis utama yang mengalami downtime.`
            : `Terdapat ${data.summary.down} sensor dengan status kritis dan ${data.summary.warning} peringatan yang memerlukan tindakan pembersihan disk / verifikasi jaringan oleh tim NOC.`}
        </p>
      </div>
    </div>
  );
}

// Main Dashboard Page
export default function DashboardPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "STAFF";
  const [selectedSensorId, setSelectedSensorId] = useState<number | null>(null);

  // Filter & Navigation states
  const [activeTab, setActiveTab] = useState<"topology" | "portals" | "storage" | "alerts">("topology");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProbeFilter, setSelectedProbeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [topologyViewMode, setTopologyViewMode] = useState<"table" | "cards">("table");
  const hidePaused = true;
  // Load saved topologyViewMode preferences
  useEffect(() => {
    try {
      const saved = localStorage.getItem("dashboard_topology_view_mode");
      if (saved === "table" || saved === "cards") {
        setTopologyViewMode(saved);
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  const changeTopologyViewMode = (mode: "table" | "cards") => {
    setTopologyViewMode(mode);
    try {
      localStorage.setItem("dashboard_topology_view_mode", mode);
    } catch {
      // ignore localStorage errors
    }
  };

  const { data, isLoading, error, refetch } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/prtg/sensors");
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      return res.json();
    },
    refetchInterval: 15000, // Live auto-refresh every 15s
  });

  // Split multi-group probes into separate cards
  const expandedProbes = useMemo(() => {
    if (!data?.probes) return [];
    return data.probes.flatMap((probe) => splitProbeByCategory(probe));
  }, [data]);

  // Extract all original probe names for filter (keep original probe names)
  const probeNames = useMemo(() => {
    if (!data?.probes) return [];
    return data.probes.map((p) => p.probeName);
  }, [data]);

  // Filtered probes (filter on expanded set, match by original prefix)
  const filteredProbes = useMemo(() => {
    if (selectedProbeFilter === "all") return expandedProbes;
    return expandedProbes.filter(
      (p) => p.probeName === selectedProbeFilter || p.probeName.startsWith(selectedProbeFilter.replace(/^Local Probe - /, "").replace(/ ?Server ?/i, "").trim())
    );
  }, [expandedProbes, selectedProbeFilter]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-noc-text-muted text-sm font-medium">Memuat data monitoring PRTG Network Monitor...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center glass-card p-8 max-w-md">
          <XCircle className="w-12 h-12 text-status-down mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-noc-text-primary mb-2">Gagal Memuat Dashboard</h2>
          <p className="text-sm text-noc-text-muted mb-4">
            Tidak dapat mengambil data sensor. Pastikan koneksi PRTG telah dikonfigurasi dengan benar di menu Settings.
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-brand-primary text-white text-xs font-bold rounded-xl hover:bg-brand-primary/90 transition-all"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const portals = data.businessPortals || [];
  const disks = data.storageWatchlist || [];
  const alerts = data.recentAlerts || [];
  const attentionCount = data.summary.down + data.summary.warning;

  return (
    <div className="animate-fade-in space-y-6">
      {/* Top Header: Title, Realtime Heartbeat, & Wallboard Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-noc-text-primary tracking-tight">
              {role === "STAFF" ? "Infrastructure Executive Overview" : "NOC Command Center"}
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
              <span className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
              Live PRTG 60s
            </span>
          </div>
          <p className="text-xs text-noc-text-muted mt-1">
            {role === "STAFF"
              ? "Ringkasan performa dan ketersediaan infrastruktur IT PT. Bina Sarana Sukses"
              : `Monitoring realtime ${data.summary.total} sensor server, storage, dan jaringan IT BSS`}
          </p>
        </div>
      </div>

      {/* Dual Timezone Clock */}
      <DualTimezoneClock />

      {/* Top KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Status Infrastruktur"
          value={`${((data.summary.ok / Math.max(data.summary.ok + data.summary.warning + data.summary.down, 1)) * 100).toFixed(1)}%`}
          icon={ShieldCheck}
          color="text-status-ok"
          subtitle={`${data.summary.ok} dari ${data.summary.ok + data.summary.warning + data.summary.down} sensor aktif normal`}
          badgeText={`${((data.summary.ok / Math.max(data.summary.ok + data.summary.warning + data.summary.down, 1)) * 100).toFixed(1)}% Sehat`}
          badgeColor="bg-status-ok-bg text-status-ok"
          progressPct={(data.summary.ok / Math.max(data.summary.ok + data.summary.warning + data.summary.down, 1)) * 100}
        />

        <KpiCard
          title="Insiden Aktif"
          value={attentionCount}
          icon={AlertTriangle}
          color={data.summary.down > 0 ? "text-status-down" : attentionCount > 0 ? "text-status-warning" : "text-status-ok"}
          subtitle={`${data.summary.down} Kritis Down • ${data.summary.warning} Warning`}
          badgeText={data.summary.down > 0 ? "Perlu Tindakan" : "Normal"}
          badgeColor={data.summary.down > 0 ? "bg-status-down-bg text-status-down" : "bg-status-warning-bg text-status-warning"}
          glowClass={data.summary.down > 0 ? "border-status-down/40 animate-glow-red" : attentionCount > 0 ? "border-status-warning/30" : ""}
        />

        <KpiCard
          title="Portal Bisnis"
          value={`${portals.filter((p) => p.status === "OK").length} / ${portals.length}`}
          icon={Globe}
          color="text-brand-accent"
          subtitle={`Latensi rata-rata: ${data.avgResponseTime.toFixed(0)} ms`}
          badgeText="100% Online"
          badgeColor="bg-brand-accent/20 text-brand-accent"
        />

        <KpiCard
          title="Watchlist Storage"
          value={`${disks.filter((d) => d.isWarning || d.isDown).length} Partisi`}
          icon={HardDrive}
          color="text-amber-400"
          subtitle="Kapasitas mendekati batas ambang"
          badgeText="< 25%"
          badgeColor="bg-amber-400/20 text-amber-400"
        />
      </div>

      {/* Role Separator */}
      {role === "STAFF" ? (
        <ExecutiveView data={data} onSelectSensor={setSelectedSensorId} />
      ) : (
        <div className="space-y-6">
          {/* Navigation Tabs & Filter Bar */}
          <div className="glass-card p-3 space-y-3">
            {/* View Selection Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-noc-border pb-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveTab("topology")}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    activeTab === "topology"
                      ? "bg-brand-primary text-white shadow-md shadow-brand-primary/20"
                      : "bg-noc-surface text-noc-text-secondary hover:text-noc-text-primary hover:bg-noc-hover"
                  )}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Topologi Site & Server ({data.probes.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("portals")}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    activeTab === "portals"
                      ? "bg-brand-primary text-white shadow-md shadow-brand-primary/20"
                      : "bg-noc-surface text-noc-text-secondary hover:text-noc-text-primary hover:bg-noc-hover"
                  )}
                >
                  <Globe className="w-3.5 h-3.5" />
                  Portal & Aplikasi BSS ({portals.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("storage")}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    activeTab === "storage"
                      ? "bg-brand-primary text-white shadow-md shadow-brand-primary/20"
                      : "bg-noc-surface text-noc-text-secondary hover:text-noc-text-primary hover:bg-noc-hover"
                  )}
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  Kapasitas Storage ({disks.length})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("alerts")}
                  className={cn(
                    "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    activeTab === "alerts"
                      ? "bg-brand-primary text-white shadow-md shadow-brand-primary/20"
                      : "bg-noc-surface text-noc-text-secondary hover:text-noc-text-primary hover:bg-noc-hover"
                  )}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Antrean Insiden ({alerts.length})
                  {alerts.length > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-status-down text-white font-mono">
                      {alerts.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Status Hint */}
              <div className="hidden lg:flex items-center gap-2 text-xs text-noc-text-muted">
                <MousePointerClick className="w-3.5 h-3.5 text-brand-primary" />
                Klik pada sensor manapun untuk riwayat grafik waktu & acknowledge
              </div>
            </div>

            {/* Quick Search & Filter Controls */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search Bar */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-noc-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama sensor, device, IP, atau probe..."
                  className="w-full bg-noc-bg border border-noc-border rounded-xl pl-9 pr-8 py-1.5 text-xs text-noc-text-primary placeholder:text-noc-text-muted focus:outline-none focus:border-brand-primary transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-noc-text-muted hover:text-noc-text-primary"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Probe Site Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-noc-text-muted" />
                  <span className="text-xs text-noc-text-muted font-medium">Site:</span>
                  <select
                    value={selectedProbeFilter}
                    onChange={(e) => setSelectedProbeFilter(e.target.value)}
                    className="bg-noc-bg border border-noc-border rounded-xl px-2.5 py-1.5 text-xs text-noc-text-primary focus:outline-none focus:border-brand-primary cursor-pointer"
                  >
                    <option value="all">Semua Site ({data.summary.total} Sensor)</option>
                    {probeNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Pills */}
                {activeTab === "topology" && (
                  <div className="flex items-center gap-1 bg-noc-bg p-1 rounded-xl border border-noc-border/60">
                    <button
                      type="button"
                      onClick={() => setStatusFilter("all")}
                      className={cn(
                        "px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all",
                        statusFilter === "all" ? "bg-noc-surface text-noc-text-primary shadow" : "text-noc-text-muted hover:text-noc-text-primary"
                      )}
                    >
                      Semua
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter("attention")}
                      className={cn(
                        "px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1",
                        statusFilter === "attention"
                          ? "bg-status-warning-bg text-status-warning shadow"
                          : "text-noc-text-muted hover:text-noc-text-primary"
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-status-warning" />
                      Perhatian ({attentionCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter("down")}
                      className={cn(
                        "px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1",
                        statusFilter === "down"
                          ? "bg-status-down-bg text-status-down shadow"
                          : "text-noc-text-muted hover:text-noc-text-primary"
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-status-down" />
                      Down ({data.summary.down})
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusFilter("ok")}
                      className={cn(
                        "px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-all",
                        statusFilter === "ok" ? "bg-status-ok-bg text-status-ok shadow" : "text-noc-text-muted hover:text-noc-text-primary"
                      )}
                    >
                      OK ({data.summary.ok})
                    </button>
                  </div>
                )}

                {/* View Mode Toggle: Table Grid vs Cards */}
                {activeTab === "topology" && (
                  <div className="flex items-center gap-1 bg-noc-bg p-1 rounded-xl border border-noc-border/60">
                    <button
                      type="button"
                      onClick={() => changeTopologyViewMode("table")}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer",
                        topologyViewMode === "table"
                          ? "bg-brand-primary text-white shadow-sm"
                          : "text-noc-text-muted hover:text-noc-text-primary"
                      )}
                      title="Tampilan Tabel Grid"
                    >
                      <Table className="w-3.5 h-3.5" />
                      <span>Tabel Grid</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => changeTopologyViewMode("cards")}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer",
                        topologyViewMode === "cards"
                          ? "bg-brand-primary text-white shadow-sm"
                          : "text-noc-text-muted hover:text-noc-text-primary"
                      )}
                      title="Tampilan Kartu"
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      <span>Kartu</span>
                    </button>
                  </div>
                )}

              </div>
            </div>
          </div>

          {/* Tab 1: Topology Grid */}
          {activeTab === "topology" && (
            topologyViewMode === "table" ? (
              <TopologyTableGrid
                probes={filteredProbes}
                onSelectSensor={setSelectedSensorId}
                searchQuery={searchQuery}
                statusFilter={statusFilter}
                hidePaused={hidePaused}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {filteredProbes.map((probe) => (
                  <EnhancedProbeCard
                    key={probe.probeName}
                    probe={probe}
                    onSelectSensor={setSelectedSensorId}
                    searchQuery={searchQuery}
                    statusFilter={statusFilter}
                    hidePaused={hidePaused}
                  />
                ))}
              </div>
            )
          )}

          {/* Tab 2: BSS Business Portals */}
          {activeTab === "portals" && (
            <BusinessPortalsView
              portals={portals}
              onSelectSensor={setSelectedSensorId}
              searchQuery={searchQuery}
            />
          )}

          {/* Tab 3: Storage Watchlist */}
          {activeTab === "storage" && (
            <StorageWatchlistView
              disks={disks}
              onSelectSensor={setSelectedSensorId}
              searchQuery={searchQuery}
            />
          )}

          {/* Tab 4: Alert Queue */}
          {activeTab === "alerts" && (
            <AlertQueueView
              alerts={alerts}
              onSelectSensor={setSelectedSensorId}
              searchQuery={searchQuery}
            />
          )}
        </div>
      )}

      {/* Interactive Sensor Detail Modal */}
      {selectedSensorId && (
        <SensorDetailModal
          sensorId={selectedSensorId}
          userRole={role}
          onClose={() => setSelectedSensorId(null)}
          onAlertAcknowledged={() => refetch()}
        />
      )}
    </div>
  );
}
