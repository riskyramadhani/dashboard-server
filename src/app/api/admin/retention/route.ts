import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const settings = await prisma.prtgSetting.findFirst({ where: { id: 1 } });
    const retentionDays = settings?.retentionDays || 90;

    const totalMetrics = await prisma.sensorMetricHistory.count();
    const oldestMetric = await prisma.sensorMetricHistory.findFirst({
      orderBy: { recordedAt: "asc" },
      select: { recordedAt: true },
    });
    const newestMetric = await prisma.sensorMetricHistory.findFirst({
      orderBy: { recordedAt: "desc" },
      select: { recordedAt: true },
    });

    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const expiredCount = await prisma.sensorMetricHistory.count({
      where: { recordedAt: { lt: cutoffDate } },
    });

    return NextResponse.json({
      retentionDays,
      totalMetrics,
      expiredCount,
      oldestRecordedAt: oldestMetric?.recordedAt || null,
      newestRecordedAt: newestMetric?.recordedAt || null,
      lastCleanupAt: settings?.lastCleanupAt || null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load retention stats" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any).role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }

    const settings = await prisma.prtgSetting.findFirst({ where: { id: 1 } });
    const retentionDays = settings?.retentionDays || 90;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const deleteResult = await prisma.sensorMetricHistory.deleteMany({
      where: { recordedAt: { lt: cutoffDate } },
    });

    await prisma.prtgSetting.update({
      where: { id: 1 },
      data: { lastCleanupAt: new Date() },
    });

    // Write audit log
    try {
      const dbUser = await prisma.user.findFirst({
        where: { employeeId: (session.user as any)?.employeeId || "" },
      });
      if (dbUser) {
        await prisma.auditLog.create({
          data: {
            userId: dbUser.id,
            action: "DATA_PURGE",
            target: "SensorMetricHistory",
            detail: `Purged ${deleteResult.count.toLocaleString()} records older than ${retentionDays} days (cutoff: ${cutoffDate.toISOString()})`,
          },
        });
      }
    } catch (e) {
      console.warn("Audit log error:", e);
    }

    return NextResponse.json({
      success: true,
      deletedCount: deleteResult.count,
      cutoffDate,
      message: `Successfully purged ${deleteResult.count.toLocaleString()} expired metric records`,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Purge failed" }, { status: 500 });
  }
}
