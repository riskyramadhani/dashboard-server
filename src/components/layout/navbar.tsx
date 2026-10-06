"use client";

import { useSession, signOut } from "next-auth/react";
import {
  Server,
  Wifi,
  WifiOff,
  LogOut,
  User,
  RefreshCw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn, timeAgo } from "@/lib/utils";

interface PrtgStatus {
  connected: boolean;
  lastSyncAt: string | null;
}

export function Navbar() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role || "STAFF";

  const canViewPrtgStatus = role === "ADMIN" || role === "NOC_OPERATOR";

  const { data: prtgStatus } = useQuery<PrtgStatus>({
    queryKey: ["prtg-status"],
    queryFn: async () => {
      const res = await fetch("/api/prtg/status");
      if (!res.ok) return { connected: false, lastSyncAt: null };
      return res.json();
    },
    enabled: canViewPrtgStatus,
    refetchInterval: 15000,
  });

  const roleLabel: Record<string, string> = {
    ADMIN: "Administrator",
    NOC_OPERATOR: "NOC Operator",
    STAFF: "Management",
  };

  const roleBadgeColor: Record<string, string> = {
    ADMIN: "bg-brand-primary/20 text-brand-primary",
    NOC_OPERATOR: "bg-brand-accent/20 text-brand-accent",
    STAFF: "bg-brand-secondary/20 text-purple-400",
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-noc-surface/95 backdrop-blur-xl border-b border-noc-border">
      <div className="h-full flex items-center justify-between px-4">
        {/* Left: Branding */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-brand-primary to-brand-secondary">
            <Server className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-noc-text-primary leading-tight">
              Dashboard-Server
            </h1>
            <p className="text-[11px] text-noc-text-muted leading-tight">
              PT. Bina Sarana Sukses
            </p>
          </div>
        </div>

        {/* Center: PRTG Status (Only for ADMIN & NOC_OPERATOR) */}
        {canViewPrtgStatus && (
          <div className="hidden md:flex items-center gap-4">
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border",
                prtgStatus?.connected
                  ? "bg-status-ok-bg border-status-ok/20 text-status-ok"
                  : "bg-status-down-bg border-status-down/20 text-status-down"
              )}
            >
              {prtgStatus?.connected ? (
                <Wifi className="w-3.5 h-3.5" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              {prtgStatus?.connected ? "PRTG Connected" : "PRTG Disconnected"}
            </div>
            {prtgStatus?.lastSyncAt && (
              <div className="flex items-center gap-1.5 text-xs text-noc-text-muted">
                <RefreshCw className="w-3 h-3" />
                Last sync: {timeAgo(prtgStatus.lastSyncAt)}
              </div>
            )}
          </div>
        )}

        {/* Right: User Info */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-medium text-noc-text-primary">
              {session?.user?.name || "User"}
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                roleBadgeColor[role] || "bg-noc-hover text-noc-text-secondary"
              )}
            >
              {roleLabel[role] || role}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <div className="w-8 h-8 rounded-full bg-noc-hover flex items-center justify-center">
              <User className="w-4 h-4 text-noc-text-secondary" />
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="p-2 rounded-lg text-noc-text-muted hover:text-status-down hover:bg-status-down-bg transition-all"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
