import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { generatePost, PostServiceError, type GenerateParams } from "@/services/postService";

// POST /api/posts/generate  → generate a new post draft via OpenAI
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: GenerateParams;
  try {
    body = (await req.json()) as GenerateParams;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.brandId || !body.platform || !body.contentType) {
    return NextResponse.json(
      { error: "brandId, platform and contentType are required" },
      { status: 400 }
    );
  }

  try {
    const draft = await generatePost(body, userId);
    return NextResponse.json(draft, { status: 201 });
  } catch (e) {
    if (e instanceof PostServiceError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
