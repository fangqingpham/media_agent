"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { PLATFORMS, POST_STATUSES } from "@/lib/contentTypes";

type Post = Record<string, unknown>;
type View = "month" | "week" | "day";

const iso = (d: Date) => d.toISOString().slice(0, 10);
function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay()); // Sunday start
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function CalendarPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [pillars, setPillars] = useState<{ id: string; name: string }[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);

  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(new Date());
  const [platform, setPlatform] = useState("");
  const [pillarId, setPillarId] = useState("");
  const [status, setStatus] = useState("");

  // compute visible date range from view + anchor
  const range = (() => {
    if (view === "day") return { from: iso(anchor), to: iso(anchor) };
    if (view === "week") {
      const s = startOfWeek(anchor);
      return { from: iso(s), to: iso(addDays(s, 6)) };
    }
    const s = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const e = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: iso(s), to: iso(e) };
  })();

  const load = useCallback(async (bId: string, r: { from: string; to: string }, plat: string, pil: string, stat: string) => {
    const p = new URLSearchParams({ brandId: bId, from: r.from, to: r.to });
    if (plat) p.set("platform", plat);
    if (pil) p.set("pillarId", pil);
    if (stat) p.set("status", stat);
    setPosts((await api(`/api/posts?${p.toString()}`)) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) { router.push("/brand/edit"); return; }
      setBrandId(brands[0].id);
      const { data: p } = await supabase.from("content_pillars").select("id, name").eq("brand_id", brands[0].id);
      setPillars(p ?? []);
      setReady(true);
    })();
  }, [router]);

  useEffect(() => {
    if (brandId) load(brandId, range, platform, pillarId, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, view, anchor, platform, pillarId, status]);

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const byDate: Record<string, Post[]> = {};
  for (const p of posts) {
    const key = (p.scheduled_for as string) || "unscheduled";
    (byDate[key] ||= []).push(p);
  }

  const move = (dir: number) => {
    if (view === "day") setAnchor(addDays(anchor, dir));
    else if (view === "week") setAnchor(addDays(anchor, dir * 7));
    else setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
  };

  const riskDot = (r: string) => (r === "high" ? "🔴" : r === "medium" ? "🟠" : "🟢");

  return (
    <main style={{ maxWidth: 1000, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Content Calendar</h1>

      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0", flexWrap: "wrap" }}>
        {(["month", "week", "day"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)} style={{ fontWeight: view === v ? 700 : 400 }}>{v}</button>
        ))}
        <button onClick={() => move(-1)}>←</button>
        <button onClick={() => setAnchor(new Date())}>Today</button>
        <button onClick={() => move(1)}>→</button>
        <span style={{ color: "#666" }}>{range.from} → {range.to}</span>

        <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ marginLeft: "auto" }}>
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={pillarId} onChange={(e) => setPillarId(e.target.value)}>
          <option value="">All pillars</option>
          {pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {POST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {Object.keys(byDate).length === 0 && (
        <p style={{ color: "#666" }}>
          No posts in this range. Generate posts in the Generator, then set a scheduled date on a draft to place it here.
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(byDate)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([date, list]) => (
            <div key={date} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
              <strong>{date === "unscheduled" ? "Unscheduled" : date}</strong>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {list.map((p) => (
                  <button
                    key={p.id as string}
                    onClick={() => router.push(`/drafts/${p.id}`)}
                    style={{ textAlign: "left", border: "1px solid #ddd", borderRadius: 6, padding: 8, background: "#fff", cursor: "pointer" }}
                  >
                    {riskDot(p.compliance_risk as string)} <strong>{(p.title as string) || "(untitled)"}</strong>
                    <span style={{ color: "#666", fontSize: 13 }}> · {p.platform as string} · {p.status as string}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>
    </main>
  );
}
