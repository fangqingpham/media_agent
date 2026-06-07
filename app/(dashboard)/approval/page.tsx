"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import {
  PLATFORMS,
  RISK_LEVELS,
  CONTENT_TYPE_LABELS,
  type ContentType,
} from "@/lib/contentTypes";
import { RiskBadge, StatusBadge } from "@/components/badges";

const QUEUE_STATUSES = ["pending_approval", "needs_revision", "approved", "rejected"];

type Post = Record<string, unknown>;

export default function ApprovalQueuePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [pillars, setPillars] = useState<{ id: string; name: string }[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [platform, setPlatform] = useState("");
  const [pillarId, setPillarId] = useState("");
  const [risk, setRisk] = useState("");
  const [status, setStatus] = useState("");
  const [humanApproval, setHumanApproval] = useState("");

  const load = useCallback(
    async (bId: string, f: { platform: string; pillarId: string; risk: string; status: string; humanApproval: string }) => {
      const p = new URLSearchParams({ brandId: bId });
      p.set("statusIn", status ? f.status : QUEUE_STATUSES.join(","));
      if (f.platform) p.set("platform", f.platform);
      if (f.pillarId) p.set("pillarId", f.pillarId);
      if (f.risk) p.set("risk", f.risk);
      if (f.humanApproval) p.set("humanApproval", f.humanApproval);
      setPosts((await api(`/api/posts?${p.toString()}`)) ?? []);
    },
    [status]
  );

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) { router.push("/brand/edit"); return; }
      setBrandId(brands[0].id);
      const { data: p } = await supabase.from("content_pillars").select("id, name").eq("brand_id", brands[0].id);
      setPillars(p ?? []);
      setReady(true);
    })();
  }, [router]);

  useEffect(() => {
    if (brandId) load(brandId, { platform, pillarId, risk, status, humanApproval });
  }, [brandId, platform, pillarId, risk, status, humanApproval, load]);

  const act = async (id: string, toStatus: string, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusyId(id);
    try {
      await api(`/api/posts/${id}/status`, { method: "POST", body: JSON.stringify({ toStatus }) });
      if (brandId) await load(brandId, { platform, pillarId, risk, status, humanApproval });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  return (
    <main style={{ maxWidth: 1000, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Approval Queue</h1>

      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          <option value="">All platforms</option>
          {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={pillarId} onChange={(e) => setPillarId(e.target.value)}>
          <option value="">All pillars</option>
          {pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="">All risk</option>
          {RISK_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Queue (all)</option>
          {QUEUE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={humanApproval} onChange={(e) => setHumanApproval(e.target.value)}>
          <option value="">Approval: any</option>
          <option value="true">Approval required</option>
          <option value="false">No approval needed</option>
        </select>
      </div>

      {posts.length === 0 && <p style={{ color: "#666" }}>Nothing in the queue. Send a draft to approval from its detail page.</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {posts.map((p) => {
          const id = p.id as string;
          const st = p.status as string;
          return (
            <article key={id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <strong>{(p.title as string) || "(untitled)"}</strong>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <RiskBadge risk={p.compliance_risk as string} />
                  <StatusBadge status={st} />
                  {p.human_approval_required ? <span style={{ color: "#c0271a", fontSize: 12, fontWeight: 600 }}>approval required</span> : null}
                </div>
              </div>
              <div style={{ fontSize: 13, color: "#666", margin: "4px 0" }}>
                {p.platform as string} · {CONTENT_TYPE_LABELS[p.content_type as ContentType] ?? (p.content_type as string)}
                {" · "}created {new Date(p.created_at as string).toLocaleDateString()}
              </div>
              {p.hook ? <p style={{ margin: "6px 0", color: "#333" }}>{(p.hook as string).slice(0, 140)}</p> : null}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <button onClick={() => router.push(`/approval/${id}`)} disabled={busyId === id}>View / Edit</button>
                {st !== "approved" && (
                  <button onClick={() => act(id, "approved")} disabled={busyId === id} style={{ color: "#0a7d36" }}>Approve</button>
                )}
                {st === "pending_approval" && (
                  <>
                    <button onClick={() => act(id, "needs_revision")} disabled={busyId === id}>Request revision</button>
                    <button onClick={() => act(id, "rejected", "Reject this post?")} disabled={busyId === id} style={{ color: "#c0271a" }}>Reject</button>
                    <button onClick={() => act(id, "draft", "Send back to draft?")} disabled={busyId === id}>Send to draft</button>
                  </>
                )}
                {(st === "needs_revision" || st === "rejected") && (
                  <button onClick={() => act(id, "draft", "Send back to draft?")} disabled={busyId === id}>Send to draft</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
