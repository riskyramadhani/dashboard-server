import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import bcryptjs from "bcryptjs";
import { Role } from "@prisma/client";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { name, role, allowedProbes, allowedModules, isActive, password } = body;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const updateData: any = {};
    if (name) updateData.name = name.trim();
    if (role && ["ADMIN", "NOC_OPERATOR", "STAFF"].includes(role)) {
      updateData.role = role as Role;
    }
    if (Array.isArray(allowedProbes)) {
      updateData.allowedProbes = allowedProbes.length > 0 ? allowedProbes : ["*"];
    }
    if (Array.isArray(allowedModules)) {
      updateData.allowedModules = allowedModules.length > 0 ? allowedModules : ["*"];
    }
    if (typeof isActive === "boolean") {
      updateData.isActive = isActive;
    }
    if (password && password.trim().length > 0) {
      updateData.passwordHash = await bcryptjs.hash(password.trim(), 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        employeeId: true,
        name: true,
        role: true,
        allowedProbes: true,
        allowedModules: true,
        isActive: true,
        updatedAt: true,
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
            action: "UPDATE_USER",
            target: `Employee ${updated.employeeId} (${updated.name})`,
            detail: `Updated user profile/role`,
          },
        });
      }
    } catch (e) {
      console.warn("Audit log error:", e);
    }

    return NextResponse.json({ success: true, user: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const { id } = await context.params;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent deleting self
    if (existing.employeeId === (session.user as any).employeeId) {
      return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
    }

    await prisma.user.delete({ where: { id } });

    // Audit log
    try {
      const dbUser = await prisma.user.findFirst({
        where: { employeeId: (session.user as any)?.employeeId || "" },
      });
      if (dbUser) {
        await prisma.auditLog.create({
          data: {
            userId: dbUser.id,
            action: "DELETE_USER",
            target: `Employee ${existing.employeeId} (${existing.name})`,
            detail: `Deleted user`,
          },
        });
      }
    } catch (e) {
      console.warn("Audit log error:", e);
    }

    return NextResponse.json({ success: true, message: "User deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete user" }, { status: 500 });
  }
}
