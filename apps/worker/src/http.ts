import { createAuthService, passwordHashDiagnostics, readSessionCookie, sessionCookie } from "./auth-service.js";
import { UpstashAuthStore } from "./upstash-store.js";
import { createWorkerPrismaClient } from "@o4t/db/worker";
import { createTokenVault } from "./token-vault.js";

export interface WorkerEnv {
  ADMIN_PASSWORD_HASH?: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  ADMIN_USER_EMAIL?: string;
  HYPERDRIVE?: { connectionString: string };
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

function redirectToApp(request: Request, env: WorkerEnv, status: "connected" | "error", reason?: string, missing?: string[]) {
  const origin = env.APP_ORIGIN || new URL(request.url).origin;
  const target = new URL("/", origin);
  target.searchParams.set("meta", status);
  if (reason) target.searchParams.set("reason", reason);
  if (missing?.length) target.searchParams.set("missing", missing.join(","));
  return Response.redirect(target.toString(), 302);
}

function sameOrigin(request: Request, env: WorkerEnv) {
  const origin = request.headers.get("Origin");
  const expected = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).origin : new URL(request.url).origin;
  return !origin || origin === expected;
}

function isValidMetaRedirect(request: Request, env: WorkerEnv): boolean {
  if (!env.META_OAUTH_REDIRECT_URI) return false;
  try {
    const redirect = new URL(env.META_OAUTH_REDIRECT_URI);
    const expectedOrigin = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).origin : new URL(request.url).origin;
    return redirect.protocol === "https:"
      && redirect.origin === expectedOrigin
      && redirect.pathname === "/api/meta/oauth/callback"
      && !redirect.search
      && !redirect.hash;
  } catch {
    return false;
  }
}

const META_REQUIRED_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
] as const;

type MetaPage = {
  id: string;
  name: string;
  access_token?: string;
  tasks?: string[];
  instagram_business_account?: { id: string; username?: string };
};

async function metaGraphGet<T>(path: string, token: string, version: string): Promise<T> {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  const response = await fetch(`https://graph.facebook.com/${version}/${cleanPath}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as (T & { error?: unknown }) | null;
  if (!response.ok || !payload || payload.error) throw new Error("META_GRAPH_REQUEST_FAILED");
  return payload;
}

function emptyMetaStatus(oauthConfigured: boolean, connectionStatus = "not_connected") {
  return {
    provider: "meta",
    oauthConfigured,
    connected: false,
    connectionStatus,
    grantedPermissions: [] as string[],
    missingPermissions: [...META_REQUIRED_PERMISSIONS],
    facebookReady: false,
    instagramReady: false,
    publishingEnabled: false,
    accounts: [] as Array<{ id: string; platform: "FACEBOOK" | "INSTAGRAM"; platformId: string; name: string; username: string | null }>,
  };
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api/health" && request.method === "GET") {
      return json({ status: "ok", service: "online4tech-publisher-worker" });
    }

    if (path === "/api/health/auth-config" && request.method === "GET") {
      const configured = typeof env.ADMIN_PASSWORD_HASH === "string" && env.ADMIN_PASSWORD_HASH.trim().length > 0;
      return json({
        configured,
        ...(configured ? { hash: passwordHashDiagnostics(env.ADMIN_PASSWORD_HASH!) } : {}),
      });
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
          env.META_APP_ID && env.META_APP_SECRET && env.META_CONFIG_ID &&
          env.META_OAUTH_REDIRECT_URI && isValidMetaRedirect(request, env) && env.TOKEN_ENCRYPTION_KEY && env.HYPERDRIVE
        );
        if (!env.HYPERDRIVE) return json(emptyMetaStatus(false, "storage_not_configured"));
        const prisma = createWorkerPrismaClient(env.HYPERDRIVE.connectionString);
        try {
          const connection = await prisma.metaConnection.findFirst({
            where: { user: { email: env.ADMIN_USER_EMAIL || "publisher-admin@online4tech.invalid" } },
            orderBy: { createdAt: "desc" },
            include: {
              accounts: {
                where: { isActive: true },
                select: { id: true, platform: true, platformId: true, name: true, username: true },
              },
            },
          });
          const grantedPermissions = connection?.scopes ?? [];
          const missingPermissions = META_REQUIRED_PERMISSIONS.filter((permission) => !grantedPermissions.includes(permission));
          const accounts = connection?.accounts ?? [];
          const connected = connection?.status === "ACTIVE";
          return json({
            provider: "meta",
            oauthConfigured,
            connected,
            connectionStatus: connection?.status ?? "not_connected",
            grantedPermissions,
            missingPermissions,
            facebookReady: connected && missingPermissions.every((p) => !["pages_show_list", "pages_read_engagement", "pages_manage_posts"].includes(p)) && accounts.some((account) => account.platform === "FACEBOOK"),
            instagramReady: connected && missingPermissions.every((p) => !["instagram_basic", "instagram_content_publish"].includes(p)) && accounts.some((account) => account.platform === "INSTAGRAM"),
            publishingEnabled: false,
            accounts,
          });
        } finally {
          await prisma.$disconnect();
        }
      } catch {
        return json({ error: "META_STATUS_UNAVAILABLE" }, 503);
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
      if (!env.META_APP_ID || !env.META_APP_SECRET || !env.META_CONFIG_ID || !env.META_OAUTH_REDIRECT_URI || !isValidMetaRedirect(request, env) || !env.TOKEN_ENCRYPTION_KEY || !env.HYPERDRIVE) {
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
      let sessionDigest: string | null = null;
      try {
        sessionDigest = await auth.consumeOAuthStateSession(state);
        if (!sessionDigest) return redirectToApp(request, env, "error", "invalid_or_expired_state");
      } catch {
        return redirectToApp(request, env, "error", "state_store_unavailable");
      }
      if (url.searchParams.has("error") || !url.searchParams.get("code")) {
        return redirectToApp(request, env, "error", "authorization_denied");
      }
      if (
        !env.META_APP_ID || !env.META_APP_SECRET || !env.META_CONFIG_ID ||
        !env.META_OAUTH_REDIRECT_URI || !isValidMetaRedirect(request, env) || !env.TOKEN_ENCRYPTION_KEY ||
        !env.HYPERDRIVE
      ) {
        return redirectToApp(request, env, "error", "server_configuration_incomplete");
      }

      let prisma: ReturnType<typeof createWorkerPrismaClient> | undefined;
      try {
        const version = env.META_GRAPH_API_VERSION || "v27.0";
        const exchangeUrl = new URL(`https://graph.facebook.com/${version}/oauth/access_token`);
        exchangeUrl.search = new URLSearchParams({
          client_id: env.META_APP_ID,
          client_secret: env.META_APP_SECRET,
          redirect_uri: env.META_OAUTH_REDIRECT_URI,
          code: url.searchParams.get("code")!,
        }).toString();
        const exchangeResponse = await fetch(exchangeUrl, { signal: AbortSignal.timeout(15_000) });
        const exchange = await exchangeResponse.json().catch(() => null) as
          | { access_token?: string; expires_in?: number; error?: unknown }
          | null;
        if (!exchangeResponse.ok || !exchange?.access_token || exchange.error) {
          return redirectToApp(request, env, "error", "code_exchange_failed");
        }

        const accessToken = exchange.access_token;
        const [profile, permissionPayload] = await Promise.all([
          metaGraphGet<{ id: string; name?: string }>("/me?fields=id,name", accessToken, version),
          metaGraphGet<{ data?: Array<{ permission: string; status: string }> }>("/me/permissions", accessToken, version),
        ]);
        const granted = (permissionPayload.data ?? [])
          .filter((item) => item.status === "granted")
          .map((item) => item.permission);
        const missing = META_REQUIRED_PERMISSIONS.filter((permission) => !granted.includes(permission));
        let pages: MetaPage[] = [];
        if (granted.includes("pages_show_list")) {
          const pagePayload = await metaGraphGet<{ data?: MetaPage[] }>(
            "/me/accounts?fields=id,name,access_token,tasks,instagram_business_account{id,username}",
            accessToken,
            version,
          );
          pages = pagePayload.data ?? [];
        }

        const vault = createTokenVault(env.TOKEN_ENCRYPTION_KEY);
        prisma = createWorkerPrismaClient(env.HYPERDRIVE.connectionString);
        const adminEmail = env.ADMIN_USER_EMAIL || "publisher-admin@online4tech.invalid";
        const admin = await prisma.user.upsert({
          where: { email: adminEmail },
          create: { email: adminEmail, displayName: profile.name ?? "Publisher Admin" },
          update: { displayName: profile.name ?? "Publisher Admin" },
        });
        const tokenExpiresAt = typeof exchange.expires_in === "number" && exchange.expires_in > 0
          ? new Date(Date.now() + exchange.expires_in * 1000)
          : null;

        await prisma.$transaction(async (tx) => {
          const connection = await tx.metaConnection.create({
            data: {
              userId: admin.id,
              metaUserId: profile.id,
              status: missing.length === 0 ? "ACTIVE" : "NEEDS_REAUTH",
              encryptedToken: vault.encrypt(accessToken),
              tokenExpiresAt,
              scopes: granted,
              connectedAt: new Date(),
              lastValidatedAt: new Date(),
            },
          });

          for (const page of pages) {
            if (!page.id || !page.name || !page.access_token) continue;
            const encryptedPageToken = vault.encrypt(page.access_token);
            await tx.socialAccount.upsert({
              where: { platform_platformId: { platform: "FACEBOOK", platformId: page.id } },
              create: {
                connectionId: connection.id,
                platform: "FACEBOOK",
                platformId: page.id,
                name: page.name,
                encryptedAccessToken: encryptedPageToken,
                metadata: { tasks: page.tasks ?? [] },
              },
              update: {
                connectionId: connection.id,
                name: page.name,
                encryptedAccessToken: encryptedPageToken,
                metadata: { tasks: page.tasks ?? [] },
                isActive: true,
              },
            });

            const instagram = page.instagram_business_account;
            if (instagram?.id) {
              await tx.socialAccount.upsert({
                where: { platform_platformId: { platform: "INSTAGRAM", platformId: instagram.id } },
                create: {
                  connectionId: connection.id,
                  platform: "INSTAGRAM",
                  platformId: instagram.id,
                  name: instagram.username ?? "Instagram Professional Account",
                  username: instagram.username ?? null,
                  encryptedAccessToken: encryptedPageToken,
                  metadata: { linkedFacebookPageId: page.id },
                },
                update: {
                  connectionId: connection.id,
                  name: instagram.username ?? "Instagram Professional Account",
                  username: instagram.username ?? null,
                  encryptedAccessToken: encryptedPageToken,
                  metadata: { linkedFacebookPageId: page.id },
                  isActive: true,
                },
              });
            }
          }
        });
        return redirectToApp(request, env, "connected", missing.length ? "permissions_missing" : "validated", missing);
      } catch {
        return redirectToApp(request, env, "error", "account_discovery_failed");
      } finally {
        if (prisma) await prisma.$disconnect().catch(() => undefined);
      }
    }

    if (path.startsWith("/api/admin/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (!sameOrigin(request, env)) return json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
    }
    return json({ error: "NOT_FOUND" }, 404);
  },
};
