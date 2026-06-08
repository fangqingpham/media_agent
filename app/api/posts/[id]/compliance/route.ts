import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getPostCompliance, reviewContent, ComplianceError } from "@/services/complianceService";

// GET  /api/posts/[id]/compliance  → latest review + flags + decisions + rewrites for a post
// POST /api/posts/[id]/compliance  → run a fresh compliance review on the post
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await getPostCompliance(id, userId));
  } catch (e) {
    if (e instanceof ComplianceError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not load compliance" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await reviewContent({ postId: id }, userId), { status: 201 });
  } catch (e) {
    if (e instanceof ComplianceError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not review post" }, { status: 500 });
  }
}
