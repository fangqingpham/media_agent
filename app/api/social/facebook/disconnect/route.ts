import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { disconnectAccount, SocialError } from "@/services/socialService";

// POST /api/social/facebook/disconnect  { accountId }
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { accountId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });
  try {
    return NextResponse.json(await disconnectAccount(userId, body.accountId));
  } catch (e) {
    if (e instanceof SocialError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Disconnect failed" }, { status: 500 });
  }
}
