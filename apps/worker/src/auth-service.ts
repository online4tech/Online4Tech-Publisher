import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const LOGIN_LIMIT = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const SESSION_PREFIX = "o4t:admin:session:";
const RATE_PREFIX = "o4t:admin:login-rate:";
const OAUTH_PREFIX = "o4t:meta:oauth:state:";
const COOKIE_NAME = "o4t_admin_session";

export interface AuthStore {
  set(key: string, value: string, ttlSeconds: number, onlyIfAbsent?: boolean): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  consume(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
  take(key: string): Promise<string | null>;
}

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const sessionKey = (token: string) => SESSION_PREFIX + sha256(token);
const safeEqual = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

export function verifyAdminPassword(password: string, encodedHash: string): boolean {
  const [scheme, saltText, hashText, ...extra] = encodedHash.split("$");
  if (scheme !== "scrypt" || !saltText || !hashText || extra.length) return false;
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(hashText, "base64url");
    if (salt.length < 16 || expected.length !== 64) return false;
    return safeEqual(scryptSync(password, salt, expected.length), expected);
  } catch {
    return false;
  }
}

export function readSessionCookie(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== COOKIE_NAME) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return undefined; }
  }
  return undefined;
}

export function sessionCookie(token: string, clear = false): string {
  return clear
    ? `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
    : `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ADMIN_SESSION_TTL_SECONDS}`;
}

export function createAuthService(store: AuthStore) {
  return {
    async login(password: string, passwordHash: string | undefined, ip: string) {
      if (!passwordHash) return { ok: false as const, status: 503, error: "ADMIN_AUTH_NOT_CONFIGURED" };
      if (!password || password.length > 256) return { ok: false as const, status: 400, error: "INVALID_REQUEST" };
      const rate = await store.consume(RATE_PREFIX + sha256(ip), LOGIN_WINDOW_MS);
      if (rate.count > LOGIN_LIMIT) {
        return { ok: false as const, status: 429, error: "LOGIN_RATE_LIMITED", retryAfterMs: Math.max(0, rate.ttlMs) };
      }
      if (!verifyAdminPassword(password, passwordHash)) {
        return { ok: false as const, status: 401, error: "INVALID_CREDENTIALS" };
      }
      await store.delete(RATE_PREFIX + sha256(ip));
      const token = randomBytes(32).toString("base64url");
      await store.set(sessionKey(token), "1", ADMIN_SESSION_TTL_SECONDS);
      return { ok: true as const, token, expiresInSeconds: ADMIN_SESSION_TTL_SECONDS };
    },

    async verify(token: string | undefined) {
      if (!token || token.length > 128) return false;
      return store.exists(sessionKey(token));
    },

    async logout(token: string | undefined) {
      if (token && token.length <= 128) await store.delete(sessionKey(token));
    },

    async beginOAuth(token: string | undefined) {
      if (!(await this.verify(token))) return { ok: false as const, error: "ADMIN_AUTH_REQUIRED" };
      const state = randomBytes(32).toString("base64url");
      const key = OAUTH_PREFIX + sha256(state);
      const stored = await store.set(key, sha256(token!), 600, true);
      if (!stored) return { ok: false as const, error: "OAUTH_STATE_UNAVAILABLE" };
      return { ok: true as const, state };
    },

    async consumeOAuthStateSession(state: string | undefined): Promise<string | null> {
      if (!state || !/^[A-Za-z0-9_-]{40,64}$/.test(state)) return null;
      const digest = await store.take(OAUTH_PREFIX + sha256(state));
      if (!digest || !/^[a-f0-9]{64}$/.test(digest)) return null;
      return (await store.exists(SESSION_PREFIX + digest)) ? digest : null;
    },

    async consumeOAuthState(state: string | undefined) {
      return (await this.consumeOAuthStateSession(state)) !== null;
    },
  };
}
