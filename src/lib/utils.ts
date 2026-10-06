import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "OK":
      return "text-status-ok";
    case "Warning":
      return "text-status-warning";
    case "Down":
      return "text-status-down";
    case "Paused":
      return "text-status-paused";
    default:
      return "text-status-unknown";
  }
}

export function getStatusBgColor(status: string): string {
  switch (status) {
    case "OK":
      return "bg-status-ok-bg";
    case "Warning":
      return "bg-status-warning-bg";
    case "Down":
      return "bg-status-down-bg";
    case "Paused":
      return "bg-status-paused-bg";
    default:
      return "bg-noc-surface";
  }
}

export function getStatusDotClass(status: string): string {
  switch (status) {
    case "OK":
      return "status-dot-ok";
    case "Warning":
      return "status-dot-warning";
    case "Down":
      return "status-dot-down";
    case "Paused":
      return "status-dot-paused";
    default:
      return "status-dot-unknown";
  }
}

export function parseNumericValue(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : null;
}

export function parseUnit(value: string | null): string {
  if (!value) return "";
  const match = value.match(/[\d.]+\s*(.+)/);
  return match ? match[1].trim() : "";
}

export function timeAgo(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>?/gm, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

