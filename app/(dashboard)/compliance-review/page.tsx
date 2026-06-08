"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { RiskBadge } from "@/components/badges";

type Row = Record<string, unknown>;

export default function ComplianceReviewQueuePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [queue, setQueue] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ad-hoc checker
  const [text, setText] = useState("");
  const [result, setResult] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setQueue((await api("/api/compliance/queue")) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      await load();
      setReady(true);
    })();
  }, [router, load]);

  const check = async () => {
    if (!text.trim()) return;
    setBusy(true); setMsg(null); setResult(null);
    try {
      const res = await api("/api/compliance/review", { method: "POST", body: JSON.stringify({ text }) });
      setResult(res.review);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Check failed"); }
    finally { setBusy(false); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 } as const;
  const input = { width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" as const };
  const list = (a: unknown) => (Array.isArray(a) ? (a as string[]) : []);

  return (
    <main style={{ maxWidth: 860, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Compliance review</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Review mortgage, lending, landlord/tenant, and buying/selling content for risky claims before
        it goes out. High-risk posts must be approved here before the publisher will post them. This
        is a risk check, not legal advice.
      </p>
      {msg && <p style={{ background: "#fdeaea", padding: 10, borderRadius: 6 }}>{msg}</p>}

      {/* queue */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Needs review ({queue.length})</h2>
        {queue.length === 0 ? <p style={{ color: "#666" }}>Nothing flagged right now.</p> : (
          <div style={{ display: "grid", gap: 8 }}>
            {queue.map((p) => (
              <Link key={p.id as string} href={`/compliance-review/${p.id}`}
                style={{ textDecoration: "none", color: "inherit", border: "1px solid #eee", borderRadius: 6, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <strong>{(p.title as string) || "(untitled)"}</strong>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <RiskBadge risk={(p.compliance_risk as string) || "low"} />
                    {p.human_approval_required ? <span style={{ fontSize: 12, color: "#c0271a" }}>approval req.</span> : null}
                    {p.latest_decision ? <span style={{ fontSize: 12, color: p.latest_decision === "approved" ? "#0a7d36" : "#b8730a" }}>{p.latest_decision as string}</span> : null}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>{p.platform as string} · {p.status as string}</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ad-hoc checker */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Check any text</h2>
        <p style={{ fontSize: 13, color: "#666" }}>Paste a caption or claim to test it (e.g. “Guaranteed mortgage approval”).</p>
        <textarea style={{ ...input, minHeight: 70 }} value={text} onChange={(e) => setText(e.target.value)} />
        <button onClick={check} disabled={busy || !text.trim()} style={{ marginTop: 10, padding: "10px 18px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6 }}>
          {busy ? "Checking…" : "Check content"}
        </button>

        {result && (
          <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <RiskBadge risk={result.risk_level as string} />
              <span style={{ fontSize: 13, color: result.can_publish ? "#0a7d36" : "#c0271a" }}>
                {result.can_publish ? "can publish (with care)" : "should not publish as-is"}
              </span>
            </div>
            {result.why_risky ? <p style={{ fontSize: 14 }}>{result.why_risky as string}</p> : null}
            {list(result.issues_found).length > 0 && (
              <><strong style={{ fontSize: 13 }}>Issues</strong><ul style={{ fontSize: 13 }}>{list(result.issues_found).map((x, i) => <li key={i}>{x}</li>)}</ul></>
            )}
            {list(result.scanner_matched).length > 0 && (
              <p style={{ fontSize: 13, color: "#b8730a" }}>Scanner flags: {list(result.scanner_matched).join(", ")}</p>
            )}
            {list(result.disclaimers).length > 0 && (
              <><strong style={{ fontSize: 13 }}>Disclaimers needed</strong><ul style={{ fontSize: 13 }}>{list(result.disclaimers).map((x, i) => <li key={i}>{x}</li>)}</ul></>
            )}
            {result.safer_rewrite ? (
              <div style={{ marginTop: 6 }}>
                <strong style={{ fontSize: 13 }}>Safer rewrite</strong>
                <div style={{ background: "#f0f7ee", border: "1px solid #cfe6c8", borderRadius: 6, padding: 8, fontSize: 14 }}>{result.safer_rewrite as string}</div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
