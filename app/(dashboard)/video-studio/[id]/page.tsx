"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { RiskBadge, CopyButton } from "@/components/badges";

type Row = Record<string, unknown>;

export default function VideoKitDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [ready, setReady] = useState(false);
  const [kit, setKit] = useState<Row | null>(null);
  const [scenes, setScenes] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Row[]>([]);
  const [posts, setPosts] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [attachPick, setAttachPick] = useState("");

  const [f, setF] = useState({ title: "", hook: "", voiceover: "", filming_notes: "", thumbnail_text: "", editing_notes: "", ai_video_prompt: "", caption: "", cta: "", hashtags: "" });
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  const hydrate = (k: Row) => {
    setKit(k);
    setF({
      title: (k.title as string) ?? "", hook: (k.hook as string) ?? "",
      voiceover: (k.voiceover as string) ?? "", filming_notes: (k.filming_notes as string) ?? "",
      thumbnail_text: (k.thumbnail_text as string) ?? "", editing_notes: (k.editing_notes as string) ?? "",
      ai_video_prompt: (k.ai_video_prompt as string) ?? "", caption: (k.caption as string) ?? "",
      cta: (k.cta as string) ?? "", hashtags: ((k.hashtags as string[]) ?? []).join(", "),
    });
  };

  const load = useCallback(async () => {
    const res = await api(`/api/video-kits/${id}`);
    hydrate(res.kit);
    setScenes(res.scenes ?? []);
    setNotes(res.notes ?? []);
    const p = await api(`/api/posts?brandId=${res.kit.brand_id}`);
    setPosts(p ?? []);
  }, [id]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      try { await load(); } catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
      setReady(true);
    })();
  }, [router, load]);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await api(`/api/video-kits/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...f, hashtags: f.hashtags.split(",").map((h) => h.trim()).filter(Boolean) }),
      });
      setMsg("Saved."); await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  };

  const attach = async () => {
    if (!attachPick) return;
    setBusy(true); setMsg(null);
    try { await api(`/api/video-kits/${id}/attach`, { method: "POST", body: JSON.stringify({ postId: attachPick }) }); setMsg("Attached to post."); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Attach failed"); }
    finally { setBusy(false); }
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    setBusy(true);
    try { await api(`/api/video-kits/${id}/notes`, { method: "POST", body: JSON.stringify({ note: noteText }) }); setNoteText(""); await load(); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Add note failed"); }
    finally { setBusy(false); }
  };

  const del = async () => {
    if (!confirm("Delete this video kit?")) return;
    setBusy(true);
    try { await api(`/api/video-kits/${id}`, { method: "DELETE" }); router.push("/video-studio"); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Delete failed"); setBusy(false); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;
  if (!kit) return <main style={{ padding: 24 }}>{msg || "Not found"} <Link href="/video-studio">Back</Link></main>;

  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 } as const;
  const input = { width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" as const };
  const label = { display: "block", fontSize: 13, color: "#444", marginTop: 10, marginBottom: 2 } as const;
  const list = (arr: unknown) => (Array.isArray(arr) ? (arr as string[]) : []);

  // Google Vids fields live in the saved raw_response (no DB migration needed).
  const vids = ((kit.raw_response as Row) || {}) as Row;
  const vchars = Array.isArray(vids.characters) ? (vids.characters as Row[]) : [];
  const vscenes = Array.isArray(vids.scenes) ? (vids.scenes as Row[]) : [];
  const hasVids = vscenes.some((s) => s.image_prompt || s.motion_prompt);
  const charSheet = [
    vids.art_style ? `STYLE: ${vids.art_style as string}` : "",
    ...vchars.map((c) => `${c.name as string}: ${c.description as string}`),
  ].filter(Boolean).join("\n\n");
  const speechSecs = (t: unknown) => {
    const s = typeof t === "string" ? t.trim() : "";
    const w = s ? s.split(/\s+/).length : 0;
    return Math.round((w / 2.5) * 10) / 10;
  };

  return (
    <main style={{ maxWidth: 860, margin: "32px auto", padding: "0 16px" }}>
      <Link href="/video-studio" style={{ fontSize: 13, color: "#0070f3" }}>← Video studio</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22 }}>{(kit.title as string) || "Video kit"}</h1>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <RiskBadge risk={kit.compliance_risk as string} />
          <span style={{ fontSize: 13, color: "#666" }}>{kit.platform as string} · {kit.duration_seconds as number}s</span>
        </span>
      </div>

      {kit.human_approval_required ? (
        <div style={{ background: "#fff3f3", border: "1px solid #f3c", borderRadius: 6, padding: 10, margin: "8px 0" }}>
          ⚠ Human approval required. {kit.compliance_reason ? <span style={{ fontSize: 13 }}>{kit.compliance_reason as string}</span> : null}
        </div>
      ) : null}

      {msg && <p style={{ background: msg === "Saved." || msg.includes("Attached") ? "#e6f7ed" : "#fdeaea", padding: 10, borderRadius: 6 }}>{msg}</p>}

      {/* Google Vids production (paste-ready) */}
      {hasVids && (
        <div style={{ ...box, border: "2px solid #0070f3" }}>
          <h2 style={{ fontSize: 16, marginTop: 0 }}>🎬 Google Vids production (paste-ready)</h2>
          {vids.vids_setup ? <p style={{ fontSize: 13, color: "#444", marginTop: 0 }}>{vids.vids_setup as string}</p> : null}

          {(vchars.length > 0 || vids.art_style) && (
            <div style={{ background: "#f6f8fb", border: "1px solid #e3e7ec", borderRadius: 6, padding: 10, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <strong style={{ fontSize: 14 }}>Character &amp; style sheet</strong>
                <CopyButton text={charSheet} label="Copy sheet" />
              </div>
              {vids.art_style ? <div style={{ fontSize: 13, marginBottom: 4 }}><em>Style:</em> {vids.art_style as string}</div> : null}
              {vchars.map((c, i) => (
                <div key={i} style={{ fontSize: 13, marginBottom: 4 }}><strong>{c.name as string}:</strong> {c.description as string}</div>
              ))}
              <p style={{ fontSize: 12, color: "#6b7280", margin: "6px 0 0" }}>Generate one reference image per clip below, then use “Animate an image” in Google Vids (Portrait 9:16).</p>
            </div>
          )}

          <div style={{ display: "grid", gap: 10 }}>
            {vscenes.map((s, i) => {
              const reuse = Number(s.reuse_image_from_scene) || 0;
              const secs = speechSecs(s.dialogue);
              return (
                <div key={i} style={{ border: "1px solid #e3e7ec", borderRadius: 6, padding: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <strong style={{ fontSize: 13 }}>Clip {s.scene_number as number}{s.timestamp ? ` · ${s.timestamp as string}` : ""}</strong>
                    {Array.isArray(s.characters_in_shot) && (s.characters_in_shot as string[]).length > 0
                      ? <span style={{ fontSize: 12, color: "#6b7280" }}>In shot: {(s.characters_in_shot as string[]).join(", ")}</span>
                      : <span style={{ fontSize: 12, color: "#6b7280" }}>Establishing shot</span>}
                  </div>

                  {reuse > 0 ? (
                    <div style={{ fontSize: 13, background: "#fff8e6", border: "1px solid #f0e0a8", borderRadius: 6, padding: 8, marginTop: 8 }}>
                      ↻ Reuse the image you generated for <strong>Clip {reuse}</strong> — don’t regenerate (keeps the characters identical).
                    </div>
                  ) : s.image_prompt ? (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>1) Image prompt</span>
                        <CopyButton text={s.image_prompt as string} label="Copy" />
                      </div>
                      <div style={{ fontSize: 13, whiteSpace: "pre-wrap", background: "#fafbfc", border: "1px solid #eee", borderRadius: 6, padding: 8 }}>{s.image_prompt as string}</div>
                    </div>
                  ) : null}

                  {s.motion_prompt ? (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>2) Motion prompt (Animate an image)</span>
                        <CopyButton text={s.motion_prompt as string} label="Copy" />
                      </div>
                      <div style={{ fontSize: 13, whiteSpace: "pre-wrap", background: "#fafbfc", border: "1px solid #eee", borderRadius: 6, padding: 8 }}>{s.motion_prompt as string}</div>
                    </div>
                  ) : null}

                  {s.dialogue ? (
                    <div style={{ fontSize: 13, marginTop: 8 }}>
                      <em>Dialogue:</em> “{s.dialogue as string}”{" "}
                      <span style={{ color: secs > 8 ? "#c0271a" : "#0a7d36", fontWeight: 600 }}>≈{secs}s{secs > 8 ? " / 8s ⚠ too long — trim" : " / 8s"}</span>
                    </div>
                  ) : null}

                  {s.on_screen ? <div style={{ fontSize: 13, marginTop: 6 }}><em>On-screen text:</em> {s.on_screen as string}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* scenes / shot list (legacy kits only; new kits use the Google Vids section above) */}
      {!hasVids && (
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Scene-by-scene shot list</h2>
        {scenes.length === 0 ? <p style={{ color: "#666" }}>No scenes.</p> : (
          <div style={{ display: "grid", gap: 8 }}>
            {scenes.map((s) => (
              <div key={s.id as string} style={{ border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
                <strong style={{ fontSize: 13 }}>#{s.scene_number as number} {s.timestamp_label ? `· ${s.timestamp_label as string}` : ""}</strong>
                {s.shot_description ? <div style={{ fontSize: 13 }}><em>Shot:</em> {s.shot_description as string}</div> : null}
                {s.voiceover ? <div style={{ fontSize: 13 }}><em>VO:</em> {s.voiceover as string}</div> : null}
                {s.on_screen ? <div style={{ fontSize: 13 }}><em>On-screen:</em> {s.on_screen as string}</div> : null}
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {/* lists */}
      <div style={box}>
        {list(kit.hook_variations).length > 0 && (
          <><strong style={{ fontSize: 14 }}>Hook variations</strong>
          <ul>{list(kit.hook_variations).map((h, i) => <li key={i} style={{ fontSize: 14 }}>{h}</li>)}</ul></>
        )}
        {list(kit.on_screen_text).length > 0 && (
          <><strong style={{ fontSize: 14 }}>On-screen text</strong>
          <ul>{list(kit.on_screen_text).map((t, i) => <li key={i} style={{ fontSize: 14 }}>{typeof t === "string" ? t : JSON.stringify(t)}</li>)}</ul></>
        )}
        {list(kit.broll_suggestions).length > 0 && (
          <><strong style={{ fontSize: 14 }}>B-roll suggestions</strong>
          <ul>{list(kit.broll_suggestions).map((t, i) => <li key={i} style={{ fontSize: 14 }}>{t}</li>)}</ul></>
        )}
      </div>

      {/* editable core */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Script & notes</h2>
        <label style={label}>Title</label>
        <input style={input} value={f.title} onChange={(e) => set("title", e.target.value)} />
        <label style={label}>Hook</label>
        <input style={input} value={f.hook} onChange={(e) => set("hook", e.target.value)} />

        <label style={label}>Voiceover <CopyButton text={f.voiceover} label="Copy" /></label>
        <textarea style={{ ...input, minHeight: 90 }} value={f.voiceover} onChange={(e) => set("voiceover", e.target.value)} />

        <label style={label}>Filming notes</label>
        <textarea style={{ ...input, minHeight: 50 }} value={f.filming_notes} onChange={(e) => set("filming_notes", e.target.value)} />

        <label style={label}>Thumbnail text</label>
        <input style={input} value={f.thumbnail_text} onChange={(e) => set("thumbnail_text", e.target.value)} />

        <label style={label}>Editing notes (Canva / CapCut)</label>
        <textarea style={{ ...input, minHeight: 60 }} value={f.editing_notes} onChange={(e) => set("editing_notes", e.target.value)} />

        <label style={label}>AI video prompt (Veo / Kling / Runway / Canva) <CopyButton text={f.ai_video_prompt} label="Copy" /></label>
        <textarea style={{ ...input, minHeight: 60 }} value={f.ai_video_prompt} onChange={(e) => set("ai_video_prompt", e.target.value)} />

        <label style={label}>Caption <CopyButton text={f.caption} label="Copy" /></label>
        <textarea style={{ ...input, minHeight: 60 }} value={f.caption} onChange={(e) => set("caption", e.target.value)} />
        <label style={label}>CTA</label>
        <input style={input} value={f.cta} onChange={(e) => set("cta", e.target.value)} />
        <label style={label}>Hashtags (comma-separated)</label>
        <input style={input} value={f.hashtags} onChange={(e) => set("hashtags", e.target.value)} />

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={save} disabled={busy} style={{ padding: "10px 18px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6 }}>{busy ? "…" : "Save"}</button>
          <button onClick={del} disabled={busy} style={{ color: "#b00", marginLeft: "auto" }}>Delete kit</button>
        </div>
      </div>

      {/* attach + notes */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Attach to a post</h2>
        {kit.post_id ? (
          <p style={{ fontSize: 14 }}>Attached to <Link href={`/drafts/${kit.post_id}`}>this post ↗</Link>. You can re-attach to a different one below.</p>
        ) : <p style={{ color: "#666", fontSize: 14 }}>Not attached to a post.</p>}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={attachPick} onChange={(e) => setAttachPick(e.target.value)} style={{ padding: 6 }}>
            <option value="">— pick a post —</option>
            {posts.map((p) => <option key={p.id as string} value={p.id as string}>{(p.title as string) || "(untitled)"} ({p.platform as string})</option>)}
          </select>
          <button onClick={attach} disabled={busy || !attachPick}>Attach</button>
        </div>
      </div>

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Production notes</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={input} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. film outdoors next time" />
          <button onClick={addNote} disabled={busy || !noteText.trim()}>Add</button>
        </div>
        {notes.length > 0 && (
          <ul style={{ marginTop: 8, fontSize: 13, color: "#444" }}>
            {notes.map((n) => <li key={n.id as string}>{new Date(n.created_at as string).toLocaleString()} — {n.note as string}</li>)}
          </ul>
        )}
      </div>
    </main>
  );
}
