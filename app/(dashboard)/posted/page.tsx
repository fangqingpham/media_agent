"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { CONTENT_TYPE_LABELS, type ContentType } from "@/lib/contentTypes";
import { StatusBadge } from "@/components/badges";

type Post = Record<string, unknown>;
const METRICS = ["views", "likes", "comments", "shares", "saves", "dms", "leads"] as const;

export default function PostedPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [perf, setPerf] = useState<Record<string, Record<string, number | string>>>({});
  const [logs, setLogs] = useState<Record<string, Post | null>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async (bId: string) => {
    const p = new URLSearchParams({ brandId: bId, status: "posted" });
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

  const expand = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    if (!perf[id]) {
      try {
        const [p, log] = await Promise.all([
          api(`/api/posts/${id}/performance`),
          api(`/api/posts/${id}/manual-log`),
        ]);
        const base: Record<string, number | string> = { notes: "" };
        METRICS.forEach((m) => (base[m] = p?.[m] ?? 0));
        base.notes = p?.notes ?? "";
        setPerf((prev) => ({ ...prev, [id]: base }));
        setLogs((prev) => ({ ...prev, [id]: log }));
      } catch { /* ignore */ }
    }
  };

  const save = async (id: string) => {
    setBusyId(id); setMsg(null);
    try {
      const data = perf[id] ?? {};
      await api(`/api/posts/${id}/performance`, { method: "POST", body: JSON.stringify(data) });
      setMsg("Metrics saved.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusyId(null); }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const numField = { width: 90, padding: 6, marginRight: 8 } as const;

  return (
    <main style={{ maxWidth: 860, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Posted</h1>
      <p style={{ color: "#666" }}>Manually enter basic metrics. Full analytics comes in Stage 6.</p>

      {posts.length === 0 && <p style={{ color: "#666" }}>No posted content yet.</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {posts.map((post) => {
          const id = post.id as string;
          const log = logs[id];
          const data = perf[id] ?? {};
          return (
            <article key={id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>{(post.title as string) || "(untitled)"}</strong>
                <StatusBadge status={post.status as string} />
              </div>
              <div style={{ fontSize: 13, color: "#666", margin: "4px 0" }}>
                {post.platform as string} · {CONTENT_TYPE_LABELS[post.content_type as ContentType] ?? (post.content_type as string)}
              </div>
              <button onClick={() => expand(id)}>{open === id ? "Hide metrics" : "Enter / view metrics"}</button>

              {open === id && (
                <div style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10 }}>
                  {log?.post_url ? (
                    <p style={{ fontSize: 13 }}>
                      Post URL: <a href={log.post_url as string} target="_blank" rel="noreferrer" style={{ color: "#0a58ca" }}>{log.post_url as string}</a>
                      {log.posted_at ? ` · posted ${new Date(log.posted_at as string).toLocaleString()}` : ""}
                    </p>
                  ) : null}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {METRICS.map((m) => (
                      <label key={m} style={{ fontSize: 13 }}>
                        {m}
                        <br />
                        <input
                          type="number"
                          min={0}
                          style={numField}
                          value={(data[m] as number) ?? 0}
                          onChange={(e) => setPerf((prev) => ({ ...prev, [id]: { ...data, [m]: Number(e.target.value) } }))}
                        />
                      </label>
                    ))}
                  </div>
                  <textarea
                    placeholder="Notes"
                    style={{ width: "100%", padding: 6, marginBottom: 8 }}
                    rows={2}
                    value={(data.notes as string) ?? ""}
                    onChange={(e) => setPerf((prev) => ({ ...prev, [id]: { ...data, notes: e.target.value } }))}
                  />
                  <button onClick={() => save(id)} disabled={busyId === id}>{busyId === id ? "…" : "Save metrics"}</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </main>
  );
}
