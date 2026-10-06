import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

const loginSchema = z.object({
  employeeId: z.string().min(1, "Employee ID is required"),
  password: z.string().min(1, "Password is required"),
});

// Edge-compatible config (no Prisma here)
export default {
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

        // Actual verification happens in auth.ts via signIn callback
        // This just passes through for the edge middleware
        return {
          id: parsed.data.employeeId,
          employeeId: parsed.data.employeeId,
          password: parsed.data.password,
        } as any;
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 12 * 60 * 60, // 12 hours (shift-based)
  },
} satisfies NextAuthConfig;
