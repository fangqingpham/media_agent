import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { encryptToken } from "@/lib/tokenCrypto";
import {
  exchangeCodeForUserToken,
  getLongLivedUserToken,
  listPages,
  verifyPage,
  type FbPage,
} from "@/lib/facebook";

export class SocialError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function log(userId: string, platform: string, event: string, detail?: string) {
  await supabaseAdmin.from("social_connection_logs").insert({
    owner_id: userId, platform, event, detail: detail ?? null,
  });
}

// Step 1 of callback: code -> long-lived user token -> list of Pages.
// We DON'T save anything yet; the admin picks a Page next.
export async function fetchPagesFromCode(code: string): Promise<FbPage[]> {
  const shortTok = await exchangeCodeForUserToken(code);
  const longTok = await getLongLivedUserToken(shortTok).catch(() => shortTok);
  return listPages(longTok);
}

// Step 2: admin selected a Page -> save account + encrypted Page token.
export async function connectPage(
  userId: string,
  brandId: string | null,
  page: { id: string; name: string; access_token: string },
  scopes: string[]
) {
  // verify the token actually works before saving
  try {
    await verifyPage(page.id, page.access_token);
  } catch (e) {
    throw new SocialError(`Page token invalid: ${e instanceof Error ? e.message : "unknown"}`, 400);
  }

  const { data: account, error } = await supabaseAdmin
    .from("social_accounts")
    .upsert(
      {
        owner_id: userId,
        brand_id: brandId,
        platform: "facebook",
        account_name: page.name,
        account_id: page.id,
        status: "connected",
        scopes,
        connected_by: userId,
      },
      { onConflict: "owner_id,platform,account_id" }
    )
    .select()
    .single();
  if (error) throw new SocialError(`Could not save account: ${error.message}`, 500);

  await supabaseAdmin.from("social_tokens").upsert(
    {
      account_id: account.id,
      owner_id: userId,
      token_type: "page",
      encrypted_token: encryptToken(page.access_token),
      expires_at: null, // Page tokens derived from long-lived user tokens are long-lived
    },
    { onConflict: "account_id" }
  );

  await log(userId, "facebook", "connect", `Connected Page ${page.name} (${page.id})`);
  return account;
}

export async function listAccounts(userId: string) {
  const { data } = await supabaseAdmin
    .from("social_accounts")
    .select("id, platform, account_name, account_id, status, scopes, created_at, updated_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function disconnectAccount(userId: string, accountId: string) {
  const { data: account } = await supabaseAdmin
    .from("social_accounts")
    .select("owner_id, account_name, platform")
    .eq("id", accountId)
    .single();
  if (!account || account.owner_id !== userId) throw new SocialError("Forbidden", 403);

  await supabaseAdmin.from("social_tokens").delete().eq("account_id", accountId);
  await supabaseAdmin.from("social_accounts").update({ status: "disconnected" }).eq("id", accountId);
  await log(userId, account.platform as string, "disconnect", `Disconnected ${account.account_name}`);
  return { ok: true };
}

export async function testConnection(userId: string, accountId: string) {
  const { data: account } = await supabaseAdmin
    .from("social_accounts")
    .select("*")
    .eq("id", accountId)
    .single();
  if (!account || account.owner_id !== userId) throw new SocialError("Forbidden", 403);

  const { data: tok } = await supabaseAdmin
    .from("social_tokens")
    .select("encrypted_token")
    .eq("account_id", accountId)
    .maybeSingle();
  if (!tok) throw new SocialError("No token stored. Reconnect the Page.", 409);

  const { decryptToken } = await import("@/lib/tokenCrypto");
  let pageToken: string;
  try {
    pageToken = decryptToken(tok.encrypted_token as string);
  } catch {
    throw new SocialError("Could not read stored token. Reconnect.", 500);
  }

  try {
    const info = await verifyPage(account.account_id as string, pageToken);
    await supabaseAdmin.from("social_accounts").update({ status: "connected" }).eq("id", accountId);
    await log(userId, "facebook", "test", `OK: ${account.account_name}`);
    return { ok: true, page: info };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "test failed";
    await supabaseAdmin.from("social_accounts").update({ status: "error" }).eq("id", accountId);
    await supabaseAdmin.from("api_error_logs").insert({
      owner_id: userId, platform: "facebook", context: "test", error_message: msg,
    });
    await log(userId, "facebook", "test", `FAILED: ${msg}`);
    throw new SocialError(`Connection test failed: ${msg}`, 502);
  }
}
