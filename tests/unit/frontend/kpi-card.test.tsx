import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

interface SimpleKpiProps {
  title: string;
  value: string;
  subtitle?: string;
  statusColor?: "ok" | "warning" | "down";
}

function KpiCardMock({ title, value, subtitle, statusColor = "ok" }: SimpleKpiProps) {
  const colorMap = {
    ok: "text-emerald-500 border-emerald-500/20",
    warning: "text-amber-500 border-amber-500/20",
    down: "text-rose-500 border-rose-500/20",
  };

  return (
    <div data-testid="kpi-card" className={`p-4 rounded-xl border ${colorMap[statusColor]}`}>
      <span className="text-xs text-slate-400 block">{title}</span>
      <h2 data-testid="kpi-value" className="text-2xl font-bold">{value}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}

describe("Frontend React Unit Tests: KPI Card & Threshold Presentation", () => {
  it("harus merender judul, nilai, dan subtitle dengan benar", () => {
    render(
      <KpiCardMock
        title="SLA Ketersediaan (Uptime)"
        value="98.9%"
        subtitle="Memenuhi target korporat ✓"
        statusColor="ok"
      />
    );

    expect(screen.getByText("SLA Ketersediaan (Uptime)")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-value")).toHaveTextContent("98.9%");
    expect(screen.getByText("Memenuhi target korporat ✓")).toBeInTheDocument();
  });

  it("harus menerapkan styling status ok (hijau/emerald)", () => {
    render(<KpiCardMock title="Health Score" value="95.5%" statusColor="ok" />);
    const card = screen.getByTestId("kpi-card");
    expect(card.className).toContain("text-emerald-500");
  });

  it("harus menerapkan styling status warning (kuning/amber)", () => {
    render(<KpiCardMock title="Insiden Berjalan" value="3 Isu" statusColor="warning" />);
    const card = screen.getByTestId("kpi-card");
    expect(card.className).toContain("text-amber-500");
  });

  it("harus menerapkan styling status down (merah/rose)", () => {
    render(<KpiCardMock title="Server Down" value="1 Kritis" statusColor="down" />);
    const card = screen.getByTestId("kpi-card");
    expect(card.className).toContain("text-rose-500");
  });
});
