import https from "https";

export interface PrtgConfig {
  baseUrl: string;
  apiToken?: string;
  ignoreSsl?: boolean;
}

export interface PrtgSensorRaw {
  objid: number;
  probe: string;
  group: string;
  device: string;
  sensor: string;
  status: string;
  status_raw: number;
  lastvalue: string;
  message?: string;
}

const httpsAgent = new https.Agent({
  rejectUnauthorized: false, // For internal PRTG self-signed SSL certs
});

export class PrtgClient {
  private baseUrl: string;
  private apiToken: string;
  private ignoreSsl: boolean;

  constructor(config: PrtgConfig) {
    this.baseUrl = (config.baseUrl || "").replace(/\/+$/, "");
    this.apiToken = config.apiToken || "";
    this.ignoreSsl = config.ignoreSsl ?? true;
  }

  private getFetchOptions(): RequestInit {
    // Next.js server-side fetch with optional self-signed SSL agent
    return {
      cache: "no-store",
      // @ts-ignore
      agent: this.ignoreSsl ? httpsAgent : undefined,
    };
  }

  /**
   * Test connection to PRTG server
   */
  async testConnection(): Promise<{ ok: boolean; message: string; version?: string }> {
    if (!this.baseUrl) {
      return { ok: false, message: "PRTG Base URL is not configured" };
    }

    try {
      const url = new URL(`${this.baseUrl}/api/status.json`);
      if (this.apiToken) {
        url.searchParams.set("apitoken", this.apiToken);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(url.toString(), {
        ...this.getFetchOptions(),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return {
          ok: false,
          message: `PRTG server responded with HTTP status ${res.status} (${res.statusText})`,
        };
      }

      const data = await res.json();
      return {
        ok: true,
        message: `Successfully connected to PRTG Network Monitor (v${data.version || "Enterprise"})`,
        version: data.version,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        return { ok: false, message: "Connection timed out after 7 seconds" };
      }
      return { ok: false, message: `Connection failed: ${err.message}` };
    }
  }

  /**
   * Fetch all sensors from PRTG
   */
  async fetchSensors(): Promise<PrtgSensorRaw[]> {
    if (!this.baseUrl) {
      throw new Error("PRTG Base URL is not configured");
    }

    const url = new URL(`${this.baseUrl}/api/table.json`);
    url.searchParams.set("content", "sensors");
    url.searchParams.set("output", "json");
    url.searchParams.set("columns", "objid,probe,group,device,sensor,status,lastvalue,message,status_raw");
    url.searchParams.set("count", "2500");
    if (this.apiToken) {
      url.searchParams.set("apitoken", this.apiToken);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url.toString(), {
      ...this.getFetchOptions(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`PRTG responded with HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    return data.sensors || [];
  }

  /**
   * Acknowledge sensor alert in PRTG
   */
  async acknowledgeAlarm(sensorId: number, ackMessage: string): Promise<boolean> {
    if (!this.baseUrl) return false;

    try {
      const url = new URL(`${this.baseUrl}/api/acknowledgealarm.htm`);
      url.searchParams.set("id", String(sensorId));
      url.searchParams.set("ackmsg", ackMessage);
      if (this.apiToken) {
        url.searchParams.set("apitoken", this.apiToken);
      }

      const res = await fetch(url.toString(), this.getFetchOptions());
      return res.ok;
    } catch (err) {
      console.error(`Failed to acknowledge alarm for sensor ${sensorId} in PRTG:`, err);
      return false;
    }
  }
}
