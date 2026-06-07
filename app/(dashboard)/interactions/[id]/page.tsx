"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import {
  INTERACTION_TYPE_LABELS,
  INTERACTION_STATUSES,
  INTERACTION_STATUS_LABELS,
} from "@/lib/interactionTypes";
import { RiskBadge, CopyButton } from "@/components/badges";

type It = Record<string, unknown>;

export default function InteractionReviewPage() {
  const router = useRouter();
  const id = useParams().id as string;

  const [it, setIt] = useState<It | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const hydrate = (data: It) => {
    setIt(data);
    setAdminNotes((data.admin_notes as string) ?? "");
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      try { hydrate(await api(`/api/interactions/${id}`)); }
      catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
      setReady(true);
    })();
  }, [id, router]);

  const run = async (key: string, fn: () => Promise<It>) => {
    setBusy(key); setMsg(null);
    try { hydrate(await fn()); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  };

  const classify = () => run("classify", () => api(`/api/interactions/${id}/classify`, { method: "POST" }));
  const genReply = () => run("reply", () => api(`/api/interactions/${id}/reply`, { method: "POST" }));
  const setStatus = (toStatus: string) =>
    run("status", () => api(`/api/interactions/${id}/status`, { method: "POST", body: JSON.stringify({ toStatus }) }));
  const saveNotes = () =>
    run("notes", () => api(`/api/interactions/${id}`, { method: "PATCH", body: JSON.stringify({ admin_notes: adminNotes }) }));

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;
  if (!it) return <main style={{ padding: 24 }}>{msg || "Not found"}</main>;

  const drafts = (it.reply_drafts as Record<string, string>) ?? null;
  const cats = (it.categories as string[]) ?? [];
  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 14, marginBottom: 14 } as const;

  return (
    <main style={{ maxWidth: 780, margin: "32px auto", padding: "0 16px" }}>
      <button onClick={() => router.push("/interactions")} style={{ marginBottom: 12 }}>← Inbox</button>

      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <strong>{(it.person_name as string) || "(no name)"} · {it.platform as string} · {INTERACTION_TYPE_LABELS[it.interaction_type as string]}</strong>
          <span style={{ fontSize: 13, color: "#444" }}>{INTERACTION_STATUS_LABELS[it.status as string] ?? (it.status as string)}</span>
        </div>
        {it.profile_url ? <a href={it.profile_url as string} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#0a58ca" }}>{it.profile_url as string}</a> : null}
        <p style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{it.original_message as string}</p>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <button onClick={classify} disabled={busy !== null}>{busy === "classify" ? "Classifying…" : "Classify"}</button>
        <button onClick={genReply} disabled={busy !== null}>{busy === "reply" ? "Drafting…" : (drafts ? "Regenerate reply" : "Draft reply")}</button>
        <button onClick={() => router.push(`/leads/new?interactionId=${id}`)} disabled={busy !== null} style={{ marginLeft: "auto", color: "#0a7d36", fontWeight: 600 }}>
          + Create Lead
        </button>
      </div>

      {it.intent_summary || cats.length > 0 ? (
        <div style={box}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>AI classification</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
            {it.compliance_risk ? <RiskBadge risk={it.compliance_risk as string} /> : null}
            {it.lead_potential ? <span style={{ fontSize: 13 }}>lead potential: <strong>{it.lead_potential as string}</strong></span> : null}
            {it.urgency ? <span style={{ fontSize: 13 }}>urgency: <strong>{it.urgency as string}</strong></span> : null}
            {it.human_approval_required ? <span style={{ color: "#c0271a", fontWeight: 600, fontSize: 13 }}>⚠ human approval required</span> : null}
          </div>
          {cats.length > 0 ? <p style={{ fontSize: 14 }}><strong>Categories:</strong> {cats.join(", ")}</p> : null}
          {it.intent_summary ? <p><strong>Intent:</strong> {it.intent_summary as string}</p> : null}
          {it.suggested_next_action ? <p><strong>Next action:</strong> {it.suggested_next_action as string}</p> : null}
          {it.risk_reason ? <p style={{ fontSize: 13, color: "#666" }}><strong>Risk reason:</strong> {it.risk_reason as string}</p> : null}
          {it.is_lead_candidate ? <p style={{ fontSize: 13, color: "#0a7d36" }}>Lead candidate{it.suggested_lead_category ? ` · ${it.suggested_lead_category as string}` : ""}</p> : null}
        </div>
      ) : null}

      {drafts ? (
        <div style={box}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>AI reply drafts</h2>

          {drafts.disclaimer ? (
            <p style={{ background: "#fffbe6", border: "1px solid #e8d27a", borderRadius: 6, padding: 8, fontSize: 13 }}>
              {drafts.disclaimer}
            </p>
          ) : null}

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Public comment reply</strong>
              <CopyButton text={drafts.public_reply} label="Copy public reply" />
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{drafts.public_reply}</p>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Private DM reply</strong>
              <CopyButton text={drafts.dm_reply} label="Copy DM reply" />
            </div>
            <p style={{ whiteSpace: "pre-wrap" }}>{drafts.dm_reply}</p>
          </div>

          {drafts.follow_up_question ? <p><strong>Follow-up question:</strong> {drafts.follow_up_question}</p> : null}
          {drafts.booking_cta ? <p><strong>Booking CTA:</strong> {drafts.booking_cta}</p> : null}
        </div>
      ) : null}

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Status</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {INTERACTION_STATUSES.map((s) => (
            <button key={s} onClick={() => setStatus(s)} disabled={busy !== null}
              style={{ fontWeight: it.status === s ? 700 : 400 }}>
              {INTERACTION_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Admin notes</h2>
        <textarea style={{ width: "100%", padding: 8 }} rows={3} value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
        <button onClick={saveNotes} disabled={busy !== null} style={{ marginTop: 8 }}>Save notes</button>
      </div>

      {msg && <p>{msg}</p>}
    </main>
  );
}
