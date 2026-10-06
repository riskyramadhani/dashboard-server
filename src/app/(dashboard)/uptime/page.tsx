"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  Activity,
  Plus,
  Trash2,
  RefreshCw,
  Globe,
  Wifi,
  Network,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  Pause,
  Play,
  X,
  AlertTriangle,
  Zap,
  TrendingUp,
  BarChart2,
  Loader2,
  Edit2,
  Save,
  Search,
  Filter,
  LayoutGrid,
  Table as TableIcon,
  HelpCircle,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ArrowUpDown,
  Info,
  Check,
  ExternalLink,
  SlidersHorizontal,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

type CheckType = "HTTP" | "HTTPS" | "PING" | "TCP_PORT";
type UptimeStatus = "UP" | "WARNING" | "DOWN" | "UNKNOWN";

interface RecentCheck {
  status: UptimeStatus;
  responseMs: number | null;
  checkedAt: string;
}

export const MONITOR_CATEGORIES = [
  "Web Server",
  "Application Server",
  "Database Server (ERP)",
] as const;

export type MonitorCategory = (typeof MONITOR_CATEGORIES)[number];

interface Monitor {
  id: string;
  name: string;
  category?: string;
  checkType: CheckType;
  target: string;
  port: number | null;
  intervalSeconds: number;
  timeoutMs: number;
  warningThresholdMs?: number | null;
  expectedStatus: number | null;
  keyword: string | null;
  isActive: boolean;
  lastStatus: UptimeStatus;
  lastCheckedAt: string | null;
  lastResponseMs: number | null;
  createdAt: string;
  uptime24h: number | null;
  avgResponseMs: number | null;
  totalChecks: number;
  totalUp: number;
  recentChecks: RecentCheck[];
}

interface HistoryResult {
  id: string;
  status: UptimeStatus;
  responseMs: number | null;
  statusCode: number | null;
  error: string | null;
  checkedAt: string;
}

interface MonitorHistory {
  monitor: Monitor;
  results: HistoryResult[];
  stats: {
    total: number;
    upCount: number;
    downCount: number;
    uptime: number | null;
    avgResponse: number | null;
    minResponse: number | null;
    maxResponse: number | null;
  };
}

// ─────────────────────────────────────────────────────────
// Human-Friendly Helpers (Untuk Awam & IT)
// ─────────────────────────────────────────────────────────

function formatRelTime(iso: string | null): string {
  if (!iso) return "Belum pernah";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return "Baru saja";
  if (diff < 60) return `${diff} dtk lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} mnt lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} dtk`;
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} dtk`;
  if (seconds < 3600) return `${seconds / 60} mnt`;
  return `${seconds / 3600} jam`;
}

function getCheckTypeLabel(type: CheckType): string {
  switch (type) {
    case "HTTP":
      return "Web (HTTP)";
    case "HTTPS":
      return "Web Aman (HTTPS)";
    case "PING":
      return "Ping Jaringan (ICMP)";
    case "TCP_PORT":
      return "Port Layanan (TCP)";
  }
}

function getCheckTypeIcon(type: CheckType) {
  switch (type) {
    case "HTTP":
    case "HTTPS":
      return Globe;
    case "PING":
      return Wifi;
    case "TCP_PORT":
      return Network;
  }
}

function getCheckTypeColor(type: CheckType): { badge: string; icon: string } {
  switch (type) {
    case "HTTP":
      return { badge: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: "text-blue-400" };
    case "HTTPS":
      return { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: "text-emerald-400" };
    case "PING":
      return { badge: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: "text-purple-400" };
    case "TCP_PORT":
      return { badge: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: "text-amber-400" };
  }
}

/**
 * Penjelasan kecepatan respon dalam bahasa ramah pengguna awam
 */
function getLatencyStatus(ms: number | null) {
  if (ms === null || ms === undefined) {
    return { label: "Menunggu Cek", badgeBg: "bg-zinc-800 text-zinc-400 border-zinc-700", desc: "Belum ada respon" };
  }
  if (ms < 300) {
    return {
      label: "Sangat Cepat",
      badgeBg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      desc: "Akses seketika & sangat responsif",
    };
  }
  if (ms < 800) {
    return {
      label: "Stabil & Baik",
      badgeBg: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
      desc: "Waktu respon normal operasional",
    };
  }
  if (ms < 2000) {
    return {
      label: "Agak Lambat",
      badgeBg: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      desc: "Beban traffic agak tinggi",
    };
  }
  return {
    label: "Lambat / Berat",
    badgeBg: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    desc: "Perlu perhatian tim jaringan",
  };
}

/**
 * Status ramah awam untuk kondisi monitor
 */
function getHumanStatus(status: UptimeStatus, isActive: boolean) {
  if (!isActive) {
    return {
      title: "Pemeriksaan Dijeda",
      shortLabel: "Dijeda",
      desc: "Monitoring dinonaktifkan sementara oleh staf",
      badge: "bg-zinc-800/80 text-zinc-400 border-zinc-700/60",
      dot: "bg-zinc-500",
      isHealthy: false,
      isWarning: false,
      isDown: false,
    };
  }
  switch (status) {
    case "UP":
      return {
        title: "Normal & Terhubung",
        shortLabel: "Online",
        desc: "Layanan dapat diakses lancar tanpa hambatan",
        badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
        dot: "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]",
        isHealthy: true,
        isWarning: false,
        isDown: false,
      };
    case "WARNING":
      return {
        title: "Performa Menurun / Lambat",
        shortLabel: "Warning",
        desc: "Layanan online namun latency merespons lambat melebihi batas toleransi",
        badge: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        dot: "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)] animate-pulse",
        isHealthy: false,
        isWarning: true,
        isDown: false,
      };
    case "DOWN":
      return {
        title: "Terputus / Gangguan",
        shortLabel: "Down",
        desc: "Layanan tidak merespons atau mengembalikan kode error",
        badge: "bg-rose-500/15 text-rose-400 border-rose-500/30",
        dot: "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)] animate-pulse",
        isHealthy: false,
        isWarning: false,
        isDown: true,
      };
    case "UNKNOWN":
    default:
      return {
        title: "Memverifikasi",
        shortLabel: "Unknown",
        desc: "Sedang menunggu pengujian pertama",
        badge: "bg-zinc-800/80 text-zinc-400 border-zinc-700/60",
        dot: "bg-zinc-500",
        isHealthy: false,
        isWarning: false,
        isDown: false,
      };
  }
}

// ─────────────────────────────────────────────────────────
// Mini Sparkline component (Visual Riwayat 48 Pengecekan)
// ─────────────────────────────────────────────────────────
function Sparkline({ checks }: { checks: RecentCheck[] }) {
  const display = checks.slice().reverse().slice(0, 36);
  if (display.length === 0) {
    return <span className="text-[11px] text-zinc-500 italic">Belum ada riwayat</span>;
  }

  const w = 5;
  const gap = 2;
  const totalWidth = display.length * (w + gap);

  return (
    <div className="flex items-center gap-1.5" title="Riwayat pengujian berurutan (paling kanan = terbaru)">
      <svg width={totalWidth} height={20} className="flex-shrink-0">
        {display.map((c, i) => {
          const isUp = c.status === "UP";
          const color = isUp ? "#10b981" : "#f43f5e";
          const h = isUp ? 14 : 7;
          return (
            <rect
              key={i}
              x={i * (w + gap)}
              y={20 - h}
              width={w}
              height={h}
              fill={color}
              rx={1}
              opacity={0.9}
            />
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Panduan Edukasi / Bantuan untuk Pengguna Awam & IT
// ─────────────────────────────────────────────────────────
function QuickHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-noc-surface border border-noc-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-noc-border flex items-center justify-between bg-noc-bg/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-primary/20 flex items-center justify-center text-brand-primary">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-noc-text-primary">Panduan Membaca Status & Metrik</h2>
              <p className="text-xs text-noc-text-muted">Penjelasan sederhana untuk pemantauan ketersediaan server & website</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Status Layanan */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-primary flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> 1. Status Layanan
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400 mb-1">
                  <CheckCircle2 className="w-4 h-4" /> Online / Normal
                </div>
                <p className="text-noc-text-secondary leading-relaxed">
                  Server/website berfungsi baik dan dapat diakses pengguna tanpa kendala.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <div className="flex items-center gap-1.5 font-bold text-rose-400 mb-1">
                  <XCircle className="w-4 h-4" /> Down / Gangguan
                </div>
                <p className="text-noc-text-secondary leading-relaxed">
                  Layanan tidak dapat dihubungi, mati, atau halaman web error (misal HTTP 500/404).
                </p>
              </div>
            </div>
          </div>

          {/* Protokol Pemeriksaan */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-primary flex items-center gap-1.5">
              <Network className="w-3.5 h-3.5" /> 2. Jenis Protokol Pengujian
            </h3>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-noc-bg border border-noc-border flex items-start gap-2.5">
                <Globe className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-noc-text-primary">Web (HTTP / HTTPS): </span>
                  <span className="text-noc-text-secondary">
                    Menguji apakah halaman aplikasi web dapat dibuka dan menghasilkan kode sukses 200 OK.
                  </span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-noc-bg border border-noc-border flex items-start gap-2.5">
                <Wifi className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-noc-text-primary">Ping Jaringan (ICMP): </span>
                  <span className="text-noc-text-secondary">
                    Mengirim paket sinyal cepat untuk mendeteksi apakah mesin fisik server masih hidup dan terhubung jaringan.
                  </span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-noc-bg border border-noc-border flex items-start gap-2.5">
                <Network className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-noc-text-primary">Port Layanan (TCP Port): </span>
                  <span className="text-noc-text-secondary">
                    Memeriksa ketersediaan aplikasi backend khusus, seperti Database (port 5432 / 3306), SSH (22), atau email.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Response Time & Uptime SLA */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-primary flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> 3. Kecepatan Respon & SLA Uptime
            </h3>
            <div className="space-y-2 text-xs text-noc-text-secondary">
              <p>
                <strong className="text-noc-text-primary">Kecepatan Respon (Latency ms):</strong> Semakin kecil angka milidetik (ms), semakin cepat website/server merespons. Nilai di bawah 300 ms tergolong sangat cepat.
              </p>
              <p>
                <strong className="text-noc-text-primary">Uptime 24 Jam (%):</strong> Persentase waktu server aktif tanpa mati selama 24 jam terakhir. Nilai 100% berarti layanan tidak pernah mati sedetik pun.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-noc-border bg-noc-bg/40 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-brand-primary text-white text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity"
          >
            Saya Mengerti
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Add Monitor Modal
// ─────────────────────────────────────────────────────────

const DEFAULT_INTERVALS = [
  { label: "1 Menit (Kritis)", value: 60 },
  { label: "2 Menit", value: 120 },
  { label: "5 Menit (Direkomendasikan)", value: 300 },
  { label: "10 Menit", value: 600 },
  { label: "15 Menit", value: 900 },
  { label: "30 Menit", value: 1800 },
  { label: "1 Jam", value: 3600 },
];

interface AddMonitorModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function AddMonitorModal({ onClose, onCreated }: AddMonitorModalProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<MonitorCategory>("Web Server");
  const [checkType, setCheckType] = useState<CheckType>("HTTPS");
  const [target, setTarget] = useState("");
  const [port, setPort] = useState("443");
  const [interval, setInterval_] = useState("300");
  const [timeout, setTimeout_] = useState("5000");
  const [warningThreshold, setWarningThreshold] = useState("1000");
  const [expectedStatus, setExpectedStatus] = useState("200");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTypeChange = (type: CheckType) => {
    setCheckType(type);
    if (type === "HTTP") {
      setPort("80");
      if (!target.startsWith("http://") && !target.startsWith("https://")) {
        setTarget(target ? `http://${target.replace(/^https?:\/\//, "")}` : "http://");
      }
    } else if (type === "HTTPS") {
      setPort("443");
      if (!target.startsWith("http://") && !target.startsWith("https://")) {
        setTarget(target ? `https://${target.replace(/^https?:\/\//, "")}` : "https://");
      }
    } else if (type === "PING") {
      setPort("");
      setTarget(target.replace(/^https?:\/\//, "").split("/")[0]);
    } else if (type === "TCP_PORT") {
      setPort("80");
      setTarget(target.replace(/^https?:\/\//, "").split("/")[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/uptime/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          checkType,
          target: target.trim(),
          port: checkType === "TCP_PORT" ? port : undefined,
          intervalSeconds: interval,
          timeoutMs: timeout,
          warningThresholdMs: warningThreshold !== "0" ? warningThreshold : null,
          expectedStatus:
            checkType === "HTTP" || checkType === "HTTPS" ? expectedStatus : undefined,
          keyword: keyword.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat monitor baru");

      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-noc-surface border border-noc-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-noc-border bg-noc-bg/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-noc-text-primary">Tambah Uptime Monitor Baru</h2>
              <p className="text-xs text-noc-text-muted">Monitoring ketersediaan website, ping server, atau port service</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Tipe Protokol */}
          <div>
            <label className="block font-semibold text-noc-text-secondary mb-1.5">
              Tipe Pengujian (Protokol) <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["HTTPS", "HTTP", "PING", "TCP_PORT"] as const).map((type) => {
                const Icon = getCheckTypeIcon(type);
                const isSelected = checkType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTypeChange(type)}
                    className={cn(
                      "flex flex-col items-center justify-center p-2.5 rounded-xl border text-xs font-semibold transition-all",
                      isSelected
                        ? "bg-brand-primary/15 border-brand-primary text-brand-primary shadow-sm"
                        : "bg-noc-bg border-noc-border text-noc-text-muted hover:border-noc-border-focus hover:text-noc-text-primary"
                    )}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <span>{type === "TCP_PORT" ? "Port TCP" : type}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kategori Server / Layanan */}
          <div>
            <label className="block font-semibold text-noc-text-secondary mb-1.5">
              Kategori Server / Layanan <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MONITOR_CATEGORIES.map((cat) => {
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all text-center",
                      isSelected
                        ? "bg-brand-primary/15 border-brand-primary text-brand-primary shadow-sm"
                        : "bg-noc-bg border-noc-border text-noc-text-muted hover:border-noc-border-focus hover:text-noc-text-primary"
                    )}
                  >
                    <Server className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nama Layanan */}
          <div>
            <label className="block font-semibold text-noc-text-secondary mb-1.5">
              Nama Layanan / Server <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Portal ERP BSS, Server Database SAP, Web Utama"
              className="w-full px-3.5 py-2.5 rounded-xl bg-noc-bg border border-noc-border text-noc-text-primary placeholder:text-noc-text-muted focus:outline-none focus:border-brand-primary transition-colors text-xs"
            />
          </div>

          {/* Target URL atau IP */}
          <div>
            <label className="block font-semibold text-noc-text-secondary mb-1.5">
              {checkType === "PING"
                ? "Alamat IP Host / Domain"
                : checkType === "TCP_PORT"
                ? "Alamat IP Server / Hostname"
                : "Alamat URL Lengkap"}{" "}
              <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={
                checkType === "PING"
                  ? "192.168.1.1 atau 8.8.8.8"
                  : checkType === "TCP_PORT"
                  ? "10.10.1.50 atau db.perusahaan.com"
                  : "https://portal.binasaranasukses.com"
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-noc-bg border border-noc-border text-noc-text-primary placeholder:text-noc-text-muted focus:outline-none focus:border-brand-primary transition-colors font-mono text-xs"
            />
          </div>

          {/* Port jika TCP_PORT */}
          {checkType === "TCP_PORT" && (
            <div>
              <label className="block font-semibold text-noc-text-secondary mb-1.5">
                Nomor Port TCP <span className="text-rose-400">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="Contoh: 3306 (MySQL), 5432 (Postgres), 22 (SSH)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-noc-bg border border-noc-border text-noc-text-primary placeholder:text-noc-text-muted focus:outline-none focus:border-brand-primary transition-colors font-mono text-xs"
              />
            </div>
          )}

          {/* Interval & Timeout */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-noc-text-secondary mb-1.5">
                Frekuensi Pengujian
              </label>
              <select
                value={interval}
                onChange={(e) => setInterval_(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-noc-bg border border-noc-border text-noc-text-primary focus:outline-none focus:border-brand-primary text-xs"
              >
                {DEFAULT_INTERVALS.map((int) => (
                  <option key={int.value} value={int.value}>
                    {int.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-noc-text-secondary mb-1.5">
                Batas Timeout (Down)
              </label>
              <select
                value={timeout}
                onChange={(e) => setTimeout_(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-noc-bg border border-noc-border text-noc-text-primary focus:outline-none focus:border-brand-primary text-xs"
              >
                <option value="3000">3 Detik</option>
                <option value="5000">5 Detik (Standar)</option>
                <option value="10000">10 Detik</option>
                <option value="15000">15 Detik</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-noc-text-muted flex items-center gap-1.5 pt-0.5">
            <Shield className="w-3.5 h-3.5 text-brand-primary shrink-0" />
            Batas peringatan latency (Warning) dikelola terpusat oleh Admin di menu Settings.
          </p>

          {/* Pengaturan Tambahan Web (HTTP / HTTPS) */}
          {(checkType === "HTTP" || checkType === "HTTPS") && (
            <div className="p-3 rounded-xl bg-noc-bg border border-noc-border space-y-3">
              <p className="text-[11px] font-semibold text-noc-text-muted uppercase tracking-wider">
                Verifikasi Khusus Web (Opsional)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-noc-text-secondary mb-1">
                    Ekspektasi Status Code
                  </label>
                  <input
                    type="number"
                    value={expectedStatus}
                    onChange={(e) => setExpectedStatus(e.target.value)}
                    placeholder="200"
                    className="w-full px-3 py-2 rounded-lg bg-noc-surface border border-noc-border text-noc-text-primary font-mono text-xs focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-noc-text-secondary mb-1">
                    Kata Kunci Wajib (Keyword)
                  </label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="Contoh: Welcome, Login"
                    className="w-full px-3 py-2 rounded-lg bg-noc-surface border border-noc-border text-noc-text-primary text-xs focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-noc-border text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover transition-colors font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold hover:opacity-95 disabled:opacity-50 transition-all shadow-md shadow-emerald-500/20"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Mulai Memantau</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Edit Monitor Modal
// ─────────────────────────────────────────────────────────

interface EditMonitorModalProps {
  monitor: Monitor;
  onClose: () => void;
  onUpdated: () => void;
}

function EditMonitorModal({ monitor, onClose, onUpdated }: EditMonitorModalProps) {
  const [name, setName] = useState(monitor.name);
  const [category, setCategory] = useState<MonitorCategory>(
    (monitor.category as MonitorCategory) || "Web Server"
  );
  const [target, setTarget] = useState(monitor.target);
  const [port, setPort] = useState(monitor.port?.toString() || "");
  const [interval, setInterval_] = useState(monitor.intervalSeconds.toString());
  const [timeout, setTimeout_] = useState(monitor.timeoutMs.toString());
  const [expectedStatus, setExpectedStatus] = useState(monitor.expectedStatus?.toString() || "200");
  const [keyword, setKeyword] = useState(monitor.keyword || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/uptime/monitors/${monitor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          target: target.trim(),
          port: monitor.checkType === "TCP_PORT" ? port : undefined,
          intervalSeconds: interval,
          timeoutMs: timeout,
          expectedStatus:
            monitor.checkType === "HTTP" || monitor.checkType === "HTTPS"
              ? expectedStatus || null
              : undefined,
          keyword: keyword.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memperbarui monitor");

      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-noc-surface border border-noc-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-noc-border bg-noc-bg/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-primary/20 text-brand-primary flex items-center justify-center">
              <Edit2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-noc-text-primary">Edit Uptime Monitor</h2>
              <p className="text-xs text-noc-text-muted">Ubah parameter target dan konfigurasi pengujian</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block font-semibold text-noc-text-secondary mb-1.5">
              Nama Layanan / Server
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-noc-bg border border-noc-border text-noc-text-primary text-xs focus:outline-none focus:border-brand-primary"
            />
          </div>

          {/* Kategori Server / Layanan */}
          <div>
            <label className="block font-semibold text-noc-text-secondary mb-1.5">
              Kategori Server / Layanan <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MONITOR_CATEGORIES.map((cat) => {
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all text-center",
                      isSelected
                        ? "bg-brand-primary/15 border-brand-primary text-brand-primary shadow-sm"
                        : "bg-noc-bg border-noc-border text-noc-text-muted hover:border-noc-border-focus hover:text-noc-text-primary"
                    )}
                  >
                    <Server className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block font-semibold text-noc-text-secondary mb-1.5">
              Alamat Target ({monitor.checkType})
            </label>
            <input
              type="text"
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-noc-bg border border-noc-border text-noc-text-primary font-mono text-xs focus:outline-none focus:border-brand-primary"
            />
          </div>

          {monitor.checkType === "TCP_PORT" && (
            <div>
              <label className="block font-semibold text-noc-text-secondary mb-1.5">
                Nomor Port TCP
              </label>
              <input
                type="number"
                required
                min={1}
                max={65535}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-noc-bg border border-noc-border text-noc-text-primary font-mono text-xs focus:outline-none focus:border-brand-primary"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-noc-text-secondary mb-1.5">
                Frekuensi Pengujian
              </label>
              <select
                value={interval}
                onChange={(e) => setInterval_(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-noc-bg border border-noc-border text-noc-text-primary text-xs focus:outline-none focus:border-brand-primary"
              >
                {DEFAULT_INTERVALS.map((int) => (
                  <option key={int.value} value={int.value}>
                    {int.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-noc-text-secondary mb-1.5">
                Batas Timeout (Down)
              </label>
              <select
                value={timeout}
                onChange={(e) => setTimeout_(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-noc-bg border border-noc-border text-noc-text-primary text-xs focus:outline-none focus:border-brand-primary"
              >
                <option value="3000">3 Detik</option>
                <option value="5000">5 Detik</option>
                <option value="10000">10 Detik</option>
                <option value="15000">15 Detik</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-noc-text-muted flex items-center gap-1.5 pt-0.5">
            <Shield className="w-3.5 h-3.5 text-brand-primary shrink-0" />
            Batas peringatan latency (Warning) dikelola terpusat oleh Admin di menu Settings.
          </p>

          {(monitor.checkType === "HTTP" || monitor.checkType === "HTTPS") && (
            <div className="p-3 rounded-xl bg-noc-bg border border-noc-border space-y-3">
              <p className="text-[11px] font-semibold text-noc-text-muted uppercase tracking-wider">
                Verifikasi Khusus Web
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-noc-text-secondary mb-1">
                    Ekspektasi Status Code
                  </label>
                  <input
                    type="number"
                    value={expectedStatus}
                    onChange={(e) => setExpectedStatus(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-noc-surface border border-noc-border text-noc-text-primary font-mono text-xs focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-noc-text-secondary mb-1">
                    Kata Kunci Wajib (Keyword)
                  </label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="Opsional"
                    className="w-full px-3 py-2 rounded-lg bg-noc-surface border border-noc-border text-noc-text-primary text-xs focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-noc-border text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover transition-colors font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-brand-primary text-white font-semibold hover:opacity-95 disabled:opacity-50 transition-all shadow-md"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Perubahan</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Monitor Detail History Drawer
// ─────────────────────────────────────────────────────────

interface MonitorDetailDrawerProps {
  monitorId: string;
  onClose: () => void;
}

function MonitorDetailDrawer({ monitorId, onClose }: MonitorDetailDrawerProps) {
  const [history, setHistory] = useState<MonitorHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState(24);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/uptime/monitors/${monitorId}/history?hours=${hours}`);
        if (res.ok) setHistory(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [monitorId, hours]);

  const m = history?.monitor;
  const s = history?.stats;
  const results = history?.results ?? [];

  return (
    <div className="fixed inset-0 z-50 flex animate-in fade-in duration-200">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-noc-surface border-l border-noc-border flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-noc-border bg-noc-bg/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20 font-semibold">
                {m?.checkType}
              </span>
              <h2 className="text-base font-bold text-noc-text-primary">{m?.name ?? "Detail Riwayat"}</h2>
            </div>
            <p className="text-xs text-noc-text-muted mt-1 font-mono">{m?.target}{m?.port ? `:${m.port}` : ""}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-brand-primary animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Periode Waktu */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-noc-text-secondary">Rentang Waktu Riwayat:</span>
              <div className="flex gap-1.5 bg-noc-bg p-1 rounded-xl border border-noc-border">
                {[
                  { label: "1 Jam", value: 1 },
                  { label: "6 Jam", value: 6 },
                  { label: "24 Jam", value: 24 },
                  { label: "48 Jam", value: 48 },
                  { label: "7 Hari", value: 168 },
                ].map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setHours(item.value)}
                    className={cn(
                      "px-3 py-1 rounded-lg text-xs font-semibold transition-all",
                      hours === item.value
                        ? "bg-brand-primary text-white shadow-sm"
                        : "text-noc-text-muted hover:text-noc-text-primary"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid Metrik Statistik */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                {
                  label: "Ketersediaan (SLA)",
                  value: s?.uptime !== null && s?.uptime !== undefined ? `${s.uptime.toFixed(2)}%` : "—",
                  icon: TrendingUp,
                  color: "text-emerald-400",
                },
                {
                  label: "Rata-rata Respon",
                  value: formatMs(s?.avgResponse ?? null),
                  icon: Zap,
                  color: "text-blue-400",
                },
                {
                  label: "Respon Tercepat",
                  value: formatMs(s?.minResponse ?? null),
                  icon: BarChart2,
                  color: "text-purple-400",
                },
                {
                  label: "Respon Terlambat",
                  value: formatMs(s?.maxResponse ?? null),
                  icon: BarChart2,
                  color: "text-amber-400",
                },
                {
                  label: "Total Pemeriksaan",
                  value: `${s?.total?.toLocaleString() ?? 0} kali`,
                  icon: Activity,
                  color: "text-noc-text-primary",
                },
                {
                  label: "Kejadian Gangguan",
                  value: `${s?.downCount?.toLocaleString() ?? 0} kali`,
                  icon: XCircle,
                  color: s?.downCount && s.downCount > 0 ? "text-rose-400 font-bold" : "text-emerald-400",
                },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <div
                    key={stat.label}
                    className="bg-noc-bg border border-noc-border rounded-xl p-3 flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-noc-text-muted">{stat.label}</span>
                      <Icon className={cn("w-3.5 h-3.5", stat.color)} />
                    </div>
                    <span className={cn("text-base font-bold", stat.color)}>{stat.value}</span>
                  </div>
                );
              })}
            </div>

            {/* Riwayat Pengecekan Terakhir */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-noc-text-secondary flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brand-primary" /> Log Pemeriksaan Terakhir ({results.length})
                </h3>
                <span className="text-[11px] text-noc-text-muted">Urutan paling baru di atas</span>
              </div>

              {results.length === 0 ? (
                <div className="text-center py-8 text-noc-text-muted text-xs bg-noc-bg rounded-xl border border-noc-border">
                  Tidak ada data rekaman pemeriksaan dalam rentang waktu ini.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                  {[...results].reverse().map((r) => {
                    const isUp = r.status === "UP";
                    const latencyInfo = getLatencyStatus(r.responseMs);
                    return (
                      <div
                        key={r.id}
                        className={cn(
                          "flex items-center justify-between px-3 py-2 rounded-xl border text-xs transition-colors",
                          isUp
                            ? "bg-noc-bg/80 border-noc-border hover:border-emerald-500/30"
                            : "bg-rose-500/10 border-rose-500/25 hover:border-rose-500/40"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {isUp ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn("font-bold text-xs", isUp ? "text-emerald-400" : "text-rose-400")}>
                                {isUp ? "NORMAL / UP" : "DOWN / GANGGUAN"}
                              </span>
                              {r.statusCode && (
                                <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-noc-surface border border-noc-border text-noc-text-secondary">
                                  HTTP {r.statusCode}
                                </span>
                              )}
                            </div>
                            {r.error && (
                              <p className="text-[11px] text-rose-300 truncate max-w-sm mt-0.5">
                                Catatan: {r.error}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0 text-right">
                          {r.responseMs !== null && (
                            <span className={cn("text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border", latencyInfo.badgeBg)}>
                              {formatMs(r.responseMs)}
                            </span>
                          )}
                          <span className="text-[11px] text-noc-text-muted font-mono whitespace-nowrap">
                            {new Date(r.checkedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Monitor Card (Visual Card Mode)
// ─────────────────────────────────────────────────────────

interface MonitorCardProps {
  monitor: Monitor;
  isAdmin: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onCheck: (id: string) => void;
  onEdit: (m: Monitor) => void;
  onDetail: (id: string) => void;
  checking: boolean;
}

function MonitorCard({
  monitor: m,
  isAdmin,
  onRefresh,
  onDelete,
  onToggle,
  onCheck,
  onEdit,
  onDetail,
  checking,
}: MonitorCardProps) {
  const Icon = getCheckTypeIcon(m.checkType);
  const typeColor = getCheckTypeColor(m.checkType);
  const statusInfo = getHumanStatus(m.lastStatus, m.isActive);
  const latencyInfo = getLatencyStatus(m.lastResponseMs);

  return (
    <div
      className={cn(
        "bg-noc-surface border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all duration-300 hover:shadow-xl group relative overflow-hidden",
        statusInfo.isHealthy
          ? "border-emerald-500/20 hover:border-emerald-500/40 shadow-emerald-500/5"
          : statusInfo.isWarning
          ? "border-amber-500/30 hover:border-amber-500/50 shadow-amber-500/10 bg-amber-500/[0.02]"
          : statusInfo.isDown
          ? "border-rose-500/30 hover:border-rose-500/50 shadow-rose-500/10 bg-rose-500/[0.02]"
          : "border-noc-border hover:border-brand-primary/40"
      )}
    >
      {/* Glow highlight */}
      <div
        className={cn(
          "absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10 opacity-20",
          statusInfo.isHealthy ? "bg-emerald-500" : statusInfo.isWarning ? "bg-amber-500" : statusInfo.isDown ? "bg-rose-500" : "bg-zinc-500"
        )}
      />

      {/* Top Header */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-start gap-2.5 min-w-0">
            {/* Status Indicator Dot */}
            <div className={cn("mt-1.5 w-3 h-3 rounded-full flex-shrink-0 transition-all", statusInfo.dot)} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3
                  className="text-sm font-bold text-noc-text-primary truncate cursor-pointer hover:text-brand-primary transition-colors"
                  onClick={() => onDetail(m.id)}
                  title={m.name}
                >
                  {m.name}
                </h3>
                {m.category && (
                  <span className="sm:hidden text-[9px] font-semibold px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-noc-text-secondary">
                    {m.category}
                  </span>
                )}
              </div>
              <p className="text-xs text-noc-text-muted truncate mt-0.5 font-mono">
                {m.target}{m.port ? `:${m.port}` : ""}
              </p>
            </div>
          </div>

          {/* Protokol & Kategori Badge */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {m.category && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-noc-text-secondary">
                <Server className="w-3 h-3 text-brand-primary" />
                <span>{m.category}</span>
              </span>
            )}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border flex-shrink-0",
                typeColor.badge
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{m.checkType}</span>
            </span>
          </div>
        </div>

        {/* Human-friendly status banner */}
        <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-noc-bg border border-noc-border/70 my-2">
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-bold px-2 py-0.5 rounded-md border", statusInfo.badge)}>
              {statusInfo.shortLabel}
            </span>
            <span className="text-xs text-noc-text-secondary font-medium hidden sm:inline">
              {statusInfo.title}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-noc-text-muted">
            <Clock className="w-3.5 h-3.5 text-noc-text-muted" />
            <span>{formatRelTime(m.lastCheckedAt)}</span>
          </div>
        </div>
      </div>

      {/* Metrik Tengah: 24h SLA Uptime + Response Time */}
      <div className="grid grid-cols-2 gap-2.5">
        {/* Box Uptime SLA */}
        <div className="bg-noc-bg rounded-xl p-3 border border-noc-border flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-noc-text-muted">Ketersediaan 24 Jam</span>
            <TrendingUp className="w-3.5 h-3.5 text-noc-text-muted" />
          </div>
          <div>
            <span
              className={cn(
                "text-lg font-extrabold font-mono",
                m.uptime24h === null
                  ? "text-zinc-400"
                  : m.uptime24h >= 99
                  ? "text-emerald-400"
                  : m.uptime24h >= 95
                  ? "text-amber-400"
                  : "text-rose-400"
              )}
            >
              {m.uptime24h !== null ? `${m.uptime24h.toFixed(1)}%` : "—"}
            </span>
          </div>
          {/* Bar Uptime */}
          <div className="mt-2 h-1.5 bg-noc-border rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                m.uptime24h === null
                  ? "bg-zinc-600"
                  : m.uptime24h >= 99
                  ? "bg-emerald-400"
                  : m.uptime24h >= 95
                  ? "bg-amber-400"
                  : "bg-rose-500"
              )}
              style={{ width: `${m.uptime24h ?? 0}%` }}
            />
          </div>
        </div>

        {/* Box Response Time */}
        <div className="bg-noc-bg rounded-xl p-3 border border-noc-border flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-noc-text-muted">Kecepatan Respon</span>
            <Zap className="w-3.5 h-3.5 text-noc-text-muted" />
          </div>
          <div>
            <span className="text-lg font-extrabold font-mono text-noc-text-primary">
              {formatMs(m.lastResponseMs ?? m.avgResponseMs)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border truncate", latencyInfo.badgeBg)}>
              {latencyInfo.label}
            </span>
            <span className="text-[10px] text-noc-text-muted font-mono">
              / {formatInterval(m.intervalSeconds)}
            </span>
          </div>
        </div>
      </div>

      {/* Sparkline Riwayat */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-noc-text-muted font-medium">Riwayat Cek:</span>
        <Sparkline checks={m.recentChecks} />
      </div>

      {/* Bottom Action Bar */}
      <div className="flex items-center gap-1.5 pt-2 border-t border-noc-border/60">
        <button
          onClick={() => onDetail(m.id)}
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-noc-bg border border-noc-border text-noc-text-secondary hover:text-noc-text-primary hover:border-brand-primary/50 transition-all"
          title="Lihat riwayat dan grafik lengkap"
        >
          <BarChart2 className="w-3.5 h-3.5 text-brand-primary" />
          <span>Riwayat</span>
        </button>

        {isAdmin && (
          <>
            <button
              onClick={() => onCheck(m.id)}
              disabled={checking}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-noc-bg border border-noc-border text-noc-text-secondary hover:text-emerald-400 hover:border-emerald-500/40 transition-all disabled:opacity-50"
              title="Uji koneksi secara manual sekarang"
            >
              {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Uji</span>
            </button>

            <button
              onClick={() => onEdit(m)}
              className="p-1.5 rounded-xl bg-noc-bg border border-noc-border text-noc-text-muted hover:text-brand-primary hover:border-brand-primary/40 transition-all"
              title="Edit konfigurasi monitor"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => onToggle(m.id, !m.isActive)}
              className={cn(
                "p-1.5 rounded-xl border transition-all",
                m.isActive
                  ? "bg-noc-bg border-noc-border text-noc-text-muted hover:text-amber-400 hover:border-amber-400/40"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
              )}
              title={m.isActive ? "Jeda pemantauan otomatis" : "Lanjutkan pemantauan otomatis"}
            >
              {m.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={() => onDelete(m.id)}
              className="p-1.5 rounded-xl bg-noc-bg border border-noc-border text-noc-text-muted hover:text-rose-400 hover:border-rose-400/40 transition-all"
              title="Hapus monitor ini"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Monitor Table Row (Compact IT Table Mode)
// ─────────────────────────────────────────────────────────

interface MonitorTableRowProps {
  monitor: Monitor;
  isAdmin: boolean;
  onRefresh: () => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, active: boolean) => void;
  onCheck: (id: string) => void;
  onEdit: (m: Monitor) => void;
  onDetail: (id: string) => void;
  checking: boolean;
}

function MonitorTableRow({
  monitor: m,
  isAdmin,
  onRefresh,
  onDelete,
  onToggle,
  onCheck,
  onEdit,
  onDetail,
  checking,
}: MonitorTableRowProps) {
  const Icon = getCheckTypeIcon(m.checkType);
  const typeColor = getCheckTypeColor(m.checkType);
  const statusInfo = getHumanStatus(m.lastStatus, m.isActive);
  const latencyInfo = getLatencyStatus(m.lastResponseMs);

  return (
    <tr className="border-b border-noc-border hover:bg-noc-hover/50 transition-colors text-xs group">
      {/* Status */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <div className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", statusInfo.dot)} />
          <span className={cn("font-bold text-[11px] px-2 py-0.5 rounded border whitespace-nowrap", statusInfo.badge)}>
            {statusInfo.shortLabel}
          </span>
        </div>
      </td>

      {/* Nama & Target */}
      <td className="py-3 px-4">
        <div className="flex items-center gap-2.5 min-w-[200px]">
          <span className={cn("p-1.5 rounded-lg border flex-shrink-0", typeColor.badge)}>
            <Icon className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => onDetail(m.id)}
                className="font-bold text-noc-text-primary hover:text-brand-primary transition-colors text-left truncate block max-w-xs"
                title={m.name}
              >
                {m.name}
              </button>
              {m.category && (
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-noc-bg border border-noc-border text-noc-text-secondary">
                  {m.category}
                </span>
              )}
            </div>
            <p className="text-[11px] text-noc-text-muted font-mono truncate max-w-xs">
              {m.target}{m.port ? `:${m.port}` : ""}
            </p>
          </div>
        </div>
      </td>

      {/* Protokol */}
      <td className="py-3 px-4 whitespace-nowrap font-medium text-noc-text-secondary">
        <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded border", typeColor.badge)}>
          {m.checkType}
        </span>
      </td>

      {/* Kecepatan Respon (Latency) */}
      <td className="py-3 px-4 whitespace-nowrap">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-noc-text-primary">
              {formatMs(m.lastResponseMs ?? m.avgResponseMs)}
            </span>
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.2 rounded border", latencyInfo.badgeBg)}>
              {latencyInfo.label}
            </span>
          </div>
        </div>
      </td>

      {/* Ketersediaan 24 Jam (SLA) */}
      <td className="py-3 px-4 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-noc-border rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                m.uptime24h === null
                  ? "bg-zinc-600"
                  : m.uptime24h >= 99
                  ? "bg-emerald-400"
                  : m.uptime24h >= 95
                  ? "bg-amber-400"
                  : "bg-rose-500"
              )}
              style={{ width: `${m.uptime24h ?? 0}%` }}
            />
          </div>
          <span
            className={cn(
              "font-mono font-bold text-xs",
              m.uptime24h === null
                ? "text-zinc-400"
                : m.uptime24h >= 99
                ? "text-emerald-400"
                : m.uptime24h >= 95
                ? "text-amber-400"
                : "text-rose-400"
            )}
          >
            {m.uptime24h !== null ? `${m.uptime24h.toFixed(1)}%` : "—"}
          </span>
        </div>
      </td>

      {/* Frekuensi & Cek Terakhir */}
      <td className="py-3 px-4 whitespace-nowrap text-noc-text-muted">
        <div className="flex flex-col">
          <span className="text-[11px] font-medium text-noc-text-secondary">
            Tiap {formatInterval(m.intervalSeconds)}
          </span>
          <span className="text-[10px] text-noc-text-muted flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" /> {formatRelTime(m.lastCheckedAt)}
          </span>
        </div>
      </td>

      {/* Aksi Cepat */}
      <td className="py-3 px-4 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onDetail(m.id)}
            className="p-1.5 rounded-lg bg-noc-bg border border-noc-border text-noc-text-muted hover:text-brand-primary hover:border-brand-primary/40 transition-all"
            title="Riwayat lengkap"
          >
            <BarChart2 className="w-3.5 h-3.5" />
          </button>

          {isAdmin && (
            <>
              <button
                onClick={() => onCheck(m.id)}
                disabled={checking}
                className="p-1.5 rounded-lg bg-noc-bg border border-noc-border text-noc-text-muted hover:text-emerald-400 hover:border-emerald-500/40 transition-all disabled:opacity-50"
                title="Uji koneksi sekarang"
              >
                {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => onEdit(m)}
                className="p-1.5 rounded-lg bg-noc-bg border border-noc-border text-noc-text-muted hover:text-brand-primary hover:border-brand-primary/40 transition-all"
                title="Edit monitor"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => onToggle(m.id, !m.isActive)}
                className={cn(
                  "p-1.5 rounded-lg border transition-all",
                  m.isActive
                    ? "bg-noc-bg border-noc-border text-noc-text-muted hover:text-amber-400 hover:border-amber-400/40"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                )}
                title={m.isActive ? "Jeda pemantauan" : "Lanjutkan pemantauan"}
              >
                {m.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>

              <button
                onClick={() => onDelete(m.id)}
                className="p-1.5 rounded-lg bg-noc-bg border border-noc-border text-noc-text-muted hover:text-rose-400 hover:border-rose-400/40 transition-all"
                title="Hapus monitor"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────
// Executive Status Banner (Ringkasan Ramah untuk Awam & Manajemen)
// ─────────────────────────────────────────────────────────

interface ExecutiveBannerProps {
  monitors: Monitor[];
  upCount: number;
  downCount: number;
  pausedCount: number;
  avgUptime: number | null;
}

function ExecutiveStatusBanner({
  monitors,
  upCount,
  downCount,
  pausedCount,
  avgUptime,
}: ExecutiveBannerProps) {
  if (monitors.length === 0) return null;

  const allUp = downCount === 0 && upCount > 0;
  const hasDown = downCount > 0;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-5 relative overflow-hidden transition-all shadow-lg",
        allUp
          ? "bg-gradient-to-r from-emerald-950/40 via-teal-950/20 to-noc-surface border-emerald-500/30"
          : hasDown
          ? "bg-gradient-to-r from-rose-950/40 via-red-950/20 to-noc-surface border-rose-500/35"
          : "bg-gradient-to-r from-zinc-900/60 to-noc-surface border-noc-border"
      )}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
        <div className="flex items-start gap-3.5">
          <div
            className={cn(
              "w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner",
              allUp
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : hasDown
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse"
                : "bg-zinc-800 text-zinc-400 border border-zinc-700"
            )}
          >
            {allUp ? (
              <ShieldCheck className="w-6 h-6" />
            ) : hasDown ? (
              <ShieldAlert className="w-6 h-6" />
            ) : (
              <Activity className="w-6 h-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-noc-text-primary">
                {allUp
                  ? "Seluruh Layanan Beroperasi Normal"
                  : hasDown
                  ? `Perhatian: ${downCount} Layanan Terdeteksi Mengalami Gangguan`
                  : "Status Pemantauan Layanan Aktif"}
              </h2>
              <span
                className={cn(
                  "text-[11px] font-bold px-2 py-0.5 rounded-full border hidden sm:inline-block",
                  allUp
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : hasDown
                    ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700"
                )}
              >
                {allUp ? "100% Online" : hasDown ? "Investigasi Tim NOC" : "Stabil"}
              </span>
            </div>
            <p className="text-xs text-noc-text-secondary mt-1 max-w-2xl leading-relaxed">
              {allUp
                ? `Semua ${upCount} target server, web, dan port saat ini terhubung lancar. Tidak ada gangguan operasional yang terdeteksi.`
                : hasDown
                ? `Terdapat ${downCount} dari ${monitors.length} server yang tidak merespon pengujian jaringan. Mohon segera periksa log riwayat pengujian.`
                : "Menunggu pengujian berkala berikutnya dari sistem daemon otomatis."}
            </p>
          </div>
        </div>

        {/* Ringkasan Skor Ramah Awam */}
        <div className="flex items-center gap-4 sm:border-l sm:border-noc-border/80 sm:pl-5 self-stretch justify-between sm:justify-start">
          <div>
            <p className="text-[11px] text-noc-text-muted font-medium">Kesehatan Operasional</p>
            <p
              className={cn(
                "text-xl sm:text-2xl font-black font-mono",
                avgUptime !== null && avgUptime >= 99
                  ? "text-emerald-400"
                  : avgUptime !== null && avgUptime >= 95
                  ? "text-amber-400"
                  : "text-rose-400"
              )}
            >
              {avgUptime !== null ? `${avgUptime.toFixed(1)}%` : "100%"}
            </p>
          </div>
          <div className="text-right sm:text-left">
            <p className="text-[11px] text-noc-text-muted font-medium">Total Terpantau</p>
            <p className="text-base sm:text-lg font-bold text-noc-text-primary">
              <span className="text-emerald-400">{upCount} Up</span> / {monitors.length} Host
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main Page Component
// ─────────────────────────────────────────────────────────

export default function UptimePage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "STAFF";
  const isAdmin = role === "ADMIN" || role === "NOC_OPERATOR";

  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [detailMonitorId, setDetailMonitorId] = useState<string | null>(null);
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  // Filters & View Mode
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Load saved viewMode preference from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("uptime_view_mode");
      if (saved === "grid" || saved === "table") {
        setViewMode(saved);
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  const changeViewMode = (mode: "grid" | "table") => {
    setViewMode(mode);
    try {
      localStorage.setItem("uptime_view_mode", mode);
    } catch {
      // ignore localStorage errors
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [filterStatus, setFilterStatus] = useState<"all" | "up" | "warning" | "down" | "paused">("all");

  const fetchMonitors = useCallback(async () => {
    try {
      const res = await fetch("/api/uptime/monitors");
      if (res.ok) {
        const data = await res.json();
        setMonitors(data.monitors);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonitors();
    const interval = setInterval(fetchMonitors, 30000);
    return () => clearInterval(interval);
  }, [fetchMonitors]);

  const handleDelete = async (id: string) => {
    if (!confirm("Hapus monitor ini beserta seluruh riwayat pengujiannya?")) return;
    await fetch(`/api/uptime/monitors/${id}`, { method: "DELETE" });
    fetchMonitors();
  };

  const handleToggle = async (id: string, active: boolean) => {
    await fetch(`/api/uptime/monitors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: active }),
    });
    fetchMonitors();
  };

  const handleCheckNow = async (id: string) => {
    setCheckingId(id);
    try {
      await fetch(`/api/uptime/monitors/${id}`, { method: "POST" });
      await fetchMonitors();
    } finally {
      setCheckingId(null);
    }
  };

  // Hitung metrik agregat
  const upCount = monitors.filter((m) => m.isActive && (m.lastStatus === "UP" || m.lastStatus === "WARNING")).length;
  const normalUpCount = monitors.filter((m) => m.isActive && m.lastStatus === "UP").length;
  const warningCount = monitors.filter((m) => m.isActive && m.lastStatus === "WARNING").length;
  const downCount = monitors.filter((m) => m.isActive && m.lastStatus === "DOWN").length;
  const pausedCount = monitors.filter((m) => !m.isActive).length;
  const unknownCount = monitors.filter((m) => m.isActive && m.lastStatus === "UNKNOWN").length;

  const avgUptime =
    monitors.length === 0
      ? null
      : monitors.filter((m) => m.uptime24h !== null).reduce((s, m) => s + (m.uptime24h ?? 0), 0) /
        (monitors.filter((m) => m.uptime24h !== null).length || 1);

  // Filter list
  const filtered = useMemo(() => {
    return monitors.filter((m) => {
      // Search text
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = m.name.toLowerCase().includes(q);
        const matchTarget = m.target.toLowerCase().includes(q);
        if (!matchName && !matchTarget) return false;
      }
      // Check type protocol
      if (filterType !== "ALL") {
        if (filterType === "WEB" && m.checkType !== "HTTP" && m.checkType !== "HTTPS") return false;
        if (filterType === "PING" && m.checkType !== "PING") return false;
        if (filterType === "TCP_PORT" && m.checkType !== "TCP_PORT") return false;
      }
      // Category filter
      if (filterCategory !== "ALL" && (m.category || "Web Server") !== filterCategory) {
        return false;
      }
      // Status
      if (filterStatus === "up") return m.isActive && m.lastStatus === "UP";
      if (filterStatus === "warning") return m.isActive && m.lastStatus === "WARNING";
      if (filterStatus === "down") return m.isActive && m.lastStatus === "DOWN";
      if (filterStatus === "paused") return !m.isActive;
      return true;
    });
  }, [monitors, searchQuery, filterType, filterCategory, filterStatus]);

  return (
    <div className="space-y-6">
      {/* Page Title & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-noc-text-primary tracking-tight">
                Uptime Monitor
              </h1>
              <p className="text-xs text-noc-text-muted">
                Monitoring realtime website, server ping, dan port service
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            onClick={() => setShowHelpModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-noc-border bg-noc-surface text-noc-text-secondary hover:text-brand-primary hover:border-brand-primary/40 text-xs font-semibold transition-all shadow-sm"
            title="Penjelasan istilah dan cara membaca metrik"
          >
            <HelpCircle className="w-3.5 h-3.5 text-brand-primary" />
            <span>Panduan</span>
          </button>

          <button
            onClick={fetchMonitors}
            className="p-2 rounded-xl border border-noc-border bg-noc-surface text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover transition-all shadow-sm"
            title="Segarkan data pengujian sekarang"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-xl hover:opacity-95 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Monitor</span>
            </button>
          )}
        </div>
      </div>

      {/* Executive Status Banner (Untuk Pimpinan & Awam) */}
      <ExecutiveStatusBanner
        monitors={monitors}
        upCount={upCount}
        downCount={downCount}
        pausedCount={pausedCount}
        avgUptime={avgUptime}
      />

      {/* Metric Stat Cards Strip */}
      {monitors.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {[
            {
              label: "Layanan Normal",
              sublabel: "Akses lancar & responsif",
              value: normalUpCount,
              total: monitors.length,
              color: "from-emerald-500/15 to-teal-600/10 border-emerald-500/25",
              textColor: "text-emerald-400",
              icon: CheckCircle2,
            },
            {
              label: "Latency Warning",
              sublabel: "Respon lambat > batas",
              value: warningCount,
              total: monitors.length,
              color: warningCount > 0 ? "from-amber-500/20 to-yellow-600/10 border-amber-500/35" : "from-noc-surface to-noc-surface border-noc-border",
              textColor: warningCount > 0 ? "text-amber-400" : "text-noc-text-muted",
              icon: AlertTriangle,
            },
            {
              label: "Layanan Terputus",
              sublabel: "Gagal diakses / timeout",
              value: downCount,
              total: monitors.length,
              color: downCount > 0 ? "from-rose-500/20 to-red-600/10 border-rose-500/35" : "from-noc-surface to-noc-surface border-noc-border",
              textColor: downCount > 0 ? "text-rose-400" : "text-noc-text-muted",
              icon: XCircle,
            },
            {
              label: "Pemeriksaan Dijeda",
              sublabel: "Nonaktif sementara waktu",
              value: pausedCount,
              total: monitors.length,
              color: "from-zinc-900/60 to-noc-surface border-noc-border",
              textColor: "text-zinc-400",
              icon: Pause,
            },
            {
              label: "Rata-rata SLA 24J",
              sublabel: "Standar ketersediaan",
              value: avgUptime !== null ? `${avgUptime.toFixed(1)}%` : "100%",
              total: null,
              color: "from-blue-500/15 to-indigo-600/10 border-blue-500/25",
              textColor: "text-blue-400",
              icon: TrendingUp,
            },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className={cn(
                  "bg-gradient-to-br border rounded-2xl p-4 flex flex-col justify-between shadow-sm",
                  s.color
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-noc-text-secondary">{s.label}</span>
                  <Icon className={cn("w-5 h-5", s.textColor)} />
                </div>
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn("text-2xl font-extrabold font-mono", s.textColor)}>
                      {s.value}
                    </span>
                    {s.total !== null && (
                      <span className="text-xs text-noc-text-muted font-medium">/ {s.total} Server</span>
                    )}
                  </div>
                  <p className="text-[11px] text-noc-text-muted mt-1">{s.sublabel}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Search, Filter Bar, dan Tampilan Toggle */}
      {monitors.length > 0 && (
        <div className="bg-noc-surface border border-noc-border rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
          {/* Kolom Kiri: Search & Filter Protokol */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-noc-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, URL, atau IP..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-noc-bg border border-noc-border text-xs text-noc-text-primary placeholder:text-noc-text-muted focus:outline-none focus:border-brand-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-noc-text-muted hover:text-noc-text-primary"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Filter Protokol */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-noc-bg border border-noc-border text-xs text-noc-text-secondary focus:outline-none focus:border-brand-primary"
            >
              <option value="ALL">Semua Protokol</option>
              <option value="WEB">Web (HTTP / HTTPS)</option>
              <option value="PING">Ping Jaringan (ICMP)</option>
              <option value="TCP_PORT">Port Layanan (TCP)</option>
            </select>

            {/* Filter Kategori Server */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-noc-bg border border-noc-border text-xs text-noc-text-secondary focus:outline-none focus:border-brand-primary"
            >
              <option value="ALL">Semua Kategori</option>
              {MONITOR_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Status Pills */}
            <div className="flex gap-1 bg-noc-bg p-1 rounded-xl border border-noc-border overflow-x-auto">
              {[
                { key: "all", label: `Semua (${monitors.length})` },
                { key: "up", label: `Online (${normalUpCount})`, text: "text-emerald-400" },
                { key: "warning", label: `Warning (${warningCount})`, text: warningCount > 0 ? "text-amber-400" : "" },
                { key: "down", label: `Down (${downCount})`, text: downCount > 0 ? "text-rose-400" : "" },
                { key: "paused", label: `Dijeda (${pausedCount})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilterStatus(tab.key as any)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-semibold transition-all whitespace-nowrap",
                    filterStatus === tab.key
                      ? "bg-noc-surface text-noc-text-primary shadow-sm border border-noc-border"
                      : "text-noc-text-muted hover:text-noc-text-primary"
                  )}
                >
                  <span className={filterStatus === tab.key ? "" : tab.text}>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Kolom Kanan: Toggle Grid Kartu vs Tabel Kompak */}
          <div className="flex items-center gap-1.5 self-end md:self-center">
            <span className="text-[11px] text-noc-text-muted mr-1 hidden sm:inline">Tampilan:</span>
            <div className="flex bg-noc-bg p-1 rounded-xl border border-noc-border">
              <button
                onClick={() => changeViewMode("grid")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  viewMode === "grid"
                    ? "bg-brand-primary text-white shadow-sm"
                    : "text-noc-text-muted hover:text-noc-text-primary"
                )}
                title="Tampilan Kartu Visual"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Kartu</span>
              </button>
              <button
                onClick={() => changeViewMode("table")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  viewMode === "table"
                    ? "bg-brand-primary text-white shadow-sm"
                    : "text-noc-text-muted hover:text-noc-text-primary"
                )}
                title="Tampilan Tabel Kompak untuk IT / NOC"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Tabel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
          <p className="text-xs text-noc-text-muted">Memuat data pemantauan server...</p>
        </div>
      ) : monitors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-noc-surface border border-noc-border rounded-3xl p-8 shadow-sm">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-emerald-500/15 to-teal-600/15 border border-emerald-500/25 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/10">
            <Activity className="w-8 h-8 text-emerald-400" />
          </div>
          <h3 className="text-base sm:text-lg font-bold text-noc-text-primary mb-2">
            Belum Ada Monitor Server / Web yang Ditambahkan
          </h3>
          <p className="text-xs sm:text-sm text-noc-text-muted mb-6 max-w-md leading-relaxed">
            Mulai monitoring ketersediaan website, host server fisik (Ping), atau port service database penting secara real-time.
          </p>
          {isAdmin ? (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-xs font-bold rounded-xl hover:opacity-95 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Monitor Pertama</span>
            </button>
          ) : (
            <p className="text-xs text-noc-text-muted italic">Hubungi administrator untuk menambahkan monitor baru.</p>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-noc-surface border border-noc-border rounded-2xl p-6 text-noc-text-muted text-xs">
          <Filter className="w-8 h-8 mx-auto mb-2 text-noc-text-muted/50" />
          <p className="font-semibold text-noc-text-secondary text-sm">Tidak ada monitor yang cocok</p>
          <p className="mt-1">Coba sesuaikan kata kunci pencarian atau reset filter di atas.</p>
          <button
            onClick={() => {
              setSearchQuery("");
              setFilterType("ALL");
              setFilterStatus("all");
            }}
            className="mt-3 px-3 py-1.5 rounded-lg border border-noc-border text-brand-primary hover:bg-noc-hover text-xs font-medium"
          >
            Reset Semua Filter
          </button>
        </div>
      ) : viewMode === "grid" ? (
        /* Mode Kartu Visual */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <MonitorCard
              key={m.id}
              monitor={m}
              isAdmin={isAdmin}
              onRefresh={fetchMonitors}
              onDelete={handleDelete}
              onToggle={handleToggle}
              onCheck={handleCheckNow}
              onEdit={setEditingMonitor}
              onDetail={setDetailMonitorId}
              checking={checkingId === m.id}
            />
          ))}
        </div>
      ) : (
        /* Mode Tabel Kompak untuk IT / NOC */
        <div className="bg-noc-surface border border-noc-border rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-noc-border bg-noc-bg/80 text-[11px] font-bold text-noc-text-muted uppercase tracking-wider">
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Nama Layanan & Target</th>
                  <th className="py-3 px-4">Protokol</th>
                  <th className="py-3 px-4">Kecepatan Respon</th>
                  <th className="py-3 px-4">SLA 24 Jam</th>
                  <th className="py-3 px-4">Jadwal Pengujian</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <MonitorTableRow
                    key={m.id}
                    monitor={m}
                    isAdmin={isAdmin}
                    onRefresh={fetchMonitors}
                    onDelete={handleDelete}
                    onToggle={handleToggle}
                    onCheck={handleCheckNow}
                    onEdit={setEditingMonitor}
                    onDetail={setDetailMonitorId}
                    checking={checkingId === m.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-noc-border bg-noc-bg/40 flex items-center justify-between text-xs text-noc-text-muted">
            <span>Menampilkan {filtered.length} dari {monitors.length} server terpantau</span>
            <span className="font-mono text-[11px]">Interval daemon otomatis: 30 detik</span>
          </div>
        </div>
      )}

      {/* Modals & Drawers */}
      {showAddModal && (
        <AddMonitorModal
          onClose={() => setShowAddModal(false)}
          onCreated={fetchMonitors}
        />
      )}

      {editingMonitor && (
        <EditMonitorModal
          monitor={editingMonitor}
          onClose={() => setEditingMonitor(null)}
          onUpdated={fetchMonitors}
        />
      )}

      {showHelpModal && (
        <QuickHelpModal onClose={() => setShowHelpModal(false)} />
      )}

      {detailMonitorId && (
        <MonitorDetailDrawer
          monitorId={detailMonitorId}
          onClose={() => setDetailMonitorId(null)}
        />
      )}
    </div>
  );
}
