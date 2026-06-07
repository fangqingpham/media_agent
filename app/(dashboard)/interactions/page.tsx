"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/contentTypes";
import {
  INTERACTION_TYPES,
  INTERACTION_TYPE_LABELS,
  INTERACTION_STATUSES,
  INTERACTION_STATUS_LABELS,
  LEAD_POTENTIAL,
} from "@/lib/interactionTypes";
import { RiskBadge } from "@/components/badges";

type Row = Record<string, unknown>;

export default function InteractionsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // filters
  const [fPlatform, setFPlatform] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fLead, setFLead] = useState("");

  // add form
  const [platform, setPlatform] = useState("facebook");
  const [type, setType] = useState("public_comment");
  const [person, setPerson] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [message, setMessage] = useState("");
  const [receivedAt, setReceivedAt] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async (bId: string, plat: string, stat: string, lead: string) => {
    const p = new URLSearchParams({ brandId: bId });
    if (plat) p.set("platform", plat);
    if (stat) p.set("status", stat);
    if (lead) p.set("leadPotential", lead);
    setRows((await api(`/api/interactions?${p.toString()}`)) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) { router.push("/brand/edit"); return; }
      setBrandId(brands[0].id);
      await load(brands[0].id, "", "", "");
      setReady(true);
    })();
  }, [router, load]);

  useEffect(() => {
    if (brandId) load(brandId, fPlatform, fStatus, fLead);
  }, [brandId, fPlatform, fStatus, fLead, load]);

  const add = async () => {
    if (!brandId) return;
    if (!message.trim()) { setMsg("Message is required."); return; }
    setBusy(true); setMsg(null);
    try {
      await api("/api/interactions", {
        method: "POST",
        body: JSON.stringify({
          brand_id: brandId, platform, interaction_type: type,
          person_name: person || null, profile_url: profileUrl || null,
          original_message: message,
          received_at: receivedAt ? new Date(receivedAt).toISOString() : null,
          notes: notes || null,
        }),
      });
      setPerson(""); setProfileUrl(""); setMessage(""); setReceivedAt(""); setNotes("");
      setMsg("Added.");
      await load(brandId, fPlatform, fStatus, fLead);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Add failed"); }
    finally { setBusy(false); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const field = { width: "100%", padding: 8, marginBottom: 10 } as const;
  const label = { display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 } as const;
  const leadColor = (l: string) => (l === "high" ? "#0a7d36" : l === "medium" ? "#b8730a" : "#888");

  return (
    <main style={{ maxWidth: 1000, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Interaction Inbox</h1>
      <p style={{ color: "#666" }}>Paste a comment or DM, then let AI classify it and draft a safe reply.</p>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, margin: "16px 0" }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Add interaction</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={label}>Platform</label>
            <select style={field} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Interaction type</label>
            <select style={field} value={type} onChange={(e) => setType(e.target.value)}>
              {INTERACTION_TYPES.map((t) => <option key={t} value={t}>{INTERACTION_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Person name</label>
            <input style={field} value={person} onChange={(e) => setPerson(e.target.value)} />
          </div>
          <div>
            <label style={label}>Profile URL (optional)</label>
            <input style={field} value={profileUrl} onChange={(e) => setProfileUrl(e.target.value)} />
          </div>
        </div>
        <label style={label}>Original message *</label>
        <textarea style={field} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={label}>Received date/time (optional)</label>
            <input type="datetime-local" style={field} value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
          </div>
          <div>
            <label style={label}>Notes (optional)</label>
            <input style={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <button onClick={add} disabled={busy || !message.trim()} style={{ padding: "10px 18px" }}>
          {busy ? "…" : "Add interaction"}
        </button>
        {msg && <span style={{ marginLeft: 12 }}>{msg}</span>}
      </section>

      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <select value={fPlatform} onChange={(e) => setFPlatform(e.target.value)}>
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">All statuses</option>
          {INTERACTION_STATUSES.map((s) => <option key={s} value={s}>{INTERACTION_STATUS_LABELS[s]}</option>)}
        </select>
        <select value={fLead} onChange={(e) => setFLead(e.target.value)}>
          <option value="">All lead potential</option>
          {LEAD_POTENTIAL.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {rows.length === 0 && <p style={{ color: "#666" }}>No interactions yet.</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((r) => (
          <button
            key={r.id as string}
            onClick={() => router.push(`/interactions/${r.id}`)}
            style={{ textAlign: "left", border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fff", cursor: "pointer" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>{(r.person_name as string) || "(no name)"} · {r.platform as string}</strong>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {r.compliance_risk ? <RiskBadge risk={r.compliance_risk as string} /> : null}
                {r.lead_potential ? <span style={{ fontSize: 12, fontWeight: 600, color: leadColor(r.lead_potential as string) }}>lead: {r.lead_potential as string}</span> : null}
                <span style={{ fontSize: 12, color: "#444" }}>{INTERACTION_STATUS_LABELS[r.status as string] ?? (r.status as string)}</span>
              </div>
            </div>
            <p style={{ margin: "6px 0", color: "#333" }}>{(r.original_message as string).slice(0, 160)}</p>
            <div style={{ fontSize: 12, color: "#888" }}>
              {Array.isArray(r.categories) && (r.categories as string[]).length > 0 ? (r.categories as string[]).join(", ") : "unclassified"}
              {" · "}{new Date(r.created_at as string).toLocaleDateString()}
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}
