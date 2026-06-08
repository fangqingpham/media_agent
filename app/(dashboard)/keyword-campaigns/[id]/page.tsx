"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/keywordTypes";
import { RiskBadge, CopyButton } from "@/components/badges";

type Row = Record<string, unknown>;

export default function KeywordCampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [ready, setReady] = useState(false);
  const [campaign, setCampaign] = useState<Row | null>(null);
  const [matches, setMatches] = useState<Row[]>([]);
  const [analytics, setAnalytics] = useState<Row | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [mForm, setMForm] = useState({ person_name: "", profile_url: "", comment_text: "", related_post_url: "" });
  const setM = (k: string, v: string) => setMForm((f) => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    const res = await api(`/api/keyword-campaigns/${id}`);
    setCampaign(res.campaign);
    setMatches(res.matches ?? []);
    setAnalytics(res.analytics ?? null);
  }, [id]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      try { await load(); } catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
      setReady(true);
    })();
  }, [router, load]);

  const changeStatus = async (status: string) => {
    setBusy("status"); setMsg(null);
    try {
      await api(`/api/keyword-campaigns/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Status change failed"); }
    finally { setBusy(null); }
  };

  const addMatch = async () => {
    setMsg(null);
    if (!mForm.comment_text.trim()) { setMsg("Comment text is required."); return; }
    setBusy("addMatch");
    try {
      const res = await api("/api/keyword-matches", {
        method: "POST",
        body: JSON.stringify({ ...mForm, campaign_id: id, platform: campaign?.platform }),
      });
      setMsg(res.warning ? `Match saved, but: ${res.warning}` : "Match saved and drafts generated.");
      setMForm({ person_name: "", profile_url: "", comment_text: "", related_post_url: "" });
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not add match"); }
    finally { setBusy(null); }
  };

  const regenerate = async (matchId: string) => {
    setBusy(matchId); setMsg(null);
    try {
      await api(`/api/keyword-matches/${matchId}/reply`, { method: "POST" });
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Regenerate failed"); }
    finally { setBusy(null); }
  };

  const createLead = async (matchId: string) => {
    setBusy(matchId); setMsg(null);
    try {
      const lead = await api(`/api/keyword-matches/${matchId}/create-lead`, { method: "POST" });
      setMsg("Lead created.");
      await load();
      router.push(`/leads/${lead.id}`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Create lead failed"); }
    finally { setBusy(null); }
  };

  const mark = async (matchId: string, fields: Record<string, unknown>) => {
    setBusy(matchId);
    try {
      await api(`/api/keyword-matches/${matchId}/mark`, { method: "POST", body: JSON.stringify(fields) });
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(null); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;
  if (!campaign) return <main style={{ padding: 24 }}>Campaign not found. <Link href="/keyword-campaigns">Back</Link></main>;

  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 } as const;
  const input = { width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" as const };
  const label = { display: "block", fontSize: 13, color: "#444", marginTop: 8, marginBottom: 2 } as const;
  const stat = { border: "1px solid #eee", borderRadius: 8, padding: "10px 14px", minWidth: 110 } as const;
  const status = campaign.status as string;

  const Stat = ({ k, v }: { k: string; v: number }) => (
    <div style={stat}><div style={{ fontSize: 22, fontWeight: 700 }}>{v}</div><div style={{ fontSize: 12, color: "#666" }}>{k}</div></div>
  );

  return (
    <main style={{ maxWidth: 920, margin: "32px auto", padding: "0 16px" }}>
      <Link href="/keyword-campaigns" style={{ fontSize: 13, color: "#0070f3" }}>← All campaigns</Link>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>{campaign.name as string}</h1>
      <div style={{ color: "#666", fontSize: 14, marginBottom: 12 }}>
        <code style={{ background: "#f3f3f3", padding: "1px 6px", borderRadius: 4 }}>{campaign.keyword as string}</code>
        {" · "}{campaign.platform as string}
        {campaign.offer_name ? ` · ${campaign.offer_name as string}` : ""}
        {campaign.lead_category ? ` · ${campaign.lead_category as string}` : ""}
        {"  "}
        <span style={{ marginLeft: 6, fontWeight: 600, color: status === "active" ? "#0a7d36" : "#666" }}>
          [{CAMPAIGN_STATUS_LABELS[status] ?? status}]
        </span>
      </div>

      {msg && <p style={{ background: msg.includes("created") || msg.includes("generated") ? "#e6f7ed" : "#fff4e0", padding: 10, borderRadius: 6 }}>{msg}</p>}

      {/* status controls */}
      <div style={{ ...box, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: "#444" }}>Campaign status:</span>
        {status !== "active" && <button onClick={() => changeStatus("active")} disabled={busy !== null}>Activate</button>}
        {status === "active" && <button onClick={() => changeStatus("paused")} disabled={busy !== null}>Pause</button>}
        {status === "paused" && <button onClick={() => changeStatus("active")} disabled={busy !== null}>Resume</button>}
        {status !== "ended" && <button onClick={() => changeStatus("ended")} disabled={busy !== null} style={{ color: "#c0271a" }}>End</button>}
        {campaign.related_post_url ? (
          <a href={campaign.related_post_url as string} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 13 }}>Related post ↗</a>
        ) : null}
      </div>

      {/* analytics */}
      {analytics && (
        <div style={box}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>Performance</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Stat k="Comments" v={analytics.comments_matched as number} />
            <Stat k="Reply drafts" v={analytics.reply_drafts_created as number} />
            <Stat k="DM drafts" v={analytics.dm_drafts_created as number} />
            <Stat k="Replies sent" v={analytics.replies_sent as number} />
            <Stat k="DMs sent" v={analytics.dms_sent as number} />
            <Stat k="Leads" v={analytics.leads_created as number} />
            <Stat k="Qualified" v={analytics.qualified_leads as number} />
            <Stat k="Booked" v={analytics.booked_calls as number} />
            <Stat k="Converted" v={analytics.converted_clients as number} />
          </div>
        </div>
      )}

      {/* add manual match */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Add a keyword comment</h2>
        {status !== "active" && <p style={{ color: "#b8730a", fontSize: 13 }}>This campaign is {status}. Activate it to capture matches.</p>}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={label}>Person name</label>
            <input style={input} value={mForm.person_name} onChange={(e) => setM("person_name", e.target.value)} placeholder="Jane D." />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={label}>Profile URL (optional)</label>
            <input style={input} value={mForm.profile_url} onChange={(e) => setM("profile_url", e.target.value)} />
          </div>
        </div>
        <label style={label}>Comment text</label>
        <textarea style={{ ...input, minHeight: 60 }} value={mForm.comment_text} onChange={(e) => setM("comment_text", e.target.value)} placeholder="RENEWAL please" />
        <label style={label}>Related post URL (optional)</label>
        <input style={input} value={mForm.related_post_url} onChange={(e) => setM("related_post_url", e.target.value)} />
        <button onClick={addMatch} disabled={busy !== null || status !== "active"} style={{ marginTop: 12, padding: "10px 18px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6 }}>
          {busy === "addMatch" ? "Saving…" : "Save match & draft replies"}
        </button>
      </div>

      {/* matches */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Matched comments ({matches.length})</h2>
        {matches.length === 0 ? <p style={{ color: "#666" }}>No matches yet.</p> : (
          <div style={{ display: "grid", gap: 14 }}>
            {matches.map((m) => {
              const mid = m.id as string;
              return (
                <div key={mid} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <strong>{(m.person_name as string) || "(unknown)"}</strong>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {m.compliance_risk ? <RiskBadge risk={m.compliance_risk as string} /> : null}
                      {m.human_approval_required ? <span style={{ fontSize: 12, color: "#c0271a" }}>needs approval</span> : null}
                    </span>
                  </div>
                  <p style={{ fontStyle: "italic", color: "#555", margin: "6px 0" }}>“{m.comment_text as string}”</p>
                  {m.profile_url ? <a href={m.profile_url as string} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Profile ↗</a> : null}

                  {m.risk_reason ? <p style={{ fontSize: 12, color: "#b8730a" }}>{m.risk_reason as string}</p> : null}

                  {(m.public_reply_draft || m.dm_draft) ? (
                    <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                      {m.public_reply_draft ? (
                        <div>
                          <div style={{ fontSize: 12, color: "#888" }}>Public reply</div>
                          <div style={{ background: "#f7f9fc", padding: 8, borderRadius: 6 }}>{m.public_reply_draft as string}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                            <CopyButton text={m.public_reply_draft as string} label="Copy reply" />
                            <label style={{ fontSize: 12 }}>
                              <input type="checkbox" checked={!!m.public_reply_sent} onChange={(e) => mark(mid, { public_reply_sent: e.target.checked })} /> sent
                            </label>
                          </div>
                        </div>
                      ) : null}
                      {m.dm_draft ? (
                        <div>
                          <div style={{ fontSize: 12, color: "#888" }}>Private DM</div>
                          <div style={{ background: "#f7f9fc", padding: 8, borderRadius: 6 }}>{m.dm_draft as string}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                            <CopyButton text={m.dm_draft as string} label="Copy DM" />
                            <label style={{ fontSize: 12 }}>
                              <input type="checkbox" checked={!!m.dm_sent} onChange={(e) => mark(mid, { dm_sent: e.target.checked })} /> sent
                            </label>
                          </div>
                        </div>
                      ) : null}
                      {m.follow_up_draft ? (
                        <div style={{ fontSize: 13, color: "#444" }}><strong>Follow-up:</strong> {m.follow_up_draft as string}</div>
                      ) : null}
                      {m.suggested_cta ? (
                        <div style={{ fontSize: 13, color: "#444" }}><strong>CTA:</strong> {m.suggested_cta as string}</div>
                      ) : null}
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: "#888" }}>No drafts yet.</p>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button onClick={() => regenerate(mid)} disabled={busy !== null}>
                      {m.public_reply_draft ? "Regenerate drafts" : "Generate drafts"}
                    </button>
                    {m.lead_id ? (
                      <Link href={`/leads/${m.lead_id}`} style={{ fontSize: 13, alignSelf: "center", color: "#0a7d36" }}>✓ Lead created — view</Link>
                    ) : (
                      <button onClick={() => createLead(mid)} disabled={busy !== null} style={{ background: "#0a7d36", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px" }}>
                        Create lead
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
