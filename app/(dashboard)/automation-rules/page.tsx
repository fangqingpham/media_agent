"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { TRIGGERS, TRIGGER_LABELS, ACTION_LABELS } from "@/lib/automationTypes";

type Row = Record<string, unknown>;

// curated action choices for the builder (omits the create_task alias of reminder)
const ACTION_CHOICES = [
  "notify_admin", "reminder", "send_to_compliance_review", "recommend_repurpose",
  "create_lead_candidate", "generate_reply_draft", "generate_next_post_ideas", "update_status",
] as const;

export default function AutomationRulesPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [rules, setRules] = useState<Row[]>([]);
  const [notifs, setNotifs] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    trigger: "followup_due",
    minScore: 80,
    metric: "reach",
    minValue: 1000,
    actions: ["notify_admin"] as string[],
    statusTarget: "needs_review",
  });
  const setF = (k: string, v: unknown) => setForm((s) => ({ ...s, [k]: v }));

  const load = useCallback(async () => {
    const [r, n] = await Promise.all([api("/api/automation-rules"), api("/api/automation/notifications")]);
    setRules(r ?? []); setNotifs(n ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      try { await load(); } catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
      setReady(true);
    })();
  }, [router, load]);

  const toggleAction = (a: string) =>
    setForm((s) => ({ ...s, actions: s.actions.includes(a) ? s.actions.filter((x) => x !== a) : [...s.actions, a] }));

  const conditionsFor = (): Record<string, unknown> => {
    if (form.trigger === "lead_score_updated") return { min_score: Number(form.minScore) };
    if (form.trigger === "performance_threshold_met") return { metric: form.metric, min_value: Number(form.minValue) };
    return {};
  };

  const create = async () => {
    if (!form.name.trim() || form.actions.length === 0) { setMsg("Name and at least one action are required."); return; }
    setBusy(true); setMsg(null);
    try {
      const actions = form.actions.map((type) =>
        type === "update_status" ? { type, params: { status: form.statusTarget } } : { type }
      );
      await api("/api/automation-rules", {
        method: "POST",
        body: JSON.stringify({ name: form.name, trigger: form.trigger, conditions: conditionsFor(), actions }),
      });
      setForm((s) => ({ ...s, name: "" })); setMsg("Rule created."); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Create failed"); }
    finally { setBusy(false); }
  };

  const toggleStatus = async (rule: Row) => {
    setBusy(true);
    try { await api(`/api/automation-rules/${rule.id}/status`, { method: "POST", body: JSON.stringify({ status: rule.status === "active" ? "paused" : "active" }) }); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(false); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    setBusy(true);
    try { await api(`/api/automation-rules/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Delete failed"); }
    finally { setBusy(false); }
  };

  const runNow = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api("/api/automation/run", { method: "POST", body: "{}" }); setMsg(`Ran ${r.rules} rule(s).`); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Run failed"); }
    finally { setBusy(false); }
  };

  const markRead = async (id: string) => {
    try { await api("/api/automation/notifications", { method: "POST", body: JSON.stringify({ id }) }); await load(); } catch { /* ignore */ }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 } as const;
  const input = { padding: 8, border: "1px solid #ccc", borderRadius: 6 } as const;
  const unread = notifs.filter((n) => !n.read);

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ fontSize: 24 }}>Automation rules</h1>
        <span style={{ display: "flex", gap: 8 }}>
          <Link href="/automation-logs" style={{ fontSize: 13, alignSelf: "center" }}>View logs →</Link>
          <button onClick={runNow} disabled={busy} style={{ padding: "8px 16px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6 }}>{busy ? "Running…" : "Run now"}</button>
        </span>
      </div>
      <p style={{ color: "#666", fontSize: 14 }}>
        Automate internal workflows — reminders, notifications, routing high-risk posts to compliance,
        and drafting replies. The engine never likes, follows, scrapes, cold-DMs, or auto-sends content,
        and only publishes through the approval/compliance-gated scheduler.
      </p>
      {msg && <p style={{ background: msg.includes("fail") || msg.includes("required") ? "#fdeaea" : "#e6f7ed", padding: 10, borderRadius: 6 }}>{msg}</p>}

      {/* notifications */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Notifications & reminders {unread.length > 0 ? <span style={{ color: "#c0271a" }}>({unread.length} unread)</span> : null}</h2>
        {notifs.length === 0 ? <p style={{ color: "#666" }}>Nothing yet. Create a rule and run it.</p> : (
          <div style={{ display: "grid", gap: 6, maxHeight: 240, overflowY: "auto" }}>
            {notifs.map((n) => (
              <div key={n.id as string} style={{ border: "1px solid #eee", borderRadius: 6, padding: 8, background: n.read ? "#fafafa" : "#fff", display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>
                  <strong style={{ fontSize: 13, color: n.level === "urgent" ? "#c0271a" : n.level === "warn" ? "#b8730a" : "#222" }}>
                    {n.kind === "reminder" ? "⏰ " : "🔔 "}{n.title as string}
                  </strong>
                  {n.body ? <div style={{ fontSize: 12, color: "#666" }}>{n.body as string}</div> : null}
                  <div style={{ fontSize: 11, color: "#aaa" }}>{new Date(n.created_at as string).toLocaleString()}</div>
                </span>
                {!n.read && <button onClick={() => markRead(n.id as string)} style={{ fontSize: 12, alignSelf: "start" }}>Mark read</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* builder */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>New rule</h2>
        <div style={{ display: "grid", gap: 10 }}>
          <input style={input} placeholder="Rule name (e.g. Notify me on hot leads)" value={form.name} onChange={(e) => setF("name", e.target.value)} />
          <label style={{ fontSize: 13 }}>When…
            <select style={{ ...input, marginLeft: 8 }} value={form.trigger} onChange={(e) => setF("trigger", e.target.value)}>
              {TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>)}
            </select>
          </label>

          {form.trigger === "lead_score_updated" && (
            <label style={{ fontSize: 13 }}>Minimum lead score
              <input type="number" style={{ ...input, marginLeft: 8, width: 90 }} value={form.minScore} onChange={(e) => setF("minScore", e.target.value)} />
            </label>
          )}
          {form.trigger === "performance_threshold_met" && (
            <div style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              Metric <input style={{ ...input, width: 120 }} value={form.metric} onChange={(e) => setF("metric", e.target.value)} />
              ≥ <input type="number" style={{ ...input, width: 110 }} value={form.minValue} onChange={(e) => setF("minValue", e.target.value)} />
            </div>
          )}

          <div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>Do…</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {ACTION_CHOICES.map((a) => (
                <label key={a} style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={form.actions.includes(a)} onChange={() => toggleAction(a)} /> {ACTION_LABELS[a]}
                </label>
              ))}
            </div>
            {form.actions.includes("update_status") && (
              <label style={{ fontSize: 13, display: "block", marginTop: 6 }}>Set status to
                <select style={{ ...input, marginLeft: 8 }} value={form.statusTarget} onChange={(e) => setF("statusTarget", e.target.value)}>
                  {["draft", "needs_review", "pending_approval", "rejected", "follow_up_later"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            )}
          </div>

          <button onClick={create} disabled={busy} style={{ padding: "10px 18px", background: "#0a7d36", color: "#fff", border: "none", borderRadius: 6, width: "fit-content" }}>
            {busy ? "Saving…" : "Create rule"}
          </button>
        </div>
      </div>

      {/* rules list */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Rules ({rules.length})</h2>
        {rules.length === 0 ? <p style={{ color: "#666" }}>No rules yet.</p> : (
          <div style={{ display: "grid", gap: 8 }}>
            {rules.map((r) => (
              <div key={r.id as string} style={{ border: "1px solid #eee", borderRadius: 6, padding: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <strong>{r.name as string}</strong>
                  <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: r.status === "active" ? "#0a7d36" : "#b8730a" }}>{r.status as string}</span>
                    <button onClick={() => toggleStatus(r)} disabled={busy} style={{ fontSize: 12 }}>{r.status === "active" ? "Pause" : "Activate"}</button>
                    <button onClick={() => del(r.id as string)} disabled={busy} style={{ fontSize: 12, color: "#b00" }}>Delete</button>
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                  When: {TRIGGER_LABELS[r.trigger as keyof typeof TRIGGER_LABELS] || (r.trigger as string)} · Do: {((r.actions as Row[]) ?? []).map((a) => a.type as string).join(", ")}
                  {typeof r.run_count === "number" ? ` · ran ${r.run_count}×` : ""}
                  {Number(r.error_count) > 0 ? ` · ${r.error_count} errors` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
