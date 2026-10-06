import { describe, it, expect } from "vitest";

// Target validation regex dari src/app/api/tools/[tool]/route.ts
const TARGET_REGEX = /^(?:(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|(?:\d{1,3}\.){3}\d{1,3})$/;

function validateTargetHost(target: string): boolean {
  if (!target || typeof target !== "string") return false;
  const trimmed = target.trim();
  if (trimmed.startsWith("-")) return false; // Cegah flag injection seperti -rf
  return TARGET_REGEX.test(trimmed);
}

function sanitizeUrlProtocol(url: string, checkType: string): { valid: boolean; formattedUrl?: string } {
  let cleanTarget = url.trim();
  if (checkType === "HTTP" || checkType === "HTTPS") {
    if (cleanTarget.includes("://") && !cleanTarget.startsWith("http://") && !cleanTarget.startsWith("https://")) {
      return { valid: false };
    }
    if (!cleanTarget.startsWith("http://") && !cleanTarget.startsWith("https://")) {
      cleanTarget = `${checkType.toLowerCase()}://${cleanTarget}`;
    }
    try {
      const parsed = new URL(cleanTarget);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { valid: false };
      }
      return { valid: true, formattedUrl: cleanTarget };
    } catch {
      return { valid: false };
    }
  }
  return { valid: false };
}

describe("Security & Validation Audit: Network Tools & Uptime Input Tests", () => {
  it("harus meloloskan domain FQDN dan IP address yang valid", () => {
    expect(validateTargetHost("192.168.1.1")).toBe(true);
    expect(validateTargetHost("10.15.0.254")).toBe(true);
    expect(validateTargetHost("binasaranasukses.co.id")).toBe(true);
    expect(validateTargetHost("sub.domain.corp.net")).toBe(true);
  });

  it("harus MENOLAK input berbahaya (Command Injection & Traversal)", () => {
    expect(validateTargetHost("192.168.1.1; rm -rf /")).toBe(false);
    expect(validateTargetHost("192.168.1.1 && whoami")).toBe(false);
    expect(validateTargetHost("192.168.1.1 | cat /etc/passwd")).toBe(false);
    expect(validateTargetHost("`reboot`")).toBe(false);
    expect(validateTargetHost("$(whoami)")).toBe(false);
    expect(validateTargetHost("-c 1 127.0.0.1")).toBe(false);
  });

  it("harus memvalidasi URL pada Uptime Monitor dengan protokol aman", () => {
    const validHttp = sanitizeUrlProtocol("portal.binasaranasukses.co.id", "HTTPS");
    expect(validHttp.valid).toBe(true);
    expect(validHttp.formattedUrl).toBe("https://portal.binasaranasukses.co.id");

    const invalidProto = sanitizeUrlProtocol("javascript:alert(1)", "HTTP");
    expect(invalidProto.valid).toBe(false);

    const fileProto = sanitizeUrlProtocol("file:///etc/shadow", "HTTPS");
    expect(fileProto.valid).toBe(false);
  });
});
