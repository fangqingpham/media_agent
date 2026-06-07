import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { openai, OPENAI_MODEL } from "@/lib/openai";
import { buildWeeklyReportMessages } from "@/prompts/weeklyReport";

export class AnalyticsError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type AnalyticsFilters = {
  brandId: string;
  platform?: string | null;
  pillarId?: string | null;
  contentType?: string | null;
  from?: string | null; // YYYY-MM-DD
  to?: string | null;
};

const rate = (n: number, d: number) => (d > 0 ? n / d : 0);
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

async function verifyBrand(brandId: string, userId: string) {
  const { data } = await supabaseAdmin.from("brands").select("owner_id, name").eq("id", brandId).single();
  if (!data || data.owner_id !== userId) throw new AnalyticsError("Forbidden", 403);
  return data;
}

export async function computeAnalytics(filters: AnalyticsFilters, userId: string) {
  if (!filters.brandId) throw new AnalyticsError("brandId is required", 400);
  await verifyBrand(filters.brandId, userId);

  // 1. posts for this brand (+ optional dimension filters)
  let pq = supabaseAdmin
    .from("post_drafts")
    .select("*")
    .eq("owner_id", userId)
    .eq("brand_id", filters.brandId);
  if (filters.platform) pq = pq.eq("platform", filters.platform);
  if (filters.pillarId) pq = pq.eq("pillar_id", filters.pillarId);
  if (filters.contentType) pq = pq.eq("content_type", filters.contentType);
  const { data: postsRaw, error: postErr } = await pq;
  if (postErr) throw new AnalyticsError(postErr.message, 400);
  const posts = postsRaw ?? [];
  const postIds = posts.map((p) => p.id);

  // 2. performance, posting logs, pillars, leads
  const [{ data: perfRows }, { data: logRows }, { data: pillarRows }, { data: leadRows }] =
    await Promise.all([
      supabaseAdmin.from("post_performance_basic").select("*").eq("owner_id", userId),
      supabaseAdmin.from("manual_post_logs").select("post_id, posted_at").eq("owner_id", userId),
      supabaseAdmin.from("content_pillars").select("id, name").eq("brand_id", filters.brandId),
      supabaseAdmin.from("leads").select("*").eq("owner_id", userId).eq("brand_id", filters.brandId),
    ]);

  const perfById = new Map((perfRows ?? []).map((r) => [r.post_id, r]));
  const logById = new Map((logRows ?? []).map((r) => [r.post_id, r]));
  const pillarName = new Map((pillarRows ?? []).map((p) => [p.id, p.name]));

  // leads grouped by source post + status counts per post
  const leadsByPost = new Map<string, { total: number; qualified: number; booked: number; converted: number }>();
  for (const l of leadRows ?? []) {
    if (!l.source_post_id) continue;
    const e = leadsByPost.get(l.source_post_id) ?? { total: 0, qualified: 0, booked: 0, converted: 0 };
    e.total += 1;
    if (l.lead_status === "qualified") e.qualified += 1;
    if (l.lead_status === "booked_call") e.booked += 1;
    if (l.lead_status === "converted") e.converted += 1;
    leadsByPost.set(l.source_post_id, e);
  }

  const inRange = (d: string | null | undefined) => {
    if (!d) return true;
    const day = d.slice(0, 10);
    if (filters.from && day < filters.from) return false;
    if (filters.to && day > filters.to) return false;
    return true;
  };

  // 3. build per-post rows (only posted, or anything with performance entered)
  const rows = posts
    .map((p) => {
      const perf = perfById.get(p.id);
      const log = logById.get(p.id);
      const postedDate = (log?.posted_at as string) ?? (p.created_at as string);
      const hasPerf = !!perf;
      const isPosted = p.status === "posted";
      if (!isPosted && !hasPerf) return null;
      if (!inRange(postedDate)) return null;

      const views = perf?.views ?? 0;
      const likes = perf?.likes ?? 0;
      const comments = perf?.comments ?? 0;
      const shares = perf?.shares ?? 0;
      const saves = perf?.saves ?? 0;
      const dms = perf?.dms ?? 0;
      const perfLeads = perf?.leads ?? 0;
      const lf = leadsByPost.get(p.id) ?? { total: 0, qualified: 0, booked: 0, converted: 0 };
      const leadsGenerated = Math.max(perfLeads, lf.total);

      return {
        id: p.id,
        title: p.title ?? "(untitled)",
        platform: p.platform,
        pillar_id: p.pillar_id,
        pillar: p.pillar_id ? pillarName.get(p.pillar_id) ?? null : null,
        content_type: p.content_type,
        cta: p.cta ?? null,
        hook: p.hook ?? null,
        posted_date: postedDate?.slice(0, 10) ?? null,
        views, likes, comments, shares, saves, dms,
        leads_generated: leadsGenerated,
        qualified_leads: lf.qualified,
        booked_calls: lf.booked,
        converted_clients: lf.converted,
        engagement_rate: rate(likes + comments + shares + saves, views),
        dm_rate: rate(dms, views),
        lead_rate: rate(leadsGenerated, views),
        qualified_lead_rate: rate(lf.qualified, leadsGenerated),
      };
    })
    .filter(Boolean) as Array<Record<string, number | string | null>>;

  // 4. totals
  const n = (k: string) => rows.map((r) => Number(r[k]) || 0);
  const totals = {
    posts: rows.length,
    views: sum(n("views")),
    likes: sum(n("likes")),
    comments: sum(n("comments")),
    shares: sum(n("shares")),
    saves: sum(n("saves")),
    dms: sum(n("dms")),
    leads: sum(n("leads_generated")),
  };

  // 5. lead funnel from the leads table (date-filtered by created_at)
  const fl = (leadRows ?? []).filter((l) => {
    if (filters.platform && l.platform !== filters.platform) return false;
    return inRange(l.created_at as string);
  });
  const leadFunnel = {
    total_leads: fl.length,
    qualified_leads: fl.filter((l) => l.lead_status === "qualified").length,
    booked_calls: fl.filter((l) => l.lead_status === "booked_call").length,
    converted_clients: fl.filter((l) => l.lead_status === "converted").length,
  };

  // 6. breakdowns for insights
  const groupAgg = (key: string) => {
    const m = new Map<string, { posts: number; views: number; engagement: number; leads: number }>();
    for (const r of rows) {
      const k = (r[key] as string) || "(none)";
      const e = m.get(k) ?? { posts: 0, views: 0, engagement: 0, leads: 0 };
      e.posts += 1;
      e.views += Number(r.views) || 0;
      e.engagement += (Number(r.likes) || 0) + (Number(r.comments) || 0) + (Number(r.shares) || 0) + (Number(r.saves) || 0);
      e.leads += Number(r.leads_generated) || 0;
      m.set(k, e);
    }
    return Array.from(m.entries()).map(([name, v]) => ({
      name, ...v, engagement_rate: rate(v.engagement, v.views),
    }));
  };

  const breakdowns = {
    byPlatform: groupAgg("platform"),
    byPillar: groupAgg("pillar"),
    byContentType: groupAgg("content_type"),
    byCta: groupAgg("cta"),
    byHook: groupAgg("hook"),
  };

  // lead source breakdowns (from leads table)
  const leadGroup = (fn: (l: Record<string, unknown>) => string) => {
    const m = new Map<string, number>();
    for (const l of fl) {
      const k = fn(l) || "(none)";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).map(([name, count]) => ({ name, count }));
  };
  const leadBreakdowns = {
    byPlatform: leadGroup((l) => l.platform as string),
    byCategory: leadGroup((l) => l.lead_category as string),
    byStatus: leadGroup((l) => l.lead_status as string),
  };

  return { totals, leadFunnel, posts: rows, breakdowns, leadBreakdowns };
}

export async function createSnapshot(
  filters: AnalyticsFilters,
  userId: string,
  label?: string
) {
  const metrics = await computeAnalytics(filters, userId);
  const { data, error } = await supabaseAdmin
    .from("analytics_snapshots")
    .insert({
      owner_id: userId,
      brand_id: filters.brandId,
      label: label ?? `Snapshot ${new Date().toLocaleDateString()}`,
      date_from: filters.from ?? null,
      date_to: filters.to ?? null,
      filters,
      metrics,
    })
    .select()
    .single();
  if (error) throw new AnalyticsError(`Could not save snapshot: ${error.message}`, 500);
  return data;
}

export async function listSnapshots(brandId: string, userId: string) {
  await verifyBrand(brandId, userId);
  const { data } = await supabaseAdmin
    .from("analytics_snapshots")
    .select("id, label, date_from, date_to, created_at")
    .eq("owner_id", userId)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getSnapshot(id: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("analytics_snapshots")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new AnalyticsError("Snapshot not found", 404);
  if (data.owner_id !== userId) throw new AnalyticsError("Forbidden", 403);
  const { data: reports } = await supabaseAdmin
    .from("ai_reports")
    .select("*")
    .eq("snapshot_id", id)
    .order("created_at", { ascending: false });
  return { snapshot: data, reports: reports ?? [] };
}

export async function generateReport(snapshotId: string, userId: string) {
  const { data: snap, error } = await supabaseAdmin
    .from("analytics_snapshots")
    .select("*")
    .eq("id", snapshotId)
    .single();
  if (error || !snap) throw new AnalyticsError("Snapshot not found", 404);
  if (snap.owner_id !== userId) throw new AnalyticsError("Forbidden", 403);

  const metrics = snap.metrics as { totals?: { posts?: number } };
  if (!metrics || !metrics.totals || (metrics.totals.posts ?? 0) === 0) {
    throw new AnalyticsError("This snapshot has no post data to report on.", 400);
  }

  const { data: brand } = await supabaseAdmin
    .from("brands")
    .select("name")
    .eq("id", snap.brand_id)
    .single();

  const { data: brief } = await supabaseAdmin
    .from("brand_briefs")
    .select("system_context")
    .eq("brand_id", snap.brand_id)
    .eq("status", "active")
    .maybeSingle();
  if (!brief || !brief.system_context) {
    throw new AnalyticsError("No active Brand Brain found. Activate a brief first.", 409);
  }

  let completion;
  try {
    completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: buildWeeklyReportMessages({
        systemContext: brief.system_context,
        brandName: brand?.name ?? "the brand",
        metrics: snap.metrics,
      }),
      response_format: { type: "json_object" },
      temperature: 0.6,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    throw new AnalyticsError(`Report generation failed: ${msg}`, 502);
  }

  let report: Record<string, unknown>;
  try {
    report = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch {
    throw new AnalyticsError("Model returned invalid JSON. Try regenerating.", 502);
  }

  const { data, error: insErr } = await supabaseAdmin
    .from("ai_reports")
    .insert({
      owner_id: userId,
      brand_id: snap.brand_id,
      snapshot_id: snapshotId,
      model: OPENAI_MODEL,
      report,
    })
    .select()
    .single();
  if (insErr) throw new AnalyticsError(`Could not save report: ${insErr.message}`, 500);
  return data;
}
