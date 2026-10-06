import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runSingleUptimeCheck } from "@/lib/uptime-sync";

type RouteContext = { params: Promise<{ id: string }> };

// PATCH /api/uptime/monitors/[id] — update or toggle monitor
export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any)?.role;
  if (role !== "ADMIN" && role !== "NOC_OPERATOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();

  const existing = await prisma.uptimeMonitor.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Monitor not found" }, { status: 404 });

  let cleanTarget: string | undefined = undefined;
  if (typeof body.target === "string") {
    let clean = body.target.trim();
    const checkType = existing.checkType;
    if (checkType === "HTTP" || checkType === "HTTPS") {
      if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
        clean = `${checkType.toLowerCase()}://${clean}`;
      }
      try {
        const parsed = new URL(clean);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return NextResponse.json({ error: "Target URL harus berprotokol HTTP atau HTTPS" }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: "Format URL tidak valid" }, { status: 400 });
      }
    } else {
      if (clean.startsWith("-") || !/^[a-zA-Z0-9.:_-]+$/.test(clean)) {
        return NextResponse.json({ error: "Format target host/IP tidak valid" }, { status: 400 });
      }
    }
    cleanTarget = clean;
  }

  const updated = await prisma.uptimeMonitor.update({
    where: { id },
    data: {
      name: body.name !== undefined ? body.name.trim() : undefined,
      target: cleanTarget,
      port: body.port !== undefined ? (body.port ? parseInt(body.port) : null) : undefined,
      intervalSeconds:
        body.intervalSeconds !== undefined
          ? Math.max(60, parseInt(body.intervalSeconds))
          : undefined,
      timeoutMs:
        body.timeoutMs !== undefined
          ? Math.max(1000, Math.min(30000, parseInt(body.timeoutMs)))
          : undefined,
      expectedStatus:
        body.expectedStatus !== undefined
          ? body.expectedStatus
            ? parseInt(body.expectedStatus)
            : null
          : undefined,
      keyword:
        body.keyword !== undefined ? body.keyword?.trim() || null : undefined,
      category:
        body.category !== undefined && ["Web Server", "Application Server", "Database Server (ERP)"].includes(body.category)
          ? body.category
          : undefined,
      warningThresholdMs:
        body.warningThresholdMs !== undefined
          ? body.warningThresholdMs
            ? Math.max(100, Math.min(30000, parseInt(body.warningThresholdMs)))
            : null
          : undefined,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    },
  });

  return NextResponse.json({ monitor: updated });
}

// DELETE /api/uptime/monitors/[id] — delete monitor
export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any)?.role;
  if (role !== "ADMIN" && role !== "NOC_OPERATOR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  await prisma.uptimeMonitor.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

// POST /api/uptime/monitors/[id] — manual trigger check
export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const monitor = await prisma.uptimeMonitor.findUnique({ where: { id } });
  if (!monitor) return NextResponse.json({ error: "Monitor not found" }, { status: 404 });

  await runSingleUptimeCheck(id);

  const updated = await prisma.uptimeMonitor.findUnique({ where: { id } });
  return NextResponse.json({ monitor: updated });
}
