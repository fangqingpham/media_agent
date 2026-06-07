"use client";
import { useState } from "react";
import { STATUS_LABELS } from "@/lib/contentTypes";

export function RiskBadge({ risk }: { risk: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    low: { bg: "#e6f7ed", fg: "#0a7d36" },
    medium: { bg: "#fff4e0", fg: "#b8730a" },
    high: { bg: "#fdeaea", fg: "#c0271a" },
  };
  const c = map[risk] ?? map.low;
  return (
    <span style={{ background: c.bg, color: c.fg, padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
      {risk}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    idea: "#888",
    draft: "#888",
    pending_approval: "#b8730a",
    needs_revision: "#b8730a",
    approved: "#0a7d36",
    ready_to_post: "#0a58ca",
    scheduled: "#0a58ca",
    scheduled_manually: "#0a58ca",
    posted: "#0a7d36",
    rejected: "#c0271a",
  };
  const fg = map[status] ?? "#444";
  return (
    <span style={{ border: `1px solid ${fg}`, color: fg, padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button onClick={copy} style={{ fontSize: 13, padding: "4px 10px" }}>
      {copied ? "✓ Copied" : label}
    </button>
  );
}
