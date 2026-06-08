import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getReview, ComplianceError } from "@/services/complianceService";

// GET /api/compliance/reviews/[id]  → { review, flags, decisions }
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await getReview(id, userId));
  } catch (e) {
    if (e instanceof ComplianceError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not load review" }, { status: 500 });
  }
}
