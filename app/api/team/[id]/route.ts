import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { updateMember, TeamError } from "@/services/teamService";

// PATCH /api/team/[id]  { role?, status?, assigned_brands? }   (owner manages)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const updated = await updateMember(userId, id, {
      role: body.role as string,
      status: body.status as string,
      assigned_brands: body.assigned_brands as string[],
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof TeamError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not update member" }, { status: 500 });
  }
}
