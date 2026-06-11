import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listNotifications, markNotificationRead, AutomationError } from "@/services/automationService";

// GET  /api/automation/notifications?unread=1   → list notifications/reminders
// POST /api/automation/notifications  { id }     → mark one read
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const unread = new URL(req.url).searchParams.get("unread") === "1";
  return NextResponse.json(await listNotifications(userId, unread));
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    return NextResponse.json(await markNotificationRead(body.id, userId));
  } catch (e) {
    if (e instanceof AutomationError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not update notification" }, { status: 500 });
  }
}
