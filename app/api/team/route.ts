import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { listTeam, inviteMember, TeamError } from "@/services/teamService";

// GET  /api/team   → members of the caller's workspace
// POST /api/team   → invite a member { email, role, assigned_brands? }
export async function GET(req: Request) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listTeam(userId));
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
    const member = await inviteMember(userId, {
      email: body.email as string,
      role: body.role as string,
      assigned_brands: (body.assigned_brands as string[]) ?? [],
    });
    return NextResponse.json(member, { status: 201 });
  } catch (e) {
    if (e instanceof TeamError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not invite member" }, { status: 500 });
  }
}
