"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/contentTypes";
import { LEAD_CATEGORIES, LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_PRIORITIES } from "@/lib/leadTypes";
import { PriorityBadge, LeadStatusBadge, ScoreBadge } from "@/components/leadBadges";

type Lead = Record<string, unknown>;
type Activity = Record<string, unknown>;

export default function LeadDetailPage() {
  const router = useRouter();
  const id = useParams().id as string;

  const [lead, setLead] = useState<Lead | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const [f, setF] = useState<Record<string, string>>({});

  const hydrate = (l: Lead) => {
    setLead(l);
    setF({
      name: (l.name as string) ?? "", platform: (l.platform as string) ?? "",
      profile_url: (l.profile_url as string) ?? "", email: (l.email as string) ?? "",
      phone: (l.phone as string) ?? "", city: (l.city as string) ?? "",
      province: (l.province as string) ?? "", lead_category: (l.lead_category as string) ?? "",
      lead_status: (l.lead_status as string) ?? "new", priority: (l.priority as string) ?? "medium",
      original_message: (l.original_message as string) ?? "",
      conversation_summary: (l.conversation_summary as string) ?? "",
      follow_up_date: (l.follow_up_date as string) ?? "",
      follow_up_notes: (l.follow_up_notes as string) ?? "",
      last_contact_date: (l.last_contact_date as string) ?? "",
    });
  };

  const loadActivity = async () => {
    try { setActivity((await api(`/api/leads/${id}/activity`)) ?? []); } catch { /* ignore */ }
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      try { hydrate(await api(`/api/leads/${id}`)); await loadActivity(); }
      catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  const save = async () => {
    setBusy("save"); setMsg(null);
    try {
      const body: Record<string, unknown> = { ...f };
      // empty date strings -> null
      if (!body.follow_up_date) body.follow_up_date = null;
      if (!body.last_contact_date) body.last_contact_date = null;
      hydrate(await api(`/api/leads/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
      await loadActivity();
      setMsg("Saved.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(null); }
  };

  const score = async () => {
    setBusy("score"); setMsg(null);
    try { hydrate(await api(`/api/leads/${id}/score`, { method: "POST" })); await loadActivity(); setMsg("Scored."); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Scoring failed"); }
    finally { setBusy(null); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy("note"); setMsg(null);
    try { hydrate(await api(`/api/leads/${id}/notes`, { method: "POST", body: JSON.stringify({ note }) })); setNote(""); await loadActivity(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Add note failed"); }
    finally { setBusy(null); }
  };

  const del = async () => {
    if (!confirm("Delete this lead permanently?")) return;
    setBusy("del");
    try { await api(`/api/leads/${id}`, { method: "DELETE" }); router.push("/leads"); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Delete failed"); setBusy(null); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;
  if (!lead) return <main style={{ padding: 24 }}>{msg || "Not found"}</main>;

  const field = { width: "100%", padding: 8, marginBottom: 10 } as const;
  const label = { display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 } as const;
  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 14, marginBottom: 14 } as const;
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  return (
    <main style={{ maxWidth: 780, margin: "32px auto", padding: "0 16px" }}>
      <button onClick={() => router.push("/leads")} style={{ marginBottom: 12 }}>← Leads</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 22 }}>{(lead.name as string) || "(no name)"}</h1>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <ScoreBadge score={lead.lead_score as number} />
          <PriorityBadge priority={lead.priority as string} />
          <LeadStatusBadge status={lead.lead_status as string} />
        </div>
      </div>

      {lead.source_interaction_id ? (
        <p style={{ fontSize: 13 }}>
          <a href={`/interactions/${lead.source_interaction_id}`} style={{ color: "#0a58ca" }}>← Source interaction</a>
        </p>
      ) : null}

      {/* AI scoring panel */}
      <div style={box}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>AI scoring</h2>
          <button onClick={score} disabled={busy !== null}>{busy === "score" ? "Scoring…" : "Score with AI"}</button>
        </div>
        {lead.score_reason ? <p style={{ fontSize: 14 }}><strong>Reason:</strong> {lead.score_reason as string}</p> : null}
        {lead.suggested_next_action ? <p style={{ fontSize: 14 }}><strong>Next action:</strong> {lead.suggested_next_action as string}</p> : null}
        {lead.suggested_follow_up_message ? (
          <p style={{ fontSize: 14, background: "#f6f8fa", padding: 8, borderRadius: 6 }}>
            <strong>Suggested follow-up:</strong> {lead.suggested_follow_up_message as string}
          </p>
        ) : null}
        {Array.isArray(lead.missing_information) && (lead.missing_information as string[]).length > 0 ? (
          <div style={{ fontSize: 14 }}><strong>Collect:</strong>
            <ul>{(lead.missing_information as string[]).map((m, i) => <li key={i}>{m}</li>)}</ul>
          </div>
        ) : null}
      </div>

      {/* editable fields */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={label}>Name</label><input style={field} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div>
            <label style={label}>Platform</label>
            <select style={field} value={f.platform} onChange={(e) => set("platform", e.target.value)}>
              <option value="">—</option>{PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div><label style={label}>Email</label><input style={field} value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><label style={label}>Phone</label><input style={field} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div><label style={label}>City</label><input style={field} value={f.city} onChange={(e) => set("city", e.target.value)} /></div>
          <div><label style={label}>Province</label><input style={field} value={f.province} onChange={(e) => set("province", e.target.value)} /></div>
          <div>
            <label style={label}>Category</label>
            <select style={field} value={f.lead_category} onChange={(e) => set("lead_category", e.target.value)}>
              <option value="">—</option>{LEAD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Status</label>
            <select style={field} value={f.lead_status} onChange={(e) => set("lead_status", e.target.value)}>
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Priority</label>
            <select style={field} value={f.priority} onChange={(e) => set("priority", e.target.value)}>
              {LEAD_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div><label style={label}>Last contact date</label><input type="date" style={field} value={f.last_contact_date} onChange={(e) => set("last_contact_date", e.target.value)} /></div>
        </div>
        <label style={label}>Profile URL</label>
        <input style={field} value={f.profile_url} onChange={(e) => set("profile_url", e.target.value)} />
        <label style={label}>Original message</label>
        <textarea style={field} rows={2} value={f.original_message} onChange={(e) => set("original_message", e.target.value)} />
        <label style={label}>Conversation summary</label>
        <textarea style={field} rows={2} value={f.conversation_summary} onChange={(e) => set("conversation_summary", e.target.value)} />

        <h3 style={{ fontSize: 15 }}>Follow-up</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={label}>Follow-up date</label><input type="date" style={field} value={f.follow_up_date} onChange={(e) => set("follow_up_date", e.target.value)} /></div>
        </div>
        <label style={label}>Follow-up notes</label>
        <textarea style={field} rows={2} value={f.follow_up_notes} onChange={(e) => set("follow_up_notes", e.target.value)} />

        <button onClick={save} disabled={busy !== null} style={{ padding: "10px 18px" }}>{busy === "save" ? "Saving…" : "Save changes"}</button>
        <button onClick={del} disabled={busy !== null} style={{ color: "#c0271a", marginLeft: 8 }}>Delete</button>
      </div>

      {/* notes */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Notes</h2>
        {lead.notes ? <pre style={{ whiteSpace: "pre-wrap", background: "#f6f6f6", padding: 10, borderRadius: 6, fontSize: 13 }}>{lead.notes as string}</pre> : <p style={{ color: "#888" }}>No notes yet.</p>}
        <textarea style={field} rows={2} placeholder="Add a note…" value={note} onChange={(e) => setNote(e.target.value)} />
        <button onClick={addNote} disabled={busy !== null || !note.trim()}>Add note</button>
      </div>

      {/* activity log */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Activity log</h2>
        {activity.length === 0 ? <p style={{ color: "#888" }}>No activity yet.</p> : (
          <ul style={{ fontSize: 13 }}>
            {activity.map((a) => (
              <li key={a.id as string}>
                <strong>{a.action as string}</strong>{a.detail ? ` — ${a.detail as string}` : ""}
                {" · "}{new Date(a.created_at as string).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </div>

      {msg && <p>{msg}</p>}
    </main>
  );
}
