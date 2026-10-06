"use client";

import { useState, useEffect } from "react";
import {
  Users,
  UserPlus,
  Shield,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Trash2,
  Loader2,
  X,
  Search,
  LayoutDashboard,
  Tv,
  FileBarChart,
  Wrench,
  Activity,
  ClipboardList,
  Settings,
  Layers,
  Sparkles,
  Info,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────
// Definition of Available Application Modules
// ─────────────────────────────────────────────────────────

export interface AppModule {
  key: string;
  name: string;
  desc: string;
  icon: React.ElementType;
  badgeColor: string;
  adminOnly?: boolean;
}

export const APP_MODULES: AppModule[] = [
  {
    key: "DASHBOARD",
    name: "Dashboard Utama",
    desc: "Monitoring status server PRTG, CPU/RAM/Disk, & Matrix Kesehatan",
    icon: LayoutDashboard,
    badgeColor: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  {
    key: "WALLBOARD",
    name: "Live Wallboard",
    desc: "Layar monitor TV pusat NOC fullscreen dengan audio alert",
    icon: Tv,
    badgeColor: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  },
  {
    key: "REPORTS",
    name: "Laporan & SLA",
    desc: "Analisis performa SLA, histori insiden, dan ekspor PDF/Excel",
    icon: FileBarChart,
    badgeColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  {
    key: "TOOLS",
    name: "Network Tools",
    desc: "Util jaringan: MAC Lookup, OUI Vendor, & IP Resolve",
    icon: Wrench,
    badgeColor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  {
    key: "UPTIME",
    name: "Uptime Monitor",
    desc: "Monitoring status web app, ping server, dan service port",
    icon: Activity,
    badgeColor: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  },
  {
    key: "USERS",
    name: "User Management",
    desc: "Manajemen akun pengguna dan konfigurasi izin modul",
    icon: Users,
    badgeColor: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    adminOnly: true,
  },
  {
    key: "AUDIT_LOGS",
    name: "Audit Logs",
    desc: "Catatan rekam jejak aktivitas operator dan keamanan sistem",
    icon: ClipboardList,
    badgeColor: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    adminOnly: true,
  },
  {
    key: "SETTINGS",
    name: "Pengaturan Sistem",
    desc: "Konfigurasi API PRTG, daemon sinkronisasi, dan retensi data",
    icon: Settings,
    badgeColor: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    adminOnly: true,
  },
];

// Preset modul cepat untuk kenyamanan administrator
const MODULE_PRESETS = [
  {
    label: "Semua Modul (*)",
    modules: ["*"],
    desc: "Akses penuh ke seluruh menu aplikasi",
  },
  {
    label: "Operator NOC",
    modules: ["DASHBOARD", "WALLBOARD", "REPORTS", "TOOLS", "UPTIME"],
    desc: "Dashboard, Wallboard, Laporan, Network Tools, & Uptime",
  },
  {
    label: "Manajemen / Staf",
    modules: ["DASHBOARD", "REPORTS", "UPTIME"],
    desc: "Hanya Dashboard, Laporan SLA, & Uptime Monitor",
  },
  {
    label: "Layar Wallboard TV",
    modules: ["WALLBOARD"],
    desc: "Khusus tampilan layar TV besar NOC (kiosk mode)",
  },
];

interface UserItem {
  id: string;
  employeeId: string;
  name: string;
  role: "ADMIN" | "NOC_OPERATOR" | "STAFF";
  allowedProbes: string[];
  allowedModules: string[];
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [availableProbes, setAvailableProbes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    employeeId: "",
    name: "",
    password: "",
    role: "STAFF" as "ADMIN" | "NOC_OPERATOR" | "STAFF",
    allowedProbes: ["*"],
    allowedModules: ["*"],
    isActive: true,
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setAvailableProbes(data.availableProbes || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openCreateModal = () => {
    setFormData({
      employeeId: "",
      name: "",
      password: "",
      role: "STAFF",
      allowedProbes: ["*"],
      allowedModules: ["*"],
      isActive: true,
    });
    setIsCreateOpen(true);
    setMessage(null);
  };

  const openEditModal = (user: UserItem) => {
    setEditingUser(user);
    setFormData({
      employeeId: user.employeeId,
      name: user.name,
      password: "",
      role: user.role,
      allowedProbes: user.allowedProbes || ["*"],
      allowedModules: user.allowedModules || ["*"],
      isActive: user.isActive,
    });
    setMessage(null);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat user");

      setMessage({ text: "User berhasil didaftarkan.", type: "success" });
      setIsCreateOpen(false);
      fetchUsers();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          role: formData.role,
          allowedProbes: formData.allowedProbes,
          allowedModules: formData.allowedModules,
          isActive: formData.isActive,
          password: formData.password || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memperbarui user");

      setMessage({ text: "User berhasil diperbarui.", type: "success" });
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (user: UserItem) => {
    if (!confirm(`Hapus pengguna ${user.name} (${user.employeeId})?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menghapus user");

      setMessage({ text: "User berhasil dihapus.", type: "success" });
      fetchUsers();
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    }
  };

  // Toggle hak akses Probe
  const toggleProbe = (probe: string) => {
    if (probe === "*") {
      setFormData((prev) => ({
        ...prev,
        allowedProbes: prev.allowedProbes.includes("*") ? [] : ["*"],
      }));
      return;
    }

    setFormData((prev) => {
      let next = prev.allowedProbes.filter((p) => p !== "*");
      if (next.includes(probe)) {
        next = next.filter((p) => p !== probe);
      } else {
        next.push(probe);
      }
      return { ...prev, allowedProbes: next.length === 0 ? ["*"] : next };
    });
  };

  // Toggle hak akses Modul
  const toggleModule = (moduleKey: string) => {
    if (moduleKey === "*") {
      setFormData((prev) => ({
        ...prev,
        allowedModules: prev.allowedModules.includes("*") ? [] : ["*"],
      }));
      return;
    }

    setFormData((prev) => {
      let next = prev.allowedModules.filter((m) => m !== "*");
      if (next.includes(moduleKey)) {
        next = next.filter((m) => m !== moduleKey);
      } else {
        next.push(moduleKey);
      }
      return {
        ...prev,
        allowedModules: next.length === 0 ? ["*"] : next,
      };
    });
  };

  const applyModulePreset = (presetModules: string[]) => {
    setFormData((prev) => ({
      ...prev,
      allowedModules: [...presetModules],
    }));
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.employeeId.toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-noc-text-primary flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand-primary/20 text-brand-primary flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            Manajemen Pengguna & Izin Modul
          </h1>
          <p className="text-xs sm:text-sm text-noc-text-muted mt-1 pl-11">
            Kelola akun karyawan dan batasi izin membuka modul spesifik (Dashboard, Wallboard, Tools, Uptime, dll)
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-primary text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20 self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          Tambah Pengguna
        </button>
      </div>

      {/* Banner Notifikasi */}
      {message && (
        <div
          className={cn(
            "p-4 rounded-xl border flex items-center gap-3",
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

      {/* Search & Filter */}
      <div className="glass-card p-3.5 flex items-center gap-3">
        <Search className="w-4 h-4 text-noc-text-muted flex-shrink-0 ml-1" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari berdasarkan Employee ID / NIK, nama karyawan, atau peran..."
          className="w-full bg-transparent text-xs sm:text-sm text-noc-text-primary placeholder:text-noc-text-muted focus:outline-none"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="p-1 rounded-md text-noc-text-muted hover:text-noc-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tabel Pengguna */}
      <div className="glass-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-noc-border bg-noc-bg/60 text-[11px] font-bold text-noc-text-muted uppercase tracking-wider">
                <th className="px-5 py-3.5">Karyawan</th>
                <th className="px-5 py-3.5">Peran / Role</th>
                <th className="px-5 py-3.5">Hak Akses Modul</th>
                <th className="px-5 py-3.5">Hak Akses Site / Probe</th>
                <th className="px-5 py-3.5">Status Akun</th>
                <th className="px-5 py-3.5">Login Terakhir</th>
                <th className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-noc-border/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-noc-text-muted">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-primary" />
                    Memuat data pengguna...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-noc-text-muted">
                    Tidak ada pengguna yang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-noc-hover/50 transition-colors">
                    {/* Karyawan */}
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="font-bold text-noc-text-primary text-xs">{user.name}</p>
                        <p className="text-[11px] text-noc-text-muted font-mono mt-0.5">{user.employeeId}</p>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border",
                          user.role === "ADMIN"
                            ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                            : user.role === "NOC_OPERATOR"
                            ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        )}
                      >
                        <Shield className="w-3 h-3" />
                        {user.role}
                      </span>
                    </td>

                    {/* Hak Akses Modul */}
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {user.allowedModules?.includes("*") ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-primary/15 text-brand-primary font-bold border border-brand-primary/30 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            Semua Modul (*)
                          </span>
                        ) : (
                          user.allowedModules?.map((modKey) => {
                            const modMeta = APP_MODULES.find((m) => m.key === modKey);
                            const ModIcon = modMeta?.icon || Layers;
                            return (
                              <span
                                key={modKey}
                                className={cn(
                                  "text-[10px] px-2 py-0.5 rounded-md font-semibold border flex items-center gap-1",
                                  modMeta?.badgeColor || "bg-noc-bg border-noc-border text-noc-text-secondary"
                                )}
                                title={modMeta?.desc}
                              >
                                <ModIcon className="w-2.5 h-2.5" />
                                {modMeta?.name || modKey}
                              </span>
                            );
                          })
                        )}
                      </div>
                    </td>

                    {/* Hak Akses Probe */}
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {user.allowedProbes?.includes("*") ? (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-noc-bg border border-noc-border text-noc-text-secondary font-medium">
                            Semua Probe (*)
                          </span>
                        ) : (
                          user.allowedProbes?.map((p) => (
                            <span
                              key={p}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-noc-bg border border-noc-border text-noc-text-muted font-mono"
                            >
                              {p}
                            </span>
                          ))
                        )}
                      </div>
                    </td>

                    {/* Status Akun */}
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border",
                          user.isActive
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            user.isActive ? "bg-emerald-400" : "bg-rose-400"
                          )}
                        />
                        {user.isActive ? "Aktif" : "Non-aktif"}
                      </span>
                    </td>

                    {/* Login Terakhir */}
                    <td className="px-5 py-3.5 whitespace-nowrap text-noc-text-muted text-[11px] font-mono">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Belum pernah"}
                    </td>

                    {/* Aksi */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEditModal(user)}
                          className="p-1.5 rounded-lg text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover transition-colors"
                          title="Edit Pengguna & Hak Akses"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="p-1.5 rounded-lg text-rose-400/70 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Hapus Pengguna"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* Modal: Tambah Pengguna Baru */}
      {/* ───────────────────────────────────────────────────────── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-card max-w-2xl w-full p-6 space-y-4 animate-scale-in max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-noc-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-primary/20 text-brand-primary flex items-center justify-center">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-noc-text-primary">Tambah Pengguna Baru</h3>
                  <p className="text-xs text-noc-text-muted">Buat akun karyawan dan atur izin modul yang diperbolehkan</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1.5 rounded-lg text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-noc-text-secondary mb-1">
                    Employee ID / NIK <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    placeholder="Contoh: 1015763"
                    className="w-full px-3.5 py-2.5 bg-noc-bg border border-noc-border rounded-xl text-xs text-noc-text-primary font-mono focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-noc-text-secondary mb-1">
                    Nama Lengkap <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nama Karyawan"
                    className="w-full px-3.5 py-2.5 bg-noc-bg border border-noc-border rounded-xl text-xs text-noc-text-primary focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-noc-text-secondary mb-1">
                    Password Awal <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Minimal 6 karakter"
                    className="w-full px-3.5 py-2.5 bg-noc-bg border border-noc-border rounded-xl text-xs text-noc-text-primary focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-noc-text-secondary mb-1">Role / Peran</label>
                  <select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value as "ADMIN" | "NOC_OPERATOR" | "STAFF" })
                    }
                    className="w-full px-3.5 py-2.5 bg-noc-bg border border-noc-border rounded-xl text-xs text-noc-text-primary focus:outline-none focus:border-brand-primary"
                  >
                    <option value="STAFF">STAFF (Manajemen / Pengguna Umum)</option>
                    <option value="NOC_OPERATOR">NOC_OPERATOR (Operator NOC / Tim Teknis)</option>
                    <option value="ADMIN">ADMIN (Super Administrator)</option>
                  </select>
                </div>
              </div>

              {/* ── BAGIAN: Hak Akses Modul Aplikasi ── */}
              <div className="p-4 rounded-2xl bg-noc-bg/80 border border-noc-border space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-noc-text-primary">
                      <Layers className="w-4 h-4 text-brand-primary" />
                      <span>Hak Akses Modul Aplikasi</span>
                    </div>
                    <p className="text-[11px] text-noc-text-muted mt-0.5">
                      Pilih modul yang diizinkan untuk dibuka oleh akun ini
                    </p>
                  </div>

                  {/* Preset Cepat */}
                  <div className="flex flex-wrap gap-1">
                    {MODULE_PRESETS.map((p) => {
                      const isSelected =
                        p.modules.includes("*")
                          ? formData.allowedModules.includes("*")
                          : !formData.allowedModules.includes("*") &&
                            p.modules.length === formData.allowedModules.length &&
                            p.modules.every((m) => formData.allowedModules.includes(m));
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => applyModulePreset(p.modules)}
                          className={cn(
                            "px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all",
                            isSelected
                              ? "bg-brand-primary text-white border-brand-primary shadow-sm"
                              : "bg-noc-surface border-noc-border text-noc-text-secondary hover:text-noc-text-primary"
                          )}
                          title={p.desc}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Grid Card Pilihan Modul */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {/* Opsi Master: Semua Modul */}
                  <div
                    onClick={() => toggleModule("*")}
                    className={cn(
                      "p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all sm:col-span-2",
                      formData.allowedModules.includes("*")
                        ? "bg-brand-primary/15 border-brand-primary shadow-sm"
                        : "bg-noc-surface border-noc-border hover:border-noc-border-focus"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={formData.allowedModules.includes("*")}
                      onChange={() => {}}
                      className="mt-0.5 rounded text-brand-primary pointer-events-none"
                    />
                    <div>
                      <span className="font-bold text-noc-text-primary flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
                        Beri Akses ke Semua Modul (*)
                      </span>
                      <p className="text-[11px] text-noc-text-muted mt-0.5">
                        Pengguna dapat mengakses semua fitur yang diizinkan untuk perannya
                      </p>
                    </div>
                  </div>

                  {/* Modul Spesifik */}
                  {APP_MODULES.map((mod) => {
                    const ModIcon = mod.icon;
                    const isChecked =
                      formData.allowedModules.includes("*") || formData.allowedModules.includes(mod.key);
                    const isDisabled = formData.allowedModules.includes("*");

                    return (
                      <div
                        key={mod.key}
                        onClick={() => {
                          if (!isDisabled) toggleModule(mod.key);
                        }}
                        className={cn(
                          "p-2.5 rounded-xl border flex items-start gap-2.5 transition-all select-none",
                          isDisabled
                            ? "bg-noc-surface/50 border-noc-border/50 opacity-75 cursor-not-allowed"
                            : isChecked
                            ? "bg-brand-primary/10 border-brand-primary/60 cursor-pointer shadow-sm"
                            : "bg-noc-surface border-noc-border hover:border-noc-border-focus cursor-pointer"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => {}}
                          className="mt-0.5 rounded text-brand-primary pointer-events-none"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-bold text-noc-text-primary text-[11px]">
                            <ModIcon className="w-3.5 h-3.5 text-brand-primary flex-shrink-0" />
                            <span className="truncate">{mod.name}</span>
                            {mod.adminOnly && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-400 font-mono">
                                Admin
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-noc-text-muted truncate mt-0.5 leading-snug">
                            {mod.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hak Akses Site / Probe */}
              <div>
                <label className="block font-semibold text-noc-text-secondary mb-1.5">
                  Hak Akses Site / Probe
                </label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto p-2.5 bg-noc-bg/50 border border-noc-border rounded-xl">
                  <label className="flex items-center gap-2 text-xs text-noc-text-primary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.allowedProbes.includes("*")}
                      onChange={() => toggleProbe("*")}
                      className="rounded text-brand-primary"
                    />
                    <strong>Semua Probe (*)</strong>
                  </label>
                  {availableProbes.map((p) => (
                    <label key={p} className="flex items-center gap-2 text-xs text-noc-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.allowedProbes.includes(p)}
                        onChange={() => toggleProbe(p)}
                        disabled={formData.allowedProbes.includes("*")}
                        className="rounded text-brand-primary disabled:opacity-40"
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-noc-border">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 rounded-xl border border-noc-border text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2 bg-brand-primary text-white rounded-xl font-bold hover:bg-brand-primary/90 transition-all disabled:opacity-50 shadow-md shadow-brand-primary/20"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Simpan Pengguna
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────── */}
      {/* Modal: Edit Pengguna */}
      {/* ───────────────────────────────────────────────────────── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-card max-w-2xl w-full p-6 space-y-4 animate-scale-in max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-noc-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-brand-primary/20 text-brand-primary flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-noc-text-primary">
                    Edit Pengguna: {editingUser.employeeId}
                  </h3>
                  <p className="text-xs text-noc-text-muted">Perbarui profil, kata sandi, dan hak akses modul</p>
                </div>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-lg text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-noc-text-secondary mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-noc-bg border border-noc-border rounded-xl text-xs text-noc-text-primary focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-noc-text-secondary mb-1">
                    Reset Password (kosongkan jika tetap)
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Password Baru"
                    className="w-full px-3.5 py-2.5 bg-noc-bg border border-noc-border rounded-xl text-xs text-noc-text-primary focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-noc-text-secondary mb-1">Role / Peran</label>
                  <select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value as "ADMIN" | "NOC_OPERATOR" | "STAFF" })
                    }
                    className="w-full px-3.5 py-2.5 bg-noc-bg border border-noc-border rounded-xl text-xs text-noc-text-primary focus:outline-none focus:border-brand-primary"
                  >
                    <option value="STAFF">STAFF (Manajemen / Pengguna Umum)</option>
                    <option value="NOC_OPERATOR">NOC_OPERATOR (Operator NOC)</option>
                    <option value="ADMIN">ADMIN (Super Administrator)</option>
                  </select>
                </div>

                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="rounded text-brand-primary"
                    />
                    <span className="font-semibold text-noc-text-primary text-xs">
                      Akun Aktif (Dapat Login ke Dashboard)
                    </span>
                  </label>
                </div>
              </div>

              {/* ── BAGIAN: Hak Akses Modul Aplikasi ── */}
              <div className="p-4 rounded-2xl bg-noc-bg/80 border border-noc-border space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 font-bold text-noc-text-primary">
                      <Layers className="w-4 h-4 text-brand-primary" />
                      <span>Hak Akses Modul Aplikasi</span>
                    </div>
                    <p className="text-[11px] text-noc-text-muted mt-0.5">
                      Pilih modul yang diizinkan untuk dibuka oleh pengguna ini
                    </p>
                  </div>

                  {/* Preset Cepat */}
                  <div className="flex flex-wrap gap-1">
                    {MODULE_PRESETS.map((p) => {
                      const isSelected =
                        p.modules.includes("*")
                          ? formData.allowedModules.includes("*")
                          : !formData.allowedModules.includes("*") &&
                            p.modules.length === formData.allowedModules.length &&
                            p.modules.every((m) => formData.allowedModules.includes(m));
                      return (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => applyModulePreset(p.modules)}
                          className={cn(
                            "px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all",
                            isSelected
                              ? "bg-brand-primary text-white border-brand-primary shadow-sm"
                              : "bg-noc-surface border-noc-border text-noc-text-secondary hover:text-noc-text-primary"
                          )}
                          title={p.desc}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Grid Card Pilihan Modul */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {/* Opsi Master: Semua Modul */}
                  <div
                    onClick={() => toggleModule("*")}
                    className={cn(
                      "p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-all sm:col-span-2",
                      formData.allowedModules.includes("*")
                        ? "bg-brand-primary/15 border-brand-primary shadow-sm"
                        : "bg-noc-surface border-noc-border hover:border-noc-border-focus"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={formData.allowedModules.includes("*")}
                      onChange={() => {}}
                      className="mt-0.5 rounded text-brand-primary pointer-events-none"
                    />
                    <div>
                      <span className="font-bold text-noc-text-primary flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-brand-primary" />
                        Beri Akses ke Semua Modul (*)
                      </span>
                      <p className="text-[11px] text-noc-text-muted mt-0.5">
                        Pengguna dapat mengakses semua fitur yang diizinkan untuk perannya
                      </p>
                    </div>
                  </div>

                  {/* Modul Spesifik */}
                  {APP_MODULES.map((mod) => {
                    const ModIcon = mod.icon;
                    const isChecked =
                      formData.allowedModules.includes("*") || formData.allowedModules.includes(mod.key);
                    const isDisabled = formData.allowedModules.includes("*");

                    return (
                      <div
                        key={mod.key}
                        onClick={() => {
                          if (!isDisabled) toggleModule(mod.key);
                        }}
                        className={cn(
                          "p-2.5 rounded-xl border flex items-start gap-2.5 transition-all select-none",
                          isDisabled
                            ? "bg-noc-surface/50 border-noc-border/50 opacity-75 cursor-not-allowed"
                            : isChecked
                            ? "bg-brand-primary/10 border-brand-primary/60 cursor-pointer shadow-sm"
                            : "bg-noc-surface border-noc-border hover:border-noc-border-focus cursor-pointer"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => {}}
                          className="mt-0.5 rounded text-brand-primary pointer-events-none"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-bold text-noc-text-primary text-[11px]">
                            <ModIcon className="w-3.5 h-3.5 text-brand-primary flex-shrink-0" />
                            <span className="truncate">{mod.name}</span>
                            {mod.adminOnly && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-400 font-mono">
                                Admin
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-noc-text-muted truncate mt-0.5 leading-snug">
                            {mod.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hak Akses Site / Probe */}
              <div>
                <label className="block font-semibold text-noc-text-secondary mb-1.5">
                  Hak Akses Site / Probe
                </label>
                <div className="space-y-1.5 max-h-32 overflow-y-auto p-2.5 bg-noc-bg/50 border border-noc-border rounded-xl">
                  <label className="flex items-center gap-2 text-xs text-noc-text-primary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.allowedProbes.includes("*")}
                      onChange={() => toggleProbe("*")}
                      className="rounded text-brand-primary"
                    />
                    <strong>Semua Probe (*)</strong>
                  </label>
                  {availableProbes.map((p) => (
                    <label key={p} className="flex items-center gap-2 text-xs text-noc-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.allowedProbes.includes(p)}
                        onChange={() => toggleProbe(p)}
                        disabled={formData.allowedProbes.includes("*")}
                        className="rounded text-brand-primary disabled:opacity-40"
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-noc-border">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 rounded-xl border border-noc-border text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-5 py-2 bg-brand-primary text-white rounded-xl font-bold hover:bg-brand-primary/90 transition-all disabled:opacity-50 shadow-md shadow-brand-primary/20"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
