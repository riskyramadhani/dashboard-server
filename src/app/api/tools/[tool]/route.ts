import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { execFile } from "child_process";
import { promisify } from "util";
import net from "net";
import dns from "dns/promises";

const execFileAsync = promisify(execFile);

// Target validation regex: IPv4 or valid FQDN domain
const TARGET_REGEX = /^(?:(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|(?:\d{1,3}\.){3}\d{1,3})$/;

// Simple in-memory rate limiter: max 15 requests per 30s per user
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 30000;
  const maxRequests = 15;

  const timestamps = rateLimitMap.get(userId) || [];
  const validTimestamps = timestamps.filter((t) => now - t < windowMs);

  if (validTimestamps.length >= maxRequests) {
    return false;
  }

  validTimestamps.push(now);
  rateLimitMap.set(userId, validTimestamps);
  return true;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ tool: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = (session.user as any)?.role;
    const allowedModules = ((session.user as any)?.allowedModules as string[]) || ["*"];
    const hasToolsAccess =
      role === "ADMIN" ||
      role === "NOC_OPERATOR" ||
      allowedModules.includes("TOOLS") ||
      (allowedModules.includes("*") && role !== "STAFF");

    if (!hasToolsAccess) {
      return NextResponse.json(
        { error: "Forbidden: You do not have access to network tools" },
        { status: 403 }
      );
    }

    const userId = session.user.id || (session.user as any)?.employeeId || "unknown";
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment before trying again." },
        { status: 429 }
      );
    }

    const { tool } = await context.params;
    const body = await request.json();
    const target = (body.target || "").trim();

    if (!target) {
      return NextResponse.json({ error: "Target host/IP is required" }, { status: 400 });
    }

    if (!TARGET_REGEX.test(target)) {
      return NextResponse.json(
        { error: "Invalid target. Must be a valid IPv4 address or domain name (e.g. 192.168.1.1 or example.com)" },
        { status: 400 }
      );
    }

    let output = "";
    let stats: Record<string, string | number> | undefined;

    // 1. PING TOOL
    if (tool === "ping") {
      const count = Math.min(Math.max(parseInt(body.count || "4"), 1), 10);
      const timeout = Math.min(Math.max(parseInt(body.timeout || "2"), 1), 5);

      try {
        // macOS and Linux compatible ping command
        const { stdout } = await execFileAsync("ping", ["-c", String(count), "-W", String(timeout * 1000), target], {
          timeout: 15000,
        });
        output = stdout;

        // Parse summary stats
        const lossMatch = stdout.match(/(\d+(?:\.\d+)?)%\s+packet\s+loss/i);
        const rttMatch = stdout.match(/(?:round-trip|rtt)[^=]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i);

        stats = {
          packetLoss: lossMatch ? `${lossMatch[1]}%` : "0%",
          min: rttMatch ? `${rttMatch[1]} ms` : "-",
          avg: rttMatch ? `${rttMatch[2]} ms` : "-",
          max: rttMatch ? `${rttMatch[3]} ms` : "-",
        };
      } catch (err: any) {
        output = err.stdout || err.stderr || err.message;
        stats = { packetLoss: "100%", avg: "Timeout" };
      }
    }

    // 2. TRACEROUTE TOOL
    else if (tool === "traceroute") {
      try {
        // Run traceroute with max 15 hops and 2s wait per hop
        const { stdout } = await execFileAsync("traceroute", ["-m", "15", "-w", "2", target], {
          timeout: 25000,
        });
        output = stdout;
      } catch (err: any) {
        output = err.stdout || err.stderr || `Traceroute finished with errors: ${err.message}`;
      }
    }

    // 3. PORT CHECK TOOL
    else if (tool === "portcheck") {
      const rawPorts = body.ports || "80, 443, 22, 3389, 5432";
      const portNumbers = rawPorts
        .split(",")
        .map((p: string) => parseInt(p.trim()))
        .filter((p: number) => !isNaN(p) && p >= 1 && p <= 65535)
        .slice(0, 10); // max 10 ports at once

      if (portNumbers.length === 0) {
        return NextResponse.json({ error: "No valid ports specified (1-65535)" }, { status: 400 });
      }

      const results = await Promise.all(
        portNumbers.map(
          (port: number) =>
            new Promise<{ port: number; open: boolean; latency: number }>((resolve) => {
              const start = Date.now();
              const socket = new net.Socket();
              let resolved = false;

              socket.setTimeout(2500);

              socket.on("connect", () => {
                if (!resolved) {
                  resolved = true;
                  const latency = Date.now() - start;
                  socket.destroy();
                  resolve({ port, open: true, latency });
                }
              });

              socket.on("timeout", () => {
                if (!resolved) {
                  resolved = true;
                  socket.destroy();
                  resolve({ port, open: false, latency: -1 });
                }
              });

              socket.on("error", () => {
                if (!resolved) {
                  resolved = true;
                  socket.destroy();
                  resolve({ port, open: false, latency: -1 });
                }
              });

              socket.connect(port, target);
            })
        )
      );

      const wellKnownServices: Record<number, string> = {
        21: "FTP",
        22: "SSH",
        25: "SMTP",
        53: "DNS",
        80: "HTTP",
        110: "POP3",
        143: "IMAP",
        443: "HTTPS",
        1433: "MSSQL",
        3306: "MySQL",
        3389: "RDP",
        5432: "PostgreSQL",
        8080: "HTTP-Alt",
        8443: "HTTPS-Alt",
      };

      const lines = results.map((r) => {
        const service = wellKnownServices[r.port] ? ` (${wellKnownServices[r.port]})` : "";
        const statusStr = r.open ? `[OPEN] Response time: ${r.latency} ms` : `[CLOSED / FILTERED]`;
        return `Port ${String(r.port).padEnd(5)}${service.padEnd(16)} : ${statusStr}`;
      });

      output = [`Target Host: ${target}`, `Tested at:   ${new Date().toISOString()}`, "", ...lines].join("\n");
      const openCount = results.filter((r) => r.open).length;
      stats = {
        totalPorts: portNumbers.length,
        openPorts: openCount,
        closedPorts: portNumbers.length - openCount,
      };
    }

    // 4. DNS LOOKUP TOOL
    else if (tool === "dns") {
      const recordType = (body.type || "A").toUpperCase();
      try {
        let dnsData: any;
        if (recordType === "A") {
          dnsData = await dns.resolve4(target);
        } else if (recordType === "AAAA") {
          dnsData = await dns.resolve6(target);
        } else if (recordType === "MX") {
          dnsData = await dns.resolveMx(target);
        } else if (recordType === "TXT") {
          dnsData = await dns.resolveTxt(target);
        } else if (recordType === "NS") {
          dnsData = await dns.resolveNs(target);
        } else if (recordType === "CNAME") {
          dnsData = await dns.resolveCname(target);
        } else {
          dnsData = await dns.lookup(target);
        }

        output = [
          `;; QUESTION SECTION:`,
          `;${target}. IN ${recordType}`,
          ``,
          `;; ANSWER SECTION:`,
          JSON.stringify(dnsData, null, 2),
        ].join("\n");
      } catch (err: any) {
        output = `DNS resolution error for ${target} (${recordType}): ${err.message}`;
      }
    } else {
      return NextResponse.json({ error: `Unsupported tool: ${tool}` }, { status: 400 });
    }

    // Log to AuditLog asynchronously
    try {
      const dbUser = await prisma.user.findFirst({
        where: {
          OR: [{ id: userId }, { employeeId: (session.user as any)?.employeeId || "" }],
        },
      });
      if (dbUser) {
        await prisma.auditLog.create({
          data: {
            userId: dbUser.id,
            action: `NETWORK_TOOL_${tool.toUpperCase()}`,
            target,
            detail: `Executed ${tool} on target ${target}`,
          },
        });
      }
    } catch (auditErr) {
      console.warn("Audit log writing failed:", auditErr);
    }

    return NextResponse.json({ output, stats });
  } catch (error: any) {
    console.error("Tool execution failed:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
