import { prisma } from "@/lib/prisma";
import { PrtgClient, PrtgSensorRaw } from "@/lib/prtg";
import { decrypt } from "@/lib/crypto";
import { parseNumericValue, parseUnit } from "@/lib/utils";
import { SensorStatus } from "@prisma/client";

function mapPrtgStatus(rawStatus: number, statusText: string): SensorStatus {
  // PRTG status_raw:
  // 1 = Unknown, 2 = Scanning, 3 = Up (OK), 4 = Warning, 5 = Down, 7 = Paused by user, etc.
  if (rawStatus === 3 || statusText.toLowerCase().includes("up") || statusText.toLowerCase() === "ok") {
    return SensorStatus.OK;
  }
  if (rawStatus === 4 || statusText.toLowerCase().includes("warn")) {
    return SensorStatus.Warning;
  }
  if (rawStatus === 5 || statusText.toLowerCase().includes("down")) {
    return SensorStatus.Down;
  }
  if (rawStatus === 7 || rawStatus === 8 || statusText.toLowerCase().includes("paused")) {
    return SensorStatus.Paused;
  }
  return SensorStatus.Unknown;
}

export async function runPrtgSync(): Promise<{
  success: boolean;
  message: string;
  syncedSensors: number;
  timestamp: Date;
}> {
  const timestamp = new Date();
  const settings = await prisma.prtgSetting.findFirst({ where: { id: 1 } });

  if (!settings || !settings.baseUrl) {
    return {
      success: false,
      message: "PRTG Base URL not configured",
      syncedSensors: 0,
      timestamp,
    };
  }

  let token = "";
  if (settings.apiTokenEncrypted && settings.apiTokenIv && settings.apiTokenAuthTag) {
    try {
      token = decrypt(settings.apiTokenEncrypted, settings.apiTokenIv, settings.apiTokenAuthTag);
    } catch (e) {
      console.error("Failed to decrypt PRTG API token:", e);
    }
  }

  const client = new PrtgClient({
    baseUrl: settings.baseUrl,
    apiToken: token,
    ignoreSsl: settings.ignoreSsl,
  });

  try {
    const rawSensors: PrtgSensorRaw[] = await client.fetchSensors();

    let count = 0;
    for (const raw of rawSensors) {
      const status = mapPrtgStatus(raw.status_raw, raw.status);
      const parsed = parseNumericValue(raw.lastvalue || "0");

      const existing = await prisma.sensor.findUnique({ where: { id: raw.objid } });

      const consecutiveWarnings =
        status === SensorStatus.Warning ? (existing ? existing.consecutiveWarnings + 1 : 1) : 0;
      const firstWarningAt =
        status === SensorStatus.Warning ? (existing?.firstWarningAt ? existing.firstWarningAt : timestamp) : null;

      await prisma.sensor.upsert({
        where: { id: raw.objid },
        update: {
          probeName: raw.probe,
          groupName: raw.group,
          deviceName: raw.device,
          sensorName: raw.sensor,
          lastStatus: status,
          lastValue: raw.lastvalue,
          lastMessage: raw.message || null,
          consecutiveWarnings,
          firstWarningAt,
          lastUpdated: timestamp,
        },
        create: {
          id: raw.objid,
          probeName: raw.probe,
          groupName: raw.group,
          deviceName: raw.device,
          sensorName: raw.sensor,
          sensorType: "PRTG Sensor",
          lastStatus: status,
          lastValue: raw.lastvalue,
          lastMessage: raw.message || null,
          consecutiveWarnings,
          firstWarningAt,
          lastUpdated: timestamp,
        },
      });

      // Record time series metric
      if (parsed !== null) {
        await prisma.sensorMetricHistory.create({
          data: {
            sensorId: raw.objid,
            metricValue: parsed,
            unit: parseUnit(raw.lastvalue || ""),
            status,
            recordedAt: timestamp,
          },
        });
      }

      count++;
    }

    // Prune stale sensors that are no longer reported by PRTG
    const liveObjIds = rawSensors.map((r) => r.objid);
    if (liveObjIds.length > 0) {
      await prisma.sensor.deleteMany({
        where: {
          id: { notIn: liveObjIds },
        },
      });
    }

    await prisma.prtgSetting.update({
      where: { id: 1 },
      data: {
        lastSyncAt: timestamp,
        connectionStatus: "connected",
      },
    });

    return {
      success: true,
      message: `Successfully synchronized ${count} sensors from PRTG`,
      syncedSensors: count,
      timestamp,
    };
  } catch (err: any) {
    // When external PRTG server is offline, update connection status to disconnected
    await prisma.prtgSetting.update({
      where: { id: 1 },
      data: {
        connectionStatus: "disconnected",
      },
    });

    return {
      success: false,
      message: `Sync failed: ${err.message}`,
      syncedSensors: 0,
      timestamp,
    };
  }
}
