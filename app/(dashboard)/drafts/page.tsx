"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import {
  PLATFORMS,
  POST_STATUSES,
  CONTENT_TYPE_LABELS,
  type ContentType,
} from "@/lib/contentTypes";

type Post = Record<string, unknown>;

export default function DraftsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async (bId: string, plat: string, stat: string) => {
    const params = new URLSearchParams({ brandId: bId });
    if (plat) params.set("platform", plat);
    if (stat) params.set("status", stat);
    setPosts((await api(`/api/posts?${params.toString()}`)) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) { router.push("/brand/edit"); return; }
      setBrandId(brands[0].id);
      await load(brands[0].id, "", "");
      setReady(true);
    })();
  }, [router, load]);

  useEffect(() => {
    if (brandId) load(brandId, platform, status);
  }, [brandId, platform, status, load]);

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const riskColor = (r: string) => (r === "high" ? "#b00" : r === "medium" ? "#b80" : "#0a0");

  return (
    <main style={{ maxWidth: 920, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Drafts</h1>

      <div style={{ display: "flex", gap: 12, margin: "12px 0", flexWrap: "wrap" }}>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ padding: 6 }}>
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: 6 }}>
          <option value="">All statuses</option>
          {POST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <a href="/content-generator" style={{ marginLeft: "auto", color: "#0070f3", alignSelf: "center" }}>+ New post</a>
      </div>

      {posts.length === 0 && <p>No posts yet. Generate one in the Generator.</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {posts.map((p) => (
          <button
            key={p.id as string}
            onClick={() => router.push(`/drafts/${p.id}`)}
            style={{ textAlign: "left", border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fff", cursor: "pointer" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{(p.title as string) || "(untitled)"}</strong>
              <span style={{ color: riskColor(p.compliance_risk as string), fontSize: 13 }}>
                risk: {p.compliance_risk as string}{p.human_approval_required ? " · approval needed" : ""}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
              {p.platform as string} · {CONTENT_TYPE_LABELS[p.content_type as ContentType] ?? (p.content_type as string)} · {p.status as string}
              {p.scheduled_for ? ` · 📅 ${p.scheduled_for as string}` : ""}
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}
