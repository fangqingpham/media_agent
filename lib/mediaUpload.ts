"use client";
import { supabase } from "./supabaseClient";
import { api } from "./api";

/**
 * Uploads a file directly to Supabase Storage using a server-issued signed
 * upload URL, so the bytes never pass through a Next.js API route. Returns the
 * public URL + storage path to save on the media_assets row.
 */
export async function uploadMediaFile(
  brandId: string,
  file: File
): Promise<{ publicUrl: string; path: string; mime: string }> {
  // 1) ask the server for a signed upload URL (also tells us the public URL)
  const { path, token, publicUrl } = await api("/api/media/upload-url", {
    method: "POST",
    body: JSON.stringify({ brandId, filename: file.name }),
  });

  // 2) upload the bytes straight to storage with the signed token
  const { error } = await supabase.storage.from("media").uploadToSignedUrl(path, token, file);
  if (error) throw new Error(`Upload failed: ${error.message}`);

  return { publicUrl, path, mime: file.type };
}
