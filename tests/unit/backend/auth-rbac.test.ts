import { describe, it, expect } from "vitest";

interface RouteAuthUser {
  role: "ADMIN" | "NOC_OPERATOR" | "STAFF";
  allowedModules: string[];
  allowedProbes: string[];
}

function verifyAccess(user: RouteAuthUser | null, routePath: string, method: string): {
  authorized: boolean;
  status: number;
  reason?: string;
} {
  // 1. Cek Autentikasi
  if (!user) {
    return { authorized: false, status: 401, reason: "Unauthorized: Session required" };
  }

  // 2. Proteksi Admin Area (Users, Settings, Retention)
  if (routePath.startsWith("/api/admin")) {
    if (user.role !== "ADMIN") {
      return { authorized: false, status: 403, reason: "Forbidden: Admin role required" };
    }
  }

  // 3. Mutasi Monitor (POST / PUT / DELETE)
  if (routePath.startsWith("/api/uptime/monitors") && method !== "GET") {
    if (user.role !== "ADMIN" && user.role !== "NOC_OPERATOR") {
      return { authorized: false, status: 403, reason: "Forbidden: Staff cannot modify monitors" };
    }
  }

  // 4. Network Tools execution (POST /api/tools/*)
  if (routePath.startsWith("/api/tools") && method === "POST") {
    const hasAccess =
      user.role === "ADMIN" ||
      user.role === "NOC_OPERATOR" ||
      user.allowedModules.includes("TOOLS") ||
      (user.allowedModules.includes("*") && user.role !== "STAFF");

    if (!hasAccess) {
      return { authorized: false, status: 403, reason: "Forbidden: Tools module access restricted" };
    }
  }

  return { authorized: true, status: 200 };
}

describe("Security Audit: Authentication & RBAC Policy Matrix Tests", () => {
  it("harus menolak request tanpa session (401 Unauthorized)", () => {
    const res = verifyAccess(null, "/api/admin/users", "GET");
    expect(res.authorized).toBe(false);
    expect(res.status).toBe(401);
  });

  it("STAFF dilarang mengakses API Admin (403 Forbidden)", () => {
    const staffUser: RouteAuthUser = {
      role: "STAFF",
      allowedModules: ["DASHBOARD", "REPORTS"],
      allowedProbes: ["*"],
    };
    const res = verifyAccess(staffUser, "/api/admin/settings", "GET");
    expect(res.authorized).toBe(false);
    expect(res.status).toBe(403);
  });

  it("STAFF dilarang membuat atau menghapus Uptime Monitor (403 Forbidden)", () => {
    const staffUser: RouteAuthUser = {
      role: "STAFF",
      allowedModules: ["DASHBOARD"],
      allowedProbes: ["*"],
    };
    const postRes = verifyAccess(staffUser, "/api/uptime/monitors", "POST");
    expect(postRes.authorized).toBe(false);
    expect(postRes.status).toBe(403);
  });

  it("NOC_OPERATOR diizinkan membuat Uptime Monitor tapi dilarang ke API Admin", () => {
    const nocUser: RouteAuthUser = {
      role: "NOC_OPERATOR",
      allowedModules: ["*"],
      allowedProbes: ["*"],
    };

    const monitorRes = verifyAccess(nocUser, "/api/uptime/monitors", "POST");
    expect(monitorRes.authorized).toBe(true);

    const adminRes = verifyAccess(nocUser, "/api/admin/users", "POST");
    expect(adminRes.authorized).toBe(false);
    expect(adminRes.status).toBe(403);
  });

  it("ADMIN memiliki hak penuh atas seluruh endpoint", () => {
    const adminUser: RouteAuthUser = {
      role: "ADMIN",
      allowedModules: ["*"],
      allowedProbes: ["*"],
    };

    expect(verifyAccess(adminUser, "/api/admin/users", "POST").authorized).toBe(true);
    expect(verifyAccess(adminUser, "/api/uptime/monitors", "POST").authorized).toBe(true);
    expect(verifyAccess(adminUser, "/api/tools/ping", "POST").authorized).toBe(true);
  });
});
