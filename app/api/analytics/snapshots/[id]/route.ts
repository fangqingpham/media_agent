import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSnapshot, AnalyticsError } from "@/services/analyticsService";

// GET /api/analytics/snapshots/:id  → snapshot + its AI reports
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await getSnapshot(id, userId));
  } catch (e) {
    if (e instanceof AnalyticsError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
