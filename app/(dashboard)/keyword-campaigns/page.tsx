"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import {
  LEAD_CATEGORIES,
  SUGGESTED_KEYWORDS,
  CAMPAIGN_STATUS_LABELS,
  normalizeKeyword,
} from "@/lib/keywordTypes";

type Campaign = Record<string, unknown>;

const PLATFORMS = ["facebook", "instagram", "tiktok"];

export default function KeywordCampaignsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string>("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: "",
    platform: "facebook",
    keyword: "",
    offer_name: "",
    lead_category: "",
    related_post_url: "",
    public_reply_template: "",
    dm_template: "",
    follow_up_template: "",
    status: "active",
    start_date: "",
    end_date: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setCampaigns((await api("/api/keyword-campaigns")) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (brands && brands.length > 0) setBrandId(brands[0].id);
      await load();
      setReady(true);
    })();
  }, [router, load]);

  const create = async () => {
    setMsg(null);
    if (!brandId) { setMsg("No brand found. Create a brand first."); return; }
    if (!form.name.trim()) { setMsg("Campaign name is required."); return; }
    if (!normalizeKeyword(form.keyword)) { setMsg("Keyword is required."); return; }
    setBusy(true);
    try {
      await api("/api/keyword-campaigns", {
        method: "POST",
        body: JSON.stringify({ ...form, brand_id: brandId, keyword: normalizeKeyword(form.keyword) }),
      });
      setMsg("Campaign created.");
      setForm((f) => ({ ...f, name: "", keyword: "", offer_name: "" }));
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Create failed"); }
    finally { setBusy(false); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const label = { display: "block", fontSize: 13, color: "#444", marginTop: 10, marginBottom: 2 } as const;
  const input = { width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" as const };
  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 } as const;

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Keyword campaigns</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Create posts like “Comment RENEWAL and I’ll send you the checklist.” When someone comments,
        add it below — the agent drafts a safe public reply + a private DM and a lead candidate. Nothing
        is sent automatically.
      </p>

      {msg && <p style={{ background: msg.includes("created") ? "#e6f7ed" : "#fdeaea", padding: 10, borderRadius: 6 }}>{msg}</p>}

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>New campaign</h2>

        <label style={label}>Campaign name</label>
        <input style={input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Mortgage Renewal Checklist" />

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={label}>Platform</label>
            <select style={input} value={form.platform} onChange={(e) => set("platform", e.target.value)}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={label}>Status</label>
            <select style={input} value={form.status} onChange={(e) => set("status", e.target.value)}>
              {Object.entries(CAMPAIGN_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <label style={label}>Keyword</label>
        <input style={input} value={form.keyword} onChange={(e) => set("keyword", e.target.value)} placeholder="RENEWAL" />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {SUGGESTED_KEYWORDS.map((k) => (
            <button key={k} type="button" onClick={() => set("keyword", k)}
              style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #ccc", borderRadius: 12, background: "#fafafa", cursor: "pointer" }}>
              {k}
            </button>
          ))}
        </div>

        <label style={label}>Offer / checklist name</label>
        <input style={input} value={form.offer_name} onChange={(e) => set("offer_name", e.target.value)} placeholder="Mortgage Renewal Checklist" />

        <label style={label}>Lead category</label>
        <select style={input} value={form.lead_category} onChange={(e) => set("lead_category", e.target.value)}>
          <option value="">— pick one —</option>
          {LEAD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <label style={label}>Related post URL (optional)</label>
        <input style={input} value={form.related_post_url} onChange={(e) => set("related_post_url", e.target.value)} placeholder="https://facebook.com/…" />

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "#555" }}>Optional reply templates (the AI uses the Brand Brain if left blank)</summary>
          <label style={label}>Public reply template</label>
          <textarea style={{ ...input, minHeight: 50 }} value={form.public_reply_template} onChange={(e) => set("public_reply_template", e.target.value)} placeholder="Thanks! I’ll send you the checklist — check your DM." />
          <label style={label}>Private DM template</label>
          <textarea style={{ ...input, minHeight: 50 }} value={form.dm_template} onChange={(e) => set("dm_template", e.target.value)} />
          <label style={label}>Follow-up question template</label>
          <textarea style={{ ...input, minHeight: 40 }} value={form.follow_up_template} onChange={(e) => set("follow_up_template", e.target.value)} />
        </details>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={label}>Start date (optional)</label>
            <input type="date" style={input} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={label}>End date (optional)</label>
            <input type="date" style={input} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />
          </div>
        </div>

        <button onClick={create} disabled={busy} style={{ marginTop: 14, padding: "10px 18px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6 }}>
          {busy ? "Creating…" : "Create campaign"}
        </button>
      </div>

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Your campaigns</h2>
        {campaigns.length === 0 ? <p style={{ color: "#666" }}>None yet.</p> : (
          <div style={{ display: "grid", gap: 10 }}>
            {campaigns.map((c) => (
              <Link key={c.id as string} href={`/keyword-campaigns/${c.id}`}
                style={{ textDecoration: "none", color: "inherit", border: "1px solid #eee", borderRadius: 6, padding: 12, display: "block" }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <strong>{c.name as string}</strong>
                  <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, background: c.status === "active" ? "#e6f7ed" : "#f0f0f0", color: c.status === "active" ? "#0a7d36" : "#666" }}>
                    {CAMPAIGN_STATUS_LABELS[c.status as string] ?? (c.status as string)}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                  <code style={{ background: "#f3f3f3", padding: "1px 6px", borderRadius: 4 }}>{c.keyword as string}</code>
                  {" · "}{c.platform as string}
                  {c.offer_name ? ` · ${c.offer_name as string}` : ""}
                  {c.lead_category ? ` · ${c.lead_category as string}` : ""}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
