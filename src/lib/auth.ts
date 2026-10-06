import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcryptjs from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import authConfig from "@/lib/auth.config";

const loginSchema = z.object({
  employeeId: z.string().min(1),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "Employee Login",
      credentials: {
        employeeId: { label: "Employee ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { employeeId: parsed.data.employeeId },
        });

        if (!user || !user.isActive) return null;

        const passwordMatch = await bcryptjs.compare(
          parsed.data.password,
          user.passwordHash
        );

        if (!passwordMatch) return null;

        // Update last login
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          employeeId: user.employeeId,
          name: user.name,
          role: user.role,
          allowedProbes: user.allowedProbes,
          allowedModules: user.allowedModules || ["*"],
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.employeeId = (user as any).employeeId;
        token.role = (user as any).role;
        token.allowedProbes = (user as any).allowedProbes;
        token.allowedModules = (user as any).allowedModules || ["*"];
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as any).employeeId = token.employeeId as string;
        (session.user as any).role = token.role as string;
        (session.user as any).allowedProbes = token.allowedProbes as string[];
        (session.user as any).allowedModules = (token.allowedModules as string[]) || ["*"];
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = nextUrl.pathname === "/login";
      const isApiAuth = nextUrl.pathname.startsWith("/api/auth");

      if (isApiAuth) return true;
      const path = nextUrl.pathname;

      // Allow internal cron sync endpoint to proceed so it can validate INTERNAL_CRON_SECRET
      if (path === "/api/prtg/sync") return true;

      // Return 401 JSON for unauthenticated API requests instead of redirecting to login page
      if (path.startsWith("/api/")) {
        if (!isLoggedIn) {
          return Response.json({ error: "Unauthorized: Authentication required" }, { status: 401 });
        }
        return true;
      }

      // Determine user role and allowed modules
      const role = (auth?.user as any)?.role;
      const allowedModules = ((auth?.user as any)?.allowedModules as string[]) || ["*"];

      const moduleMap: Record<string, string> = {
        "/dashboard": "DASHBOARD",
        "/wallboard": "WALLBOARD",
        "/reports": "REPORTS",
        "/tools": "TOOLS",
        "/uptime": "UPTIME",
        "/admin/users": "USERS",
        "/admin/audit-logs": "AUDIT_LOGS",
        "/admin/settings": "SETTINGS",
      };

      const modulePaths: Record<string, string> = {
        DASHBOARD: "/dashboard",
        WALLBOARD: "/wallboard",
        REPORTS: "/reports",
        TOOLS: "/tools",
        UPTIME: "/uptime",
        USERS: "/admin/users",
        AUDIT_LOGS: "/admin/audit-logs",
        SETTINGS: "/admin/settings",
      };

      // Determine default landing page / fallback route for this user
      const fallback = allowedModules.includes("*")
        ? "/dashboard"
        : (allowedModules.map((m) => modulePaths[m]).find(Boolean) || "/dashboard");

      if (isLoginPage) return !isLoggedIn ? true : Response.redirect(new URL(fallback, nextUrl));
      if (!isLoggedIn) return false;

      // 1. Admin routes strictly require ADMIN role
      if (path.startsWith("/admin") && role !== "ADMIN") {
        return Response.redirect(new URL(fallback, nextUrl));
      }

      // 2. Default wildcard restrictions (when not explicitly customized):
      // By default without custom modules, STAFF cannot access /tools or /wallboard
      if (allowedModules.includes("*")) {
        if (role === "STAFF" && (path.startsWith("/tools") || path.startsWith("/wallboard"))) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
      } else {
        // 3. Custom allowedModules: ensure the accessed module is permitted
        for (const [prefix, moduleKey] of Object.entries(moduleMap)) {
          if (path === prefix || path.startsWith(prefix + "/")) {
            if (!allowedModules.includes(moduleKey)) {
              if (path !== fallback) {
                return Response.redirect(new URL(fallback, nextUrl));
              }
            }
          }
        }
      }

      return true;
    },
  },
});
