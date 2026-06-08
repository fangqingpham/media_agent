"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";

type Row = Record<string, unknown>;

export default function SocialInboxSyncPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [jobs, setJobs] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [a, j] = await Promise.all([api("/api/social-sync/status"), api("/api/social-sync/jobs")]);
    setAccounts(a ?? []);
    setJobs(j ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      await load();
      setReady(true);
    })();
  }, [router, load]);

  const sync = async (accountId?: string) => {
    setBusy(true); setMsg(null);
    try {
      const res = await api("/api/social-sync/run", { method: "POST", body: JSON.stringify({ platform: "facebook", accountId }) });
      setMsg(`Sync complete: ${res.imported} imported, ${res.skipped} duplicates skipped.`);
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Sync failed"); }
    finally { setBusy(false); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 } as const;
  const fbAccounts = accounts.filter((a) => a.platform === "facebook");

  return (
    <main style={{ maxWidth: 860, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Social inbox sync</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Pull comments from your connected Pages through the official API into your{" "}
        <Link href="/interactions">Inbox</Link>. Each imported comment is auto-classified and gets a
        draft reply — nothing is sent automatically, and sensitive items still require your approval.
      </p>
      {msg && <p style={{ background: msg.includes("complete") ? "#e6f7ed" : "#fdeaea", padding: 10, borderRadius: 6 }}>{msg}</p>}

      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Connected accounts</h2>
          {fbAccounts.length > 0 && (
            <button onClick={() => sync()} disabled={busy} style={{ padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6 }}>
              {busy ? "Syncing…" : "Sync all Facebook comments"}
            </button>
          )}
        </div>

        {accounts.length === 0 ? (
          <p style={{ color: "#666", marginTop: 10 }}>
            No connected accounts. <Link href="/settings/social-accounts">Connect a Facebook Page</Link> first.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {accounts.map((a) => {
              const last = a.last_sync as Row | null;
              return (
                <div key={a.id as string} style={{ border: "1px solid #eee", borderRadius: 6, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <strong>{a.platform as string} · {(a.account_name as string) || "(no name)"}</strong>
                    <span style={{ fontSize: 12, color: a.status === "connected" ? "#0a7d36" : "#c0271a" }}>{a.status as string}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                    Comments: {a.comments_supported ? "✓ supported" : "✗ permission missing"} · Messages: {a.messages_supported ? "✓ supported" : "✗ not available"}
                  </div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {last ? (
                      <>Last sync: {last.finished_at ? new Date(last.finished_at as string).toLocaleString() : "—"} · {last.status as string}
                      {typeof last.imported_count === "number" ? ` · ${last.imported_count} imported` : ""}
                      {last.error_message ? ` · ${last.error_message as string}` : ""}</>
                    ) : "Never synced."}
                  </div>
                  {a.platform === "facebook" && a.comments_supported ? (
                    <button onClick={() => sync(a.id as string)} disabled={busy} style={{ marginTop: 8, fontSize: 13 }}>Sync this Page</button>
                  ) : null}
                  {a.platform === "facebook" && !a.comments_supported ? (
                    <p style={{ fontSize: 12, color: "#b8730a" }}>Needs the pages_read_engagement permission. Reconnect the Page to grant it.</p>
                  ) : null}
                  {a.platform !== "facebook" ? (
                    <p style={{ fontSize: 12, color: "#b8730a" }}>{a.platform as string} sync isn’t available yet (coming after Facebook).</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <p style={{ fontSize: 12, color: "#888", marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 8 }}>
          <strong>Direct messages (DMs):</strong> reading Page messages requires the <code>pages_messaging</code>
          permission and Advanced Access via Meta App Review, which isn’t enabled on this app. Message sync is a
          future step — for now only public comments are imported.
        </p>
      </div>

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Recent sync runs</h2>
        {jobs.length === 0 ? <p style={{ color: "#666" }}>No syncs yet.</p> : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>{["When", "Status", "Imported", "Skipped", "Scanned", "Error"].map((h) => (
                <th key={h} style={{ textAlign: "left", fontSize: 12, color: "#666", borderBottom: "1px solid #ddd", padding: "6px 8px" }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id as string}>
                  <td style={{ fontSize: 13, padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>{new Date(j.created_at as string).toLocaleString()}</td>
                  <td style={{ fontSize: 13, padding: "6px 8px", borderBottom: "1px solid #f0f0f0", color: j.status === "success" ? "#0a7d36" : j.status === "failed" ? "#c0271a" : "#b8730a" }}>{j.status as string}</td>
                  <td style={{ fontSize: 13, padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>{j.imported_count as number}</td>
                  <td style={{ fontSize: 13, padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>{j.skipped_count as number}</td>
                  <td style={{ fontSize: 13, padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>{j.scanned_count as number}</td>
                  <td style={{ fontSize: 12, padding: "6px 8px", borderBottom: "1px solid #f0f0f0", color: "#c0271a" }}>{(j.error_message as string) || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
