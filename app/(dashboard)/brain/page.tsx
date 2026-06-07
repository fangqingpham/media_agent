"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";

type Brief = {
  id: string;
  version: number;
  status: string;
  voice_summary: string | null;
  audience_summary: string | null;
  pillars_summary: string | null;
  sample_hooks: { platform: string; hook: string }[];
  sample_ctas: string[];
  compliance_flags: { issue: string; recommendation: string }[];
};

export default function BrainPage() {
  const router = useRouter();
  const [brandId, setBrandId] = useState<string | null>(null);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadBriefs = async (id: string) => {
    const data = await api(`/api/brands/${id}/briefs`);
    setBriefs(data ?? []);
  };

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) {
        router.push("/brand/edit");
        return;
      }
      setBrandId(brands[0].id);
      await loadBriefs(brands[0].id);
      setReady(true);
    })();
  }, [router]);

  const generate = async () => {
    if (!brandId) return;
    setLoading(true);
    setErr(null);
    try {
      await api(`/api/brands/${brandId}/briefs`, { method: "POST" });
      await loadBriefs(brandId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const activate = async (briefId: string) => {
    if (!brandId) return;
    await api(`/api/brands/${brandId}/briefs/${briefId}/activate`, { method: "POST" });
    await loadBriefs(brandId);
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24 }}>AI Content Brain</h1>
      <p style={{ color: "#666" }}>
        Generates a reusable strategy brief from your brand setup. Activate one to use it
        in later stages.
      </p>
      <button onClick={generate} disabled={loading} style={{ padding: "10px 20px", margin: "12px 0" }}>
        {loading ? "Generating…" : "Generate brief"}
      </button>
      {err && <p style={{ color: "#b00" }}>{err}</p>}

      {briefs.length === 0 && <p>No briefs yet. Generate your first one.</p>}

      {briefs.map((b) => (
        <article key={b.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>
              v{b.version}{" "}
              <span style={{ color: b.status === "active" ? "#0a0" : "#888" }}>· {b.status}</span>
            </strong>
            {b.status !== "active" && (
              <button onClick={() => activate(b.id)} style={{ padding: "4px 12px" }}>
                Activate
              </button>
            )}
          </header>
          {b.voice_summary && <p><strong>Voice:</strong> {b.voice_summary}</p>}
          {b.audience_summary && <p><strong>Audience:</strong> {b.audience_summary}</p>}
          {b.pillars_summary && <p><strong>Pillars:</strong> {b.pillars_summary}</p>}

          {b.sample_hooks?.length > 0 && (
            <div>
              <strong>Sample hooks:</strong>
              <ul>{b.sample_hooks.map((h, i) => <li key={i}>[{h.platform}] {h.hook}</li>)}</ul>
            </div>
          )}
          {b.sample_ctas?.length > 0 && (
            <div>
              <strong>Sample CTAs:</strong>
              <ul>{b.sample_ctas.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </div>
          )}
          {b.compliance_flags?.length > 0 && (
            <div role="alert" style={{ background: "#fff3f3", border: "1px solid #f3c", borderRadius: 6, padding: 10, marginTop: 8 }}>
              <strong>⚠ Compliance flags:</strong>
              <ul>{b.compliance_flags.map((f, i) => <li key={i}>{f.issue} — {f.recommendation}</li>)}</ul>
            </div>
          )}
        </article>
      ))}
    </main>
  );
}
