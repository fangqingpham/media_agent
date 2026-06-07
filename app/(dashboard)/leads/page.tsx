"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/contentTypes";
import { LEAD_CATEGORIES, LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_PRIORITIES } from "@/lib/leadTypes";
import { PriorityBadge, LeadStatusBadge, ScoreBadge } from "@/components/leadBadges";

type Lead = Record<string, unknown>;
const today = () => new Date().toISOString().slice(0, 10);

export default function LeadsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [f, setF] = useState({ platform: "", category: "", status: "", priority: "", overdue: false, hot: false });

  const load = useCallback(async (bId: string, filters: typeof f) => {
    const p = new URLSearchParams({ brandId: bId });
    if (filters.platform) p.set("platform", filters.platform);
    if (filters.category) p.set("category", filters.category);
    if (filters.status) p.set("status", filters.status);
    if (filters.priority) p.set("priority", filters.priority);
    if (filters.overdue) p.set("overdue", "true");
    if (filters.hot) p.set("hot", "true");
    setLeads((await api(`/api/leads?${p.toString()}`)) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) { router.push("/brand/edit"); return; }
      setBrandId(brands[0].id);
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

  return (
    <main style={{ maxWidth: 1040, margin: "32px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24 }}>Leads</h1>
        <button onClick={() => router.push("/leads/new")} style={{ padding: "8px 16px", color: "#0a7d36", fontWeight: 600 }}>+ New lead</button>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap", alignItems: "center" }}>
        <select value={f.platform} onChange={(e) => setF({ ...f, platform: e.target.value })}>
          <option value="">All platforms</option>{PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          <option value="">All categories</option>{LEAD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">All statuses</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
        </select>
        <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
          <option value="">All priority</option>{LEAD_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={f.hot} onChange={(e) => setF({ ...f, hot: e.target.checked })} /> Hot</label>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={f.overdue} onChange={(e) => setF({ ...f, overdue: e.target.checked })} /> Overdue follow-up</label>
      </div>

      {leads.length === 0 && <p style={{ color: "#666" }}>No leads yet. Create one from the inbox or with “New lead”.</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {leads.map((l) => {
          const overdue = l.follow_up_date && (l.follow_up_date as string) < today();
          return (
            <button key={l.id as string} onClick={() => router.push(`/leads/${l.id}`)}
              style={{ textAlign: "left", border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fff", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <strong>{(l.name as string) || "(no name)"}</strong>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <ScoreBadge score={l.lead_score as number} />
                  <PriorityBadge priority={l.priority as string} />
                  <LeadStatusBadge status={l.lead_status as string} />
                </div>
              </div>
              <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                {(l.platform as string) || "—"} · {(l.lead_category as string) || "Uncategorized"}
                {l.follow_up_date ? <span style={{ color: overdue ? "#c0271a" : "#666" }}> · follow-up {l.follow_up_date as string}{overdue ? " (overdue)" : ""}</span> : ""}
              </div>
            </button>
          );
        })}
      </div>
    </main>
  );
}
