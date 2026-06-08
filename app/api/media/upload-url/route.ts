import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { createUploadUrl, MediaError } from "@/services/mediaService";

// POST /api/media/upload-url  { brandId, filename }
// Returns a signed upload URL so the browser can upload the file bytes directly
// to Supabase Storage, plus the public URL the file will have afterward.
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { brandId?: string; filename?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.brandId || !body.filename)
    return NextResponse.json({ error: "brandId and filename required" }, { status: 400 });
  try {
    return NextResponse.json(await createUploadUrl(body.brandId, body.filename, userId));
  } catch (e) {
    if (e instanceof MediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not create upload URL" }, { status: 500 });
  }
}
