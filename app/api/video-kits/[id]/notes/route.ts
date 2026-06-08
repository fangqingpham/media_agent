import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { addProductionNote, VideoError } from "@/services/videoService";

// POST /api/video-kits/[id]/notes  { note }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: { note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.note) return NextResponse.json({ error: "note required" }, { status: 400 });
  try {
    return NextResponse.json(await addProductionNote(id, body.note, userId), { status: 201 });
  } catch (e) {
    if (e instanceof VideoError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not add note" }, { status: 500 });
  }
}
