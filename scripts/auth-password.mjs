import crypto from "crypto";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, keyLen: 64 };

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  if (!password || typeof password !== "string") throw new Error("Password wajib diisi.");
  const hash = crypto.scryptSync(password, Buffer.from(salt, "hex"), SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p
  }).toString("hex");
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt}$${hash}`;
}

export function verifyPassword(password, encodedHash) {
  if (!password || !encodedHash) return false;
  const [scheme, n, r, p, salt, expected] = String(encodedHash).split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, Buffer.from(salt, "hex"), Buffer.from(expected, "hex").length, {
    N: Number(n),
    r: Number(r),
    p: Number(p)
  });
  return crypto.timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const password = process.argv[2] || process.env.AUTH_GATEWAY_PASSWORD;
  if (!password) {
    console.error("Usage: npm run auth:hash-password -- <password>");
    process.exitCode = 1;
  } else {
    console.log(hashPassword(password));
  }
}
