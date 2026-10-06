"use client";

import { useState, useEffect } from "react";
import {
  Wrench,
  Send,
  Globe,
  Network,
  Wifi,
  Calculator,
  Cpu,
  Terminal as TerminalIcon,
  Loader2,
  Copy,
  Check,
  History,
  Trash2,
  Building2,
  Radio,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Pencil,
  X,
  Undo2,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ToolTab = "ping" | "traceroute" | "portcheck" | "dns" | "subnet" | "mac";

interface ToolResult {
  output: string;
  error?: string;
  stats?: Record<string, string | number>;
}

interface MacLookupData {
  macAddress: string;
  ouiPrefix: string;
  vendor: string;
  companyAddress?: string;
  country?: string;
  isPrivate: boolean;
  isMulticast: boolean;
  isBroadcast: boolean;
  source: "OFFLINE_DATABASE" | "LIVE_API" | "ARP_RESOLVED";
  resolvedFromIp?: string;
  formats: {
    colon: string;
    hyphen: string;
    cisco: string;
    raw: string;
  };
}

interface MacHistoryItem {
  id: string;
  macAddress: string;
  ouiPrefix: string;
  vendor: string;
  isPrivate: boolean;
  remark?: string | null;
  isDeleted?: boolean;
  deletedAt?: string | null;
  queriedBy: string;
  createdAt: string;
  details?: string;
}

const tabs: { id: ToolTab; label: string; icon: React.ElementType }[] = [
  { id: "ping", label: "Ping", icon: Wifi },
  { id: "traceroute", label: "Traceroute", icon: Network },
  { id: "portcheck", label: "Port Check", icon: Globe },
  { id: "dns", label: "DNS Lookup", icon: Globe },
  { id: "subnet", label: "Subnet Calc", icon: Calculator },
  { id: "mac", label: "MAC Lookup", icon: Cpu },
];

const MAC_PRESETS = [
  { label: "Cisco", value: "00:00:0C:4A:2B:11" },
  { label: "MikroTik", value: "48:8B:0A:99:88:77" },
  { label: "Fortinet", value: "70:4C:A5:11:22:33" },
  { label: "VMware", value: "00:0C:29:8F:A1:02" },
  { label: "Ruijie", value: "70:81:05:3A:4B:5C" },
  { label: "Private/LAA", value: "7A:3F:4D:A8:C8:64" },
  { label: "Local IP (ARP)", value: "172.20.10.1" },
];

function formatRelativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "Baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

// Subnet Calculator (pure client-side)
function calculateSubnet(cidr: string): ToolResult {
  const match = cidr.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
  if (!match) return { output: "", error: "Invalid CIDR format. Use: 192.168.1.0/24" };

  const [, ip, prefixStr] = match;
  const prefix = parseInt(prefixStr);
  if (prefix < 0 || prefix > 32)
    return { output: "", error: "Prefix must be between 0 and 32" };

  const ipParts = ip.split(".").map(Number);
  if (ipParts.some((p) => p < 0 || p > 255))
    return { output: "", error: "Invalid IP address" };

  const ipNum =
    (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (ipNum & mask) >>> 0;
  const broadcast = (network | ~mask) >>> 0;
  const firstHost = prefix >= 31 ? network : (network + 1) >>> 0;
  const lastHost = prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;
  const totalHosts = prefix >= 31 ? (prefix === 32 ? 1 : 2) : Math.pow(2, 32 - prefix) - 2;

  const toIp = (n: number) =>
    `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;

  const output = [
    `CIDR Notation:      ${ip}/${prefix}`,
    `Network Address:    ${toIp(network)}`,
    `Broadcast Address:  ${toIp(broadcast)}`,
    `Subnet Mask:        ${toIp(mask)}`,
    `Wildcard Mask:      ${toIp(~mask >>> 0)}`,
    `Usable Host Range:  ${toIp(firstHost)} – ${toIp(lastHost)}`,
    `Total Usable Hosts: ${totalHosts.toLocaleString()}`,
    `IP Class:           ${ipParts[0] < 128 ? "A" : ipParts[0] < 192 ? "B" : ipParts[0] < 224 ? "C" : "D/E"}`,
  ].join("\n");

  return { output };
}

export default function ToolsPage() {
  const [activeTab, setActiveTab] = useState<ToolTab>("ping");
  const [target, setTarget] = useState("");
  const [count, setCount] = useState("4");
  const [timeout, setTimeout_] = useState("5");
  const [ports, setPorts] = useState("80,443,22,3389,1433,3306,5432");
  const [dnsType, setDnsType] = useState("A");
  const [result, setResult] = useState<ToolResult | null>(null);
  const [loading, setLoading] = useState(false);

  // MAC Lookup specific state
  const [macResult, setMacResult] = useState<MacLookupData | null>(null);
  const [macError, setMacError] = useState<string | null>(null);
  const [macHistory, setMacHistory] = useState<MacHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);
  const [remark, setRemark] = useState("");
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [editingRemarkValue, setEditingRemarkValue] = useState("");
  const [savingRemarkId, setSavingRemarkId] = useState<string | null>(null);

  // Recycle Bin state
  const [historyTab, setHistoryTab] = useState<"active" | "trash">("active");
  const [trashCount, setTrashCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<{ message: string; undoId?: string } | null>(null);

  // Fetch MAC search history
  const fetchMacHistory = async (targetTab?: "active" | "trash") => {
    const currentTab = targetTab !== undefined ? targetTab : historyTab;
    setLoadingHistory(true);
    try {
      const url = currentTab === "trash" ? "/api/tools/mac?trash=true" : "/api/tools/mac";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setMacHistory(data.history || []);
        setTrashCount(data.trashCount || 0);
        setActiveCount(data.activeCount || 0);
      }
    } catch (err) {
      console.error("Failed to load MAC lookup history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load history when entering MAC tab
  useEffect(() => {
    if (activeTab === "mac") {
      fetchMacHistory(historyTab);
    }
  }, [activeTab]);

  const copyToClipboard = (text: string, formatName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFormat(formatName);
    setTimeout(() => setCopiedFormat(null), 2000);
  };

  // Soft-delete single item to recycle bin (non-destructive, instantaneous)
  const deleteMacHistoryItem = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tools/mac?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setActionNotice({ message: "Riwayat MAC dipindahkan ke Tempat Sampah.", undoId: id });
        fetchMacHistory(historyTab);
        setTimeout(() => setActionNotice((prev) => (prev?.undoId === id ? null : prev)), 6000);
      }
    } catch (err) {
      console.error("Failed to delete item:", err);
    } finally {
      setDeletingId(null);
    }
  };

  // Restore item from recycle bin
  const restoreMacHistoryItem = async (id: string) => {
    setRestoringId(id);
    try {
      const res = await fetch("/api/tools/mac", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, restore: true }),
      });
      if (res.ok) {
        setActionNotice({ message: "Riwayat MAC berhasil dipulihkan ke daftar aktif.", undoId: undefined });
        fetchMacHistory(historyTab);
        setTimeout(() => setActionNotice(null), 4000);
      }
    } catch (err) {
      console.error("Failed to restore item:", err);
    } finally {
      setRestoringId(null);
    }
  };

  // Permanent delete single item
  const permanentDeleteMacHistoryItem = async (id: string) => {
    if (!confirm("Hapus permanen riwayat MAC ini? Tindakan ini tidak dapat dibatalkan.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/tools/mac?id=${id}&permanent=true`, { method: "DELETE" });
      if (res.ok) {
        setActionNotice({ message: "Riwayat MAC berhasil dihapus secara permanen.", undoId: undefined });
        fetchMacHistory(historyTab);
        setTimeout(() => setActionNotice(null), 4000);
      }
    } catch (err) {
      console.error("Failed to permanently delete item:", err);
    } finally {
      setDeletingId(null);
    }
  };

  // Empty entire recycle bin
  const emptyRecycleBin = async () => {
    if (!confirm("Kosongkan Tempat Sampah? Semua riwayat di Recycle Bin akan dihapus secara permanen.")) return;
    try {
      const res = await fetch("/api/tools/mac?emptyTrash=true", { method: "DELETE" });
      if (res.ok) {
        setActionNotice({ message: "Tempat Sampah berhasil dikosongkan.", undoId: undefined });
        fetchMacHistory(historyTab);
        setTimeout(() => setActionNotice(null), 4000);
      }
    } catch (err) {
      console.error("Failed to empty recycle bin:", err);
    }
  };

  // Soft-delete all active items
  const clearMacHistory = async () => {
    if (!confirm("Pindahkan semua riwayat pencarian aktif ke Tempat Sampah (Recycle Bin)?")) return;
    try {
      const res = await fetch("/api/tools/mac?all=true", { method: "DELETE" });
      if (res.ok) {
        setActionNotice({ message: "Semua riwayat pencarian dipindahkan ke Tempat Sampah.", undoId: undefined });
        fetchMacHistory(historyTab);
        setTimeout(() => setActionNotice(null), 4000);
      }
    } catch (err) {
      console.error("Failed to delete history:", err);
    }
  };

  const saveRemark = async (id: string, newRemark: string) => {
    setSavingRemarkId(id);
    try {
      const res = await fetch("/api/tools/mac", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, remark: newRemark }),
      });
      if (res.ok) {
        setMacHistory((prev) =>
          prev.map((item) => (item.id === id ? { ...item, remark: newRemark.trim() || null } : item))
        );
        setEditingRemarkId(null);
      }
    } catch (err) {
      console.error("Failed to update remark:", err);
    } finally {
      setSavingRemarkId(null);
    }
  };

  const executeMacLookup = async (lookupTarget?: string, lookupRemark?: string) => {
    const query = (lookupTarget || target).trim();
    if (!query) return;

    if (lookupTarget) {
      setTarget(lookupTarget);
    }
    const currentRemark = lookupRemark !== undefined ? lookupRemark : remark;
    if (lookupRemark !== undefined) {
      setRemark(lookupRemark);
    }

    setLoading(true);
    setMacError(null);
    setMacResult(null);

    try {
      const res = await fetch("/api/tools/mac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: query, remark: currentRemark }),
      });

      const data = await res.json();
      if (!res.ok) {
        setMacError(data.error || "Gagal melakukan lookup MAC Address");
      } else {
        setMacResult(data.result);
        fetchMacHistory();
      }
    } catch {
      setMacError("Terjadi gangguan koneksi ke server");
    } finally {
      setLoading(false);
    }
  };

  const execute = async () => {
    if (activeTab === "mac") {
      executeMacLookup();
      return;
    }

    if (activeTab === "subnet") {
      setResult(calculateSubnet(target));
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const body: Record<string, string> = { target };
      if (activeTab === "ping") {
        body.count = count;
        body.timeout = timeout;
      }
      if (activeTab === "portcheck") body.ports = ports;
      if (activeTab === "dns") body.type = dnsType;

      const res = await fetch(`/api/tools/${activeTab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ output: "", error: data.error || "Execution failed" });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ output: "", error: "Network error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-noc-text-primary flex items-center gap-2">
          <Wrench className="w-7 h-7 text-brand-primary" />
          Network Diagnostic Tools
        </h1>
        <p className="text-sm text-noc-text-muted mt-1">
          ICMP Ping, Traceroute, Port Check, DNS Lookup, Subnet Calculator, dan MAC Address Lookup
        </p>
      </div>

      <div className="glass-card overflow-hidden">
        {/* Tab Bar */}
        <div className="flex border-b border-noc-border overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setResult(null);
                  setMacError(null);
                }}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all whitespace-nowrap border-b-2",
                  activeTab === tab.id
                    ? "border-brand-primary text-brand-primary bg-brand-primary/5"
                    : "border-transparent text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover/50"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Input Area */}
        <div className="p-5 border-b border-noc-border">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[240px]">
              <label className="block text-xs text-noc-text-muted mb-1.5 font-medium">
                {activeTab === "subnet"
                  ? "CIDR (e.g. 192.168.1.0/24)"
                  : activeTab === "mac"
                  ? "MAC Address / IP Lokal (ARP)"
                  : "Target (IP / Domain)"}
              </label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={
                  activeTab === "subnet"
                    ? "192.168.1.0/24"
                    : activeTab === "mac"
                    ? "e.g. 00:1A:2B:3C:4D:5E, 704c.a511.2233, atau IP 192.168.1.1"
                    : "e.g. 192.168.1.1 or google.com"
                }
                className="w-full px-4 py-2.5 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text-primary placeholder:text-noc-text-muted focus:ring-2 focus:ring-brand-primary/50 font-mono"
                onKeyDown={(e) => e.key === "Enter" && execute()}
              />
            </div>

            {activeTab === "mac" && (
              <div className="w-72 min-w-[200px]">
                <label className="block text-xs text-noc-text-muted mb-1.5 font-medium">
                  Remark / Catatan (Opsional)
                </label>
                <input
                  type="text"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="e.g. Core Switch MHU, Server ERP"
                  className="w-full px-4 py-2.5 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text-primary placeholder:text-noc-text-muted focus:ring-2 focus:ring-brand-primary/50"
                  onKeyDown={(e) => e.key === "Enter" && execute()}
                />
              </div>
            )}

            {activeTab === "ping" && (
              <>
                <div className="w-24">
                  <label className="block text-xs text-noc-text-muted mb-1.5 font-medium">Count</label>
                  <select
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text-primary"
                  >
                    <option value="4">4</option>
                    <option value="8">8</option>
                    <option value="16">16</option>
                  </select>
                </div>
                <div className="w-28">
                  <label className="block text-xs text-noc-text-muted mb-1.5 font-medium">Timeout (s)</label>
                  <select
                    value={timeout}
                    onChange={(e) => setTimeout_(e.target.value)}
                    className="w-full px-3 py-2.5 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text-primary"
                  >
                    <option value="3">3s</option>
                    <option value="5">5s</option>
                    <option value="10">10s</option>
                  </select>
                </div>
              </>
            )}

            {activeTab === "portcheck" && (
              <div className="w-64">
                <label className="block text-xs text-noc-text-muted mb-1.5 font-medium">Ports (comma-separated)</label>
                <input
                  type="text"
                  value={ports}
                  onChange={(e) => setPorts(e.target.value)}
                  className="w-full px-3 py-2.5 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text-primary font-mono"
                />
              </div>
            )}

            {activeTab === "dns" && (
              <div className="w-32">
                <label className="block text-xs text-noc-text-muted mb-1.5 font-medium">Record Type</label>
                <select
                  value={dnsType}
                  onChange={(e) => setDnsType(e.target.value)}
                  className="w-full px-3 py-2.5 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text-primary"
                >
                  <option value="A">A</option>
                  <option value="AAAA">AAAA</option>
                  <option value="CNAME">CNAME</option>
                  <option value="MX">MX</option>
                  <option value="NS">NS</option>
                  <option value="TXT">TXT</option>
                  <option value="PTR">PTR (Reverse)</option>
                </select>
              </div>
            )}

            <button
              onClick={execute}
              disabled={loading || !target.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-primary text-white rounded-lg text-sm font-medium hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : activeTab === "mac" ? (
                <Cpu className="w-4 h-4" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {activeTab === "mac" ? "Cari Vendor" : "Execute"}
            </button>
          </div>

          {/* Quick Presets for MAC Lookup */}
          {activeTab === "mac" && (
            <div className="mt-3 pt-3 border-t border-noc-border/60 flex flex-wrap items-center gap-2">
              <span className="text-xs text-noc-text-muted flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
                Contoh Cepat:
              </span>
              {MAC_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => executeMacLookup(preset.value)}
                  className="px-2.5 py-1 text-xs bg-noc-surface hover:bg-noc-hover text-noc-text-secondary hover:text-noc-text-primary border border-noc-border rounded-md transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Output Section */}
        {activeTab === "mac" ? (
          <div className="p-5 space-y-6">
            {/* MAC Lookup Result Card */}
            {macError && (
              <div className="p-4 rounded-lg bg-status-down/10 border border-status-down/30 text-status-down text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{macError}</span>
              </div>
            )}

            {macResult && (
              <div className="rounded-xl border border-noc-border bg-noc-surface/40 p-5 backdrop-blur-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-noc-border">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="w-5 h-5 text-brand-primary" />
                      <h2 className="text-xl font-bold text-noc-text-primary">{macResult.vendor}</h2>
                    </div>
                    {macResult.companyAddress && (
                      <p className="text-xs text-noc-text-muted">{macResult.companyAddress}</p>
                    )}
                    {remark && (
                      <p className="text-xs text-brand-primary font-medium mt-1 flex items-center gap-1">
                        <Pencil className="w-3 h-3" />
                        Catatan: {remark}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {macResult.source === "OFFLINE_DATABASE" && (
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Database Lokal
                      </span>
                    )}
                    {macResult.source === "LIVE_API" && (
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5" />
                        IEEE Online Registry
                      </span>
                    )}
                    {macResult.source === "ARP_RESOLVED" && (
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                        <Network className="w-3.5 h-3.5" />
                        Resolved from ARP ({macResult.resolvedFromIp})
                      </span>
                    )}
                    {macResult.isPrivate ? (
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                        <Radio className="w-3.5 h-3.5" />
                        Locally Administered (LAA / Private)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30">
                        Universal (OUI Terdaftar)
                      </span>
                    )}
                  </div>
                </div>

                {/* Specification Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-noc-border">
                  <div>
                    <span className="text-xs text-noc-text-muted block">OUI Prefix</span>
                    <span className="text-sm font-mono font-semibold text-noc-text-primary">
                      {macResult.ouiPrefix}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-noc-text-muted block">Negara / Asal</span>
                    <span className="text-sm font-medium text-noc-text-primary">
                      {macResult.country || "Tidak Terdaftar"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-noc-text-muted block">Tipe Transmisi</span>
                    <span className="text-sm font-medium text-noc-text-primary">
                      {macResult.isBroadcast
                        ? "Broadcast (All)"
                        : macResult.isMulticast
                        ? "Multicast Group"
                        : "Unicast (Individual)"}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-noc-text-muted block">Format Asli</span>
                    <span className="text-sm font-mono font-semibold text-noc-text-primary">
                      {macResult.macAddress}
                    </span>
                  </div>
                </div>

                {/* Formatted Representations with Copy Buttons */}
                <div className="pt-4">
                  <span className="text-xs text-noc-text-muted block mb-2 font-medium">
                    Format Variasi (Klik untuk Salin):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { name: "Colon", value: macResult.formats.colon },
                      { name: "Hyphen", value: macResult.formats.hyphen },
                      { name: "Cisco", value: macResult.formats.cisco },
                      { name: "Raw Hex", value: macResult.formats.raw },
                    ].map((f) => (
                      <button
                        key={f.name}
                        onClick={() => copyToClipboard(f.value, f.name)}
                        className="flex items-center justify-between px-3 py-2 bg-noc-bg/80 border border-noc-border rounded-lg text-xs font-mono text-noc-text-secondary hover:text-noc-text-primary hover:border-brand-primary/50 transition-all text-left"
                      >
                        <div>
                          <span className="text-[10px] text-noc-text-muted block">{f.name}</span>
                          <span className="font-semibold">{f.value}</span>
                        </div>
                        {copiedFormat === f.name ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-noc-text-muted shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!macResult && !macError && !loading && (
              <div className="p-8 text-center border border-dashed border-noc-border rounded-xl text-noc-text-muted">
                <Cpu className="w-8 h-8 mx-auto mb-2 text-noc-text-muted/60" />
                <p className="text-sm">
                  Masukkan MAC Address atau IP Lokal dan klik <strong>Cari Vendor</strong>.
                </p>
                <p className="text-xs text-noc-text-muted mt-1">
                  Mendukung format colon, dash, Cisco dot, raw hex, dan auto-resolusi ARP.
                </p>
              </div>
            )}

            {/* MAC Search History Table & Recycle Bin */}
            <div className="pt-2">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-brand-primary" />
                  <h3 className="text-sm font-semibold text-noc-text-primary">
                    Riwayat Pencarian MAC
                  </h3>

                  {/* Toggle Active vs Recycle Bin */}
                  <div className="flex items-center bg-noc-bg border border-noc-border rounded-lg p-0.5 ml-2">
                    <button
                      id="tab-history-active"
                      onClick={() => {
                        setHistoryTab("active");
                        fetchMacHistory("active");
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-all font-medium",
                        historyTab === "active"
                          ? "bg-noc-surface text-noc-text-primary shadow-sm"
                          : "text-noc-text-muted hover:text-noc-text-primary"
                      )}
                    >
                      <span>Aktif</span>
                      {activeCount > 0 && (
                        <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-brand-primary/20 text-brand-primary font-semibold">
                          {activeCount}
                        </span>
                      )}
                    </button>
                    <button
                      id="tab-history-trash"
                      onClick={() => {
                        setHistoryTab("trash");
                        fetchMacHistory("trash");
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-all font-medium",
                        historyTab === "trash"
                          ? "bg-noc-surface text-status-down shadow-sm"
                          : "text-noc-text-muted hover:text-noc-text-primary"
                      )}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Tempat Sampah</span>
                      {trashCount > 0 && (
                        <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-status-down/20 text-status-down font-semibold">
                          {trashCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  {historyTab === "active" && activeCount > 0 && (
                    <button
                      id="btn-move-all-trash"
                      onClick={clearMacHistory}
                      className="flex items-center gap-1 text-xs text-status-down/80 hover:text-status-down transition-colors"
                      title="Pindahkan semua ke tempat sampah"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Pindahkan Semua ke Sampah
                    </button>
                  )}
                  {historyTab === "trash" && trashCount > 0 && (
                    <button
                      id="btn-empty-trash"
                      onClick={emptyRecycleBin}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs text-status-down bg-status-down/10 hover:bg-status-down/20 border border-status-down/30 rounded-md transition-colors"
                      title="Hapus semua secara permanen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Kosongkan Tempat Sampah
                    </button>
                  )}
                </div>
              </div>

              {/* Action Notice / Undo Banner */}
              {actionNotice && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-between gap-2 text-xs text-brand-primary animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{actionNotice.message}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {actionNotice.undoId && (
                      <button
                        onClick={() => restoreMacHistoryItem(actionNotice.undoId!)}
                        className="px-2 py-0.5 rounded bg-brand-primary text-white font-medium hover:bg-brand-primary/90 transition-colors flex items-center gap-1"
                      >
                        <Undo2 className="w-3 h-3" />
                        Batalkan (Undo)
                      </button>
                    )}
                    <button
                      onClick={() => setActionNotice(null)}
                      className="p-0.5 hover:text-noc-text-primary transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {loadingHistory ? (
                <div className="flex items-center justify-center p-6 text-noc-text-muted text-xs">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Memuat data...
                </div>
              ) : macHistory.length === 0 ? (
                <div className="p-4 text-center border border-noc-border/40 rounded-lg text-xs text-noc-text-muted">
                  {historyTab === "trash"
                    ? "Tempat Sampah kosong. Tidak ada riwayat MAC yang dihapus."
                    : "Belum ada riwayat pencarian aktif. Pencarian yang dilakukan akan otomatis tersimpan di sini."}
                </div>
              ) : (
                <div className="border border-noc-border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-noc-surface/60 border-b border-noc-border text-noc-text-muted uppercase text-[10px]">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">
                            {historyTab === "trash" ? "Waktu Dihapus" : "Waktu"}
                          </th>
                          <th className="px-4 py-2.5 font-medium">MAC Address</th>
                          <th className="px-4 py-2.5 font-medium">Pabrikan / Vendor</th>
                          <th className="px-4 py-2.5 font-medium">Remark / Catatan</th>
                          <th className="px-4 py-2.5 font-medium">Tipe</th>
                          <th className="px-4 py-2.5 font-medium">Operator</th>
                          <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-noc-border/40">
                        {macHistory.map((item) => (
                          <tr key={item.id} className="hover:bg-noc-hover/30 transition-colors">
                            <td className="px-4 py-2.5 text-noc-text-muted whitespace-nowrap">
                              {formatRelativeTime(
                                historyTab === "trash" && item.deletedAt ? item.deletedAt : item.createdAt
                              )}
                            </td>
                            <td className="px-4 py-2.5 font-mono font-medium text-noc-text-primary whitespace-nowrap">
                              {item.macAddress}
                            </td>
                            <td className="px-4 py-2.5 text-noc-text-primary font-medium">
                              {item.vendor}
                            </td>
                            <td className="px-4 py-2.5">
                              {historyTab === "trash" ? (
                                item.remark ? (
                                  <span className="text-noc-text-primary font-medium bg-noc-hover/60 px-2 py-0.5 rounded border border-noc-border/50 text-[11px]">
                                    {item.remark}
                                  </span>
                                ) : (
                                  <span className="text-noc-text-muted italic text-[11px]">-</span>
                                )
                              ) : editingRemarkId === item.id ? (
                                <div className="flex items-center gap-1.5 min-w-[180px]">
                                  <input
                                    type="text"
                                    value={editingRemarkValue}
                                    onChange={(e) => setEditingRemarkValue(e.target.value)}
                                    placeholder="Tulis catatan..."
                                    className="w-full px-2 py-1 bg-noc-bg border border-brand-primary rounded text-xs text-noc-text-primary focus:outline-none"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveRemark(item.id, editingRemarkValue);
                                      if (e.key === "Escape") setEditingRemarkId(null);
                                    }}
                                  />
                                  <button
                                    onClick={() => saveRemark(item.id, editingRemarkValue)}
                                    disabled={savingRemarkId === item.id}
                                    className="p-1 bg-brand-primary text-white rounded hover:bg-brand-primary/90 transition-colors"
                                    title="Simpan"
                                  >
                                    {savingRemarkId === item.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Check className="w-3 h-3" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => setEditingRemarkId(null)}
                                    className="p-1 bg-noc-surface text-noc-text-muted hover:text-noc-text-primary rounded transition-colors"
                                    title="Batal"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 group">
                                  {item.remark ? (
                                    <span className="text-noc-text-primary font-medium bg-noc-hover/60 px-2 py-0.5 rounded border border-noc-border/50 text-[11px]">
                                      {item.remark}
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setEditingRemarkId(item.id);
                                        setEditingRemarkValue("");
                                      }}
                                      className="text-noc-text-muted/60 hover:text-brand-primary italic text-[11px] transition-colors"
                                    >
                                      + Tambah catatan
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setEditingRemarkId(item.id);
                                      setEditingRemarkValue(item.remark || "");
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-0.5 text-noc-text-muted hover:text-brand-primary transition-opacity"
                                    title="Edit Catatan"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              {item.isPrivate ? (
                                <span className="px-2 py-0.5 text-[10px] rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                  Private / LAA
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-[10px] rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                  Universal OUI
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-noc-text-muted whitespace-nowrap">
                              {item.queriedBy}
                            </td>
                            <td className="px-4 py-2.5 text-right whitespace-nowrap">
                              {historyTab === "trash" ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    id={`btn-restore-${item.id}`}
                                    onClick={() => restoreMacHistoryItem(item.id)}
                                    disabled={restoringId === item.id}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[11px] font-medium transition-colors"
                                    title="Pulihkan ke riwayat aktif"
                                  >
                                    {restoringId === item.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Undo2 className="w-3 h-3" />
                                    )}
                                    Pulihkan
                                  </button>
                                  <button
                                    id={`btn-perm-delete-${item.id}`}
                                    onClick={() => permanentDeleteMacHistoryItem(item.id)}
                                    disabled={deletingId === item.id}
                                    className="inline-flex items-center gap-1 p-1 bg-status-down/10 hover:bg-status-down/20 text-status-down border border-status-down/30 rounded text-[11px] font-medium transition-colors"
                                    title="Hapus Permanen"
                                  >
                                    {deletingId === item.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    id={`btn-check-again-${item.id}`}
                                    onClick={() => executeMacLookup(item.macAddress, item.remark || "")}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-noc-surface hover:bg-noc-hover text-noc-text-primary border border-noc-border rounded text-[11px] font-medium transition-colors"
                                    title="Cek Ulang MAC"
                                  >
                                    <RotateCcw className="w-3 h-3 text-brand-primary" />
                                    Cek Ulang
                                  </button>
                                  <button
                                    id={`btn-trash-${item.id}`}
                                    onClick={() => deleteMacHistoryItem(item.id)}
                                    disabled={deletingId === item.id}
                                    className="p-1 bg-noc-surface hover:bg-status-down/10 text-noc-text-muted hover:text-status-down border border-noc-border hover:border-status-down/30 rounded transition-colors"
                                    title="Pindahkan ke Tempat Sampah"
                                  >
                                    {deletingId === item.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Terminal Output for other network tools */
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <TerminalIcon className="w-4 h-4 text-noc-text-muted" />
              <span className="text-xs font-medium text-noc-text-muted">Output</span>
            </div>
            <div className="terminal-output min-h-[200px]">
              {result ? (
                result.error ? (
                  <span className="text-status-down">{result.error}</span>
                ) : (
                  <pre className="whitespace-pre-wrap">{result.output}</pre>
                )
              ) : (
                <span className="text-noc-text-muted italic">
                  {loading
                    ? "Executing command..."
                    : `Enter a ${activeTab === "subnet" ? "CIDR notation" : "target"} and click Execute`}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
