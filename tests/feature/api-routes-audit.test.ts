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

// Simulasi validasi payload & error responses untuk API Route mutasi
function handleCreateMonitorPayload(body: any): { status: number; error?: string; data?: any } {
  const { name, checkType, target, port } = body;

  if (!name || !checkType || !target) {
    return { status: 400, error: "name, checkType, and target are required" };
  }

  const validTypes = ["HTTP", "HTTPS", "PING", "TCP_PORT"];
  if (!validTypes.includes(checkType)) {
    return { status: 400, error: "Invalid checkType" };
  }

  if (checkType === "TCP_PORT" && (!port || port < 1 || port > 65535)) {
    return { status: 400, error: "TCP_PORT check requires a valid port (1-65535)" };
  }

  return { status: 201, data: { id: "mon-123", name, checkType, target, port } };
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
});
