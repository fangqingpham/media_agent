import "server-only";

export const FB = {
  appId: process.env.FACEBOOK_APP_ID,
  appSecret: process.env.FACEBOOK_APP_SECRET,
  redirectUri: process.env.FACEBOOK_REDIRECT_URI,
  graphVersion: process.env.FACEBOOK_GRAPH_VERSION || "v20.0",
  scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
};

export function fbConfigError(): string | null {
  if (!FB.appId) return "Missing FACEBOOK_APP_ID";
  if (!FB.appSecret) return "Missing FACEBOOK_APP_SECRET";
  if (!FB.redirectUri) return "Missing FACEBOOK_REDIRECT_URI";
  return null;
}

const base = () => `https://graph.facebook.com/${FB.graphVersion}`;

export function fbAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: FB.appId!,
    redirect_uri: FB.redirectUri!,
    state,
    scope: FB.scopes.join(","),
    response_type: "code",
  });
  return `https://www.facebook.com/${FB.graphVersion}/dialog/oauth?${params.toString()}`;
}

type FbError = { error?: { message?: string; type?: string; code?: number } };

async function fbGet(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${base()}${path}?${qs}`);
  const json = (await res.json()) as FbError & Record<string, unknown>;
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `Facebook API error (${res.status})`);
  }
  return json;
}

// Exchange an OAuth code for a short-lived user token.
export async function exchangeCodeForUserToken(code: string): Promise<string> {
  const json = await fbGet("/oauth/access_token", {
    client_id: FB.appId!,
    client_secret: FB.appSecret!,
    redirect_uri: FB.redirectUri!,
    code,
  });
  return json.access_token as string;
}

// Upgrade to a long-lived user token (~60 days).
export async function getLongLivedUserToken(shortToken: string): Promise<string> {
  const json = await fbGet("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: FB.appId!,
    client_secret: FB.appSecret!,
    fb_exchange_token: shortToken,
  });
  return json.access_token as string;
}

export type FbPage = { id: string; name: string; access_token: string };

// List the Pages the user manages (each comes with its own Page access token).
export async function listPages(userToken: string): Promise<FbPage[]> {
  const json = await fbGet("/me/accounts", { access_token: userToken, fields: "id,name,access_token" });
  return (json.data as FbPage[]) ?? [];
}

// Verify a Page token works and the Page is reachable.
export async function verifyPage(pageId: string, pageToken: string) {
  return fbGet(`/${pageId}`, { access_token: pageToken, fields: "id,name" });
}

// Publish a text (and optional link) post to a Page feed. Returns the post id.
export async function publishToPage(
  pageId: string,
  pageToken: string,
  message: string,
  link?: string
): Promise<{ id: string }> {
  const body = new URLSearchParams({ message, access_token: pageToken });
  if (link) body.set("link", link);
  const res = await fetch(`${base()}/${pageId}/feed`, { method: "POST", body });
  const json = (await res.json()) as FbError & { id?: string };
  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message || `Publish failed (${res.status})`);
  }
  return { id: json.id };
}

// ---- Publishing with media (needs pages_manage_posts) ----
// Facebook fetches these image/video URLs server-side, so the URLs must be
// PUBLICLY reachable (e.g. a public Supabase Storage URL or a stock URL).

// Single photo post with caption. Returns the feed post id when available.
export async function publishPhotoToPage(
  pageId: string,
  pageToken: string,
  imageUrl: string,
  caption: string
): Promise<{ id: string }> {
  const body = new URLSearchParams({ url: imageUrl, caption, access_token: pageToken });
  const res = await fetch(`${base()}/${pageId}/photos`, { method: "POST", body });
  const json = (await res.json()) as FbError & { id?: string; post_id?: string };
  if (!res.ok || json.error || !(json.post_id || json.id)) {
    throw new Error(json.error?.message || `Photo publish failed (${res.status})`);
  }
  return { id: (json.post_id || json.id) as string };
}

// Upload a photo WITHOUT publishing it (for multi-image posts). Returns photo id.
export async function uploadUnpublishedPhoto(
  pageId: string,
  pageToken: string,
  imageUrl: string
): Promise<string> {
  const body = new URLSearchParams({ url: imageUrl, published: "false", access_token: pageToken });
  const res = await fetch(`${base()}/${pageId}/photos`, { method: "POST", body });
  const json = (await res.json()) as FbError & { id?: string };
  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message || `Photo upload failed (${res.status})`);
  }
  return json.id as string;
}

// Multi-photo post: attach already-uploaded (unpublished) photo ids to a feed post.
export async function publishMultiPhotoPost(
  pageId: string,
  pageToken: string,
  message: string,
  photoIds: string[]
): Promise<{ id: string }> {
  const body = new URLSearchParams({ message, access_token: pageToken });
  photoIds.forEach((pid, i) => body.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: pid })));
  const res = await fetch(`${base()}/${pageId}/feed`, { method: "POST", body });
  const json = (await res.json()) as FbError & { id?: string };
  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message || `Multi-photo publish failed (${res.status})`);
  }
  return { id: json.id };
}

// Video post from a hosted URL. Facebook fetches the file_url server-side.
export async function publishVideoToPage(
  pageId: string,
  pageToken: string,
  videoUrl: string,
  description: string
): Promise<{ id: string }> {
  const body = new URLSearchParams({ file_url: videoUrl, description, access_token: pageToken });
  const res = await fetch(`${base()}/${pageId}/videos`, { method: "POST", body });
  const json = (await res.json()) as FbError & { id?: string };
  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message || `Video publish failed (${res.status})`);
  }
  return { id: json.id };
}

// ---- Stage 12: reading Page posts + comments (needs pages_read_engagement) ----

export type FbPagePost = { id: string; message?: string; permalink_url?: string; created_time?: string };
export type FbComment = {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  from?: { id?: string; name?: string };
};

// Recent posts on a Page.
export async function listPagePosts(pageId: string, pageToken: string, limit = 25): Promise<FbPagePost[]> {
  const json = await fbGet(`/${pageId}/posts`, {
    access_token: pageToken,
    fields: "id,message,permalink_url,created_time",
    limit: String(limit),
  });
  return (json.data as FbPagePost[]) ?? [];
}

// Comments on a single post (newest first). `from` may be absent depending on the
// commenter's privacy / the app's permission level — callers must handle that.
export async function listPostComments(postId: string, pageToken: string, limit = 50): Promise<FbComment[]> {
  const json = await fbGet(`/${postId}/comments`, {
    access_token: pageToken,
    fields: "id,message,created_time,permalink_url,from",
    order: "reverse_chronological",
    limit: String(limit),
  });
  return (json.data as FbComment[]) ?? [];
}
