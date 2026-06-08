import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listAssets, createAsset, MediaError } from "@/services/mediaService";

// GET  /api/media?brandId=  → list assets
// POST /api/media           → create an asset row (upload result / external / stock)
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const brandId = new URL(req.url).searchParams.get("brandId") || undefined;
  return NextResponse.json(await listAssets(userId, brandId));
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
    return NextResponse.json(await createAsset(body, userId), { status: 201 });
  } catch (e) {
    if (e instanceof MediaError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not create asset" }, { status: 500 });
  }
}
