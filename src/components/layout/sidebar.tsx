"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  FileBarChart,
  Wrench,
  Settings,
  Users,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Tv,
  Activity,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  moduleKey: string;
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    moduleKey: "DASHBOARD",
  },
  {
    label: "Live Wallboard",
    href: "/wallboard",
    icon: Tv,
    moduleKey: "WALLBOARD",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: FileBarChart,
    moduleKey: "REPORTS",
  },
  {
    label: "Network Tools",
    href: "/tools",
    icon: Wrench,
    moduleKey: "TOOLS",
  },
  {
    label: "Uptime Monitor",
    href: "/uptime",
    icon: Activity,
    moduleKey: "UPTIME",
  },
  {
    label: "User Management",
    href: "/admin/users",
    icon: Users,
    adminOnly: true,
    moduleKey: "USERS",
  },
  {
    label: "Audit Logs",
    href: "/admin/audit-logs",
    icon: ClipboardList,
    adminOnly: true,
    moduleKey: "AUDIT_LOGS",
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: Settings,
    adminOnly: true,
    moduleKey: "SETTINGS",
  },
];

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const role = (session?.user as any)?.role || "STAFF";
  const allowedModules = ((session?.user as any)?.allowedModules as string[]) || ["*"];

  const filteredNav = navItems.filter((item) => {
    // 1. Admin modules strictly require ADMIN role
    if (item.adminOnly) {
      if (role !== "ADMIN") return false;
      return allowedModules.includes("*") || allowedModules.includes(item.moduleKey);
    }

    // 2. If the user has specific allowedModules configured, strictly follow what the Admin selected
    if (!allowedModules.includes("*")) {
      return allowedModules.includes(item.moduleKey);
    }

    // 3. If wildcard "*", follow default role visibility:
    // ADMIN & NOC_OPERATOR see all operational modules
    // STAFF default (without specific checkboxes) sees DASHBOARD, REPORTS, UPTIME
    if (role === "STAFF") {
      return ["DASHBOARD", "REPORTS", "UPTIME"].includes(item.moduleKey);
    }

    return true;
  });

  return (
    <aside
      className={cn(
        "fixed left-0 top-16 bottom-0 z-30 bg-noc-surface border-r border-noc-border transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Nav Items */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                isActive ? "nav-item-active" : "nav-item",
                collapsed && "justify-center px-2"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-noc-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center py-2 rounded-lg text-noc-text-muted hover:text-noc-text-primary hover:bg-noc-hover transition-all"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>
    </aside>
  );
}
