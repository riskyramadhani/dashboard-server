import { PrismaClient, SensorStatus, Role } from "@prisma/client";
import bcryptjs from "bcryptjs";

const prisma = new PrismaClient();

// ─── TOPOLOGY DEFINITION ─────────────────────────────────────
interface SensorDef {
  id: number;
  probeName: string;
  groupName: string;
  deviceName: string;
  sensorName: string;
  sensorType: string;
  status: SensorStatus;
  value: string;
  unit: string;
  numericBase: number;
  message?: string;
}

const sensorDefs: SensorDef[] = [
  // ─── LOCAL PROBE - SERVER JKT ───────────────────────────
  // Database Server (2 Warning, 16 OK)
  { id: 1001, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "CPU Load", sensorType: "CPU Load", status: "OK", value: "35 %", unit: "%", numericBase: 35 },
  { id: 1002, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Memory", sensorType: "Memory", status: "OK", value: "62 %", unit: "%", numericBase: 62 },
  { id: 1003, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Disk Free C:", sensorType: "Disk Free", status: "Warning", value: "12 GB", unit: "GB", numericBase: 12, message: "Low disk space on C:" },
  { id: 1004, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Disk Free D:", sensorType: "Disk Free", status: "Warning", value: "8 GB", unit: "GB", numericBase: 8, message: "Low disk space on D:" },
  { id: 1005, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Ping", sensorType: "Ping", status: "OK", value: "1.2 ms", unit: "ms", numericBase: 1.2 },
  { id: 1006, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "SQL Connections", sensorType: "Database", status: "OK", value: "45", unit: "", numericBase: 45 },
  { id: 1007, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "SQL Query Time", sensorType: "Database", status: "OK", value: "15 ms", unit: "ms", numericBase: 15 },
  { id: 1008, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Network Traffic In", sensorType: "Network", status: "OK", value: "125 Mbps", unit: "Mbps", numericBase: 125 },
  { id: 1009, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Network Traffic Out", sensorType: "Network", status: "OK", value: "89 Mbps", unit: "Mbps", numericBase: 89 },
  { id: 1010, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Uptime", sensorType: "System", status: "OK", value: "45 d", unit: "d", numericBase: 45 },
  { id: 1011, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "SNMP Traffic", sensorType: "SNMP", status: "OK", value: "200 Kbps", unit: "Kbps", numericBase: 200 },
  { id: 1012, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Event Log", sensorType: "System", status: "OK", value: "0 errors", unit: "", numericBase: 0 },
  { id: 1013, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Service: MSSQL", sensorType: "Service", status: "OK", value: "Running", unit: "", numericBase: 1 },
  { id: 1014, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Service: SQL Agent", sensorType: "Service", status: "OK", value: "Running", unit: "", numericBase: 1 },
  { id: 1015, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Temperature", sensorType: "Hardware", status: "OK", value: "42 °C", unit: "°C", numericBase: 42 },
  { id: 1016, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Fan Speed", sensorType: "Hardware", status: "OK", value: "2400 RPM", unit: "RPM", numericBase: 2400 },
  { id: 1017, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Power Supply", sensorType: "Hardware", status: "OK", value: "Redundant", unit: "", numericBase: 1 },
  { id: 1018, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Database Server", sensorName: "Disk I/O", sensorType: "Disk", status: "OK", value: "23 ms", unit: "ms", numericBase: 23 },

  // Web Server (1 Warning, 38 OK) - showing subset
  { id: 2001, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Web Server", sensorName: "CPU Load", sensorType: "CPU Load", status: "OK", value: "28 %", unit: "%", numericBase: 28 },
  { id: 2002, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Web Server", sensorName: "Memory", sensorType: "Memory", status: "Warning", value: "89 %", unit: "%", numericBase: 89, message: "High memory usage" },
  { id: 2003, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Web Server", sensorName: "Disk Free C:", sensorType: "Disk Free", status: "OK", value: "45 GB", unit: "GB", numericBase: 45 },
  { id: 2004, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Web Server", sensorName: "Ping", sensorType: "Ping", status: "OK", value: "0.8 ms", unit: "ms", numericBase: 0.8 },
  { id: 2005, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Web Server", sensorName: "HTTP Response", sensorType: "HTTP", status: "OK", value: "120 ms", unit: "ms", numericBase: 120 },
  { id: 2006, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Web Server", sensorName: "HTTPS Certificate", sensorType: "SSL", status: "OK", value: "Valid 89d", unit: "d", numericBase: 89 },
  { id: 2007, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Web Server", sensorName: "IIS Requests/s", sensorType: "Web", status: "OK", value: "342", unit: "", numericBase: 342 },
  { id: 2008, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Web Server", sensorName: "Active Sessions", sensorType: "Web", status: "OK", value: "128", unit: "", numericBase: 128 },
  { id: 2009, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Web Server", sensorName: "Network In", sensorType: "Network", status: "OK", value: "250 Mbps", unit: "Mbps", numericBase: 250 },
  { id: 2010, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Web Server", sensorName: "Network Out", sensorType: "Network", status: "OK", value: "180 Mbps", unit: "Mbps", numericBase: 180 },

  // Additional Server (4 OK)
  { id: 3001, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Additional Server", sensorName: "CPU Load", sensorType: "CPU Load", status: "OK", value: "15 %", unit: "%", numericBase: 15 },
  { id: 3002, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Additional Server", sensorName: "Memory", sensorType: "Memory", status: "OK", value: "40 %", unit: "%", numericBase: 40 },
  { id: 3003, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Additional Server", sensorName: "Ping", sensorType: "Ping", status: "OK", value: "0.5 ms", unit: "ms", numericBase: 0.5 },
  { id: 3004, probeName: "Local Probe - Server JKT", groupName: "Servers", deviceName: "Additional Server", sensorName: "Disk Free", sensorType: "Disk Free", status: "OK", value: "120 GB", unit: "GB", numericBase: 120 },

  // PRTG Core Server (2 OK)
  { id: 4001, probeName: "Local Probe - Server JKT", groupName: "PRTG", deviceName: "PRTG Core Server", sensorName: "Core Health", sensorType: "System", status: "OK", value: "100 %", unit: "%", numericBase: 100 },
  { id: 4002, probeName: "Local Probe - Server JKT", groupName: "PRTG", deviceName: "PRTG Core Server", sensorName: "Probe Health", sensorType: "System", status: "OK", value: "100 %", unit: "%", numericBase: 100 },

  // ─── PROBE-BSSMHU ──────────────────────────────────────
  { id: 5001, probeName: "PROBE-BSSMHU", groupName: "BSS MHU", deviceName: "ServerERP-MHU", sensorName: "CPU Load", sensorType: "CPU Load", status: "OK", value: "42 %", unit: "%", numericBase: 42 },
  { id: 5002, probeName: "PROBE-BSSMHU", groupName: "BSS MHU", deviceName: "ServerERP-MHU", sensorName: "Memory", sensorType: "Memory", status: "OK", value: "71 %", unit: "%", numericBase: 71 },
  { id: 5003, probeName: "PROBE-BSSMHU", groupName: "BSS MHU", deviceName: "ServerERP-MHU", sensorName: "Disk Free Space", sensorType: "Disk Free", status: "Warning", value: "5.2 GB", unit: "GB", numericBase: 5.2, message: "Disk space critically low" },
  { id: 5004, probeName: "PROBE-BSSMHU", groupName: "BSS MHU", deviceName: "ServerERP-MHU", sensorName: "Ping", sensorType: "Ping", status: "OK", value: "3.5 ms", unit: "ms", numericBase: 3.5 },

  // ─── PROBE-BSSBAYAN ─────────────────────────────────────
  { id: 6001, probeName: "PROBE-BSSBAYAN", groupName: "BSS Bayan", deviceName: "Monitoring-BAYAN", sensorName: "CPU Load", sensorType: "CPU Load", status: "OK", value: "18 %", unit: "%", numericBase: 18 },
  { id: 6002, probeName: "PROBE-BSSBAYAN", groupName: "BSS Bayan", deviceName: "Monitoring-BAYAN", sensorName: "Memory", sensorType: "Memory", status: "OK", value: "55 %", unit: "%", numericBase: 55 },
  { id: 6003, probeName: "PROBE-BSSBAYAN", groupName: "BSS Bayan", deviceName: "Monitoring-BAYAN", sensorName: "Ping", sensorType: "Ping", status: "OK", value: "2.1 ms", unit: "ms", numericBase: 2.1 },
  { id: 6004, probeName: "PROBE-BSSBAYAN", groupName: "BSS Bayan", deviceName: "ServerERP-BAYAN", sensorName: "CPU Load", sensorType: "CPU Load", status: "OK", value: "25 %", unit: "%", numericBase: 25 },
  { id: 6005, probeName: "PROBE-BSSBAYAN", groupName: "BSS Bayan", deviceName: "ServerERP-BAYAN", sensorName: "Memory", sensorType: "Memory", status: "OK", value: "48 %", unit: "%", numericBase: 48 },
  { id: 6006, probeName: "PROBE-BSSBAYAN", groupName: "BSS Bayan", deviceName: "ServerERP-BAYAN", sensorName: "Disk Free", sensorType: "Disk Free", status: "OK", value: "85 GB", unit: "GB", numericBase: 85 },
  { id: 6007, probeName: "PROBE-BSSBAYAN", groupName: "BSS Bayan", deviceName: "ServerERP-BAYAN", sensorName: "Ping", sensorType: "Ping", status: "OK", value: "1.8 ms", unit: "ms", numericBase: 1.8 },

  // ─── PROBE-BSSCDI ──────────────────────────────────────
  { id: 7001, probeName: "PROBE-BSSCDI", groupName: "BSS CDI", deviceName: "ServerERP-CDI", sensorName: "CPU Load", sensorType: "CPU Load", status: "OK", value: "22 %", unit: "%", numericBase: 22 },
  { id: 7002, probeName: "PROBE-BSSCDI", groupName: "BSS CDI", deviceName: "ServerERP-CDI", sensorName: "Memory", sensorType: "Memory", status: "OK", value: "51 %", unit: "%", numericBase: 51 },
  { id: 7003, probeName: "PROBE-BSSCDI", groupName: "BSS CDI", deviceName: "ServerERP-CDI", sensorName: "Disk Free", sensorType: "Disk Free", status: "OK", value: "92 GB", unit: "GB", numericBase: 92 },
  { id: 7004, probeName: "PROBE-BSSCDI", groupName: "BSS CDI", deviceName: "ServerERP-CDI", sensorName: "Ping", sensorType: "Ping", status: "OK", value: "2.8 ms", unit: "ms", numericBase: 2.8 },

  // ─── PROBE-EPROC ────────────────────────────────────────
  { id: 8001, probeName: "PROBE-EPROC", groupName: "BSS EPROC", deviceName: "ServerERP-EPROC", sensorName: "CPU Load", sensorType: "CPU Load", status: "OK", value: "38 %", unit: "%", numericBase: 38 },
  { id: 8002, probeName: "PROBE-EPROC", groupName: "BSS EPROC", deviceName: "ServerERP-EPROC", sensorName: "Memory", sensorType: "Memory", status: "OK", value: "67 %", unit: "%", numericBase: 67 },
  { id: 8003, probeName: "PROBE-EPROC", groupName: "BSS EPROC", deviceName: "ServerERP-EPROC", sensorName: "Disk Free Space", sensorType: "Disk Free", status: "Warning", value: "6.8 GB", unit: "GB", numericBase: 6.8, message: "Disk space running low" },
  { id: 8004, probeName: "PROBE-EPROC", groupName: "BSS EPROC", deviceName: "ServerERP-EPROC", sensorName: "Ping", sensorType: "Ping", status: "OK", value: "4.2 ms", unit: "ms", numericBase: 4.2 },
];

// ─── HELPER: Generate realistic metric history ───────────
function generateMetrics(sensor: SensorDef, days: number) {
  const metrics: {
    sensorId: number;
    metricValue: number;
    unit: string;
    status: SensorStatus;
    recordedAt: Date;
  }[] = [];

  const now = new Date();
  const intervalMinutes = 5; // Every 5 minutes
  const totalPoints = (days * 24 * 60) / intervalMinutes;

  for (let i = 0; i < totalPoints; i++) {
    const recordedAt = new Date(
      now.getTime() - i * intervalMinutes * 60 * 1000
    );

    // Generate realistic variations
    let value: number;
    const hourOfDay = recordedAt.getHours();
    const isBusinessHours = hourOfDay >= 8 && hourOfDay <= 18;
    const noise = (Math.random() - 0.5) * 2;

    switch (sensor.sensorType) {
      case "CPU Load":
        value = sensor.numericBase + noise * 15 + (isBusinessHours ? 10 : -5);
        // Occasional spikes
        if (Math.random() < 0.02) value = 85 + Math.random() * 13;
        value = Math.max(1, Math.min(100, value));
        break;

      case "Memory":
        value = sensor.numericBase + noise * 8 + (isBusinessHours ? 5 : -3);
        value = Math.max(10, Math.min(99, value));
        break;

      case "Disk Free":
        // Gradually decreasing over time (trending)
        const daysSinceStart = i / (24 * 60 / intervalMinutes);
        value = sensor.numericBase + daysSinceStart * 0.05 + noise * 0.5;
        if (sensor.status === "Warning") {
          value = Math.max(2, Math.min(20, value));
        } else {
          value = Math.max(10, Math.min(200, value));
        }
        break;

      case "Ping":
        value = sensor.numericBase + noise * 0.5;
        // Occasional high latency
        if (Math.random() < 0.01) value = 50 + Math.random() * 150;
        value = Math.max(0.1, value);
        break;

      default:
        value = sensor.numericBase + noise * (sensor.numericBase * 0.1);
        value = Math.max(0, value);
        break;
    }

    // Determine status based on value
    let status: SensorStatus = "OK";
    if (sensor.sensorType === "CPU Load" && value > 90) status = "Down";
    else if (sensor.sensorType === "CPU Load" && value > 80) status = "Warning";
    else if (sensor.sensorType === "Memory" && value > 95) status = "Down";
    else if (sensor.sensorType === "Memory" && value > 85) status = "Warning";
    else if (sensor.sensorType === "Disk Free" && value < 3) status = "Down";
    else if (sensor.sensorType === "Disk Free" && value < 10) status = "Warning";
    else if (sensor.sensorType === "Ping" && value > 200) status = "Down";
    else if (sensor.sensorType === "Ping" && value > 100) status = "Warning";

    metrics.push({
      sensorId: sensor.id,
      metricValue: parseFloat(value.toFixed(2)),
      unit: sensor.unit,
      status,
      recordedAt,
    });
  }

  return metrics;
}

// ─── MAIN SEED ────────────────────────────────────────────
async function main() {
  console.log("🌱 Starting seed...");

  // Clean existing data
  await prisma.sensorMetricHistory.deleteMany();
  await prisma.sensor.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.prtgSetting.deleteMany();

  console.log("🧹 Cleaned existing data");

  // ─── Users ───────────────────────────────────────────────
  const adminHash = await bcryptjs.hash("1015763", 12);
  const nocHash = await bcryptjs.hash("1015001", 12);
  const staffHash = await bcryptjs.hash("1015002", 12);

  await prisma.user.createMany({
    data: [
      {
        employeeId: "1015763",
        name: "Admin BSS",
        passwordHash: adminHash,
        role: Role.ADMIN,
        allowedProbes: ["*"],
      },
      {
        employeeId: "1015001",
        name: "NOC Operator",
        passwordHash: nocHash,
        role: Role.NOC_OPERATOR,
        allowedProbes: ["*"],
      },
      {
        employeeId: "1015002",
        name: "Manager IT",
        passwordHash: staffHash,
        role: Role.STAFF,
        allowedProbes: ["*"],
      },
    ],
  });
  console.log("👤 Created 3 users (Admin, NOC, Staff)");

  // ─── PRTG Settings ──────────────────────────────────────
  await prisma.prtgSetting.create({
    data: {
      id: 1,
      baseUrl: "https://prtg.bss.local",
      retentionDays: 90,
      pollIntervalSeconds: 60,
      ignoreSsl: true,
      connectionStatus: "connected",
      lastSyncAt: new Date(),
    },
  });
  console.log("⚙️  Created PRTG settings");

  // ─── Sensors (Only seeded if table is empty) ───────────────
  const existingSensorCount = await prisma.sensor.count();
  if (existingSensorCount === 0) {
    for (const def of sensorDefs) {
      await prisma.sensor.create({
        data: {
          id: def.id,
          probeName: def.probeName,
          groupName: def.groupName,
          deviceName: def.deviceName,
          sensorName: def.sensorName,
          sensorType: def.sensorType,
          lastStatus: def.status,
          lastValue: def.value,
          lastMessage: def.message || null,
          isActive: true,
          consecutiveWarnings: def.status === "Warning" ? 5 : 0,
          firstWarningAt: def.status === "Warning" ? new Date(Date.now() - 2 * 60 * 60 * 1000) : null,
          lastUpdated: new Date(),
        },
      });
    }
    console.log(`📡 Created ${sensorDefs.length} sensors`);

    // ─── Metric History (30 days, every 5 min) ───────────────
    console.log("📊 Generating 30-day metric history (this may take a moment)...");

    const histSensors = sensorDefs.filter((s) =>
      ["CPU Load", "Memory", "Disk Free", "Ping"].includes(s.sensorType)
    );

    let totalMetrics = 0;
    for (const sensor of histSensors) {
      const metrics = generateMetrics(sensor, 30);
      for (let i = 0; i < metrics.length; i += 1000) {
        const batch = metrics.slice(i, i + 1000);
        await prisma.sensorMetricHistory.createMany({ data: batch });
      }
      totalMetrics += metrics.length;
      process.stdout.write(`\r  📈 Seeded metrics for sensor ${sensor.id} (${sensor.sensorName})`);
    }
    console.log(`\n✅ Generated ${totalMetrics.toLocaleString()} metric data points`);
  } else {
    console.log(`📡 Skipped mock sensors (${existingSensorCount} real PRTG sensors already exist)`);
  }

  console.log("\n🎉 Seed complete!");
  console.log("\n📋 Login Credentials:");
  console.log("  Admin:        1015763 / 1015763");
  console.log("  NOC Operator: 1015001 / 1015001");
  console.log("  Management:   1015002 / 1015002");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
