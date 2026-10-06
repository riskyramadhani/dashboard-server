import { prisma } from "@/lib/prisma";
import { runUptimeCheck } from "@/lib/uptime-check";

/**
 * Runs a single uptime check for the given monitor ID,
 * saves the result, and updates the monitor's lastStatus.
 * This function never throws — all errors are silently logged.
 */
export async function runSingleUptimeCheck(monitorId: string): Promise<void> {
  try {
    const monitor = await prisma.uptimeMonitor.findUnique({
      where: { id: monitorId },
    });

    if (!monitor || !monitor.isActive) return;

    // runUptimeCheck never throws
    const result = await runUptimeCheck({
      checkType: monitor.checkType as "HTTP" | "HTTPS" | "PING" | "TCP_PORT",
      target: monitor.target,
      port: monitor.port,
      timeoutMs: monitor.timeoutMs,
      expectedStatus: monitor.expectedStatus,
      keyword: monitor.keyword,
    });

    // Determine if response time exceeds warningThresholdMs
    let finalStatus: "UP" | "WARNING" | "DOWN" = result.status;
    if (
      finalStatus === "UP" &&
      monitor.warningThresholdMs &&
      result.responseMs !== undefined &&
      result.responseMs !== null &&
      result.responseMs >= monitor.warningThresholdMs
    ) {
      finalStatus = "WARNING";
    }

    await prisma.$transaction([
      prisma.uptimeCheckResult.create({
        data: {
          monitorId: monitor.id,
          status: finalStatus,
          responseMs: result.responseMs ?? null,
          statusCode: result.statusCode ?? null,
          error: result.error ?? null,
        },
      }),
      prisma.uptimeMonitor.update({
        where: { id: monitor.id },
        data: {
          lastStatus: finalStatus,
          lastCheckedAt: new Date(),
          lastResponseMs: result.responseMs ?? null,
        },
      }),
    ]);
  } catch (err: any) {
    // DB errors or unexpected failures — log only, never propagate
    console.error(`[Uptime] Check failed for monitor ${monitorId}:`, err?.message ?? err);
  }
}

/**
 * Runs uptime checks for all active monitors whose interval has elapsed.
 */
export async function runDueUptimeChecks(): Promise<void> {
  const now = new Date();

  let monitors;
  try {
    monitors = await prisma.uptimeMonitor.findMany({
      where: { isActive: true },
    });
  } catch (err: any) {
    console.error("[Uptime] Failed to fetch monitors:", err?.message ?? err);
    return;
  }

  const due = monitors.filter((m) => {
    if (!m.lastCheckedAt) return true; // never checked
    const elapsed = (now.getTime() - m.lastCheckedAt.getTime()) / 1000;
    return elapsed >= m.intervalSeconds;
  });

  if (due.length === 0) return;

  console.log(`[Uptime] Running checks for ${due.length} due monitor(s)...`);

  // Each check is independent — one failure won't affect others
  await Promise.allSettled(due.map((m) => runSingleUptimeCheck(m.id)));
}

/**
 * Clean up old check results (keep last 30 days per monitor).
 */
export async function purgeOldUptimeResults(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const deleted = await prisma.uptimeCheckResult.deleteMany({
      where: { checkedAt: { lt: cutoff } },
    });
    if (deleted.count > 0) {
      console.log(`[Uptime] Purged ${deleted.count} old uptime check results`);
    }
  } catch (err: any) {
    console.error("[Uptime] Purge failed:", err?.message ?? err);
  }
}
