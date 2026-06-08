import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listPostMedia, attachMedia, detachMedia, MediaError } from "@/services/mediaService";

// GET    /api/posts/[id]/media            → media attached to this post
// POST   /api/posts/[id]/media { mediaId } → attach
// DELETE /api/posts/[id]/media?mediaId=   → detach
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await listPostMedia(id, userId));
  } catch (e) {
    if (e instanceof MediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not load media" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { mediaId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.mediaId) return NextResponse.json({ error: "mediaId required" }, { status: 400 });
  try {
    return NextResponse.json(await attachMedia(id, body.mediaId, userId), { status: 201 });
  } catch (e) {
    if (e instanceof MediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not attach media" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const mediaId = new URL(req.url).searchParams.get("mediaId");
  if (!mediaId) return NextResponse.json({ error: "mediaId required" }, { status: 400 });
  try {
    return NextResponse.json(await detachMedia(id, mediaId, userId));
  } catch (e) {
    if (e instanceof MediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not remove media" }, { status: 500 });
  }
}
