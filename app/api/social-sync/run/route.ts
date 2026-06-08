import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { runFacebookSync, SyncError } from "@/services/syncService";

// POST /api/social-sync/run  { platform?: 'facebook', accountId? }
// Stage 12 supports Facebook comment sync. Instagram/TikTok return a clear note.
export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { platform?: string; accountId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* body optional → default facebook */
  }
  const platform = body.platform || "facebook";

  if (platform !== "facebook") {
    return NextResponse.json(
      { error: `${platform} sync isn't available yet. Facebook comment sync is supported in this stage.` },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await runFacebookSync(userId, body.accountId));
  } catch (e) {
    if (e instanceof SyncError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
