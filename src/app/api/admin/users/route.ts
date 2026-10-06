import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import bcryptjs from "bcryptjs";
import { Role } from "@prisma/client";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        employeeId: true,
        name: true,
        role: true,
        allowedProbes: true,
        allowedModules: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { employeeId: "asc" },
    });

    // Also get distinct probe names for the user assignment dropdown
    const probes = await prisma.sensor.findMany({
      distinct: ["probeName"],
      select: { probeName: true },
      orderBy: { probeName: "asc" },
    });

    return NextResponse.json({
      users,
      availableProbes: probes.map((p) => p.probeName),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load users" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { employeeId, name, password, role, allowedProbes, allowedModules } = body;

    if (!employeeId || !name || !password) {
      return NextResponse.json({ error: "Employee ID, name, and password are required" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({
      where: { employeeId: employeeId.trim() },
    });
    if (existing) {
      return NextResponse.json({ error: "User with this Employee ID already exists" }, { status: 400 });
    }

    const passwordHash = await bcryptjs.hash(password.trim(), 10);
    const validRole = ["ADMIN", "NOC_OPERATOR", "STAFF"].includes(role) ? (role as Role) : Role.STAFF;
    const probes = Array.isArray(allowedProbes) && allowedProbes.length > 0 ? allowedProbes : ["*"];
    const modules = Array.isArray(allowedModules) && allowedModules.length > 0 ? allowedModules : ["*"];

    const newUser = await prisma.user.create({
      data: {
        employeeId: employeeId.trim(),
        name: name.trim(),
        passwordHash,
        role: validRole,
        allowedProbes: probes,
        allowedModules: modules,
        isActive: true,
      },
      select: {
        id: true,
        employeeId: true,
        name: true,
        role: true,
        allowedProbes: true,
        allowedModules: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Audit log
    try {
      const dbUser = await prisma.user.findFirst({
        where: { employeeId: (session.user as any)?.employeeId || "" },
      });
      if (dbUser) {
        await prisma.auditLog.create({
          data: {
            userId: dbUser.id,
            action: "CREATE_USER",
            target: `Employee ${newUser.employeeId} (${newUser.name})`,
            detail: `Created user with role ${newUser.role}`,
          },
        });
      }
    } catch (e) {
      console.warn("Audit log error:", e);
    }

    return NextResponse.json({ success: true, user: newUser }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create user" }, { status: 500 });
  }
}
