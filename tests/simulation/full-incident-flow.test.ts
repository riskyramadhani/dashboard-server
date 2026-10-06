import { describe, it, expect } from "vitest";

interface SensorState {
  id: number;
  name: string;
  status: "OK" | "Warning" | "Down" | "Paused";
}

class SystemSimulation {
  public sensors: SensorState[] = [];

  constructor(initialSensors: SensorState[]) {
    this.sensors = initialSensors;
  }

  // ITIL-standard SLA Availability
  public getSlaAvailability(): number {
    const active = this.sensors.filter((s) => s.status !== "Paused");
    if (active.length === 0) return 100;
    const downCount = active.filter((s) => s.status === "Down").length;
    return ((active.length - downCount) / active.length) * 100;
  }

  // System Health Score
  public getHealthScore(): number {
    const active = this.sensors.filter((s) => s.status !== "Paused");
    if (active.length === 0) return 100;
    const okCount = active.filter((s) => s.status === "OK").length;
    return (okCount / active.length) * 100;
  }

  // Simulasi outage
  public triggerIncident(sensorId: number, newStatus: "Down" | "Warning") {
    const target = this.sensors.find((s) => s.id === sensorId);
    if (target) target.status = newStatus;
  }

  // Simulasi recovery
  public resolveIncident(sensorId: number) {
    const target = this.sensors.find((s) => s.id === sensorId);
    if (target) target.status = "OK";
  }
}

describe("Simulation Test: Full Incident Lifecycle & SLA Impact", () => {
  it("harus mensimulasikan siklus insiden: Normal -> Outage -> Degradasi -> Recovery", () => {
    // 10 Sensor: 8 OK, 2 Paused (Maintenance)
    const initialSensors: SensorState[] = [
      { id: 1, name: "Web Server 01", status: "OK" },
      { id: 2, name: "Web Server 02", status: "OK" },
      { id: 3, name: "Database Master", status: "OK" },
      { id: 4, name: "Database Replica", status: "OK" },
      { id: 5, name: "ERP Application", status: "OK" },
      { id: 6, name: "Core Switch JKT", status: "OK" },
      { id: 7, name: "Gateway Bayan", status: "OK" },
      { id: 8, name: "Backup Gateway", status: "OK" },
      { id: 9, name: "Staging Server", status: "Paused" },
      { id: 10, name: "Dev Cluster", status: "Paused" },
    ];

    const system = new SystemSimulation(initialSensors);

    // KONDISI AWAL (NORMAL)
    // 8 Aktif, 0 Down -> SLA 100%, Health 100%
    expect(system.getSlaAvailability()).toBe(100);
    expect(system.getHealthScore()).toBe(100);

    // FASE 1: INSIDEN OUTAGE (Database Master DOWN)
    system.triggerIncident(3, "Down");
    // 8 Aktif, 1 Down -> SLA = 7 / 8 = 87.5%, Health = 7 / 8 = 87.5%
    expect(system.getSlaAvailability()).toBe(87.5);
    expect(system.getHealthScore()).toBe(87.5);

    // FASE 2: DEGRADASI PERFORMA (Web Server 01 HIGH LOAD / WARNING)
    system.triggerIncident(1, "Warning");
    // Warning BUKAN Down -> SLA tetap 87.5% (hanya 1 Down)
    // Namun Health Score turun karena hanya 6 yang OK -> 6 / 8 = 75%
    expect(system.getSlaAvailability()).toBe(87.5);
    expect(system.getHealthScore()).toBe(75);

    // FASE 3: RECOVERY DATABASE MASTER (Insiden Selesai)
    system.resolveIncident(3);
    // Tidak ada lagi Down -> SLA Uptime kembali ke 100%!
    // Tapi Web Server 01 masih Warning -> Health Score 7 / 8 = 87.5%
    expect(system.getSlaAvailability()).toBe(100);
    expect(system.getHealthScore()).toBe(87.5);

    // FASE 4: FULL RECOVERY (Semua Sensor Normal)
    system.resolveIncident(1);
    expect(system.getSlaAvailability()).toBe(100);
    expect(system.getHealthScore()).toBe(100);
  });
});
