import { describe, it, expect } from "vitest";

// Logika SLA Availability Murni & Health Score sesuai ITIL standard
function calculateSlaUptime(total: number, paused: number, down: number): number {
  const activeTotal = total - paused;
  if (activeTotal <= 0) return 100;
  return ((activeTotal - down) / activeTotal) * 100;
}

function calculateHealthScore(total: number, paused: number, ok: number): number {
  const activeTotal = total - paused;
  if (activeTotal <= 0) return 100;
  return (ok / activeTotal) * 100;
}

// Logika pemisahan sensor RAM: Meminfo (Free) vs Physical Memory (Available/Usage)
function parseRamMetric(sensorName: string, lastValue: string | null): {
  isFreeMetric: boolean;
  value: number | null;
  usagePct: number | null;
} {
  if (!lastValue) return { isFreeMetric: false, value: null, usagePct: null };
  const num = parseFloat(lastValue.replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return { isFreeMetric: false, value: null, usagePct: null };

  const isMeminfo = sensorName.toLowerCase().includes("meminfo");
  const isFree = isMeminfo || sensorName.toLowerCase().includes("available") || sensorName.toLowerCase().includes("free");

  return {
    isFreeMetric: isFree,
    value: num,
    usagePct: isFree ? Math.max(0, 100 - num) : num,
  };
}

describe("PRTG SLA & Health Score Calculation Unit Tests", () => {
  it("harus menghitung SLA Ketersediaan murni 100% jika hanya ada sensor Warning dan tidak ada Down", () => {
    const total = 50;
    const paused = 5;
    const down = 0;
    const sla = calculateSlaUptime(total, paused, down);
    expect(sla).toBe(100);
  });

  it("harus mengecualikan sensor Paused dari pembagi saat menghitung SLA", () => {
    // 102 sensor total, 13 paused, 1 down -> 89 aktif, 1 down -> 88/89 = 98.876%
    const total = 102;
    const paused = 13;
    const down = 1;
    const sla = calculateSlaUptime(total, paused, down);
    expect(Number(sla.toFixed(2))).toBe(98.88);
  });

  it("Health Score harus mencerminkan kondisi sensor optimal (OK / Active)", () => {
    // 102 total, 13 paused, 83 OK -> 83 / 89 = 93.258%
    const total = 102;
    const paused = 13;
    const ok = 83;
    const health = calculateHealthScore(total, paused, ok);
    expect(Number(health.toFixed(2))).toBe(93.26);
  });

  it("harus membedakan sensor Meminfo (Free Physical 85%) menjadi Usage 15%", () => {
    const parsed = parseRamMetric("Meminfo", "85 %");
    expect(parsed.isFreeMetric).toBe(true);
    expect(parsed.value).toBe(85);
    expect(parsed.usagePct).toBe(15);
  });

  it("harus membaca sensor Memory: Physical memory secara langsung dan akurat", () => {
    const parsed = parseRamMetric("Memory: Physical memory", "41 %");
    expect(parsed.value).toBe(41);
  });
});
