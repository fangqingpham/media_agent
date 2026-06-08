import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { generateKitFromDraft, listKits, VideoError } from "@/services/videoService";

// GET  /api/posts/[id]/video-kit            → kits attached to this post
// POST /api/posts/[id]/video-kit { durationSeconds? } → generate a kit from the draft
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(await listKits(userId, { postId: id }));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { durationSeconds?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* body optional */
  }
  try {
    const kit = await generateKitFromDraft(id, userId, Number(body.durationSeconds) || 30);
    return NextResponse.json(kit, { status: 201 });
  } catch (e) {
    if (e instanceof VideoError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not generate kit" }, { status: 500 });
  }
}
