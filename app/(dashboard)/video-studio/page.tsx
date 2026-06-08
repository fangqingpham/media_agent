"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";

type Row = Record<string, unknown>;
const PLATFORMS = ["facebook", "instagram", "tiktok"];
const DURATIONS = [15, 30, 45];

export default function VideoStudioPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState("");
  const [pillars, setPillars] = useState<Row[]>([]);
  const [kits, setKits] = useState<Row[]>([]);
  const [posts, setPosts] = useState<Row[]>([]);
  const [plans, setPlans] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // kit generator form
  const [gen, setGen] = useState({ platform: "facebook", durationSeconds: 30, topic: "", pillarId: "" });
  const setG = (k: string, v: unknown) => setGen((s) => ({ ...s, [k]: v }));

  // batch plan
  const [selected, setSelected] = useState<string[]>([]);
  const [openPlan, setOpenPlan] = useState<Row | null>(null);

  const load = useCallback(async (bId: string) => {
    const [k, p, pl] = await Promise.all([
      api(`/api/video-kits?brandId=${bId}`),
      api(`/api/posts?brandId=${bId}`),
      api(`/api/batch-plans?brandId=${bId}`),
    ]);
    setKits(k ?? []); setPosts(p ?? []); setPlans(pl ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) { router.push("/brand/edit"); return; }
      setBrandId(brands[0].id);
      const { data: p } = await supabase.from("content_pillars").select("id, name");
      setPillars(p ?? []);
      await load(brands[0].id);
      setReady(true);
    })();
  }, [router, load]);

  const generateKit = async () => {
    setBusy(true); setMsg(null);
    try {
      const kit = await api("/api/video-kits", {
        method: "POST",
        body: JSON.stringify({ brandId, platform: gen.platform, durationSeconds: gen.durationSeconds, topic: gen.topic || null, pillarId: gen.pillarId || null }),
      });
      router.push(`/video-studio/${kit.id}`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Generate failed"); setBusy(false); }
  };

  const toggleSel = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const generatePlan = async () => {
    if (selected.length < 2) { setMsg("Select at least 2 posts."); return; }
    setBusy(true); setMsg(null);
    try {
      const plan = await api("/api/batch-plans", { method: "POST", body: JSON.stringify({ brandId, postIds: selected }) });
      setOpenPlan(plan); setSelected([]);
      await load(brandId);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Plan failed"); }
    finally { setBusy(false); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 } as const;
  const input = { width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" as const };
  const label = { display: "block", fontSize: 13, color: "#444", marginTop: 10, marginBottom: 2 } as const;
  const list = (arr: unknown) => (Array.isArray(arr) ? (arr as unknown[]) : []);

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Video studio</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Generate short-form video kits (script, scenes, b-roll, overlays, editing + AI-video prompts)
        and batch recording plans. Nothing is posted — these are production assets for you to film/edit.
      </p>
      {msg && <p style={{ background: "#fdeaea", padding: 10, borderRadius: 6 }}>{msg}</p>}

      {/* generate kit */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>New video kit</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={label}>Platform</label>
            <select style={input} value={gen.platform} onChange={(e) => setG("platform", e.target.value)}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={label}>Content pillar (optional)</label>
            <select style={input} value={gen.pillarId} onChange={(e) => setG("pillarId", e.target.value)}>
              <option value="">— none —</option>
              {pillars.map((p) => <option key={p.id as string} value={p.id as string}>{p.name as string}</option>)}
            </select>
          </div>
        </div>
        <label style={label}>Duration</label>
        <div style={{ display: "flex", gap: 8 }}>
          {DURATIONS.map((d) => (
            <button key={d} onClick={() => setG("durationSeconds", d)}
              style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #ccc", background: gen.durationSeconds === d ? "#0070f3" : "#fff", color: gen.durationSeconds === d ? "#fff" : "#333" }}>
              {d}s
            </button>
          ))}
        </div>
        <label style={label}>Topic / instruction</label>
        <textarea style={{ ...input, minHeight: 60 }} value={gen.topic} onChange={(e) => setG("topic", e.target.value)} placeholder="e.g. 3 things first-time buyers in the GTA should check before an offer" />
        <button onClick={generateKit} disabled={busy} style={{ marginTop: 12, padding: "10px 18px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6 }}>
          {busy ? "Generating…" : "Generate video kit"}
        </button>
      </div>

      {/* saved kits */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Saved kits ({kits.length})</h2>
        {kits.length === 0 ? <p style={{ color: "#666" }}>None yet.</p> : (
          <div style={{ display: "grid", gap: 8 }}>
            {kits.map((k) => (
              <Link key={k.id as string} href={`/video-studio/${k.id}`} style={{ textDecoration: "none", color: "inherit", border: "1px solid #eee", borderRadius: 6, padding: 10 }}>
                <strong>{(k.title as string) || "(untitled kit)"}</strong>
                <span style={{ fontSize: 12, color: "#888" }}> · {k.platform as string} · {k.duration_seconds as number}s · risk {k.compliance_risk as string}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* batch plan */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Batch recording plan</h2>
        <p style={{ fontSize: 13, color: "#666" }}>Select 2–12 posts to film in one session; the planner groups them by outfit/location/topic and estimates time.</p>
        <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
          {posts.length === 0 ? <p style={{ color: "#666" }}>No posts yet.</p> : posts.map((p) => (
            <label key={p.id as string} style={{ display: "block", fontSize: 14, padding: "2px 0" }}>
              <input type="checkbox" checked={selected.includes(p.id as string)} onChange={() => toggleSel(p.id as string)} />{" "}
              {(p.title as string) || "(untitled)"} <span style={{ color: "#888", fontSize: 12 }}>({p.platform as string}/{p.content_type as string})</span>
            </label>
          ))}
        </div>
        <button onClick={generatePlan} disabled={busy || selected.length < 2} style={{ marginTop: 12, padding: "10px 18px", background: "#0a7d36", color: "#fff", border: "none", borderRadius: 6 }}>
          {busy ? "Planning…" : `Generate plan (${selected.length} selected)`}
        </button>

        {openPlan && (
          <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 12 }}>
            <strong>{openPlan.title as string}</strong>
            {openPlan.estimated_minutes ? <span style={{ color: "#666" }}> · ~{openPlan.estimated_minutes as number} min</span> : null}
            {list(openPlan.groups).map((g, i) => {
              const grp = g as Row;
              return (
                <div key={i} style={{ border: "1px solid #eee", borderRadius: 6, padding: 8, marginTop: 8 }}>
                  <strong style={{ fontSize: 14 }}>{grp.group_name as string} <span style={{ color: "#888", fontSize: 12 }}>(by {grp.group_by as string})</span></strong>
                  {list(grp.posts).length > 0 && <div style={{ fontSize: 13 }}>Posts: {list(grp.posts).join("; ")}</div>}
                  {list(grp.shots).length > 0 && <ul style={{ margin: "4px 0", fontSize: 13 }}>{list(grp.shots).map((s, j) => <li key={j}>{s as string}</li>)}</ul>}
                </div>
              );
            })}
            {list(openPlan.shot_checklist).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <strong style={{ fontSize: 14 }}>Shot checklist</strong>
                <ul style={{ fontSize: 13 }}>{list(openPlan.shot_checklist).map((s, i) => <li key={i}>{s as string}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        {plans.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 14 }}>Saved plans</strong>
            <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
              {plans.map((pl) => (
                <button key={pl.id as string} onClick={() => setOpenPlan(pl)} style={{ textAlign: "left", border: "1px solid #eee", borderRadius: 6, padding: 8, background: "#fff", cursor: "pointer" }}>
                  {(pl.title as string)} <span style={{ color: "#888", fontSize: 12 }}>· {new Date(pl.created_at as string).toLocaleDateString()}{pl.estimated_minutes ? ` · ~${pl.estimated_minutes as number} min` : ""}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
