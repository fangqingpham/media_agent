"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";

type Row = Record<string, unknown>;

export default function AutomationLogsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [runs, setRuns] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      try { setRuns((await api("/api/automation-logs")) ?? []); }
      catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
      setReady(true);
    })();
  }, [router]);

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const color = (s: string) => (s === "success" ? "#0a7d36" : s === "failed" ? "#c0271a" : "#b8730a");
  const th = { textAlign: "left" as const, fontSize: 12, color: "#666", borderBottom: "1px solid #ddd", padding: "6px 8px" };
  const td = { fontSize: 13, padding: "6px 8px", borderBottom: "1px solid #f0f0f0", verticalAlign: "top" as const };

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 24 }}>Automation logs</h1>
        <Link href="/automation-rules" style={{ fontSize: 13 }}>← Rules</Link>
      </div>
      <p style={{ color: "#666", fontSize: 14 }}>Every rule evaluation: what fired, what it did, and anything skipped or failed.</p>
      {msg && <p style={{ background: "#fdeaea", padding: 10, borderRadius: 6 }}>{msg}</p>}

      {runs.length === 0 ? <p style={{ color: "#666" }}>No runs yet. Create a rule and click “Run now”.</p> : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr><th style={th}>When</th><th style={th}>Rule</th><th style={th}>Trigger</th><th style={th}>Status</th><th style={th}>Action / detail</th></tr></thead>
          <tbody>
            {runs.map((r) => {
              const rule = (r.automation_rules as Row) || {};
              return (
                <tr key={r.id as string}>
                  <td style={td}>{new Date(r.created_at as string).toLocaleString()}</td>
                  <td style={td}>{(rule.name as string) || "—"}</td>
                  <td style={td}>{r.trigger as string}</td>
                  <td style={{ ...td, color: color(r.status as string) }}>{r.status as string}</td>
                  <td style={td}>
                    {(r.action_taken as string) || ""}
                    {r.detail ? <div style={{ fontSize: 12, color: "#888" }}>{r.detail as string}</div> : null}
                    {r.error_message ? <div style={{ fontSize: 12, color: "#c0271a" }}>{r.error_message as string}</div> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
