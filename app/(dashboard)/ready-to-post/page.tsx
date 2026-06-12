"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { CONTENT_TYPE_LABELS, isVideoType, type ContentType } from "@/lib/contentTypes";
import { RiskBadge, StatusBadge, CopyButton } from "@/components/badges";
import MediaAttach from "@/components/MediaAttach";

type Post = Record<string, unknown>;

// statuses that belong on this page: approved + ready_to_post + scheduled_manually
const READY_STATUSES = ["approved", "ready_to_post", "scheduled_manually"];

export default function ReadyToPostPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, { scheduledAt: string; postedAt: string; postUrl: string; notes: string }>>({});

  const load = useCallback(async (bId: string) => {
    const p = new URLSearchParams({ brandId: bId, statusIn: READY_STATUSES.join(",") });
    setPosts((await api(`/api/posts?${p.toString()}`)) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) { router.push("/brand/edit"); return; }
      setBrandId(brands[0].id);
      await load(brands[0].id);
      setReady(true);
    })();
  }, [router, load]);

  const formFor = (id: string) => forms[id] ?? { scheduledAt: "", postedAt: "", postUrl: "", notes: "" };
  const setFormFor = (id: string, patch: Partial<{ scheduledAt: string; postedAt: string; postUrl: string; notes: string }>) =>
    setForms((prev) => ({ ...prev, [id]: { ...formFor(id), ...patch } }));

  const toReady = async (id: string) => {
    setBusyId(id);
    try {
      await api(`/api/posts/${id}/status`, { method: "POST", body: JSON.stringify({ toStatus: "ready_to_post" }) });
      if (brandId) await load(brandId);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setBusyId(null); }
  };

  const markScheduled = async (post: Post) => {
    const id = post.id as string;
    const form = formFor(id);
    setBusyId(id);
    try {
      await api(`/api/posts/${id}/manual-log`, {
        method: "POST",
        body: JSON.stringify({ scheduledAt: form.scheduledAt || null, notes: form.notes || null, finalCaption: (post.caption as string) || (post.platform_caption as string) }),
      });
      await api(`/api/posts/${id}/status`, { method: "POST", body: JSON.stringify({ toStatus: "scheduled_manually", note: "Scheduled manually" }) });
      if (brandId) await load(brandId);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setBusyId(null); }
  };

  const markPosted = async (post: Post) => {
    const id = post.id as string;
    const form = formFor(id);
    if (form.postUrl && !/^https?:\/\//i.test(form.postUrl)) {
      alert("Post URL must start with http:// or https://");
      return;
    }
    setBusyId(id);
    try {
      await api(`/api/posts/${id}/manual-log`, {
        method: "POST",
        body: JSON.stringify({
          postedAt: form.postedAt || new Date().toISOString(),
          postUrl: form.postUrl || null,
          notes: form.notes || null,
          finalCaption: (post.caption as string) || (post.platform_caption as string),
        }),
      });
      await api(`/api/posts/${id}/status`, { method: "POST", body: JSON.stringify({ toStatus: "posted", note: "Marked posted" }) });
      if (brandId) await load(brandId);
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setBusyId(null); }
  };

  // Stage 7: publish via the official Facebook Graph API (with confirmation).
  const publishToFacebook = async (post: Post) => {
    const id = post.id as string;
    const highRisk = post.compliance_risk === "high";
    const confirmMsg = highRisk
      ? "This post is HIGH compliance risk. Publish to Facebook anyway?"
      : "Publish this post to your connected Facebook Page now?";
    if (!confirm(confirmMsg)) return;
    setBusyId(id);
    try {
      const r = await api("/api/social/facebook/publish", {
        method: "POST",
        body: JSON.stringify({ postId: id, allowHighRisk: highRisk }),
      });
      alert(`Published. Post ID: ${r.platform_post_id}`);
      if (brandId) await load(brandId);
    } catch (e) { alert(e instanceof Error ? e.message : "Publish failed"); }
    finally { setBusyId(null); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const field = { padding: 6, marginRight: 8, marginBottom: 6 } as const;

  return (
    <main style={{ maxWidth: 860, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Ready to Post</h1>
      <p style={{ color: "#666" }}>Approved posts to publish manually (Meta Business Suite / TikTok app), then log here.</p>

      {posts.length === 0 && <p style={{ color: "#666" }}>Nothing here yet. Approve a post in the queue first.</p>}

      <div style={{ display: "grid", gap: 14 }}>
        {posts.map((post) => {
          const id = post.id as string;
          const st = post.status as string;
          const hashtags = ((post.hashtags as string[]) ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
          // Prefer the full educational caption (matches what the publisher sends).
          const pubCaption = (post.caption as string) || (post.platform_caption as string) || "";
          const full = [pubCaption, hashtags].filter(Boolean).join("\n\n");
          const form = formFor(id);
          return (
            <article key={id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>{(post.title as string) || "(untitled)"}</strong>
                <div style={{ display: "flex", gap: 6 }}><RiskBadge risk={post.compliance_risk as string} /><StatusBadge status={st} /></div>
              </div>
              <div style={{ fontSize: 13, color: "#666", margin: "4px 0" }}>
                {post.platform as string} · {CONTENT_TYPE_LABELS[post.content_type as ContentType] ?? (post.content_type as string)}
              </div>

              {pubCaption ? <p style={{ whiteSpace: "pre-wrap" }}>{pubCaption}</p> : null}
              {hashtags ? <p style={{ color: "#0a58ca" }}>{hashtags}</p> : null}
              {post.visual_idea ? <p style={{ fontSize: 13 }}><strong>Visual:</strong> {post.visual_idea as string}</p> : null}
              {isVideoType(post.content_type as string) && post.video_script ? (
                <details><summary>Video script</summary><pre style={{ background: "#f6f6f6", padding: 10, borderRadius: 6, overflow: "auto", fontSize: 13 }}>{JSON.stringify(post.video_script, null, 2)}</pre></details>
              ) : null}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
                <CopyButton text={pubCaption} label="Copy caption" />
                <CopyButton text={hashtags} label="Copy hashtags" />
                <CopyButton text={full} label="Copy full post" />
                {post.platform === "facebook" && (
                  <button onClick={() => publishToFacebook(post)} disabled={busyId === id}
                    style={{ background: "#1877f2", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px" }}>
                    Publish to Facebook
                  </button>
                )}
              </div>

              <MediaAttach postId={id} brandId={brandId ?? undefined} />

              {st === "approved" && (
                <button onClick={() => toReady(id)} disabled={busyId === id}>Move to ready-to-post</button>
              )}

              {(st === "ready_to_post" || st === "scheduled_manually") && (
                <div style={{ marginTop: 8, borderTop: "1px solid #eee", paddingTop: 8 }}>
                  <div>
                    <label style={{ fontSize: 13 }}>Schedule date/time </label>
                    <input type="datetime-local" style={field} value={form.scheduledAt} onChange={(e) => setFormFor(id, { scheduledAt: e.target.value })} />
                    <button onClick={() => markScheduled(post)} disabled={busyId === id}>Mark scheduled</button>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 13 }}>Posted date/time </label>
                    <input type="datetime-local" style={field} value={form.postedAt} onChange={(e) => setFormFor(id, { postedAt: e.target.value })} />
                    <input placeholder="Post URL (https://…)" style={{ ...field, width: 220 }} value={form.postUrl} onChange={(e) => setFormFor(id, { postUrl: e.target.value })} />
                    <button onClick={() => markPosted(post)} disabled={busyId === id} style={{ color: "#0a7d36" }}>Mark posted</button>
                  </div>
                  <input placeholder="Notes (optional)" style={{ ...field, width: "100%", marginTop: 6 }} value={form.notes} onChange={(e) => setFormFor(id, { notes: e.target.value })} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
