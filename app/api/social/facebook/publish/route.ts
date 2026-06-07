import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { publishPostToFacebook, PublishError } from "@/services/publishService";

// POST /api/social/facebook/publish  { postId, allowHighRisk? }
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { postId?: string; allowHighRisk?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.postId) return NextResponse.json({ error: "postId required" }, { status: 400 });
  try {
    const result = await publishPostToFacebook(body.postId, userId, {
      trigger: "manual",
      allowHighRisk: !!body.allowHighRisk,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof PublishError) return NextResponse.json({ error: e.message }, { status: e.status });
    const msg = e instanceof Error ? e.message : "Publish failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
