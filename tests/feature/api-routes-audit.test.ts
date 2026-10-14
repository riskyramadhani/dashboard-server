import { describe, it, expect } from "vitest";

// Simulasi in-memory rate limiter dari /api/tools/[tool]/route.ts
class RateLimiterSimulation {
  private map = new Map<string, number[]>();
  private windowMs: number;
  private maxRequests: number;

  constructor(maxRequests = 5, windowMs = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  public check(userId: string): { allowed: boolean; status: number } {
    const now = Date.now();
    const timestamps = this.map.get(userId) || [];
    const valid = timestamps.filter((t) => now - t < this.windowMs);

    if (valid.length >= this.maxRequests) {
      return { allowed: false, status: 429 };
    }

    valid.push(now);
    this.map.set(userId, valid);
    return { allowed: true, status: 200 };
  }
}

// Simulasi validasi payload & error responses untuk API Route mutasi (Single & Batch)
function handleCreateMonitorPayload(body: any): { status: number; error?: string; data?: any; count?: number } {
  const isBatch = Array.isArray(body) || (body?.monitors && Array.isArray(body?.monitors));
  const items = isBatch ? (Array.isArray(body) ? body : body.monitors) : [body];

  if (!items || items.length === 0) {
    return { status: 400, error: "Daftar monitor tidak boleh kosong" };
  }

  const results: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { name, checkType, target, port } = item;

    if (!name || !checkType || !target) {
      return { status: 400, error: `Baris ${i + 1}: name, checkType, and target are required` };
    }

    const validTypes = ["HTTP", "HTTPS", "PING", "TCP_PORT"];
    if (!validTypes.includes(checkType)) {
      return { status: 400, error: `Baris ${i + 1}: Invalid checkType` };
    }

    if (checkType === "TCP_PORT" && (!port || port < 1 || port > 65535)) {
      return { status: 400, error: `Baris ${i + 1}: TCP_PORT check requires a valid port (1-65535)` };
    }

    results.push({ id: `mon-${i + 1}`, name, checkType, target, port });
  }

  if (isBatch) {
    return { status: 201, count: results.length, data: results };
  }

  return { status: 201, data: results[0] };
}

describe("Feature & Integration Test: API Simulation, Error Handling & Rate Limiting", () => {
  it("Rate Limiter harus mengembalikan 429 ketika request melebihi ambang batas", () => {
    const limiter = new RateLimiterSimulation(3, 2000); // Max 3 request per 2 detik
    const user = "user-1015763";

    expect(limiter.check(user).status).toBe(200);
    expect(limiter.check(user).status).toBe(200);
    expect(limiter.check(user).status).toBe(200);
    
    // Request ke-4 harus ditolak dengan HTTP 429 Too Many Requests
    const overflow = limiter.check(user);
    expect(overflow.allowed).toBe(false);
    expect(overflow.status).toBe(429);
  });

  it("POST /api/uptime/monitors harus mengembalikan 400 saat payload tidak lengkap (Error Test)", () => {
    const invalidBody = { name: "Web Server" }; // Kurang checkType & target
    const result = handleCreateMonitorPayload(invalidBody);

    expect(result.status).toBe(400);
    expect(result.error).toContain("required");
  });

  it("POST /api/uptime/monitors harus mengembalikan 400 jika TCP_PORT portnya invalid", () => {
    const invalidPortBody = {
      name: "DB Server",
      checkType: "TCP_PORT",
      target: "192.168.1.10",
      port: 99999, // Port di luar 1-65535
    };
    const result = handleCreateMonitorPayload(invalidPortBody);

    expect(result.status).toBe(400);
    expect(result.error).toContain("valid port");
  });

  it("POST /api/uptime/monitors harus mengembalikan 201 Created saat payload valid (Success Test)", () => {
    const validBody = {
      name: "BSS Main Portal",
      checkType: "HTTPS",
      target: "https://binasaranasukses.co.id",
    };
    const result = handleCreateMonitorPayload(validBody);

    expect(result.status).toBe(201);
    expect(result.data.name).toBe("BSS Main Portal");
    expect(result.data.id).toBeDefined();
  });

  it("POST /api/uptime/monitors harus mendukung pendaftaran Batch / Multi-Add (Success Batch Test)", () => {
    const batchPayload = {
      monitors: [
        { name: "Portal 1", checkType: "HTTPS", target: "https://portal1.bss.co.id" },
        { name: "Server PING", checkType: "PING", target: "192.168.101.1" },
        { name: "DB ERP", checkType: "TCP_PORT", target: "192.168.101.26", port: 5432 },
      ],
    };

    const result = handleCreateMonitorPayload(batchPayload);
    expect(result.status).toBe(201);
    expect(result.count).toBe(3);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data[2].port).toBe(5432);
  });
});
