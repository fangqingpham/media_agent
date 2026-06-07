"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import {
  PLATFORMS,
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  type ContentType,
} from "@/lib/contentTypes";

type Option = { id: string; name: string };

export default function ContentGeneratorPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [hasActiveBrain, setHasActiveBrain] = useState(false);
  const [pillars, setPillars] = useState<Option[]>([]);
  const [audiences, setAudiences] = useState<Option[]>([]);

  const [platform, setPlatform] = useState<string>("facebook");
  const [contentType, setContentType] = useState<ContentType>("facebook_post");
  const [pillarId, setPillarId] = useState("");
  const [audienceId, setAudienceId] = useState("");
  const [cta, setCta] = useState("");
  const [tone, setTone] = useState("");
  const [instruction, setInstruction] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) { router.push("/brand/edit"); return; }
      const b = brands[0];
      setBrandId(b.id);

      const active = await api(`/api/brands/${b.id}/briefs/active`);
      setHasActiveBrain(!!active);

      const [{ data: p }, { data: a }] = await Promise.all([
        supabase.from("content_pillars").select("id, name").eq("brand_id", b.id),
        supabase.from("target_audiences").select("id, name").eq("brand_id", b.id),
      ]);
      setPillars(p ?? []);
      setAudiences(a ?? []);
      setReady(true);
    })();
  }, [router]);

  const generate = async () => {
    if (!brandId) return;
    setLoading(true); setErr(null); setResult(null);
    try {
      const draft = await api("/api/posts/generate", {
        method: "POST",
        body: JSON.stringify({
          brandId, platform, contentType,
          pillarId: pillarId || null,
          audienceId: audienceId || null,
          cta: cta || null,
          tone: tone || null,
          userInstruction: instruction || null,
        }),
      });
      setResult(draft);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const field = { width: "100%", padding: 8, marginBottom: 12 } as const;
  const label = { display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 } as const;

  return (
    <main style={{ maxWidth: 820, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>AI Post Generator</h1>

      {!hasActiveBrain && (
        <div role="alert" style={{ background: "#fff3f3", border: "1px solid #f3c", borderRadius: 6, padding: 12, margin: "12px 0" }}>
          No active Brand Brain. <a href="/brain" style={{ color: "#0070f3" }}>Generate &amp; activate one</a> before creating posts.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={label}>Platform</label>
          <select style={field} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>Content type</label>
          <select style={field} value={contentType} onChange={(e) => setContentType(e.target.value as ContentType)}>
            {CONTENT_TYPES.map((t) => <option key={t} value={t}>{CONTENT_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>Content pillar</label>
          <select style={field} value={pillarId} onChange={(e) => setPillarId(e.target.value)}>
            <option value="">— none —</option>
            {pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>Target audience</label>
          <select style={field} value={audienceId} onChange={(e) => setAudienceId(e.target.value)}>
            <option value="">— none —</option>
            {audiences.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>CTA (optional)</label>
          <input style={field} value={cta} onChange={(e) => setCta(e.target.value)} placeholder="e.g. DM us to book a viewing" />
        </div>
        <div>
          <label style={label}>Tone (optional)</label>
          <input style={field} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="e.g. warm, practical" />
        </div>
      </div>
      <label style={label}>Extra instruction (optional)</label>
      <textarea style={field} rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} />

      <button onClick={generate} disabled={loading || !hasActiveBrain} style={{ padding: "10px 20px" }}>
        {loading ? "Generating…" : "Generate post"}
      </button>
      {err && <p style={{ color: "#b00", marginTop: 12 }}>{err}</p>}

      {result && <GeneratedCard draft={result} onChanged={setResult} />}
    </main>
  );
}

function GeneratedCard({
  draft,
  onChanged,
}: {
  draft: Record<string, unknown>;
  onChanged: (d: Record<string, unknown> | null) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const id = draft.id as string;
  const risk = draft.compliance_risk as string;
  const riskColor = risk === "high" ? "#b00" : risk === "medium" ? "#b80" : "#0a0";

  const regenerate = async () => {
    setBusy(true);
    try { onChanged(await api(`/api/posts/${id}/regenerate`, { method: "POST" })); }
    catch (e) { alert(e instanceof Error ? e.message : "Regenerate failed"); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!confirm("Delete this draft?")) return;
    setBusy(true);
    try { await api(`/api/posts/${id}`, { method: "DELETE" }); onChanged(null); }
    finally { setBusy(false); }
  };

  return (
    <article style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>{(draft.title as string) || "Generated post"}</strong>
        <span style={{ color: riskColor, fontWeight: 600 }}>risk: {risk}</span>
      </div>
      {draft.human_approval_required ? (
        <p style={{ color: "#b00", fontWeight: 600 }}>⚠ Human approval required</p>
      ) : null}
      {draft.hook ? <p><strong>Hook:</strong> {draft.hook as string}</p> : null}
      {draft.platform_caption ? <p style={{ whiteSpace: "pre-wrap" }}><strong>Caption:</strong> {draft.platform_caption as string}</p> : null}
      {Array.isArray(draft.hashtags) && (draft.hashtags as string[]).length > 0 ? (
        <p style={{ color: "#0070f3" }}>{(draft.hashtags as string[]).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}</p>
      ) : null}
      {draft.cta ? <p><strong>CTA:</strong> {draft.cta as string}</p> : null}
      {draft.visual_idea ? <p><strong>Visual:</strong> {draft.visual_idea as string}</p> : null}
      {draft.compliance_reason ? <p style={{ fontSize: 13, color: "#666" }}>{draft.compliance_reason as string}</p> : null}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={() => router.push(`/drafts/${id}`)} disabled={busy}>Edit / view</button>
        <button onClick={regenerate} disabled={busy}>{busy ? "…" : "Regenerate"}</button>
        <button onClick={del} disabled={busy} style={{ color: "#b00" }}>Delete</button>
      </div>
      <p style={{ fontSize: 13, color: "#888", marginTop: 8 }}>Saved as a draft. Find it later under Drafts or Calendar.</p>
    </article>
  );
}
