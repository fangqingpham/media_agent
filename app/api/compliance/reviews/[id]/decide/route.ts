import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { decideReview, ComplianceError } from "@/services/complianceService";

// POST /api/compliance/reviews/[id]/decide  { decision: 'approved'|'rejected'|'needs_changes', note? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { decision?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.decision) return NextResponse.json({ error: "decision required" }, { status: 400 });
  try {
    return NextResponse.json(await decideReview(id, body.decision, body.note ?? null, userId));
  } catch (e) {
    if (e instanceof ComplianceError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not save decision" }, { status: 500 });
  }
}
