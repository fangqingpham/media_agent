import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { fetchPagesFromCode, SocialError } from "@/services/socialService";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/social/facebook/callback?code=...&state=...
// Facebook redirects here after consent. We exchange the code for a token, fetch
// the user's Pages, stash them briefly in a short-lived row, then redirect to the
// settings page where the admin picks a Page. (Pages carry tokens, so we never
// put them in the URL.)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const origin = url.origin;

  if (error) {
    return NextResponse.redirect(`${origin}/settings/social-accounts?error=${encodeURIComponent("Facebook authorization was denied")}`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${origin}/settings/social-accounts?error=${encodeURIComponent("Missing code/state")}`);
  }

  let token = "";
  let brandId = "";
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    token = decoded.token;
    brandId = decoded.brandId;
  } catch {
    return NextResponse.redirect(`${origin}/settings/social-accounts?error=${encodeURIComponent("Invalid state")}`);
  }

  const userId = await getUserId(new Request(req.url, { headers: { authorization: `Bearer ${token}` } }));
  if (!userId) {
    return NextResponse.redirect(`${origin}/settings/social-accounts?error=${encodeURIComponent("Session expired, try again")}`);
  }

  try {
    const pages = await fetchPagesFromCode(code);
    // stash pages (incl. tokens) server-side, keyed by a random id, for the picker step
    const stashId = crypto.randomUUID();
    await supabaseAdmin.from("social_connection_logs").insert({
      owner_id: userId,
      platform: "facebook",
      event: "oauth_pages",
      detail: JSON.stringify({ stashId, brandId, pages }),
    });
    return NextResponse.redirect(`${origin}/settings/social-accounts?stash=${stashId}`);
  } catch (e) {
    const msg = e instanceof SocialError ? e.message : e instanceof Error ? e.message : "OAuth failed";
    await supabaseAdmin.from("api_error_logs").insert({
      owner_id: userId, platform: "facebook", context: "oauth", error_message: msg,
    });
    return NextResponse.redirect(`${origin}/settings/social-accounts?error=${encodeURIComponent(msg)}`);
  }
}
