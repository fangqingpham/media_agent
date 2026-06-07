"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import {
  RISK_LEVELS,
  CONTENT_TYPE_LABELS,
  isVideoType,
  isCarouselType,
  type ContentType,
} from "@/lib/contentTypes";
import { RiskBadge, StatusBadge } from "@/components/badges";

type Post = Record<string, unknown>;
type History = Record<string, unknown>;

export default function ApprovalReviewPage() {
  const router = useRouter();
  const id = (useParams().id as string);

  const [post, setPost] = useState<Post | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [f, setF] = useState({
    title: "", hook: "", caption: "", platform_caption: "", cta: "",
    visual_idea: "", hashtags: "", compliance_risk: "low",
    compliance_reason: "", human_approval_required: false, admin_notes: "",
  });

  const hydrate = (p: Post) => {
    setPost(p);
    setF({
      title: (p.title as string) ?? "",
      hook: (p.hook as string) ?? "",
      caption: (p.caption as string) ?? "",
      platform_caption: (p.platform_caption as string) ?? "",
      cta: (p.cta as string) ?? "",
      visual_idea: (p.visual_idea as string) ?? "",
      hashtags: ((p.hashtags as string[]) ?? []).join(", "),
      compliance_risk: (p.compliance_risk as string) ?? "low",
      compliance_reason: (p.compliance_reason as string) ?? "",
      human_approval_required: !!p.human_approval_required,
      admin_notes: (p.admin_notes as string) ?? "",
    });
  };

  const loadHistory = async () => {
    try { setHistory((await api(`/api/posts/${id}/history`)) ?? []); } catch { /* ignore */ }
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      try { hydrate(await api(`/api/posts/${id}`)); await loadHistory(); }
      catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  const saveFields = async () => {
    setBusy(true); setMsg(null);
    try {
      const body = {
        title: f.title, hook: f.hook, caption: f.caption,
        platform_caption: f.platform_caption, cta: f.cta, visual_idea: f.visual_idea,
        hashtags: f.hashtags.split(",").map((h) => h.trim()).filter(Boolean),
        compliance_risk: f.compliance_risk, compliance_reason: f.compliance_reason,
        human_approval_required: f.human_approval_required, admin_notes: f.admin_notes,
      };
      hydrate(await api(`/api/posts/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
      setMsg("Saved.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  };

  const changeStatus = async (toStatus: string, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(true); setMsg(null);
    try {
      hydrate(await api(`/api/posts/${id}/status`, { method: "POST", body: JSON.stringify({ toStatus }) }));
      await loadHistory();
      setMsg(`Status → ${toStatus}`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Status change failed"); }
    finally { setBusy(false); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;
  if (!post) return <main style={{ padding: 24 }}>{msg || "Not found"}</main>;

  const ct = post.content_type as ContentType;
  const st = post.status as string;
  const field = { width: "100%", padding: 8, marginBottom: 12 } as const;
  const label = { display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 } as const;

  return (
    <main style={{ maxWidth: 780, margin: "32px auto", padding: "0 16px" }}>
      <button onClick={() => router.push("/approval")} style={{ marginBottom: 12 }}>← Back to queue</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22 }}>{post.platform as string} · {CONTENT_TYPE_LABELS[ct] ?? ct}</h1>
        <div style={{ display: "flex", gap: 6 }}>
          <RiskBadge risk={post.compliance_risk as string} />
          <StatusBadge status={st} />
        </div>
      </div>

      <h2 style={{ fontSize: 16, marginTop: 16 }}>Content</h2>
      <label style={label}>Title</label>
      <input style={field} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <label style={label}>Hook</label>
      <input style={field} value={f.hook} onChange={(e) => setF({ ...f, hook: e.target.value })} />
      <label style={label}>Caption</label>
      <textarea style={field} rows={3} value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} />
      <label style={label}>Platform caption</label>
      <textarea style={field} rows={4} value={f.platform_caption} onChange={(e) => setF({ ...f, platform_caption: e.target.value })} />
      <label style={label}>Hashtags (comma-separated)</label>
      <input style={field} value={f.hashtags} onChange={(e) => setF({ ...f, hashtags: e.target.value })} />
      <label style={label}>CTA</label>
      <input style={field} value={f.cta} onChange={(e) => setF({ ...f, cta: e.target.value })} />
      <label style={label}>Visual idea</label>
      <textarea style={field} rows={2} value={f.visual_idea} onChange={(e) => setF({ ...f, visual_idea: e.target.value })} />

      {isVideoType(ct) && post.video_script ? (
        <><strong>Video script</strong><pre style={{ background: "#f6f6f6", padding: 10, borderRadius: 6, overflow: "auto", fontSize: 13 }}>{JSON.stringify(post.video_script, null, 2)}</pre></>
      ) : null}
      {isCarouselType(ct) && post.carousel_outline ? (
        <><strong>Carousel outline</strong><pre style={{ background: "#f6f6f6", padding: 10, borderRadius: 6, overflow: "auto", fontSize: 13 }}>{JSON.stringify(post.carousel_outline, null, 2)}</pre></>
      ) : null}

      <h2 style={{ fontSize: 16, marginTop: 16 }}>Compliance &amp; admin</h2>
      <label style={label}>Compliance risk</label>
      <select style={field} value={f.compliance_risk} onChange={(e) => setF({ ...f, compliance_risk: e.target.value })}>
        {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <label style={label}>Compliance notes</label>
      <textarea style={field} rows={2} value={f.compliance_reason} onChange={(e) => setF({ ...f, compliance_reason: e.target.value })} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <input type="checkbox" checked={f.human_approval_required} onChange={(e) => setF({ ...f, human_approval_required: e.target.checked })} />
        Human approval required
      </label>
      <label style={label}>Admin notes</label>
      <textarea style={field} rows={2} value={f.admin_notes} onChange={(e) => setF({ ...f, admin_notes: e.target.value })} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button onClick={saveFields} disabled={busy} style={{ padding: "10px 18px" }}>{busy ? "…" : "Save changes"}</button>
        <button onClick={() => changeStatus("approved")} disabled={busy} style={{ color: "#0a7d36" }}>Approve</button>
        <button onClick={() => changeStatus("needs_revision")} disabled={busy}>Request revision</button>
        <button onClick={() => changeStatus("rejected", "Reject this post?")} disabled={busy} style={{ color: "#c0271a" }}>Reject</button>
      </div>
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Status history</h2>
      {history.length === 0 ? (
        <p style={{ color: "#666" }}>No status changes yet.</p>
      ) : (
        <ul style={{ fontSize: 14 }}>
          {history.map((h) => (
            <li key={h.id as string}>
              {(h.from_status as string) ?? "—"} → <strong>{h.to_status as string}</strong>
              {" · "}{new Date(h.created_at as string).toLocaleString()}
              {h.note ? ` · ${h.note as string}` : ""}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
