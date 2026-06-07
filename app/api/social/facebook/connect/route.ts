import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fbAuthUrl, fbConfigError } from "@/lib/facebook";

// GET /api/social/facebook/connect?token=<supabase access token>&brandId=<id>
// Returns the Meta OAuth URL for the browser to redirect to. We carry the user's
// access token + brandId through the `state` param so the callback can identify them
// (the callback is hit by Facebook's redirect, which won't send our auth header).
export async function GET(req: Request) {
  const url = new URL(req.url);
  // accept the auth token via header (normal) or query (when opened as a full-page nav)
  const headerToken = req.headers.get("authorization")?.replace("Bearer ", "");
  const queryToken = url.searchParams.get("token");
  const token = headerToken || queryToken;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getUserId(new Request(req.url, { headers: { authorization: `Bearer ${token}` } }));
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfgErr = fbConfigError();
  if (cfgErr) return NextResponse.json({ error: cfgErr }, { status: 500 });

  const brandId = url.searchParams.get("brandId") ?? "";
  const state = Buffer.from(JSON.stringify({ token, brandId })).toString("base64url");
  return NextResponse.redirect(fbAuthUrl(state));
}
