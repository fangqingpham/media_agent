"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";
import { PriorityBadge, LeadStatusBadge } from "@/components/leadBadges";

type Lead = Record<string, unknown>;
const today = () => new Date().toISOString().slice(0, 10);

export default function FollowUpsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) { router.push("/brand/edit"); return; }
      const all: Lead[] = (await api(`/api/leads?brandId=${brands[0].id}`)) ?? [];
      setLeads(all.filter((l) => !!l.follow_up_date));
      setReady(true);
    })();
  }, [router]);

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;

  const t = today();
  const overdue = leads.filter((l) => (l.follow_up_date as string) < t);
  const due = leads.filter((l) => (l.follow_up_date as string) === t);
  const upcoming = leads.filter((l) => (l.follow_up_date as string) > t)
    .sort((a, b) => ((a.follow_up_date as string) < (b.follow_up_date as string) ? -1 : 1));

  const Row = ({ l }: { l: Lead }) => (
    <button onClick={() => router.push(`/leads/${l.id}`)}
      style={{ textAlign: "left", border: "1px solid #ddd", borderRadius: 8, padding: 12, background: "#fff", cursor: "pointer", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong>{(l.name as string) || "(no name)"}</strong>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <PriorityBadge priority={l.priority as string} />
          <LeadStatusBadge status={l.lead_status as string} />
          <span style={{ fontSize: 13, color: "#444" }}>{l.follow_up_date as string}</span>
        </div>
      </div>
      {l.follow_up_notes ? <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>{l.follow_up_notes as string}</p> : null}
    </button>
  );

  const Section = ({ title, items, color }: { title: string; items: Lead[]; color: string }) => (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, color }}>{title} ({items.length})</h2>
      {items.length === 0 ? <p style={{ color: "#888" }}>Nothing here.</p> : (
        <div style={{ display: "grid", gap: 10 }}>{items.map((l) => <Row key={l.id as string} l={l} />)}</div>
      )}
    </section>
  );

  return (
    <main style={{ maxWidth: 860, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Follow-ups</h1>
      <Section title="Overdue" items={overdue} color="#c0271a" />
      <Section title="Due today" items={due} color="#b8730a" />
      <Section title="Upcoming" items={upcoming} color="#0a58ca" />
    </main>
  );
}
