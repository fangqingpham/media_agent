"use client";
import { supabase } from "./supabaseClient";

/**
 * Fetch wrapper that attaches the logged-in user's Supabase access token as a
 * Bearer header, so server route handlers can identify the caller via getUserId().
 */
export async function api(path: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  // some endpoints (DELETE) may return empty
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
