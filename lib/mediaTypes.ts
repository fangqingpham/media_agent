// Shared Stage 9 constants — single source of truth for the media library UI.

export const ASSET_TYPES = [
  "image",
  "video",
  "thumbnail",
  "logo",
  "template",
  "b-roll",
  "carousel",
  "other",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_SOURCES = ["upload", "external", "stock"] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];

export const MEDIA_PLATFORMS = ["facebook", "instagram", "tiktok"] as const;

export const STORAGE_BUCKET = "media";

/** Best-guess file_kind from a MIME type. */
export function fileKindFromMime(mime?: string | null): "image" | "video" | null {
  if (!mime) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return null;
}

/** Sanitize a filename for use in a storage path (no spaces/slashes). */
export function safeFileName(name: string): string {
  return (name || "file")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(0, 120);
}
