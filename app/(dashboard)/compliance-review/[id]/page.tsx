"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { RiskBadge } from "@/components/badges";

type Row = Record<string, unknown>;

export default function ComplianceReviewDetailPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params?.id as string;

  const [ready, setReady] = useState(false);
  const [post, setPost] = useState<Row | null>(null);
  const [review, setReview] = useState<Row | null>(null);
  const [flags, setFlags] = useState<Row[]>([]);
  const [decisions, setDecisions] = useState<Row[]>([]);
  const [rewrites, setRewrites] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const res = await api(`/api/posts/${postId}/compliance`);
    setPost(res.post);
    setReview(res.review);
    setFlags(res.flags ?? []);
    setDecisions(res.decisions ?? []);
    setRewrites(res.rewrites ?? []);
  }, [postId]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      try { await load(); } catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
      setReady(true);
    })();
  }, [router, load]);

  const runReview = async () => {
    setBusy(true); setMsg(null);
    try { await api(`/api/posts/${postId}/compliance`, { method: "POST" }); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Review failed"); }
    finally { setBusy(false); }
  };

  const decide = async (decision: string) => {
    if (!review) return;
    setBusy(true); setMsg(null);
    try {
      await api(`/api/compliance/reviews/${review.id}/decide`, { method: "POST", body: JSON.stringify({ decision, note: note || null }) });
      setNote(""); setMsg(`Decision recorded: ${decision}.`); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Decision failed"); }
    finally { setBusy(false); }
  };

  const applyRewrite = async () => {
    if (!review) return;
    if (!confirm("Replace the post caption with the safer rewrite?")) return;
    setBusy(true); setMsg(null);
    try { await api(`/api/compliance/reviews/${review.id}/apply-rewrite`, { method: "POST" }); setMsg("Rewrite applied to the post caption."); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Apply failed"); }
    finally { setBusy(false); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;
  if (!post) return <main style={{ padding: 24 }}>{msg || "Post not found"} <Link href="/compliance-review">Back</Link></main>;

  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 } as const;
  const input = { width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" as const };
  const list = (a: unknown) => (Array.isArray(a) ? (a as string[]) : []);
  const caption = (post.platform_caption as string) || (post.caption as string) || "";

  return (
    <main style={{ maxWidth: 860, margin: "32px auto", padding: "0 16px" }}>
      <Link href="/compliance-review" style={{ fontSize: 13, color: "#0070f3" }}>← Compliance queue</Link>
      <h1 style={{ fontSize: 22 }}>{(post.title as string) || "Untitled post"}</h1>
      <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
        {post.platform as string} · {post.status as string} · post risk: <RiskBadge risk={(post.compliance_risk as string) || "low"} />
      </div>
      {msg && <p style={{ background: msg.includes("recorded") || msg.includes("applied") ? "#e6f7ed" : "#fdeaea", padding: 10, borderRadius: 6 }}>{msg}</p>}

      {/* original content */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Original content</h2>
        {post.hook ? <p style={{ fontSize: 14 }}><strong>Hook:</strong> {post.hook as string}</p> : null}
        <div style={{ background: "#f7f7f7", borderRadius: 6, padding: 10, whiteSpace: "pre-wrap", fontSize: 14 }}>{caption || "(no caption)"}</div>
        {post.cta ? <p style={{ fontSize: 14 }}><strong>CTA:</strong> {post.cta as string}</p> : null}
        <Link href={`/drafts/${postId}`} style={{ fontSize: 13 }}>Open in draft editor ↗</Link>
      </div>

      {/* review */}
      {!review ? (
        <div style={box}>
          <p style={{ color: "#666" }}>No compliance review yet.</p>
          <button onClick={runReview} disabled={busy} style={{ padding: "10px 18px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6 }}>
            {busy ? "Reviewing…" : "Run AI compliance review"}
          </button>
        </div>
      ) : (
        <>
          <div style={box}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>AI compliance review</h2>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <RiskBadge risk={review.risk_level as string} />
                <span style={{ fontSize: 13, color: review.can_publish ? "#0a7d36" : "#c0271a" }}>
                  {review.can_publish ? "can publish (with care)" : "blocked as-is"}
                </span>
              </span>
            </div>
            <button onClick={runReview} disabled={busy} style={{ marginTop: 6, fontSize: 12 }}>Re-run review</button>

            {review.why_risky ? <p style={{ fontSize: 14, marginTop: 8 }}>{review.why_risky as string}</p> : null}

            {list(review.issues_found).length > 0 && (
              <><strong style={{ fontSize: 13 }}>Issues found</strong>
              <ul style={{ fontSize: 14 }}>{list(review.issues_found).map((x, i) => <li key={i}>{x}</li>)}</ul></>
            )}

            {flags.length > 0 && (
              <><strong style={{ fontSize: 13 }}>Risk flags</strong>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
                {flags.map((fl) => (
                  <span key={fl.id as string} title={(fl.detail as string) || ""}
                    style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: fl.source === "scanner" ? "#fde7d2" : "#fdeaea", color: "#7a2e12" }}>
                    {(fl.phrase as string) || (fl.flag_type as string)}{fl.source === "scanner" ? " ⚑" : ""}
                  </span>
                ))}
              </div></>
            )}

            {list(review.disclaimers).length > 0 && (
              <><strong style={{ fontSize: 13 }}>Required disclaimers</strong>
              <ul style={{ fontSize: 14 }}>{list(review.disclaimers).map((x, i) => <li key={i}>{x}</li>)}</ul></>
            )}

            {review.reviewer_notes ? <p style={{ fontSize: 13, color: "#555" }}><em>{review.reviewer_notes as string}</em></p> : null}

            {review.safer_rewrite ? (
              <div style={{ marginTop: 8 }}>
                <strong style={{ fontSize: 13 }}>Suggested safer rewrite</strong>
                <div style={{ background: "#f0f7ee", border: "1px solid #cfe6c8", borderRadius: 6, padding: 10, fontSize: 14, whiteSpace: "pre-wrap" }}>{review.safer_rewrite as string}</div>
                <button onClick={applyRewrite} disabled={busy} style={{ marginTop: 6, background: "#0a7d36", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px" }}>
                  Apply rewrite to post
                </button>
              </div>
            ) : null}
          </div>

          {/* admin decision */}
          <div style={box}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Admin decision</h2>
            {review.risk_level === "high" && (
              <p style={{ fontSize: 13, color: "#c0271a" }}>This is high-risk — it must be <strong>approved</strong> here before it can be published.</p>
            )}
            <textarea style={{ ...input, minHeight: 50 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note (why you approved / what to change)" />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button onClick={() => decide("approved")} disabled={busy} style={{ background: "#0a7d36", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px" }}>Approve</button>
              <button onClick={() => decide("needs_changes")} disabled={busy} style={{ background: "#b8730a", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px" }}>Needs changes</button>
              <button onClick={() => decide("rejected")} disabled={busy} style={{ background: "#c0271a", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px" }}>Reject</button>
            </div>

            {decisions.length > 0 && (
              <ul style={{ marginTop: 10, fontSize: 13, color: "#444" }}>
                {decisions.map((d) => (
                  <li key={d.id as string}>{new Date(d.created_at as string).toLocaleString()} — <strong>{d.decision as string}</strong>{d.note ? ` · ${d.note as string}` : ""}</li>
                ))}
              </ul>
            )}
          </div>

          {rewrites.length > 0 && (
            <div style={box}>
              <h2 style={{ fontSize: 16, marginTop: 0 }}>Rewrite history</h2>
              <ul style={{ fontSize: 13, color: "#444" }}>
                {rewrites.map((r) => <li key={r.id as string}>{new Date(r.created_at as string).toLocaleString()} — caption replaced</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </main>
  );
}
