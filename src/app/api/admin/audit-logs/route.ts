import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category") || "all";
    const query = (searchParams.get("q") || "").trim().toLowerCase();

    const where: any = {};

    if (category !== "all") {
      if (category === "tools") {
        where.action = { startsWith: "NETWORK_TOOL" };
      } else if (category === "ack") {
        where.action = "ACKNOWLEDGE_ALERT";
      } else if (category === "users") {
        where.action = { in: ["CREATE_USER", "UPDATE_USER", "DELETE_USER"] };
      } else if (category === "settings") {
        where.action = { in: ["UPDATE_SETTINGS", "DATA_PURGE", "AUTO_DATA_PURGE"] };
      }
    }

    if (query) {
      where.OR = [
        { action: { contains: query, mode: "insensitive" } },
        { target: { contains: query, mode: "insensitive" } },
        { detail: { contains: query, mode: "insensitive" } },
        { user: { name: { contains: query, mode: "insensitive" } } },
        { user: { employeeId: { contains: query, mode: "insensitive" } } },
      ];
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            employeeId: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const counts = {
      total: await prisma.auditLog.count(),
      tools: await prisma.auditLog.count({ where: { action: { startsWith: "NETWORK_TOOL" } } }),
      ack: await prisma.auditLog.count({ where: { action: "ACKNOWLEDGE_ALERT" } }),
      users: await prisma.auditLog.count({
        where: { action: { in: ["CREATE_USER", "UPDATE_USER", "DELETE_USER"] } },
      }),
      settings: await prisma.auditLog.count({
        where: { action: { in: ["UPDATE_SETTINGS", "DATA_PURGE", "AUTO_DATA_PURGE"] } },
      }),
    };

    return NextResponse.json({ logs, counts });
  } catch (error: any) {
    console.error("Audit log fetch error:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch audit logs" }, { status: 500 });
  }
}
