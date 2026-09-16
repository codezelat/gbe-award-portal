import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
} from "node:crypto";
import { env } from "@/lib/env";

// Avoid visually ambiguous 0/O and 1/I when a recipient types the printed code.
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const generateInviteCode = () =>
  Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(
    "",
  );
export const inviteCodeHash = (code: string) =>
  createHash("sha256").update(code).digest("hex");
function key() {
  if (!env.BETTER_AUTH_SECRET)
    throw new Error("Invite encryption is unavailable.");
  return createHash("sha256")
    .update(`gbe-special-invite:v1:${env.BETTER_AUTH_SECRET}`)
    .digest();
}
export function encryptInviteCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from("gbe-special-invite:v1"));
  const encrypted = Buffer.concat([
    cipher.update(code, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function decryptInviteCode(value: string) {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext)
    throw new Error("Invite image is unavailable.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from("gbe-special-invite:v1"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
