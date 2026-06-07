"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";

type Attempt = Record<string, unknown>;

export default function PublishLogsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<Attempt[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows((await api("/api/publish-logs")) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      await load();
      setReady(true);
    })();
  }, [router, load]);

  const retry = async (postId: string) => {
    setBusy(postId); setMsg(null);
    try {
      await api("/api/social/facebook/publish", { method: "POST", body: JSON.stringify({ postId }) });
      setMsg("Republished.");
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Retry failed"); }
    finally { setBusy(null); }
  };

  const runScheduler = async () => {
    setBusy("scheduler"); setMsg(null);
    try {
      const r = await api("/api/social/scheduler/run", { method: "POST" });
      setMsg(`Scheduler ran: processed ${r.processed ?? 0} due post(s).`);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Scheduler failed"); }
    finally { setBusy(null); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const th = { textAlign: "left" as const, padding: "6px 8px", fontSize: 12, color: "#666", borderBottom: "1px solid #ddd" };
  const td = { padding: "6px 8px", fontSize: 13, borderBottom: "1px solid #f0f0f0", verticalAlign: "top" as const };

  return (
    <main style={{ maxWidth: 1100, margin: "32px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24 }}>Publish logs</h1>
        <button onClick={runScheduler} disabled={busy !== null}>{busy === "scheduler" ? "Running…" : "Run scheduler now"}</button>
      </div>
      {msg && <p>{msg}</p>}

      {rows.length === 0 ? <p style={{ color: "#666" }}>No publish attempts yet.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>{["Post", "Platform", "Time", "Trigger", "Status", "Post ID / Error", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id as string}>
                  <td style={td}>{r.post_title as string}</td>
                  <td style={td}>{r.platform as string}</td>
                  <td style={td}>{new Date(r.created_at as string).toLocaleString()}</td>
                  <td style={td}>{r.trigger as string}</td>
                  <td style={{ ...td, color: r.status === "success" ? "#0a7d36" : "#c0271a", fontWeight: 600 }}>{r.status as string}</td>
                  <td style={td}>
                    {r.status === "success"
                      ? <a href={(r.published_url as string) || "#"} target="_blank" rel="noreferrer" style={{ color: "#0a58ca" }}>{r.platform_post_id as string}</a>
                      : <span style={{ color: "#c0271a" }}>{r.error_message as string}</span>}
                  </td>
                  <td style={td}>
                    {r.status === "failed" && r.post_id ? (
                      <button onClick={() => retry(r.post_id as string)} disabled={busy !== null}>Retry</button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
