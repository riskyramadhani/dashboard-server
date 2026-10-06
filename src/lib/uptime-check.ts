import net from "net";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";

const execFileAsync = promisify(execFile);
const IS_MACOS = os.platform() === "darwin";

export interface CheckResult {
  status: "UP" | "DOWN";
  responseMs?: number;
  statusCode?: number;
  error?: string;
}

/**
 * Normalise any thrown error into a short, readable string.
 */
function errorMessage(err: any, defaultMsg = "Unknown error"): string {
  const raw: string = err?.message ?? err?.code ?? defaultMsg;

  // Common network error patterns → friendly messages
  if (/connection reset/i.test(raw)) return "Connection reset by peer";
  if (/ECONNREFUSED/.test(raw)) return "Connection refused";
  if (/ECONNRESET/.test(raw)) return "Connection reset";
  if (/ETIMEDOUT|timed? out/i.test(raw)) return "Connection timed out";
  if (/ENOTFOUND|getaddrinfo/i.test(raw)) return "DNS resolution failed";
  if (/EHOSTUNREACH/.test(raw)) return "Host unreachable";
  if (/AbortError|abort/i.test(raw)) return "Connection timed out";
  if (/UND_ERR/i.test(raw)) return "Network error";

  // Truncate at 120 chars to avoid blowing up DB column
  return raw.slice(0, 120);
}

/**
 * HTTP/HTTPS check — GETs the target URL and measures response time.
 * The response body is consumed (and discarded) only when a keyword match
 * is required; otherwise we close the connection right after headers.
 */
export async function checkHttp(
  target: string,
  timeoutMs: number,
  expectedStatus?: number,
  keyword?: string
): Promise<CheckResult> {
  const start = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(target, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "NOC-Dashboard-Uptime/1.0" },
      redirect: "follow",
    });

    clearTimeout(timer);
    const responseMs = Date.now() - start;
    const expected = expectedStatus ?? 200;

    if (res.status !== expected) {
      // Drain / abort the body so the socket is released cleanly
      try { await res.body?.cancel(); } catch { /* ignore */ }
      return {
        status: "DOWN",
        responseMs,
        statusCode: res.status,
        error: `Expected HTTP ${expected}, got ${res.status}`,
      };
    }

    if (keyword) {
      let body = "";
      try {
        body = await res.text();
      } catch (bodyErr) {
        // Body read failed after headers OK — treat as DOWN
        return {
          status: "DOWN",
          responseMs,
          statusCode: res.status,
          error: `Body read error: ${errorMessage(bodyErr)}`,
        };
      }
      if (!body.includes(keyword)) {
        return {
          status: "DOWN",
          responseMs,
          statusCode: res.status,
          error: `Keyword "${keyword}" not found in response body`,
        };
      }
    } else {
      // Not reading body — release the socket
      try { await res.body?.cancel(); } catch { /* ignore */ }
    }

    return { status: "UP", responseMs, statusCode: res.status };
  } catch (err: any) {
    clearTimeout(timer);
    return {
      status: "DOWN",
      responseMs: Date.now() - start,
      error: errorMessage(err, "HTTP check failed"),
    };
  }
}

/**
 * PING (ICMP) check — runs the system `ping` command.
 * Handles macOS vs Linux flag differences.
 */
export async function checkPing(
  target: string,
  timeoutMs: number
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));

    // macOS: -W <ms>  |  Linux: -W <seconds>
    const waitArg = IS_MACOS ? String(timeoutMs) : String(timeoutSec);

    const { stdout } = await execFileAsync(
      "ping",
      ["-c", "1", "-W", waitArg, target],
      { timeout: timeoutMs + 3000 }
    );

    const rttMatch = stdout.match(/time[=<]([\d.]+)\s*ms/i);
    const responseMs = rttMatch
      ? Math.round(parseFloat(rttMatch[1]))
      : Date.now() - start;

    return { status: "UP", responseMs };
  } catch (err: any) {
    return {
      status: "DOWN",
      responseMs: Date.now() - start,
      error: errorMessage(err, "Host unreachable"),
    };
  }
}

/**
 * TCP Port check — attempts to open a TCP socket to host:port.
 */
export async function checkTcpPort(
  target: string,
  port: number,
  timeoutMs: number
): Promise<CheckResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: CheckResult) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      finish({ status: "UP", responseMs: Date.now() - start });
    });

    socket.on("timeout", () => {
      finish({
        status: "DOWN",
        responseMs: Date.now() - start,
        error: "Connection timed out",
      });
    });

    socket.on("error", (err) => {
      finish({
        status: "DOWN",
        responseMs: Date.now() - start,
        error: errorMessage(err, "TCP connect failed"),
      });
    });

    try {
      socket.connect(port, target);
    } catch (err) {
      finish({
        status: "DOWN",
        responseMs: Date.now() - start,
        error: errorMessage(err, "TCP connect failed"),
      });
    }
  });
}

/**
 * Dispatch the correct check type based on the monitor config.
 * All errors are caught here — this function NEVER throws.
 */
export async function runUptimeCheck(monitor: {
  checkType: "HTTP" | "HTTPS" | "PING" | "TCP_PORT";
  target: string;
  port?: number | null;
  timeoutMs: number;
  expectedStatus?: number | null;
  keyword?: string | null;
}): Promise<CheckResult> {
  const { checkType, target, port, timeoutMs, expectedStatus, keyword } = monitor;

  try {
    switch (checkType) {
      case "HTTP":
      case "HTTPS":
        return await checkHttp(
          target,
          timeoutMs,
          expectedStatus ?? undefined,
          keyword ?? undefined
        );
      case "PING":
        return await checkPing(target, timeoutMs);
      case "TCP_PORT":
        if (!port) return { status: "DOWN", error: "TCP_PORT check requires a port number" };
        return await checkTcpPort(target, port, timeoutMs);
      default:
        return { status: "DOWN", error: "Unsupported check type" };
    }
  } catch (err: any) {
    // Safety net — individual check functions should never throw,
    // but if they do we capture it here.
    return {
      status: "DOWN",
      error: errorMessage(err, "Unexpected check error"),
    };
  }
}
