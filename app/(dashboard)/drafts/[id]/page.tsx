"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import MediaAttach from "@/components/MediaAttach";
import {
  POST_STATUSES,
  CONTENT_TYPE_LABELS,
  isVideoType,
  isCarouselType,
  type ContentType,
} from "@/lib/contentTypes";

type Post = Record<string, unknown>;

export default function DraftDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [post, setPost] = useState<Post | null>(null);
  const [kits, setKits] = useState<Post[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // editable fields
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [caption, setCaption] = useState("");
  const [platformCaption, setPlatformCaption] = useState("");
  const [cta, setCta] = useState("");
  const [visualIdea, setVisualIdea] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [status, setStatus] = useState("draft");
  const [scheduledFor, setScheduledFor] = useState("");

  const hydrate = (p: Post) => {
    setPost(p);
    setTitle((p.title as string) ?? "");
    setHook((p.hook as string) ?? "");
    setCaption((p.caption as string) ?? "");
    setPlatformCaption((p.platform_caption as string) ?? "");
    setCta((p.cta as string) ?? "");
    setVisualIdea((p.visual_idea as string) ?? "");
    setHashtags(((p.hashtags as string[]) ?? []).join(", "));
    setStatus((p.status as string) ?? "draft");
    setScheduledFor((p.scheduled_for as string) ?? "");
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      try { hydrate(await api(`/api/posts/${id}`)); }
      catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
      try { setKits((await api(`/api/posts/${id}/video-kit`)) ?? []); } catch { /* ignore */ }
      setReady(true);
    })();
  }, [id, router]);

  const genVideoKit = async () => {
    setBusy(true); setMsg(null);
    try {
      const kit = await api(`/api/posts/${id}/video-kit`, { method: "POST", body: JSON.stringify({ durationSeconds: 30 }) });
      router.push(`/video-studio/${kit.id}`);
    } catch (e) { setMsg(e instanceof Error ? e.message : "Video kit failed"); setBusy(false); }
  };

  const save = async (extra: Record<string, unknown> = {}) => {
    setBusy(true); setMsg(null);
    try {
      const body = {
        title, hook, caption, platform_caption: platformCaption, cta,
        visual_idea: visualIdea,
        hashtags: hashtags.split(",").map((h) => h.trim()).filter(Boolean),
        status, scheduled_for: scheduledFor || null,
        ...extra,
      };
      hydrate(await api(`/api/posts/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
      setMsg("Saved.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  };

  const regenerate = async () => {
    setBusy(true); setMsg(null);
    try { hydrate(await api(`/api/posts/${id}/regenerate`, { method: "POST" })); setMsg("Regenerated."); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Regenerate failed"); }
    finally { setBusy(false); }
  };

  const sendToApproval = async () => {
    setStatus("pending_approval");
    await save({ status: "pending_approval" });
  };

  const del = async () => {
    if (!confirm("Delete this draft permanently?")) return;
    setBusy(true);
    try { await api(`/api/posts/${id}`, { method: "DELETE" }); router.push("/drafts"); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Delete failed"); setBusy(false); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;
  if (!post) return <main style={{ padding: 24 }}>{msg || "Not found"}</main>;

  const ct = post.content_type as ContentType;
  const risk = post.compliance_risk as string;
  const riskColor = risk === "high" ? "#b00" : risk === "medium" ? "#b80" : "#0a0";
  const field = { width: "100%", padding: 8, marginBottom: 12 } as const;
  const label = { display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 } as const;

  return (
    <main style={{ maxWidth: 760, margin: "32px auto", padding: "0 16px" }}>
      <button onClick={() => router.push("/drafts")} style={{ marginBottom: 12 }}>← Drafts</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22 }}>{post.platform as string} · {CONTENT_TYPE_LABELS[ct] ?? ct}</h1>
        <span style={{ color: riskColor, fontWeight: 600 }}>risk: {risk}</span>
      </div>

      {post.human_approval_required ? (
        <div role="alert" style={{ background: "#fff3f3", border: "1px solid #f3c", borderRadius: 6, padding: 10, margin: "8px 0" }}>
          ⚠ Human approval required before this can be posted.
          {post.compliance_reason ? <div style={{ fontSize: 13, marginTop: 4 }}>{post.compliance_reason as string}</div> : null}
        </div>
      ) : null}

      {Array.isArray(post.claims_to_check) && (post.claims_to_check as string[]).length > 0 ? (
        <div style={{ background: "#fffbe6", border: "1px solid #e8d27a", borderRadius: 6, padding: 10, margin: "8px 0", fontSize: 14 }}>
          <strong>Double-check these claims:</strong>
          <ul>{(post.claims_to_check as string[]).map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      ) : null}

      <label style={label}>Title</label>
      <input style={field} value={title} onChange={(e) => setTitle(e.target.value)} />
      <label style={label}>Hook</label>
      <input style={field} value={hook} onChange={(e) => setHook(e.target.value)} />
      <label style={label}>Caption</label>
      <textarea style={field} rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
      <label style={label}>Platform caption</label>
      <textarea style={field} rows={4} value={platformCaption} onChange={(e) => setPlatformCaption(e.target.value)} />
      <label style={label}>Hashtags (comma-separated)</label>
      <input style={field} value={hashtags} onChange={(e) => setHashtags(e.target.value)} />
      <label style={label}>CTA</label>
      <input style={field} value={cta} onChange={(e) => setCta(e.target.value)} />
      <label style={label}>Visual idea</label>
      <textarea style={field} rows={2} value={visualIdea} onChange={(e) => setVisualIdea(e.target.value)} />

      {post.media_suggestion ? (
        <div style={{ background: "#f0f7ff", border: "1px solid #cfe2ff", borderRadius: 6, padding: 10, marginBottom: 12, fontSize: 13 }}>
          <strong>AI media suggestion</strong>
          <div>Needed: {(post.media_suggestion as Record<string, unknown>).needed_type as string}</div>
          {(post.media_suggestion as Record<string, unknown>).could_use_existing ? <div>Could reuse: {(post.media_suggestion as Record<string, unknown>).could_use_existing as string}</div> : null}
          {(post.media_suggestion as Record<string, unknown>).suggested_thumbnail_text ? <div>Thumbnail text: “{(post.media_suggestion as Record<string, unknown>).suggested_thumbnail_text as string}”</div> : null}
          {(post.media_suggestion as Record<string, unknown>).suggested_overlay_text ? <div>Overlay text: “{(post.media_suggestion as Record<string, unknown>).suggested_overlay_text as string}”</div> : null}
        </div>
      ) : null}

      <MediaAttach postId={id} brandId={post.brand_id as string} />

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, margin: "12px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <strong style={{ fontSize: 14 }}>Video production</strong>
          <button onClick={genVideoKit} disabled={busy} style={{ background: "#0a7d36", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px" }}>
            {busy ? "…" : "Generate video production kit"}
          </button>
        </div>
        {kits.length > 0 && (
          <ul style={{ margin: "8px 0 0", fontSize: 13 }}>
            {kits.map((k) => (
              <li key={k.id as string}><Link href={`/video-studio/${k.id}`}>{(k.title as string) || "Video kit"}</Link> · {k.duration_seconds as number}s</li>
            ))}
          </ul>
        )}
      </div>

      {isVideoType(ct) && post.video_script ? (
        <div style={{ marginBottom: 12 }}>
          <strong>Video script</strong>
          <pre style={{ background: "#f6f6f6", padding: 10, borderRadius: 6, overflow: "auto", fontSize: 13 }}>
            {JSON.stringify(post.video_script, null, 2)}
          </pre>
        </div>
      ) : null}

      {isCarouselType(ct) && post.carousel_outline ? (
        <div style={{ marginBottom: 12 }}>
          <strong>Carousel outline</strong>
          <pre style={{ background: "#f6f6f6", padding: 10, borderRadius: 6, overflow: "auto", fontSize: 13 }}>
            {JSON.stringify(post.carousel_outline, null, 2)}
          </pre>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={label}>Status</label>
          <select style={field} value={status} onChange={(e) => setStatus(e.target.value)}>
            {POST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>Scheduled date</label>
          <input type="date" style={field} value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => save()} disabled={busy} style={{ padding: "10px 18px" }}>{busy ? "…" : "Save"}</button>
        <button onClick={regenerate} disabled={busy}>Regenerate</button>
        <button onClick={sendToApproval} disabled={busy}>Send to approval</button>
        <button onClick={del} disabled={busy} style={{ color: "#b00", marginLeft: "auto" }}>Delete</button>
      </div>
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
