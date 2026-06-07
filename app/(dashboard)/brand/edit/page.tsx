"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";

// Stage 1 form: creates/updates the brand core fields, then upserts voice,
// audiences, and pillars directly via Supabase (RLS protects the rows).
export default function BrandEditPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);

  // core brand
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [website, setWebsite] = useState("");
  const [complianceNotes, setComplianceNotes] = useState("");

  // voice
  const [tone, setTone] = useState(""); // comma-separated
  const [wordsToAvoid, setWordsToAvoid] = useState("");
  const [emojiUsage, setEmojiUsage] = useState("minimal");

  // one audience + one pillar to start (keep Stage 1 simple)
  const [audienceName, setAudienceName] = useState("");
  const [audienceDesc, setAudienceDesc] = useState("");
  const [pillarName, setPillarName] = useState("");
  const [pillarDesc, setPillarDesc] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }
      // load existing brand if any
      const brands = await api("/api/brands");
      if (brands && brands.length > 0) {
        const b = brands[0];
        setBrandId(b.id);
        setName(b.name ?? "");
        setDescription(b.description ?? "");
        setServiceArea(b.service_area ?? "");
        setWebsite(b.website ?? "");
        setComplianceNotes(b.compliance_notes ?? "");
        const { data: voice } = await supabase
          .from("brand_voice")
          .select("*")
          .eq("brand_id", b.id)
          .maybeSingle();
        if (voice) {
          setTone((voice.tone ?? []).join(", "));
          setWordsToAvoid((voice.words_to_avoid ?? []).join(", "));
          setEmojiUsage(voice.emoji_usage ?? "minimal");
        }
      }
      setReady(true);
    })();
  }, [router]);

  const csv = (s: string) =>
    s.split(",").map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      let id = brandId;
      const payload = {
        name,
        description,
        service_area: serviceArea,
        website,
        compliance_notes: complianceNotes,
      };
      if (id) {
        await api(`/api/brands/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        const created = await api("/api/brands", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        id = created.id;
        setBrandId(id);
      }

      // voice (upsert on brand_id PK)
      await supabase.from("brand_voice").upsert({
        brand_id: id,
        tone: csv(tone),
        words_to_avoid: csv(wordsToAvoid),
        emoji_usage: emojiUsage,
      });

      // add one audience / pillar if provided and not already present
      if (audienceName) {
        await supabase.from("target_audiences").insert({
          brand_id: id,
          name: audienceName,
          description: audienceDesc,
        });
        setAudienceName("");
        setAudienceDesc("");
      }
      if (pillarName) {
        await supabase.from("content_pillars").insert({
          brand_id: id,
          name: pillarName,
          description: pillarDesc,
        });
        setPillarName("");
        setPillarDesc("");
      }

      setMsg("Saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const field = { width: "100%", padding: 8, marginBottom: 12 } as const;
  const label = { display: "block", fontWeight: 600, marginBottom: 4 } as const;

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Brand setup</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Fill this in, then go to the Content Brain to generate your strategy brief.
      </p>

      <h2 style={{ fontSize: 18, marginBottom: 8 }}>Identity</h2>
      <label style={label}>Brand name *</label>
      <input style={field} value={name} onChange={(e) => setName(e.target.value)} />
      <label style={label}>What the business does</label>
      <textarea style={field} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      <label style={label}>Service area</label>
      <input style={field} value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} placeholder="e.g. Greater Toronto Area" />
      <label style={label}>Website</label>
      <input style={field} value={website} onChange={(e) => setWebsite(e.target.value)} />

      <h2 style={{ fontSize: 18, margin: "16px 0 8px" }}>Voice</h2>
      <label style={label}>Tone (comma-separated)</label>
      <input style={field} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="friendly, professional, trustworthy" />
      <label style={label}>Words to avoid (comma-separated)</label>
      <input style={field} value={wordsToAvoid} onChange={(e) => setWordsToAvoid(e.target.value)} />
      <label style={label}>Emoji usage</label>
      <select style={field} value={emojiUsage} onChange={(e) => setEmojiUsage(e.target.value)}>
        <option value="none">none</option>
        <option value="minimal">minimal</option>
        <option value="moderate">moderate</option>
        <option value="heavy">heavy</option>
      </select>

      <h2 style={{ fontSize: 18, margin: "16px 0 8px" }}>Add an audience</h2>
      <input style={field} value={audienceName} onChange={(e) => setAudienceName(e.target.value)} placeholder="Audience name (e.g. First-time renters)" />
      <textarea style={field} rows={2} value={audienceDesc} onChange={(e) => setAudienceDesc(e.target.value)} placeholder="Who they are, what they need" />

      <h2 style={{ fontSize: 18, margin: "16px 0 8px" }}>Add a content pillar</h2>
      <input style={field} value={pillarName} onChange={(e) => setPillarName(e.target.value)} placeholder="Pillar name (e.g. Renting tips)" />
      <textarea style={field} rows={2} value={pillarDesc} onChange={(e) => setPillarDesc(e.target.value)} placeholder="What this pillar covers" />

      <h2 style={{ fontSize: 18, margin: "16px 0 8px" }}>Compliance</h2>
      <label style={label}>Compliance notes</label>
      <textarea style={field} rows={2} value={complianceNotes} onChange={(e) => setComplianceNotes(e.target.value)} placeholder="e.g. Follow fair-housing / Ontario Human Rights Code rules" />

      <button onClick={save} disabled={saving || !name} style={{ padding: "10px 20px" }}>
        {saving ? "Saving…" : "Save"}
      </button>
      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
      <p style={{ marginTop: 16 }}>
        <a href="/brain" style={{ color: "#0070f3" }}>→ Go to Content Brain</a>
      </p>
    </main>
  );
}
