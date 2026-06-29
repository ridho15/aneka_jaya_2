import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const PREFIX = "scrypt";

export function hashPassword(password: string) {
  const normalized = password.trim();
  if (normalized.length < 8) throw new Error("Password minimal 8 karakter.");
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(normalized, salt, KEY_LENGTH).toString("base64url");
  return `${PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash?: string | null) {
  if (!storedHash) return false;
  const [prefix, salt, hash] = storedHash.split("$");
  if (prefix !== PREFIX || !salt || !hash) return false;
  const candidate = scryptSync(password.trim(), salt, KEY_LENGTH);
  const expected = Buffer.from(hash, "base64url");
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}
