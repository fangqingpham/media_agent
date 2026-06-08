import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listKits, generateVideoKit, VideoError } from "@/services/videoService";

// GET  /api/video-kits?brandId=&postId=  → list kits
// POST /api/video-kits                    → generate a kit
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  return NextResponse.json(
    await listKits(userId, {
      brandId: url.searchParams.get("brandId") || undefined,
      postId: url.searchParams.get("postId") || undefined,
    })
  );
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const kit = await generateVideoKit(
      {
        brandId: String(body.brandId || ""),
        platform: String(body.platform || ""),
        durationSeconds: Number(body.durationSeconds) || 30,
        pillarId: (body.pillarId as string) || null,
        topic: (body.topic as string) || null,
        postId: (body.postId as string) || null,
      },
      userId
    );
    return NextResponse.json(kit, { status: 201 });
  } catch (e) {
    if (e instanceof VideoError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not generate kit" }, { status: 500 });
  }
}
