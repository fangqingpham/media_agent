"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { PLATFORMS, CONTENT_TYPES, CONTENT_TYPE_LABELS, type ContentType } from "@/lib/contentTypes";

type Row = Record<string, number | string | null>;
type Data = {
  totals: Record<string, number>;
  leadFunnel: Record<string, number>;
  posts: Row[];
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function AnalyticsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [pillars, setPillars] = useState<{ id: string; name: string }[]>([]);
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ platform: "", pillarId: "", contentType: "", from: "", to: "" });

  const load = useCallback(async (bId: string, filters: typeof f) => {
    const p = new URLSearchParams({ brandId: bId });
    if (filters.platform) p.set("platform", filters.platform);
    if (filters.pillarId) p.set("pillarId", filters.pillarId);
    if (filters.contentType) p.set("contentType", filters.contentType);
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    try { setData(await api(`/api/analytics?${p.toString()}`)); setErr(null); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed to load"); }
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
      await load(brands[0].id, f);
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, load]);

  useEffect(() => {
    if (brandId) load(brandId, f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, f]);

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const t = data?.totals;
  const lf = data?.leadFunnel;
  const cards: { label: string; value: number }[] = t && lf ? [
    { label: "Posts", value: t.posts }, { label: "Views", value: t.views },
    { label: "Likes", value: t.likes }, { label: "Comments", value: t.comments },
    { label: "Shares", value: t.shares }, { label: "Saves", value: t.saves },
    { label: "DMs", value: t.dms }, { label: "Leads", value: t.leads },
    { label: "Qualified", value: lf.qualified_leads }, { label: "Booked calls", value: lf.booked_calls },
    { label: "Converted", value: lf.converted_clients },
  ] : [];

  const th = { textAlign: "left" as const, padding: "6px 8px", fontSize: 12, color: "#666", borderBottom: "1px solid #ddd", whiteSpace: "nowrap" as const };
  const td = { padding: "6px 8px", fontSize: 13, borderBottom: "1px solid #f0f0f0", whiteSpace: "nowrap" as const };

  return (
    <main style={{ maxWidth: 1200, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Analytics</h1>

      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap", alignItems: "center" }}>
        <select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}>
          <option value="">All platforms</option>{PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={f.pillarId} onChange={(e) => setF({ ...f, pillarId: e.target.value })}>
          <option value="">All pillars</option>{pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={f.contentType} onChange={(e) => setF({ ...f, contentType: e.target.value })}>
          <option value="">All types</option>{CONTENT_TYPES.map((c) => <option key={c} value={c}>{CONTENT_TYPE_LABELS[c]}</option>)}
        </select>
        <label style={{ fontSize: 13 }}>From <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label style={{ fontSize: 13 }}>To <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        {(f.from || f.to || f.platform || f.pillarId || f.contentType) && (
          <button onClick={() => setF({ platform: "", pillarId: "", contentType: "", from: "", to: "" })}>Clear</button>
        )}
      </div>

      {err && <p style={{ color: "#b00" }}>{err}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ border: "1px solid #e5e5e5", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{c.value.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: "#666" }}>{c.label}</div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18 }}>Post performance</h2>
      {!data || data.posts.length === 0 ? (
        <p style={{ color: "#666" }}>No posts with performance data in this range. Enter metrics on the Posted page first.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {["Title", "Platform", "Pillar", "Type", "Posted", "Views", "Likes", "Comments", "Shares", "Saves", "DMs", "Leads", "Qual.", "Booked", "Conv.", "Eng. rate", "Lead rate"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.posts.map((r) => (
                <tr key={r.id as string} style={{ cursor: "pointer" }} onClick={() => router.push(`/drafts/${r.id}`)}>
                  <td style={{ ...td, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.title as string}</td>
                  <td style={td}>{r.platform as string}</td>
                  <td style={td}>{(r.pillar as string) || "—"}</td>
                  <td style={td}>{CONTENT_TYPE_LABELS[r.content_type as ContentType] ?? (r.content_type as string)}</td>
                  <td style={td}>{(r.posted_date as string) || "—"}</td>
                  <td style={td}>{r.views as number}</td>
                  <td style={td}>{r.likes as number}</td>
                  <td style={td}>{r.comments as number}</td>
                  <td style={td}>{r.shares as number}</td>
                  <td style={td}>{r.saves as number}</td>
                  <td style={td}>{r.dms as number}</td>
                  <td style={td}>{r.leads_generated as number}</td>
                  <td style={td}>{r.qualified_leads as number}</td>
                  <td style={td}>{r.booked_calls as number}</td>
                  <td style={td}>{r.converted_clients as number}</td>
                  <td style={td}>{pct(r.engagement_rate as number)}</td>
                  <td style={td}>{pct(r.lead_rate as number)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
