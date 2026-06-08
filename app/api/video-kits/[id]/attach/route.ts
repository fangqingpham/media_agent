import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { attachKitToPost, VideoError } from "@/services/videoService";

// POST /api/video-kits/[id]/attach  { postId }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { postId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
  try {
    return NextResponse.json(await attachKitToPost(id, body.postId, userId));
  } catch (e) {
    if (e instanceof VideoError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not attach kit" }, { status: 500 });
  }
}
