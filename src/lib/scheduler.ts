import { Cron } from "croner";
import { runPrtgSync } from "@/lib/sync";
import { runDueUptimeChecks, purgeOldUptimeResults } from "@/lib/uptime-sync";
import { prisma } from "@/lib/prisma";

// Global singleton to prevent duplicate cron jobs during Next.js hot reload
const globalForScheduler = globalThis as unknown as {
  prtgSyncJob?: Cron;
  retentionPurgeJob?: Cron;
  uptimeCheckJob?: Cron;
  uptimePurgeJob?: Cron;
};

export function initCronJobs() {
  // Prevent duplicate instances in development
  if (globalForScheduler.prtgSyncJob) {
    console.log("🔄 Scheduler already initialized, skipping duplicate registration.");
    return;
  }

  console.log("⏰ Initializing enterprise background scheduler for Dashboard-Server...");

  // 1. PRTG Polling Sync Job (Every 60 seconds)
  globalForScheduler.prtgSyncJob = new Cron(
    "*/60 * * * * *",
    {
      name: "prtg-sync",
      protect: true, // Prevents job overlaps if previous run took longer than 60s
    },
    async () => {
      try {
        const result = await runPrtgSync();
        if (result.success) {
          console.log(`[PRTG Auto-Sync] ${result.message} at ${new Date().toLocaleTimeString("id-ID")}`);
        } else {
          console.warn(`[PRTG Auto-Sync Warn] ${result.message}`);
        }
      } catch (err) {
        console.error("[PRTG Auto-Sync Error]", err);
      }
    }
  );
  console.log("✅ [Scheduler] PRTG sync daemon active (interval: 60s)");

  // 2. Automated Retention Purge Job (Daily at 02:00 WIB)
  globalForScheduler.retentionPurgeJob = new Cron(
    "0 2 * * *",
    {
      name: "retention-purge",
      timezone: "Asia/Jakarta",
    },
    async () => {
      console.log("[Retention Purge] Running scheduled daily metrics cleanup...");
      try {
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

        // Audit log entry for automated system action
        const systemAdmin = await prisma.user.findFirst({
          where: { role: "ADMIN" },
        });

        if (systemAdmin) {
          await prisma.auditLog.create({
            data: {
              userId: systemAdmin.id,
              action: "AUTO_DATA_PURGE",
              target: "SensorMetricHistory",
              detail: `Automated 02:00 purge removed ${deleteResult.count.toLocaleString()} records older than ${retentionDays} days`,
            },
          });
        }

        console.log(
          `[Retention Purge] Successfully purged ${deleteResult.count.toLocaleString()} expired records (cutoff: ${cutoffDate.toISOString()})`
        );
      } catch (err) {
        console.error("[Retention Purge Error]", err);
      }
    }
  );
  console.log("✅ [Scheduler] Retention daily cleanup active (02:00 WIB)");

  // 3. Uptime Monitor Check Job (Every 30 seconds)
  globalForScheduler.uptimeCheckJob = new Cron(
    "*/30 * * * * *",
    {
      name: "uptime-check",
      protect: true,
    },
    async () => {
      try {
        await runDueUptimeChecks();
      } catch (err) {
        console.error("[Uptime Check Error]", err);
      }
    }
  );
  console.log("✅ [Scheduler] Uptime monitor check daemon active (interval: 30s)");

  // 4. Uptime Results Purge Job (Daily at 03:00 WIB)
  globalForScheduler.uptimePurgeJob = new Cron(
    "0 3 * * *",
    {
      name: "uptime-purge",
      timezone: "Asia/Jakarta",
    },
    async () => {
      try {
        await purgeOldUptimeResults();
      } catch (err) {
        console.error("[Uptime Purge Error]", err);
      }
    }
  );
  console.log("✅ [Scheduler] Uptime results purge active (03:00 WIB)");
}
