import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const COOKIE_NAME = "o4t_admin_session";

function decodeSecret(encoded: string): Buffer {
  const secret = Buffer.from(encoded, "base64");
  if (secret.length !== 32 || secret.toString("base64") !== encoded) {
    throw new Error("ADMIN_SESSION_SECRET must be canonical base64 for 32 bytes");
  }
  return secret;
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyAdminPassword(password: string, encodedHash: string): boolean {
  const [scheme, saltText, hashText, ...extra] = encodedHash.split("$");
  if (scheme !== "scrypt" || !saltText || !hashText || extra.length) return false;

  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    if (salt.length < 16 || expected.length !== 64) return false;
    const actual = scryptSync(password, salt, expected.length);
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createAdminSession(secretText: string, now = Date.now()): string {
  const secret = decodeSecret(secretText);
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
    nonce: randomBytes(16).toString("base64url"),
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAdminSession(
  token: string | undefined,
  secretText: string,
  now = Date.now(),
): boolean {
  if (!token) return false;
  try {
    const secret = decodeSecret(secretText);
    const [payload, signature, ...extra] = token.split(".");
    if (!payload || !signature || extra.length) return false;
    const expected = createHmac("sha256", secret).update(payload).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (!safeEqual(expected, supplied)) return false;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown; nonce?: unknown };
    return typeof claims.exp === "number"
      && claims.exp > Math.floor(now / 1000)
      && typeof claims.nonce === "string"
      && claims.nonce.length >= 16;
  } catch {
    return false;
  }
}

export function readCookie(header: string | undefined, name = COOKIE_NAME): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return undefined;
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

export function newPasswordHash(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export const ADMIN_SESSION_TTL_SECONDS = SESSION_TTL_SECONDS;
