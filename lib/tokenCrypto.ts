import "server-only";
import crypto from "crypto";

// AES-256-GCM encryption for access tokens. The key comes from
// SOCIAL_TOKEN_ENCRYPTION_KEY (must be 32 bytes; hex or base64 accepted, or a
// long passphrase that we hash to 32 bytes). Ciphertext format: iv:tag:data (hex).

function getKey(): Buffer {
  const raw = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("Missing SOCIAL_TOKEN_ENCRYPTION_KEY env var");
  // try hex (64 chars) or base64 (44 chars) first; else hash to 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  } catch {
    /* fall through */
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptToken(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new Error("Malformed token ciphertext");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}
