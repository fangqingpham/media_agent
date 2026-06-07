"use client";
import { LEAD_STATUS_LABELS } from "@/lib/leadTypes";

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    low: { bg: "#eef0f2", fg: "#555" },
    medium: { bg: "#e7f0fd", fg: "#0a58ca" },
    high: { bg: "#fff4e0", fg: "#b8730a" },
    urgent: { bg: "#fdeaea", fg: "#c0271a" },
  };
  const c = map[priority] ?? map.medium;
  return (
    <span style={{ background: c.bg, color: c.fg, padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
      {priority}
    </span>
  );
}

export function LeadStatusBadge({ status }: { status: string }) {
  return (
    <span style={{ border: "1px solid #bbb", color: "#444", padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
      {LEAD_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span style={{ color: "#999", fontSize: 12 }}>unscored</span>;
  }
  const fg = score >= 85 ? "#c0271a" : score >= 65 ? "#b8730a" : score >= 40 ? "#0a58ca" : "#777";
  return (
    <span style={{ border: `2px solid ${fg}`, color: fg, padding: "1px 8px", borderRadius: 999, fontSize: 13, fontWeight: 700 }}>
      {score}
    </span>
  );
}
