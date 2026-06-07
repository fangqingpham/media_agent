"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { PLATFORMS } from "@/lib/contentTypes";
import { LEAD_CATEGORIES, LEAD_PRIORITIES } from "@/lib/leadTypes";

function NewLeadInner() {
  const router = useRouter();
  const interactionId = useSearchParams().get("interactionId");

  const [ready, setReady] = useState(false);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [f, setF] = useState({
    name: "", platform: "facebook", profile_url: "", email: "", phone: "",
    city: "", province: "", lead_category: "General Inquiry", priority: "medium",
    original_message: "", intent_summary: "",
  });

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) { router.push("/brand/edit"); return; }
      setBrandId(brands[0].id);

      // pre-fill from interaction if provided
      if (interactionId) {
        try {
          const it = await api(`/api/interactions/${interactionId}`);
          setF((prev) => ({
            ...prev,
            name: it.person_name ?? "",
            platform: it.platform ?? "facebook",
            profile_url: it.profile_url ?? "",
            original_message: it.original_message ?? "",
            intent_summary: it.intent_summary ?? "",
            lead_category: it.suggested_lead_category || prev.lead_category,
          }));
        } catch { /* ignore, fall back to blank form */ }
      }
      setReady(true);
    })();
  }, [router, interactionId]);

  const save = async () => {
    if (!brandId) return;
    setBusy(true); setMsg(null);
    try {
      const lead = await api("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          brand_id: brandId,
          source_interaction_id: interactionId || null,
          ...f,
        }),
      });
      router.push(`/leads/${lead.id}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not create lead");
      setBusy(false);
    }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const field = { width: "100%", padding: 8, marginBottom: 10 } as const;
  const label = { display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 } as const;
  const set = (k: string, v: string) => setF({ ...f, [k]: v });

  return (
    <main style={{ maxWidth: 640, margin: "32px auto", padding: "0 16px" }}>
      <button onClick={() => router.back()} style={{ marginBottom: 12 }}>← Back</button>
      <h1 style={{ fontSize: 24 }}>Create lead</h1>
      {interactionId && <p style={{ color: "#0a7d36", fontSize: 14 }}>Pre-filled from interaction.</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><label style={label}>Name</label><input style={field} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div>
          <label style={label}>Platform</label>
          <select style={field} value={f.platform} onChange={(e) => set("platform", e.target.value)}>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div><label style={label}>Email</label><input style={field} value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div><label style={label}>Phone</label><input style={field} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div><label style={label}>City</label><input style={field} value={f.city} onChange={(e) => set("city", e.target.value)} /></div>
        <div><label style={label}>Province</label><input style={field} value={f.province} onChange={(e) => set("province", e.target.value)} /></div>
        <div>
          <label style={label}>Lead category</label>
          <select style={field} value={f.lead_category} onChange={(e) => set("lead_category", e.target.value)}>
            {LEAD_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>Priority</label>
          <select style={field} value={f.priority} onChange={(e) => set("priority", e.target.value)}>
            {LEAD_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <label style={label}>Profile URL</label>
      <input style={field} value={f.profile_url} onChange={(e) => set("profile_url", e.target.value)} />
      <label style={label}>Original message</label>
      <textarea style={field} rows={3} value={f.original_message} onChange={(e) => set("original_message", e.target.value)} />
      <label style={label}>Intent summary</label>
      <textarea style={field} rows={2} value={f.intent_summary} onChange={(e) => set("intent_summary", e.target.value)} />

      <button onClick={save} disabled={busy} style={{ padding: "10px 18px" }}>{busy ? "Creating…" : "Create lead"}</button>
      {msg && <p style={{ color: "#b00", marginTop: 12 }}>{msg}</p>}
    </main>
  );
}

export default function NewLeadPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <NewLeadInner />
    </Suspense>
  );
}
