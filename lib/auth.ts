import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Extracts and verifies the Supabase user from the request's Authorization
 * header. Returns the user id, or null if missing/invalid.
 *
 * The browser sends the user's access token as "Authorization: Bearer <token>".
 * We verify it against Supabase to get a trusted user id, then use that id to
 * enforce ownership in our service code (since the admin client bypasses RLS).
 */
export async function getUserId(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
