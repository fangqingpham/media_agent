"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";

type Row = Record<string, unknown>;
const ROLES = ["admin", "manager", "agent", "viewer"];

export default function TeamSettingsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Row | null>(null);
  const [members, setMembers] = useState<Row[]>([]);
  const [brands, setBrands] = useState<Row[]>([]);
  const [leads, setLeads] = useState<Row[]>([]);
  const [audit, setAudit] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [invite, setInvite] = useState({ email: "", role: "agent" });
  const [assign, setAssign] = useState({ leadId: "", memberId: "" });

  const load = useCallback(async () => {
    const [m, t, b, a] = await Promise.all([
      api("/api/team/me"),
      api("/api/team"),
      api("/api/brands"),
      api("/api/audit-logs"),
    ]);
    setMe(m); setMembers(t ?? []); setBrands(b ?? []); setAudit(a ?? []);
    try { setLeads((await api("/api/leads")) ?? []); } catch { setLeads([]); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      try { await load(); } catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
      setReady(true);
    })();
  }, [router, load]);

  const doInvite = async () => {
    if (!invite.email.trim()) return;
    setBusy(true); setMsg(null);
    try {
      await api("/api/team", { method: "POST", body: JSON.stringify(invite) });
      setInvite({ email: "", role: "agent" }); setMsg("Invite added."); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Invite failed"); }
    finally { setBusy(false); }
  };

  const patchMember = async (id: string, body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try { await api(`/api/team/${id}`, { method: "PATCH", body: JSON.stringify(body) }); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(false); }
  };

  const toggleBrand = (member: Row, brandId: string) => {
    const cur = (member.assigned_brands as string[]) ?? [];
    const next = cur.includes(brandId) ? cur.filter((x) => x !== brandId) : [...cur, brandId];
    patchMember(member.id as string, { assigned_brands: next });
  };

  const doAssign = async () => {
    if (!assign.leadId) return;
    setBusy(true); setMsg(null);
    try {
      const member = members.find((m) => m.id === assign.memberId);
      await api(`/api/leads/${assign.leadId}/assign`, {
        method: "POST",
        body: JSON.stringify({ assignedTo: member ? member.member_user_id : null }),
      });
      setMsg("Lead assigned."); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Assign failed"); }
    finally { setBusy(false); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 } as const;
  const input = { padding: 8, border: "1px solid #ccc", borderRadius: 6 } as const;

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Team & access</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Invite teammates and control what they can do. Owners and admins manage settings, connect
        accounts, approve and publish; agents work assigned leads and draft replies but can’t publish
        or connect APIs; viewers see dashboards only.
      </p>
      {msg && <p style={{ background: msg.includes("fail") || msg.includes("permission") ? "#fdeaea" : "#e6f7ed", padding: 10, borderRadius: 6 }}>{msg}</p>}

      {me && (
        <div style={box}>
          <strong>Your access:</strong> {(me.profile as Row)?.email as string || "you"} · role <strong>{me.role as string}</strong>
          <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
            {(me.permissions as string[])?.length} permissions in your own workspace.
          </div>
        </div>
      )}

      {/* invite */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Invite a teammate</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input style={{ ...input, flex: 1, minWidth: 200 }} type="email" placeholder="email@example.com"
            value={invite.email} onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))} />
          <select style={input} value={invite.role} onChange={(e) => setInvite((s) => ({ ...s, role: e.target.value }))}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={doInvite} disabled={busy || !invite.email.trim()} style={{ padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6 }}>Invite</button>
        </div>
        <p style={{ fontSize: 12, color: "#888", marginTop: 6 }}>
          No email is sent yet — share the app link with them. They’re linked automatically when they sign in with this email.
        </p>
      </div>

      {/* members */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Team members ({members.length})</h2>
        {members.length === 0 ? <p style={{ color: "#666" }}>No teammates yet.</p> : (
          <div style={{ display: "grid", gap: 10 }}>
            {members.map((m) => (
              <div key={m.id as string} style={{ border: "1px solid #eee", borderRadius: 6, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <span>
                    <strong>{m.invite_email as string}</strong>
                    <span style={{ fontSize: 12, color: m.status === "active" ? "#0a7d36" : m.status === "pending" ? "#b8730a" : "#999", marginLeft: 8 }}>{m.status as string}</span>
                  </span>
                  <span style={{ display: "flex", gap: 6 }}>
                    <select value={m.role as string} onChange={(e) => patchMember(m.id as string, { role: e.target.value })} style={input}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    {m.status === "disabled" ? (
                      <button onClick={() => patchMember(m.id as string, { status: "active" })} disabled={busy}>Enable</button>
                    ) : (
                      <button onClick={() => patchMember(m.id as string, { status: "disabled" })} disabled={busy} style={{ color: "#b00" }}>Disable</button>
                    )}
                  </span>
                </div>
                {brands.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    Brands:{" "}
                    {brands.map((b) => {
                      const on = ((m.assigned_brands as string[]) ?? []).includes(b.id as string);
                      return (
                        <label key={b.id as string} style={{ marginRight: 10 }}>
                          <input type="checkbox" checked={on} onChange={() => toggleBrand(m, b.id as string)} /> {b.name as string}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* assign leads */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Assign a lead</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select style={input} value={assign.leadId} onChange={(e) => setAssign((s) => ({ ...s, leadId: e.target.value }))}>
            <option value="">— pick a lead —</option>
            {leads.map((l) => <option key={l.id as string} value={l.id as string}>{(l.name as string) || "(unnamed)"} · {l.lead_status as string}</option>)}
          </select>
          <select style={input} value={assign.memberId} onChange={(e) => setAssign((s) => ({ ...s, memberId: e.target.value }))}>
            <option value="">— unassign —</option>
            {members.filter((m) => m.status === "active" && m.member_user_id).map((m) => <option key={m.id as string} value={m.id as string}>{m.invite_email as string}</option>)}
          </select>
          <button onClick={doAssign} disabled={busy || !assign.leadId} style={{ padding: "8px 16px", background: "#0a7d36", color: "#fff", border: "none", borderRadius: 6 }}>Assign</button>
        </div>
        <p style={{ fontSize: 12, color: "#888", marginTop: 6 }}>Only active members who have signed in can be assigned leads.</p>
      </div>

      {/* audit log */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Audit log</h2>
        {audit.length === 0 ? <p style={{ color: "#666" }}>No activity yet.</p> : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>{["When", "Action", "Entity", "Detail"].map((h) => (
              <th key={h} style={{ textAlign: "left", fontSize: 12, color: "#666", borderBottom: "1px solid #ddd", padding: "6px 8px" }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id as string}>
                  <td style={{ fontSize: 12, padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>{new Date(a.created_at as string).toLocaleString()}</td>
                  <td style={{ fontSize: 13, padding: "6px 8px", borderBottom: "1px solid #f0f0f0" }}>{a.action as string}</td>
                  <td style={{ fontSize: 12, padding: "6px 8px", borderBottom: "1px solid #f0f0f0", color: "#888" }}>{(a.entity_type as string) || ""}</td>
                  <td style={{ fontSize: 12, padding: "6px 8px", borderBottom: "1px solid #f0f0f0", color: "#666" }}>{(a.detail as string) || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
