"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";

export default function BrandPage() {
  const router = useRouter();
  const [brand, setBrand] = useState<Record<string, unknown> | null>(null);
  const [counts, setCounts] = useState({ audiences: 0, pillars: 0, hasVoice: false });
  const [ready, setReady] = useState(false);

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
      if (brands && brands.length > 0) {
        const b = brands[0];
        setBrand(b);
        const [{ count: a }, { count: p }, { data: v }] = await Promise.all([
          supabase.from("target_audiences").select("*", { count: "exact", head: true }).eq("brand_id", b.id),
          supabase.from("content_pillars").select("*", { count: "exact", head: true }).eq("brand_id", b.id),
          supabase.from("brand_voice").select("brand_id").eq("brand_id", b.id).maybeSingle(),
        ]);
        setCounts({ audiences: a ?? 0, pillars: p ?? 0, hasVoice: !!v });
      }
      setReady(true);
    })();
  }, [router]);

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  if (!brand) {
    return (
      <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "system-ui" }}>
        <h1>No brand yet</h1>
        <p><a href="/brand/edit" style={{ color: "#0070f3" }}>→ Set up your brand</a></p>
      </main>
    );
  }

  const item = (ok: boolean, label: string) => (
    <li style={{ color: ok ? "#0a0" : "#b00" }}>{ok ? "✓" : "✗"} {label}</li>
  );

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24 }}>{brand.name as string}</h1>
      <p style={{ color: "#666" }}>{(brand.description as string) || "No description yet"}</p>
      <p><strong>Service area:</strong> {(brand.service_area as string) || "—"}</p>

      <h2 style={{ fontSize: 18, marginTop: 24 }}>Setup completeness</h2>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {item(!!brand.description, "Description")}
        {item(counts.hasVoice, "Brand voice")}
        {item(counts.audiences > 0, `Audience (${counts.audiences})`)}
        {item(counts.pillars > 0, `Content pillar (${counts.pillars})`)}
      </ul>

      <p style={{ marginTop: 16 }}>
        <a href="/brand/edit" style={{ color: "#0070f3" }}>Edit</a>
        {"  ·  "}
        <a href="/brain" style={{ color: "#0070f3" }}>Content Brain →</a>
      </p>
    </main>
  );
}
