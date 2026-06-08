"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Asset = Record<string, unknown>;

/**
 * Reusable block for post detail / ready-to-post pages: shows media attached to
 * a post, lets the admin attach an existing library asset or quickly add an
 * external link (Canva/CapCut/stock URL) and attach it, and remove attachments.
 * Self-contained — fetches its own data via the API using the post id.
 */
export default function MediaAttach({ postId, brandId }: { postId: string; brandId?: string }) {
  const [attached, setAttached] = useState<Asset[]>([]);
  const [library, setLibrary] = useState<Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  const load = useCallback(async () => {
    const [a, lib] = await Promise.all([
      api(`/api/posts/${postId}/media`),
      api(`/api/media${brandId ? `?brandId=${brandId}` : ""}`),
    ]);
    setAttached(a ?? []);
    setLibrary(lib ?? []);
  }, [postId, brandId]);

  useEffect(() => { load().catch((e) => setMsg(e instanceof Error ? e.message : "Load failed")); }, [load]);

  const attachedIds = new Set(attached.map((a) => a.id as string));
  const available = library.filter((a) => !attachedIds.has(a.id as string));

  const attach = async (mediaId: string) => {
    if (!mediaId) return;
    setBusy(true); setMsg(null);
    try {
      await api(`/api/posts/${postId}/media`, { method: "POST", body: JSON.stringify({ mediaId }) });
      setPick("");
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Attach failed"); }
    finally { setBusy(false); }
  };

  const remove = async (mediaId: string) => {
    setBusy(true); setMsg(null);
    try {
      await api(`/api/posts/${postId}/media?mediaId=${mediaId}`, { method: "DELETE" });
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Remove failed"); }
    finally { setBusy(false); }
  };

  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 12, margin: "12px 0" } as const;

  return (
    <div style={box}>
      <strong style={{ fontSize: 14 }}>Media</strong>
      {msg && <p style={{ color: "#b00", fontSize: 13 }}>{msg}</p>}

      {attached.length === 0 ? (
        <p style={{ color: "#666", fontSize: 13, margin: "6px 0" }}>No media attached.</p>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "8px 0" }}>
          {attached.map((a) => (
            <div key={a.id as string} style={{ border: "1px solid #eee", borderRadius: 6, padding: 6, width: 140 }}>
              {a.file_kind === "image" && a.file_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.file_url as string} alt={a.title as string} style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 4 }} />
              ) : (
                <div style={{ height: 80, background: "#f3f3f3", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#888" }}>
                  {(a.file_kind as string) || (a.asset_type as string)}
                </div>
              )}
              <div style={{ fontSize: 12, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title as string}</div>
              <button onClick={() => remove(a.id as string)} disabled={busy} style={{ fontSize: 12, color: "#b00", marginTop: 2 }}>Remove</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
        <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ padding: 6 }}>
          <option value="">— attach from library —</option>
          {available.map((a) => (
            <option key={a.id as string} value={a.id as string}>
              {(a.title as string)} ({a.asset_type as string})
            </option>
          ))}
        </select>
        <button onClick={() => attach(pick)} disabled={busy || !pick}>Attach</button>
        <Link href="/media-library" style={{ fontSize: 13, color: "#0070f3" }}>+ Upload / add new media</Link>
      </div>
    </div>
  );
}
