import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { regeneratePost, PostServiceError } from "@/services/postService";

// POST /api/posts/:id/regenerate  → re-run generation for an existing draft (overwrites content)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  try {
    const draft = await regeneratePost(id, userId);
    return NextResponse.json(draft);
  } catch (e) {
    if (e instanceof PostServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
