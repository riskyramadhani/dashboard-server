"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  Server,
  Shield,
  Clock,
  Database,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ExternalLink,
  Loader2,
  Lock,
  Activity,
  Save,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [purging, setPurging] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // PRTG Settings
  const [baseUrl, setBaseUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [ignoreSsl, setIgnoreSsl] = useState(true);
  const [pollIntervalSeconds, setPollIntervalSeconds] = useState(60);
  const [retentionDays, setRetentionDays] = useState(90);
  const [connectionStatus, setConnectionStatus] = useState("unknown");
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  // Uptime Monitor Threshold Settings
  const [uptimeWarningLatencyMs, setUptimeWarningLatencyMs] = useState(1000);
  const [uptimeTimeoutMs, setUptimeTimeoutMs] = useState(5000);
  const [applyToAllMonitors, setApplyToAllMonitors] = useState(false);
  const [savingUptime, setSavingUptime] = useState(false);

  // Retention stats
  const [retentionStats, setRetentionStats] = useState<{
    totalMetrics: number;
    expiredCount: number;
    oldestRecordedAt: string | null;
    lastCleanupAt: string | null;
  } | null>(null);

  // Toast / Alert banner
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/settings");
      if (res.ok) {
        const data = await res.json();
        setBaseUrl(data.baseUrl || "");
        setHasToken(data.hasToken);
        setIgnoreSsl(data.ignoreSsl ?? true);
        setPollIntervalSeconds(data.pollIntervalSeconds || 60);
        setRetentionDays(data.retentionDays || 90);
        setConnectionStatus(data.connectionStatus || "unknown");
        setLastSyncAt(data.lastSyncAt);
        setUptimeWarningLatencyMs(data.uptimeWarningLatencyMs ?? 1000);
        setUptimeTimeoutMs(data.uptimeTimeoutMs ?? 5000);
      }

      const retRes = await fetch("/api/admin/retention");
      if (retRes.ok) {
        const retData = await retRes.json();
        setRetentionStats(retData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          apiToken: apiToken ? apiToken : undefined,
          ignoreSsl,
          pollIntervalSeconds,
          retentionDays,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save settings");

      setApiToken("");
      setHasToken(data.settings?.hasToken);

      // Auto-trigger sync immediately after saving so the user doesn't wait
      let syncMessage = "Pengaturan PRTG & Retensi berhasil disimpan.";
      try {
        const syncRes = await fetch("/api/prtg/sync", { method: "POST" });
        const syncData = await syncRes.json();
        if (syncData.success) {
          syncMessage += ` Sinkronisasi berhasil (${syncData.syncedSensors} sensor diperbarui).`;
          setConnectionStatus("connected");
        }
      } catch (syncErr) {
        console.warn("Auto sync after save error:", syncErr);
      }

      setMessage({ text: syncMessage, type: "success" });
      await fetchSettings();
      queryClient.invalidateQueries({ queryKey: ["prtg-status"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["wallboard-data"] });
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          apiToken: apiToken || undefined,
          ignoreSsl,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setMessage({ text: `Koneksi Berhasil: ${data.message}`, type: "success" });
        setConnectionStatus("connected");
        queryClient.invalidateQueries({ queryKey: ["prtg-status"] });
      } else {
        setMessage({ text: `Koneksi Gagal: ${data.message}`, type: "error" });
        setConnectionStatus("disconnected");
        queryClient.invalidateQueries({ queryKey: ["prtg-status"] });
      }
    } catch (err: any) {
      setMessage({ text: `Error saat menguji koneksi: ${err.message}`, type: "error" });
    } finally {
      setTesting(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch("/api/prtg/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setMessage({ text: data.message, type: "success" });
        setConnectionStatus("connected");
        await fetchSettings();
        queryClient.invalidateQueries({ queryKey: ["prtg-status"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["wallboard-data"] });
      } else {
        setMessage({ text: data.message || "Gagal sinkronisasi", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: `Error sinkronisasi: ${err.message}`, type: "error" });
    } finally {
      setSyncing(false);
    }
  };

  const handlePurgeData = async () => {
    if (!confirm("Apakah Anda yakin ingin menghapus data metrik historis yang telah melewati masa retensi?")) {
      return;
    }
    setPurging(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/retention", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: data.message, type: "success" });
        fetchSettings();
      } else {
        setMessage({ text: data.error || "Gagal melakukan purge", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: `Error purge: ${err.message}`, type: "error" });
    } finally {
      setPurging(false);
    }
  };

  const handleSaveUptimeSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUptime(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          ignoreSsl,
          pollIntervalSeconds,
          retentionDays,
          uptimeWarningLatencyMs,
          uptimeTimeoutMs,
          applyToAllMonitors,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan standar uptime");

      queryClient.invalidateQueries({ queryKey: ["wallboard-uptime-monitors"] });

      let msg = "Standar Ambang Batas Uptime & Warning berhasil diperbarui.";
      if (data.updatedMonitorsCount > 0) {
        msg += ` Standar batas berhasil diterapkan ke ${data.updatedMonitorsCount} monitor aktif.`;
      }
      setMessage({ text: msg, type: "success" });
    } catch (err: any) {
      setMessage({ text: `Gagal menyimpan standar uptime: ${err.message}`, type: "error" });
    } finally {
      setSavingUptime(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in max-w-5xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-noc-text-primary flex items-center gap-2">
          <Settings className="w-7 h-7 text-brand-primary" />
          Pengaturan Sistem & Integrasi PRTG
        </h1>
        <p className="text-sm text-noc-text-muted mt-1">
          Konfigurasi koneksi PRTG REST API, enkripsi token AES-256-GCM, dan kebijakan retensi data TimescaleDB
        </p>
      </div>

      {/* Alert Banner */}
      {message && (
        <div
          className={cn(
            "p-4 rounded-xl border flex items-center gap-3 transition-all",
            message.type === "success"
              ? "bg-status-ok-bg/50 border-status-ok/30 text-status-ok"
              : "bg-status-down-bg/50 border-status-down/30 text-status-down"
          )}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{message.text}</span>
        </div>
      )}

      {/* PRTG Configuration Form */}
      <form onSubmit={handleSaveSettings} className="glass-card p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-noc-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-brand-primary/10 text-brand-primary">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-noc-text-primary">Koneksi PRTG Network Monitor</h2>
              <p className="text-xs text-noc-text-muted">Kredensial API disimpan aman dengan enkripsi AES-256-GCM</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
                connectionStatus === "connected"
                  ? "bg-status-ok-bg text-status-ok"
                  : "bg-status-down-bg text-status-down"
              )}
            >
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  connectionStatus === "connected" ? "bg-status-ok" : "bg-status-down"
                )}
              />
              {connectionStatus === "connected" ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Base URL */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-noc-text-muted mb-1.5">
              PRTG Server Base URL <span className="text-status-down">*</span>
            </label>
            <input
              type="url"
              required
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://prtg.bss.local:8443 atau https://10.20.1.5"
              className="w-full px-4 py-2.5 bg-noc-bg border border-noc-border rounded-xl text-sm text-noc-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
            />
            <p className="text-[11px] text-noc-text-muted mt-1">
              URL web PRTG Core Server (gunakan HTTPS untuk transmisi aman).
            </p>
          </div>

          {/* API Token / Passhash */}
          <div>
            <label className="block text-xs font-medium text-noc-text-muted mb-1.5 flex items-center justify-between">
              <span>PRTG Passhash / API Token</span>
              {hasToken && (
                <span className="text-[11px] text-status-ok flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Token Tersimpan (Terenkripsi)
                </span>
              )}
            </label>
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={hasToken ? "•••••••••••••••••••••••• (Isi untuk mengganti)" : "Masukkan PRTG Passhash / Token"}
              className="w-full px-4 py-2.5 bg-noc-bg border border-noc-border rounded-xl text-sm text-noc-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
            />
            <p className="text-[11px] text-noc-text-muted mt-1">
              Passhash akun PRTG Administrator atau token read-only sensor.
            </p>
          </div>

          {/* Polling Interval */}
          <div>
            <label className="block text-xs font-medium text-noc-text-muted mb-1.5">
              Interval Sinkronisasi (Detik)
            </label>
            <div className="relative">
              <input
                type="number"
                min={10}
                max={600}
                value={pollIntervalSeconds}
                onChange={(e) => setPollIntervalSeconds(parseInt(e.target.value) || 60)}
                className="w-full px-4 py-2.5 bg-noc-bg border border-noc-border rounded-xl text-sm text-noc-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
              />
              <Clock className="w-4 h-4 text-noc-text-muted absolute right-3.5 top-3" />
            </div>
            <p className="text-[11px] text-noc-text-muted mt-1">
              Rekomendasi NOC: 60 detik untuk keseimbangan beban server PRTG.
            </p>
          </div>

          {/* SSL Checkbox */}
          <div className="md:col-span-2 flex items-center gap-3 p-3.5 bg-noc-bg/60 rounded-xl border border-noc-border">
            <input
              type="checkbox"
              id="ignoreSsl"
              checked={ignoreSsl}
              onChange={(e) => setIgnoreSsl(e.target.checked)}
              className="w-4 h-4 text-brand-primary rounded bg-noc-bg border-noc-border focus:ring-brand-primary/50"
            />
            <label htmlFor="ignoreSsl" className="text-xs text-noc-text-primary cursor-pointer select-none">
              <strong>Abaikan validasi sertifikat SSL PRTG (Self-signed)</strong>
              <span className="block text-noc-text-muted text-[11px]">
                Centang opsi ini jika PRTG Server menggunakan sertifikat SSL lokal internal (default PRTG).
              </span>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-noc-border">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={testing}
              onClick={handleTestConnection}
              className="flex items-center gap-2 px-4 py-2 bg-noc-hover text-noc-text-primary rounded-xl text-xs font-medium hover:bg-noc-border transition-all disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
              Uji Koneksi PRTG
            </button>
            <button
              type="button"
              disabled={syncing}
              onClick={handleSyncNow}
              className="flex items-center gap-2 px-4 py-2 bg-noc-hover text-noc-text-primary rounded-xl text-xs font-medium hover:bg-noc-border transition-all disabled:opacity-50"
            >
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Sinkronisasi Sekarang
            </button>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white rounded-xl text-xs font-semibold hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Simpan Konfigurasi
          </button>
        </div>
      </form>

      {/* Uptime Monitor & SLA Warning Threshold Policy Card */}
      <form onSubmit={handleSaveUptimeSettings} className="glass-card p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-noc-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-noc-text-primary">
                Standar Ambang Batas Uptime & Warning (SLA)
              </h2>
              <p className="text-xs text-noc-text-muted">
                Kebijakan terpusat admin untuk menentukan kapan website & server berstatus Normal, Warning (lambat), atau Down
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
            Khusus Admin
          </span>
        </div>

        {/* Status Guide Explanation Box */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-xl bg-noc-bg/60 border border-noc-border text-xs">
          <div className="flex items-start gap-2.5 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 mt-1 shrink-0" />
            <div>
              <span className="font-bold text-emerald-400">Online (Hijau)</span>
              <p className="text-[11px] text-noc-text-muted mt-0.5">
                Latency respon normal di bawah batas toleransi (&lt; {uptimeWarningLatencyMs} ms).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2 rounded-lg bg-amber-500/5 border border-amber-500/20">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 mt-1 shrink-0 animate-pulse" />
            <div>
              <span className="font-bold text-amber-400">Warning (Kuning)</span>
              <p className="text-[11px] text-noc-text-muted mt-0.5">
                Layanan aktif namun respon lambat (≥ {uptimeWarningLatencyMs} ms).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2 rounded-lg bg-rose-500/5 border border-rose-500/20">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 mt-1 shrink-0 animate-ping" />
            <div>
              <span className="font-bold text-rose-400">Down (Merah)</span>
              <p className="text-[11px] text-noc-text-muted mt-0.5">
                Tidak merespon melebihi batas timeout (≥ {uptimeTimeoutMs / 1000}s) atau HTTP error.
              </p>
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-noc-text-secondary mb-1.5 flex items-center justify-between">
              <span>Batas Toleransi Latency (Warning Threshold)</span>
              <span className="text-amber-400 font-mono text-[11px] font-bold">{uptimeWarningLatencyMs} ms</span>
            </label>
            <select
              value={uptimeWarningLatencyMs}
              onChange={(e) => setUptimeWarningLatencyMs(parseInt(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-noc-bg border border-noc-border text-xs text-noc-text-primary focus:outline-none focus:border-brand-primary"
            >
              <option value="500">500 ms (Sangat Ketat - Rekomendasi ERP / DB Lokal)</option>
              <option value="1000">1000 ms (1 Detik - Standar Rekomendasi BSS)</option>
              <option value="1500">1500 ms (1.5 Detik - Toleran)</option>
              <option value="2000">2000 ms (2 Detik - Website Berat)</option>
              <option value="3000">3000 ms (3 Detik - Toleransi Maksimal)</option>
            </select>
            <p className="text-[11px] text-noc-text-muted mt-1.5">
              Jika waktu respon server melebihi batas ini, server ditandai berstatus <strong>WARNING</strong> di wallboard dan dashboard secara otomatis.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-noc-text-secondary mb-1.5 flex items-center justify-between">
              <span>Batas Timeout Standar (Batas Layanan Down)</span>
              <span className="text-rose-400 font-mono text-[11px] font-bold">{uptimeTimeoutMs / 1000} Detik</span>
            </label>
            <select
              value={uptimeTimeoutMs}
              onChange={(e) => setUptimeTimeoutMs(parseInt(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-noc-bg border border-noc-border text-xs text-noc-text-primary focus:outline-none focus:border-brand-primary"
            >
              <option value="3000">3 Detik (Cepat)</option>
              <option value="5000">5 Detik (Standar Rekomendasi)</option>
              <option value="10000">10 Detik (Tinggi)</option>
              <option value="15000">15 Detik (Maksimal)</option>
            </select>
            <p className="text-[11px] text-noc-text-muted mt-1.5">
              Batas waktu tunggu koneksi jaringan sebelum server dianggap <strong>DOWN (OFFLINE)</strong> dan memicu sirene / alert.
            </p>
          </div>
        </div>

        {/* Checkbox Mass-Apply */}
        <div className="p-3.5 rounded-xl bg-noc-bg/40 border border-noc-border flex items-center justify-between">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs text-noc-text-primary">
            <input
              type="checkbox"
              checked={applyToAllMonitors}
              onChange={(e) => setApplyToAllMonitors(e.target.checked)}
              className="w-4 h-4 rounded border-noc-border text-brand-primary focus:ring-brand-primary/20"
            />
            <span className="font-medium">
              Terapkan juga standar threshold baru ini ke <strong>seluruh monitor yang sudah dibuat</strong> saat ini
            </span>
          </label>
        </div>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={savingUptime}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white rounded-xl text-xs font-semibold hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20 disabled:opacity-50"
          >
            {savingUptime ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Standar Uptime & Warning
          </button>
        </div>
      </form>

      {/* Data Retention & Storage Policy Card */}
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-4 border-b border-noc-border">
          <div className="p-2 rounded-lg bg-status-warning/10 text-status-warning">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-noc-text-primary">Kebijakan Retensi & Storage TimescaleDB</h2>
            <p className="text-xs text-noc-text-muted">
              Pembersihan otomatis metrik sensor historis untuk menjaga efisiensi I/O storage
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-noc-bg/50 rounded-xl border border-noc-border">
            <span className="text-xs text-noc-text-muted">Total Data Metrik Historis</span>
            <p className="text-2xl font-bold text-noc-text-primary mt-1">
              {retentionStats?.totalMetrics.toLocaleString() || "0"}
            </p>
            <span className="text-[11px] text-noc-text-muted">rekaman point waktu</span>
          </div>

          <div className="p-4 bg-noc-bg/50 rounded-xl border border-noc-border">
            <span className="text-xs text-noc-text-muted">Masa Retensi Aktif</span>
            <p className="text-2xl font-bold text-brand-primary mt-1">{retentionDays} Hari</p>
            <span className="text-[11px] text-noc-text-muted">
              Data lebih lama akan dihapus otomatis
            </span>
          </div>

          <div className="p-4 bg-noc-bg/50 rounded-xl border border-noc-border">
            <span className="text-xs text-noc-text-muted">Data Kadaluarsa</span>
            <p
              className={cn(
                "text-2xl font-bold mt-1",
                (retentionStats?.expiredCount || 0) > 0 ? "text-status-warning" : "text-status-ok"
              )}
            >
              {retentionStats?.expiredCount.toLocaleString() || "0"}
            </p>
            <span className="text-[11px] text-noc-text-muted">dapat segera dibersihkan</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3">
          <div className="text-xs text-noc-text-muted">
            Pembersihan terakhir:{" "}
            <strong className="text-noc-text-primary">
              {retentionStats?.lastCleanupAt
                ? new Date(retentionStats.lastCleanupAt).toLocaleString("id-ID")
                : "Belum pernah dijalankan"}
            </strong>
          </div>
          <button
            type="button"
            disabled={purging || (retentionStats?.expiredCount || 0) === 0}
            onClick={handlePurgeData}
            className="flex items-center gap-2 px-4 py-2 bg-status-down/10 text-status-down hover:bg-status-down/20 border border-status-down/30 rounded-xl text-xs font-semibold transition-all disabled:opacity-40"
          >
            {purging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Purge Data Kadaluarsa Sekarang
          </button>
        </div>
      </div>

      {/* Corporate Info Footer */}
      <div className="glass-card p-4 flex items-center justify-between text-xs text-noc-text-muted">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-brand-primary" />
          <span>Sistem Monitoring: <strong>Dashboard-Server</strong> · PT. Bina Sarana Sukses</span>
        </div>
        <div>
          <span>Database Engine: <strong>PostgreSQL 15 (TimescaleDB Ready)</strong></span>
        </div>
      </div>
    </div>
  );
}
