"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { uploadMediaFile } from "@/lib/mediaUpload";
import { ASSET_TYPES, MEDIA_PLATFORMS, fileKindFromMime } from "@/lib/mediaTypes";

type Asset = Record<string, unknown>;

export default function MediaLibraryPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    title: "",
    asset_type: "image",
    source: "upload",
    file_url: "",
    external_edit_link: "",
    thumbnail_url: "",
    tags: "",
    notes: "",
    platforms: [] as string[],
  });
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const togglePlatform = (p: string) =>
    setForm((f) => ({ ...f, platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p] }));

  const load = useCallback(async () => {
    setAssets((await api("/api/media")) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (brands && brands.length > 0) setBrandId(brands[0].id);
      await load();
      setReady(true);
    })();
  }, [router, load]);

  const submit = async () => {
    setMsg(null);
    if (!brandId) { setMsg("No brand found."); return; }
    if (!form.title.trim()) { setMsg("Title is required."); return; }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        brand_id: brandId,
        title: form.title,
        asset_type: form.asset_type,
        source: form.source,
        external_edit_link: form.external_edit_link || null,
        thumbnail_url: form.thumbnail_url || null,
        tags: form.tags,
        notes: form.notes || null,
        platforms: form.platforms,
      };

      if (form.source === "upload") {
        const file = fileRef.current?.files?.[0];
        if (!file) { setMsg("Choose a file to upload."); setBusy(false); return; }
        const { publicUrl, path, mime } = await uploadMediaFile(brandId, file);
        payload.file_url = publicUrl;
        payload.storage_path = path;
        payload.mime_type = mime;
        payload.file_kind = fileKindFromMime(mime);
      } else {
        payload.file_url = form.file_url || null;
      }

      await api("/api/media", { method: "POST", body: JSON.stringify(payload) });
      setMsg("Asset added.");
      setForm((f) => ({ ...f, title: "", file_url: "", external_edit_link: "", thumbnail_url: "", tags: "", notes: "" }));
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not add asset"); }
    finally { setBusy(false); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const label = { display: "block", fontSize: 13, color: "#444", marginTop: 10, marginBottom: 2 } as const;
  const input = { width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" as const };
  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 } as const;

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Media library</h1>
      <p style={{ color: "#666", fontSize: 14 }}>
        Store images, videos, thumbnails, logos, and links to Canva/CapCut projects or stock media.
        Attach them to posts from the draft or ready-to-post pages.
      </p>
      {msg && <p style={{ background: msg.includes("added") ? "#e6f7ed" : "#fdeaea", padding: 10, borderRadius: 6 }}>{msg}</p>}

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Add media</h2>

        <label style={label}>Source</label>
        <select style={input} value={form.source} onChange={(e) => set("source", e.target.value)}>
          <option value="upload">Upload a file (image / video)</option>
          <option value="external">External edit link (Canva / CapCut)</option>
          <option value="stock">Stock image/video URL</option>
        </select>

        {form.source === "upload" && (
          <>
            <label style={label}>File</label>
            <input ref={fileRef} type="file" accept="image/*,video/*" style={input} />
            <p style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
              Needs a Supabase Storage bucket named <code>media</code> (public). If you haven&apos;t created it yet,
              use an external link or stock URL instead — those need no storage.
            </p>
          </>
        )}
        {form.source === "external" && (
          <>
            <label style={label}>Canva / CapCut edit link</label>
            <input style={input} value={form.external_edit_link} onChange={(e) => set("external_edit_link", e.target.value)} placeholder="https://www.canva.com/design/…" />
          </>
        )}
        {form.source === "stock" && (
          <>
            <label style={label}>Stock media URL</label>
            <input style={input} value={form.file_url} onChange={(e) => set("file_url", e.target.value)} placeholder="https://…" />
          </>
        )}

        <label style={label}>Title</label>
        <input style={input} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Renewal carousel cover" />

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={label}>Asset type</label>
            <select style={input} value={form.asset_type} onChange={(e) => set("asset_type", e.target.value)}>
              {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={label}>Platforms</label>
            <div style={{ display: "flex", gap: 12, paddingTop: 8 }}>
              {MEDIA_PLATFORMS.map((p) => (
                <label key={p} style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={form.platforms.includes(p)} onChange={() => togglePlatform(p)} /> {p}
                </label>
              ))}
            </div>
          </div>
        </div>

        <label style={label}>Thumbnail URL (optional)</label>
        <input style={input} value={form.thumbnail_url} onChange={(e) => set("thumbnail_url", e.target.value)} />

        <label style={label}>Tags (comma-separated)</label>
        <input style={input} value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="renewal, checklist, blue" />

        <label style={label}>Notes</label>
        <textarea style={{ ...input, minHeight: 50 }} value={form.notes} onChange={(e) => set("notes", e.target.value)} />

        <button onClick={submit} disabled={busy} style={{ marginTop: 14, padding: "10px 18px", background: "#0070f3", color: "#fff", border: "none", borderRadius: 6 }}>
          {busy ? "Saving…" : "Add to library"}
        </button>
      </div>

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Your assets ({assets.length})</h2>
        {assets.length === 0 ? <p style={{ color: "#666" }}>Nothing yet.</p> : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
            {assets.map((a) => (
              <Link key={a.id as string} href={`/media-library/${a.id}`}
                style={{ textDecoration: "none", color: "inherit", border: "1px solid #eee", borderRadius: 8, padding: 8 }}>
                {a.file_kind === "image" && (a.thumbnail_url || a.file_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={(a.thumbnail_url as string) || (a.file_url as string)} alt={a.title as string}
                    style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6 }} />
                ) : (
                  <div style={{ height: 100, background: "#f3f3f3", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 13 }}>
                    {(a.asset_type as string)}{a.source === "external" ? " · link" : ""}
                  </div>
                )}
                <div style={{ fontWeight: 600, fontSize: 14, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title as string}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{a.asset_type as string} · {a.source as string}</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
