import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { PrtgClient } from "@/lib/prtg";
import { decrypt } from "@/lib/crypto";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    if (role !== "ADMIN" && role !== "NOC_OPERATOR") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const sensorId = parseInt(id);
    if (isNaN(sensorId)) {
      return NextResponse.json({ error: "Invalid sensor ID" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const message = body.message || `Acknowledged by ${session.user.name || session.user.email}`;

    const sensor = await prisma.sensor.findUnique({ where: { id: sensorId } });
    if (!sensor) {
      return NextResponse.json({ error: "Sensor not found" }, { status: 404 });
    }

    // Update in DB
    const updated = await prisma.sensor.update({
      where: { id: sensorId },
      data: {
        acknowledgedBy: session.user.name || session.user.email || "NOC Operator",
        acknowledgedAt: new Date(),
        lastMessage: `[ACKNOWLEDGED]: ${message}`,
      },
    });

    // Also attempt to notify PRTG server if configured
    try {
      const settings = await prisma.prtgSetting.findFirst({ where: { id: 1 } });
      if (settings?.baseUrl) {
        let token = "";
        if (settings.apiTokenEncrypted && settings.apiTokenIv && settings.apiTokenAuthTag) {
          token = decrypt(settings.apiTokenEncrypted, settings.apiTokenIv, settings.apiTokenAuthTag);
        }
        const client = new PrtgClient({
          baseUrl: settings.baseUrl,
          apiToken: token,
          ignoreSsl: settings.ignoreSsl,
        });
        await client.acknowledgeAlarm(sensorId, message);
      }
    } catch (prtgErr) {
      console.warn("Could not push ACK to PRTG:", prtgErr);
    }

    // Write audit log
    try {
      const dbUser = await prisma.user.findFirst({
        where: { employeeId: (session.user as any)?.employeeId || "" },
      });
      if (dbUser) {
        await prisma.auditLog.create({
          data: {
            userId: dbUser.id,
            action: "ACKNOWLEDGE_ALERT",
            target: `Sensor #${sensorId} (${sensor.sensorName})`,
            detail: message,
          },
        });
      }
    } catch (e) {
      console.warn("Audit log error:", e);
    }

    return NextResponse.json({ success: true, sensor: updated });
  } catch (error: any) {
    console.error("Acknowledge error:", error);
    return NextResponse.json({ error: error.message || "Failed to acknowledge alert" }, { status: 500 });
  }
}
