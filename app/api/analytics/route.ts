import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { computeAnalytics, AnalyticsError, type AnalyticsFilters } from "@/services/analyticsService";

// GET /api/analytics?brandId=&platform=&pillarId=&contentType=&from=&to=
// Live analytics: totals, lead funnel, per-post rows, and breakdowns.
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const filters: AnalyticsFilters = {
    brandId: url.searchParams.get("brandId") ?? "",
    platform: url.searchParams.get("platform"),
    pillarId: url.searchParams.get("pillarId"),
    contentType: url.searchParams.get("contentType"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  };

  try {
    return NextResponse.json(await computeAnalytics(filters, userId));
  } catch (e) {
    if (e instanceof AnalyticsError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
