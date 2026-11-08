import { createAuthService, readSessionCookie, sessionCookie } from "./auth-service.js";
import { UpstashAuthStore } from "./upstash-store.js";

export interface WorkerEnv {
  ADMIN_PASSWORD_HASH?: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_CONFIG_ID?: string;
  TOKEN_ENCRYPTION_KEY?: string;
  META_GRAPH_API_VERSION?: string;
  META_OAUTH_REDIRECT_URI?: string;
  APP_ORIGIN?: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
}

const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...Object.fromEntries(new Headers(headers)) },
  });

const clearCookie = () =>
  "o4t_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";

function redirectToApp(request: Request, env: WorkerEnv, status: "connected" | "error", reason?: string) {
  const origin = env.APP_ORIGIN || new URL(request.url).origin;
  const target = new URL("/", origin);
  target.searchParams.set("meta", status);
  if (reason) target.searchParams.set("reason", reason);
  return Response.redirect(target.toString(), 302);
}

function sameOrigin(request: Request, env: WorkerEnv) {
  const origin = request.headers.get("Origin");
  const expected = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).origin : new URL(request.url).origin;
  return !origin || origin === expected;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api/health" && request.method === "GET") {
      return json({ status: "ok", service: "online4tech-publisher-worker" });
    }

    if (!path.startsWith("/api/")) {
      return env.ASSETS ? env.ASSETS.fetch(request) : json({ error: "NOT_FOUND" }, 404);
    }

    const store = new UpstashAuthStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
    const auth = createAuthService(store);
    const token = readSessionCookie(request.headers.get("Cookie"));

    if (path === "/api/admin/login" && request.method === "POST") {
      if (!sameOrigin(request, env)) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
      let body: { password?: unknown };
      try { body = await request.json() as { password?: unknown }; }
      catch { return json({ error: "INVALID_REQUEST" }, 400); }
      if (typeof body.password !== "string") return json({ error: "INVALID_REQUEST" }, 400);
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      try {
        const result = await auth.login(body.password, env.ADMIN_PASSWORD_HASH, ip);
        if (!result.ok) {
          const headers = result.status === 429 ? { "Retry-After": String(Math.max(1, Math.ceil((result.retryAfterMs ?? 1000) / 1000))) } : undefined;
          return json({ error: result.error }, result.status, headers);
        }
        return json(
          { authenticated: true, expiresInSeconds: result.expiresInSeconds },
          200,
          { "Set-Cookie": sessionCookie(result.token) },
        );
      } catch {
        return json({ error: "SESSION_STORE_UNAVAILABLE" }, 503);
      }
    }

    if (path === "/api/admin/logout" && request.method === "POST") {
      if (!sameOrigin(request, env)) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
      try {
        await auth.logout(token);
        return json({ authenticated: false }, 200, { "Set-Cookie": clearCookie() });
      } catch {
        return json({ error: "SESSION_STORE_UNAVAILABLE" }, 503);
      }
    }

    if (path === "/api/admin/meta/status" && request.method === "GET") {
      try {
        if (!(await auth.verify(token))) return json({ error: "ADMIN_AUTH_REQUIRED" }, 401);
        const oauthConfigured = Boolean(
          env.META_APP_ID &&
          env.META_APP_SECRET &&
          env.META_CONFIG_ID &&
          env.META_OAUTH_REDIRECT_URI &&
          env.TOKEN_ENCRYPTION_KEY
        );
        return json({
          provider: "meta",
          oauthConfigured,
          connected: false,
          connectionStatus: "not_connected",
          grantedPermissions: [],
          missingPermissions: [
            "pages_show_list",
            "pages_read_engagement",
            "pages_manage_posts",
            "instagram_basic",
            "instagram_content_publish"
          ],
          facebookReady: false,
          instagramReady: false,
          publishingEnabled: false,
          accounts: []
        });
      } catch {
        return json({ error: "SESSION_STORE_UNAVAILABLE" }, 503);
      }
    }

    if (path === "/api/admin/session" && request.method === "GET") {
      try {
        const authenticated = await auth.verify(token);
        return json({ authenticated, expiresInSeconds: authenticated ? 8 * 60 * 60 : 0 }, authenticated ? 200 : 401);
      } catch {
        return json({ error: "SESSION_STORE_UNAVAILABLE" }, 503);
      }
    }

    if (path === "/api/admin/meta/oauth/start" && request.method === "GET") {
      if (!sameOrigin(request, env)) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
      if (!env.META_APP_ID || !env.META_CONFIG_ID || !env.META_OAUTH_REDIRECT_URI) {
        return json({ error: "META_OAUTH_NOT_CONFIGURED" }, 503);
      }
      try {
        const started = await auth.beginOAuth(token);
        if (!started.ok) return json({ error: started.error }, 401);
        const version = env.META_GRAPH_API_VERSION || "v27.0";
        const authorize = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
        authorize.searchParams.set("client_id", env.META_APP_ID);
        authorize.searchParams.set("redirect_uri", env.META_OAUTH_REDIRECT_URI);
        authorize.searchParams.set("config_id", env.META_CONFIG_ID);
        authorize.searchParams.set("response_type", "code");
        authorize.searchParams.set("state", started.state);
        return Response.redirect(authorize.toString(), 302);
      } catch {
        return json({ error: "OAUTH_STATE_UNAVAILABLE" }, 503);
      }
    }

    if (path === "/api/meta/oauth/callback" && request.method === "GET") {
      const state = url.searchParams.get("state") || undefined;
      try {
        const valid = await auth.consumeOAuthState(state);
        if (!valid) return redirectToApp(request, env, "error", "invalid_or_expired_state");
      } catch {
        return redirectToApp(request, env, "error", "state_store_unavailable");
      }
      if (url.searchParams.has("error") || !url.searchParams.get("code")) {
        return redirectToApp(request, env, "error", "authorization_denied");
      }
      // Token exchange and account persistence are deliberately gated until
      // the Worker database adapter is installed and tested.
      return redirectToApp(request, env, "error", "account_storage_migration_pending");
    }

    if (path.startsWith("/api/admin/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (!sameOrigin(request, env)) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
    }
    return json({ error: "NOT_FOUND" }, 404);
  },
};
