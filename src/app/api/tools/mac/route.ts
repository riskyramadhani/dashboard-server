import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lookupMacAddress } from "@/lib/mac-lookup";

// Simple in-memory rate limiter: max 20 requests per 30s per user
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 30000;
  const maxRequests = 20;

  const timestamps = rateLimitMap.get(userId) || [];
  const validTimestamps = timestamps.filter((t) => now - t < windowMs);

  if (validTimestamps.length >= maxRequests) {
    return false;
  }

  validTimestamps.push(now);
  rateLimitMap.set(userId, validTimestamps);
  return true;
}

function hasToolsAccess(session: any): boolean {
  const role = (session?.user as any)?.role;
  const allowedModules = ((session?.user as any)?.allowedModules as string[]) || ["*"];
  return (
    role === "ADMIN" ||
    role === "NOC_OPERATOR" ||
    allowedModules.includes("TOOLS") ||
    (allowedModules.includes("*") && role !== "STAFF")
  );
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasToolsAccess(session)) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to network tools" },
        { status: 403 }
      );
    }

    const userId = session.user.id || (session.user as any)?.employeeId || "unknown";
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment before trying again." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const target = (body.target || "").trim();
    const remark = (body.remark || "").trim() || null;

    if (!target) {
      return NextResponse.json({ error: "Target MAC Address atau IP lokal harus diisi" }, { status: 400 });
    }

    // Execute MAC address resolution
    const result = await lookupMacAddress(target);

    // Save to MacLookupHistory in PostgreSQL (Deduplicate / Upsert by MAC address)
    const employeeId = (session.user as any)?.employeeId || session.user.name || "Operator";
    try {
      const existingRecords = await prisma.macLookupHistory.findMany({
        where: { macAddress: result.macAddress },
        orderBy: { createdAt: "desc" },
      });

      if (existingRecords.length > 0) {
        const primary = existingRecords[0];
        // Retain existing remark if none was explicitly passed in this check
        const finalRemark = remark !== null ? remark : primary.remark;

        await prisma.macLookupHistory.update({
          where: { id: primary.id },
          data: {
            ouiPrefix: result.ouiPrefix,
            vendor: result.vendor,
            isPrivate: result.isPrivate,
            remark: finalRemark,
            queriedBy: employeeId,
            isDeleted: false,
            deletedAt: null,
            createdAt: new Date(), // bump timestamp to top of history
            details: JSON.stringify({
              country: result.country,
              source: result.source,
              resolvedFromIp: result.resolvedFromIp,
              isMulticast: result.isMulticast,
              isBroadcast: result.isBroadcast,
              ciscoFormat: result.formats.cisco,
            }),
          },
        });

        // Delete any prior duplicate entries for this MAC address
        if (existingRecords.length > 1) {
          const duplicateIds = existingRecords.slice(1).map((r) => r.id);
          await prisma.macLookupHistory.deleteMany({
            where: { id: { in: duplicateIds } },
          });
        }
      } else {
        await prisma.macLookupHistory.create({
          data: {
            macAddress: result.macAddress,
            ouiPrefix: result.ouiPrefix,
            vendor: result.vendor,
            isPrivate: result.isPrivate,
            remark,
            queriedBy: employeeId,
            details: JSON.stringify({
              country: result.country,
              source: result.source,
              resolvedFromIp: result.resolvedFromIp,
              isMulticast: result.isMulticast,
              isBroadcast: result.isBroadcast,
              ciscoFormat: result.formats.cisco,
            }),
          },
        });
      }

      // Also record in AuditLog
      const dbUser = await prisma.user.findFirst({
        where: {
          OR: [{ id: userId }, { employeeId }],
        },
      });

      if (dbUser) {
        await prisma.auditLog.create({
          data: {
            userId: dbUser.id,
            action: "NETWORK_TOOL_MACLOOKUP",
            target: result.macAddress,
            detail: `Resolved vendor "${result.vendor}" for ${target} (${result.source})${remark ? ` [Remark: ${remark}]` : ""}`,
          },
        });
      }
    } catch (dbErr) {
      console.warn("Failed to persist MAC lookup history / audit log:", dbErr);
    }

    return NextResponse.json({ result, success: true });
  } catch (error: any) {
    console.error("MAC lookup failed:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasToolsAccess(session)) {
      return NextResponse.json({ error: "Forbidden: You do not have access to network tools" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const isTrash = searchParams.get("trash") === "true";

    const [history, trashCount, activeCount] = await Promise.all([
      prisma.macLookupHistory.findMany({
        where: { isDeleted: isTrash },
        orderBy: isTrash ? { deletedAt: "desc" } : { createdAt: "desc" },
        take: 50,
      }),
      prisma.macLookupHistory.count({
        where: { isDeleted: true },
      }),
      prisma.macLookupHistory.count({
        where: { isDeleted: false },
      }),
    ]);

    return NextResponse.json({ history, trashCount, activeCount });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch history" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasToolsAccess(session)) {
      return NextResponse.json({ error: "Forbidden: You do not have access to network tools" }, { status: 403 });
    }

    const body = await request.json();
    const { id, remark, restore } = body;

    if (!id) {
      return NextResponse.json({ error: "ID riwayat harus disertakan" }, { status: 400 });
    }

    const updateData: any = {};
    if (restore) {
      updateData.isDeleted = false;
      updateData.deletedAt = null;
    }
    if (remark !== undefined) {
      updateData.remark = remark ? remark.trim() : null;
    }

    const updated = await prisma.macLookupHistory.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ success: true, history: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update record" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!hasToolsAccess(session)) {
      return NextResponse.json({ error: "Forbidden: You do not have access to network tools" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const permanent = searchParams.get("permanent") === "true";
    const emptyTrash = searchParams.get("emptyTrash") === "true";
    const all = searchParams.get("all") === "true";

    if (emptyTrash) {
      // Purge all items in trash permanently
      await prisma.macLookupHistory.deleteMany({
        where: { isDeleted: true },
      });
      return NextResponse.json({ success: true, message: "Recycle bin emptied" });
    }

    if (id) {
      if (permanent) {
        await prisma.macLookupHistory.delete({ where: { id } });
      } else {
        await prisma.macLookupHistory.update({
          where: { id },
          data: { isDeleted: true, deletedAt: new Date() },
        });
      }
      return NextResponse.json({ success: true });
    }

    if (all) {
      // Soft-delete all active records to recycle bin
      await prisma.macLookupHistory.updateMany({
        where: { isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Parameter aksi tidak valid" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete record" }, { status: 500 });
  }
}
