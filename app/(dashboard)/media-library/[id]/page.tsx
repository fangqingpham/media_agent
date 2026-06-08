"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { ASSET_TYPES, MEDIA_PLATFORMS } from "@/lib/mediaTypes";

type Row = Record<string, unknown>;

export default function MediaAssetDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [ready, setReady] = useState(false);
  const [asset, setAsset] = useState<Row | null>(null);
  const [usedInPosts, setUsedInPosts] = useState<Row[]>([]);
  const [usageLogs, setUsageLogs] = useState<Row[]>([]);
  const [pillars, setPillars] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [f, setF] = useState({
    title: "", asset_type: "image", tags: "", notes: "",
    external_edit_link: "", file_url: "", thumbnail_url: "", pillar_id: "",
    platforms: [] as string[],
  });
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const togglePlatform = (p: string) =>
    setF((s) => ({ ...s, platforms: s.platforms.includes(p) ? s.platforms.filter((x) => x !== p) : [...s.platforms, p] }));

  const hydrate = (a: Row) => {
    setAsset(a);
    setF({
      title: (a.title as string) ?? "",
      asset_type: (a.asset_type as string) ?? "image",
      tags: ((a.tags as string[]) ?? []).join(", "),
      notes: (a.notes as string) ?? "",
      external_edit_link: (a.external_edit_link as string) ?? "",
      file_url: (a.file_url as string) ?? "",
      thumbnail_url: (a.thumbnail_url as string) ?? "",
      pillar_id: (a.pillar_id as string) ?? "",
      platforms: (a.platforms as string[]) ?? [],
    });
  };

  const load = useCallback(async () => {
    const res = await api(`/api/media/${id}`);
    hydrate(res.asset);
    setUsedInPosts(res.used_in_posts ?? []);
    setUsageLogs(res.usage_logs ?? []);
  }, [id]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      try {
        await load();
        // content pillars are owner-scoped via RLS — safe to read from the browser client
        const { data: p } = await supabase.from("content_pillars").select("id, name");
        setPillars(p ?? []);
      } catch (e) { setMsg(e instanceof Error ? e.message : "Load failed"); }
      setReady(true);
    })();
  }, [router, load]);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await api(`/api/media/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: f.title, asset_type: f.asset_type,
          tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
          notes: f.notes, external_edit_link: f.external_edit_link || null,
          file_url: f.file_url || null, thumbnail_url: f.thumbnail_url || null,
          pillar_id: f.pillar_id || null, platforms: f.platforms,
        }),
      });
      setMsg("Saved.");
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(false); }
  };

  const del = async () => {
    if (!confirm("Delete this asset? This also removes the uploaded file.")) return;
    setBusy(true);
    try { await api(`/api/media/${id}`, { method: "DELETE" }); router.push("/media-library"); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Delete failed"); setBusy(false); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;
  if (!asset) return <main style={{ padding: 24 }}>{msg || "Not found"} <Link href="/media-library">Back</Link></main>;

  const label = { display: "block", fontSize: 13, color: "#444", marginTop: 10, marginBottom: 2 } as const;
  const input = { width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" as const };
  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 } as const;

  return (
    <main style={{ maxWidth: 820, margin: "32px auto", padding: "0 16px" }}>
      <Link href="/media-library" style={{ fontSize: 13, color: "#0070f3" }}>← Media library</Link>
      <h1 style={{ fontSize: 22 }}>{asset.title as string}</h1>

      {msg && <p style={{ background: msg === "Saved." ? "#e6f7ed" : "#fdeaea", padding: 10, borderRadius: 6 }}>{msg}</p>}

      {/* preview */}
      <div style={box}>
        {asset.file_kind === "image" && (asset.file_url || asset.thumbnail_url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={(asset.file_url as string) || (asset.thumbnail_url as string)} alt={asset.title as string}
            style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8 }} />
        ) : asset.file_kind === "video" && asset.file_url ? (
          <video src={asset.file_url as string} controls style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 8 }} />
        ) : (
          <div style={{ color: "#888", fontSize: 14 }}>No inline preview ({asset.source as string} · {asset.asset_type as string}).</div>
        )}
        <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
          {asset.file_url ? <a href={asset.file_url as string} target="_blank" rel="noreferrer">Open file ↗</a> : null}
          {asset.external_edit_link ? <a href={asset.external_edit_link as string} target="_blank" rel="noreferrer">Open edit link ↗</a> : null}
        </div>
        <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
          Created {new Date(asset.created_at as string).toLocaleDateString()}
          {asset.last_used_date ? ` · last used ${new Date(asset.last_used_date as string).toLocaleDateString()}` : " · not used yet"}
        </div>
      </div>

      {/* edit */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Edit</h2>
        <label style={label}>Title</label>
        <input style={input} value={f.title} onChange={(e) => set("title", e.target.value)} />

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={label}>Asset type</label>
            <select style={input} value={f.asset_type} onChange={(e) => set("asset_type", e.target.value)}>
              {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={label}>Content pillar</label>
            <select style={input} value={f.pillar_id} onChange={(e) => set("pillar_id", e.target.value)}>
              <option value="">— none —</option>
              {pillars.map((p) => <option key={p.id as string} value={p.id as string}>{p.name as string}</option>)}
            </select>
          </div>
        </div>

        <label style={label}>Platform suitability</label>
        <div style={{ display: "flex", gap: 14, paddingTop: 4 }}>
          {MEDIA_PLATFORMS.map((p) => (
            <label key={p} style={{ fontSize: 13 }}>
              <input type="checkbox" checked={f.platforms.includes(p)} onChange={() => togglePlatform(p)} /> {p}
            </label>
          ))}
        </div>

        <label style={label}>File URL</label>
        <input style={input} value={f.file_url} onChange={(e) => set("file_url", e.target.value)} />
        <label style={label}>External edit link (Canva / CapCut)</label>
        <input style={input} value={f.external_edit_link} onChange={(e) => set("external_edit_link", e.target.value)} />
        <label style={label}>Thumbnail URL</label>
        <input style={input} value={f.thumbnail_url} onChange={(e) => set("thumbnail_url", e.target.value)} />
        <label style={label}>Tags (comma-separated)</label>
        <input style={input} value={f.tags} onChange={(e) => set("tags", e.target.value)} />
        <label style={label}>Usage notes</label>
        <textarea style={{ ...input, minHeight: 60 }} value={f.notes} onChange={(e) => set("notes", e.target.value)} />

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={save} disabled={busy} style={{ padding: "10px 18px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6 }}>
            {busy ? "…" : "Save"}
          </button>
          <button onClick={del} disabled={busy} style={{ color: "#b00", marginLeft: "auto" }}>Delete asset</button>
        </div>
      </div>

      {/* usage */}
      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Usage</h2>
        {usedInPosts.length === 0 ? (
          <p style={{ color: "#666", fontSize: 14 }}>Not attached to any posts yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {usedInPosts.map((p) => (
              <Link key={p.id as string} href={`/drafts/${p.id}`} style={{ textDecoration: "none", color: "inherit", border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
                <strong>{(p.title as string) || "(untitled)"}</strong>
                <span style={{ fontSize: 12, color: "#888" }}> · {p.platform as string} · {p.status as string}{p.scheduled_for ? ` · ${p.scheduled_for as string}` : ""}</span>
              </Link>
            ))}
          </div>
        )}
        {usageLogs.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
            <strong>History</strong>
            <ul style={{ margin: "6px 0 0" }}>
              {usageLogs.map((l) => (
                <li key={l.id as string}>{new Date(l.used_at as string).toLocaleString()} · {(l.platform as string) || "—"} · {(l.note as string) || ""}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
