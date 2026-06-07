"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { api } from "@/lib/api";

type Row = Record<string, number | string | null>;
type Group = { name: string; posts: number; views: number; engagement: number; leads: number; engagement_rate: number };
type Data = {
  posts: Row[];
  breakdowns: { byPlatform: Group[]; byPillar: Group[]; byContentType: Group[]; byCta: Group[]; byHook: Group[] };
  leadBreakdowns: { byPlatform: { name: string; count: number }[]; byCategory: { name: string; count: number }[]; byStatus: { name: string; count: number }[] };
};

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function ContentInsightsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }
      const brands = await api("/api/brands");
      if (!brands || brands.length === 0) { router.push("/brand/edit"); return; }
      try { setData(await api(`/api/analytics?brandId=${brands[0].id}`)); } catch { /* ignore */ }
      setReady(true);
    })();
  }, [router]);

  if (!ready) return <main style={{ padding: 24 }}>Loading…</main>;
  if (!data || data.posts.length === 0) {
    return (
      <main style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
        <h1 style={{ fontSize: 24 }}>Content Insights</h1>
        <p style={{ color: "#666" }}>No performance data yet. Enter metrics on the Posted page, then come back.</p>
      </main>
    );
  }

  const posts = data.posts;
  const byEng = [...posts].sort((a, b) => (b.engagement_rate as number) - (a.engagement_rate as number));
  const byLeads = [...posts].sort((a, b) => (b.leads_generated as number) - (a.leads_generated as number));
  const rankGroups = (g: Group[]) => [...g].sort((a, b) => b.engagement_rate - a.engagement_rate);

  const box = { border: "1px solid #ddd", borderRadius: 8, padding: 14, marginBottom: 16 } as const;
  const li = { fontSize: 14, marginBottom: 4 } as const;

  const PostList = ({ rows, metric }: { rows: Row[]; metric: "eng" | "leads" }) => (
    <ol style={{ margin: 0, paddingLeft: 20 }}>
      {rows.slice(0, 5).map((r) => (
        <li key={r.id as string} style={li}>
          <button onClick={() => router.push(`/drafts/${r.id}`)} style={{ background: "none", border: "none", color: "#0a58ca", cursor: "pointer", padding: 0, textAlign: "left" }}>
            {(r.title as string)}
          </button>{" "}
          <span style={{ color: "#666" }}>
            ({r.platform as string} · {metric === "eng" ? pct(r.engagement_rate as number) + " eng" : (r.leads_generated as number) + " leads"})
          </span>
        </li>
      ))}
    </ol>
  );

  const GroupTable = ({ rows }: { rows: Group[] }) => (
    <ol style={{ margin: 0, paddingLeft: 20 }}>
      {rows.filter((r) => r.name !== "(none)").slice(0, 5).map((r) => (
        <li key={r.name} style={li}>{r.name} — {pct(r.engagement_rate)} eng, {r.leads} leads ({r.posts} posts)</li>
      ))}
      {rows.filter((r) => r.name !== "(none)").length === 0 && <li style={{ color: "#888" }}>Not enough data.</li>}
    </ol>
  );

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24 }}>Content Insights</h1>

      <div style={box}><h2 style={{ fontSize: 16, marginTop: 0 }}>Best posts by engagement</h2><PostList rows={byEng} metric="eng" /></div>
      <div style={box}><h2 style={{ fontSize: 16, marginTop: 0 }}>Best posts by leads</h2><PostList rows={byLeads} metric="leads" /></div>

      <div style={box}><h2 style={{ fontSize: 16, marginTop: 0 }}>Best platforms</h2><GroupTable rows={rankGroups(data.breakdowns.byPlatform)} /></div>
      <div style={box}><h2 style={{ fontSize: 16, marginTop: 0 }}>Best content pillars</h2><GroupTable rows={rankGroups(data.breakdowns.byPillar)} /></div>
      <div style={box}><h2 style={{ fontSize: 16, marginTop: 0 }}>Best content types</h2><GroupTable rows={rankGroups(data.breakdowns.byContentType)} /></div>
      <div style={box}><h2 style={{ fontSize: 16, marginTop: 0 }}>Best CTAs</h2><GroupTable rows={rankGroups(data.breakdowns.byCta)} /></div>
      <div style={box}><h2 style={{ fontSize: 16, marginTop: 0 }}>Best hooks</h2><GroupTable rows={rankGroups(data.breakdowns.byHook)} /></div>

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Worst-performing posts</h2>
        <PostList rows={[...byEng].reverse()} metric="eng" />
      </div>

      <div style={box}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Lead sources</h2>
        <p style={li}><strong>By platform:</strong> {data.leadBreakdowns.byPlatform.map((b) => `${b.name}: ${b.count}`).join(" · ") || "—"}</p>
        <p style={li}><strong>By category:</strong> {data.leadBreakdowns.byCategory.map((b) => `${b.name}: ${b.count}`).join(" · ") || "—"}</p>
        <p style={li}><strong>By status:</strong> {data.leadBreakdowns.byStatus.map((b) => `${b.name}: ${b.count}`).join(" · ") || "—"}</p>
      </div>

      <p style={{ color: "#666", fontSize: 13 }}>
        “Topics to repeat / avoid” and richer pattern analysis come from the <a href="/weekly-report" style={{ color: "#0a58ca" }}>AI Report</a>.
      </p>
    </main>
  );
}
