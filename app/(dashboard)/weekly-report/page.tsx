"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";

type Snapshot = { id: string; label: string; date_from: string | null; date_to: string | null; created_at: string };
type Report = Record<string, unknown>;

// default range: last 7 days
const iso = (d: Date) => d.toISOString().slice(0, 10);
const weekAgo = () => { const d = new Date(); d.setDate(d.getDate() - 7); return iso(d); };

export default function WeeklyReportPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [from, setFrom] = useState(weekAgo());
  const [to, setTo] = useState(iso(new Date()));

  const loadSnapshots = useCallback(async (bId: string) => {
    setSnapshots((await api(`/api/analytics/snapshots?brandId=${bId}`)) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) { router.push("/brand/edit"); return; }
      setBrandId(brands[0].id);
      await loadSnapshots(brands[0].id);
      setReady(true);
    })();
  }, [router, loadSnapshots]);

  const createSnapshot = async () => {
    if (!brandId) return;
    setBusy("snap"); setMsg(null);
    try {
      const snap = await api("/api/analytics/snapshots", {
        method: "POST",
        body: JSON.stringify({ brandId, from, to, label: `Week ${from} → ${to}` }),
      });
      await loadSnapshots(brandId);
      setSelected(snap.id);
      setReport(null);
      setMsg("Snapshot created. Now generate the AI report.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Snapshot failed"); }
    finally { setBusy(null); }
  };

  const openSnapshot = async (id: string) => {
    setSelected(id); setReport(null); setMsg(null);
    try {
      const res = await api(`/api/analytics/snapshots/${id}`);
      if (res.reports && res.reports.length > 0) setReport(res.reports[0].report);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
  };

  const generate = async () => {
    if (!selected) return;
    setBusy("report"); setMsg(null);
    try {
      const r = await api(`/api/analytics/snapshots/${selected}/report`, { method: "POST" });
      setReport(r.report);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Report failed"); }
    finally { setBusy(null); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 14, marginBottom: 16 } as const;
  const r = report;
  const list = (k: string) => Array.isArray(r?.[k]) ? (r![k] as string[]) : [];
  const ideas = Array.isArray(r?.next_week_post_ideas) ? (r!.next_week_post_ideas as Record<string, string>[]) : [];

  return (
    <main style={{ maxWidth: 860, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Weekly AI Report</h1>

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>1 · Create a snapshot</h2>
        <label style={{ fontSize: 13 }}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>{" "}
        <label style={{ fontSize: 13 }}>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>{" "}
        <button onClick={createSnapshot} disabled={busy !== null}>{busy === "snap" ? "Creating…" : "Create snapshot"}</button>
      </div>

      {snapshots.length > 0 && (
        <div style={box}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>2 · Pick a snapshot</h2>
          <div style={{ display: "grid", gap: 6 }}>
            {snapshots.map((s) => (
              <button key={s.id} onClick={() => openSnapshot(s.id)}
                style={{ textAlign: "left", padding: 8, border: "1px solid #ddd", borderRadius: 6, background: selected === s.id ? "#eef4ff" : "#fff", cursor: "pointer" }}>
                {s.label} <span style={{ color: "#888", fontSize: 12 }}>· {new Date(s.created_at).toLocaleString()}</span>
              </button>
            ))}
          </div>
          {selected && (
            <button onClick={generate} disabled={busy !== null} style={{ marginTop: 10, padding: "8px 16px" }}>
              {busy === "report" ? "Generating…" : (report ? "Regenerate report" : "Generate AI report")}
            </button>
          )}
        </div>
      )}

      {msg && <p>{msg}</p>}

      {r && (
        <div style={box}>
          <h2 style={{ fontSize: 18, marginTop: 0 }}>Report</h2>
          {r.overall_summary ? <p>{r.overall_summary as string}</p> : null}

          <Section title="What worked" items={list("what_worked")} />
          <Section title="What didn't work" items={list("what_didnt_work")} />

          {r.best_post ? (
            <p><strong>Best post:</strong> {(r.best_post as Record<string, string>).title} — {(r.best_post as Record<string, string>).why}</p>
          ) : null}
          <p style={{ fontSize: 14 }}>
            <strong>Best pillar:</strong> {(r.best_pillar as string) || "—"} ·{" "}
            <strong>Best platform:</strong> {(r.best_platform as string) || "—"} ·{" "}
            <strong>Best CTA:</strong> {(r.best_cta as string) || "—"}
          </p>
          {r.best_hook_pattern ? <p><strong>Best hook pattern:</strong> {r.best_hook_pattern as string}</p> : null}
          {r.lead_quality_summary ? <p><strong>Lead quality:</strong> {r.lead_quality_summary as string}</p> : null}

          <Section title="Repeat these topics" items={list("repeat_topics")} />
          <Section title="Stop / reduce these" items={list("stop_or_reduce_topics")} />
          <Section title="Best hooks" items={list("best_hooks")} />
          <Section title="Best CTAs" items={list("best_ctas")} />

          {r.platform_recommendations ? <p><strong>Platform rec:</strong> {r.platform_recommendations as string}</p> : null}
          {r.content_mix_recommendation ? <p><strong>Content mix:</strong> {r.content_mix_recommendation as string}</p> : null}

          <Section title="⚠ Compliance warnings" items={list("compliance_warnings")} warn />
          {r.compliance_notes ? <p style={{ fontSize: 13, color: "#666" }}>{r.compliance_notes as string}</p> : null}

          <Section title="Recommendations for next week" items={list("recommendations_next_week")} />

          {ideas.length > 0 && (
            <>
              <h3 style={{ fontSize: 16 }}>7 post ideas for next week</h3>
              <ol style={{ paddingLeft: 20 }}>
                {ideas.map((idea, i) => (
                  <li key={i} style={{ marginBottom: 8 }}>
                    <strong>{idea.platform} · {idea.pillar}</strong><br />
                    {idea.idea}<br />
                    {idea.hook ? <em style={{ color: "#555" }}>Hook: {idea.hook}</em> : null}
                  </li>
                ))}
              </ol>
            </>
          )}

          <Section title="Action plan" items={list("action_plan")} />
        </div>
      )}
    </main>
  );
}

function Section({ title, items, warn }: { title: string; items: string[]; warn?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <strong style={{ color: warn ? "#c0271a" : undefined }}>{title}</strong>
      <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
        {items.map((it, i) => <li key={i} style={{ fontSize: 14 }}>{it}</li>)}
      </ul>
    </div>
  );
}
