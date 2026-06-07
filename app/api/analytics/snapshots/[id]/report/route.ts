import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { generateReport, AnalyticsError } from "@/services/analyticsService";

// POST /api/analytics/snapshots/:id/report  → generate + save the AI weekly report
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await generateReport(id, userId), { status: 201 });
  } catch (e) {
    if (e instanceof AnalyticsError) return NextResponse.json({ error: e.message }, { status: e.status });
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
