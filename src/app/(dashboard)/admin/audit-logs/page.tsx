"use client";

import { useState, useEffect } from "react";
import {
  ClipboardList,
  Search,
  Wrench,
  ShieldAlert,
  Users,
  Settings,
  Database,
  Filter,
  Loader2,
  Calendar,
  User,
  Clock,
} from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";

interface AuditLogItem {
  id: string;
  action: string;
  target: string | null;
  detail: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: {
    employeeId: string;
    name: string;
    role: string;
  };
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    tools: 0,
    ack: 0,
    users: 0,
    settings: 0,
  });
  const [category, setCategory] = useState<"all" | "tools" | "ack" | "users" | "settings">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (search.trim()) params.set("q", search.trim());

      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        if (data.counts) setCounts(data.counts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [category]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  const getActionBadge = (action: string) => {
    if (action.startsWith("NETWORK_TOOL")) {
      return {
        label: action.replace("NETWORK_TOOL_", ""),
        color: "bg-brand-primary/10 text-brand-primary border-brand-primary/20",
        icon: Wrench,
      };
    }
    if (action === "ACKNOWLEDGE_ALERT") {
      return {
        label: "ACK ALERT",
        color: "bg-status-warning-bg text-status-warning border-status-warning/20",
        icon: ShieldAlert,
      };
    }
    if (action.includes("USER")) {
      return {
        label: action.replace("_USER", ""),
        color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
        icon: Users,
      };
    }
    if (action.includes("PURGE")) {
      return {
        label: action,
        color: "bg-status-down-bg text-status-down border-status-down/20",
        icon: Database,
      };
    }
    return {
      label: action,
      color: "bg-noc-hover text-noc-text-secondary border-noc-border",
      icon: Settings,
    };
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-noc-text-primary flex items-center gap-2">
          <ClipboardList className="w-7 h-7 text-brand-primary" />
          Audit Trail & Log Aktivitas
        </h1>
        <p className="text-sm text-noc-text-muted mt-1">
          Rekaman jejak operasional sistem, eksekusi tools jaringan, penanganan insiden NOC, dan perubahan akun
        </p>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-noc-card border border-noc-border rounded-xl">
          <span className="text-xs text-noc-text-muted font-medium">Total Log Tercatat</span>
          <p className="text-2xl font-bold text-noc-text-primary mt-1">{counts.total}</p>
        </div>
        <div className="p-4 bg-noc-card border border-noc-border rounded-xl">
          <span className="text-xs text-noc-text-muted font-medium">Penggunaan Network Tools</span>
          <p className="text-2xl font-bold text-brand-primary mt-1">{counts.tools}</p>
        </div>
        <div className="p-4 bg-noc-card border border-noc-border rounded-xl">
          <span className="text-xs text-noc-text-muted font-medium">Konfirmasi Alert (ACK)</span>
          <p className="text-2xl font-bold text-status-warning mt-1">{counts.ack}</p>
        </div>
        <div className="p-4 bg-noc-card border border-noc-border rounded-xl">
          <span className="text-xs text-noc-text-muted font-medium">Operasi Akun & Sistem</span>
          <p className="text-2xl font-bold text-purple-400 mt-1">{counts.users + counts.settings}</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex flex-wrap gap-1 bg-noc-bg p-1 rounded-xl border border-noc-border">
            {[
              { id: "all", label: "Semua Aktivitas" },
              { id: "tools", label: "Diagnostic Tools" },
              { id: "ack", label: "Acknowledge Alert" },
              { id: "users", label: "Manajemen User" },
              { id: "settings", label: "Settings & Purge" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                  category === cat.id
                    ? "bg-brand-primary text-white"
                    : "text-noc-text-secondary hover:text-noc-text-primary"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari target, operator, aksi..."
                className="w-64 px-3.5 py-1.5 pl-9 bg-noc-bg border border-noc-border rounded-xl text-xs text-noc-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50"
              />
              <Search className="w-3.5 h-3.5 text-noc-text-muted absolute left-3 top-2.5" />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 bg-noc-hover text-noc-text-primary rounded-xl text-xs font-semibold hover:bg-noc-border transition-all"
            >
              Cari
            </button>
          </form>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-noc-border text-left text-xs font-semibold text-noc-text-muted uppercase">
                <th className="px-5 py-3.5">Waktu</th>
                <th className="px-5 py-3.5">Operator</th>
                <th className="px-5 py-3.5">Aksi</th>
                <th className="px-5 py-3.5">Target</th>
                <th className="px-5 py-3.5">Keterangan Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-noc-border/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand-primary" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-noc-text-muted text-sm">
                    Belum ada rekaman audit log untuk filter ini.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const badge = getActionBadge(log.action);
                  const Icon = badge.icon;
                  return (
                    <tr key={log.id} className="hover:bg-noc-hover/40 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="text-xs font-medium text-noc-text-primary">
                          {new Date(log.createdAt).toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </div>
                        <div className="text-[10px] text-noc-text-muted">
                          {new Date(log.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}{" "}
                          · {timeAgo(log.createdAt)}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-noc-hover flex items-center justify-center flex-shrink-0">
                            <User className="w-3.5 h-3.5 text-noc-text-secondary" />
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-noc-text-primary">
                              {log.user?.name || "System"}
                            </p>
                            <p className="text-[10px] text-noc-text-muted font-mono">
                              {log.user?.employeeId || "SYS"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border",
                            badge.color
                          )}
                        >
                          <Icon className="w-3 h-3" />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono text-noc-text-primary font-medium">
                          {log.target || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs text-noc-text-secondary">
                          {log.detail || "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
