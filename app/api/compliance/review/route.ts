import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { reviewContent, ComplianceError } from "@/services/complianceService";

// POST /api/compliance/review  { postId? , text? , brandId? }
// Runs an AI + deterministic compliance review on a post or on ad-hoc text.
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { postId?: string; text?: string; brandId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.postId && !body.text) return NextResponse.json({ error: "postId or text required" }, { status: 400 });
  try {
    const result = await reviewContent(
      { postId: body.postId, text: body.text, brandId: body.brandId ?? null },
      userId
    );
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof ComplianceError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not review content" }, { status: 500 });
  }
}
