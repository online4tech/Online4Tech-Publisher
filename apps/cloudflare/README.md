# Cloudflare runtime (staging foundation)

This directory is the new same-origin runtime for Online4Tech Publisher.

- Static frontend assets are served from `apps/web/dist`.
- API requests are intercepted by the Worker before static asset handling.
- `GET /api/health` is a runtime smoke test.
- Other API routes deliberately return HTTP 503 until their handlers are migrated.
- Publishing is explicitly disabled.

## Local preview

From the repository root:

```sh
pnpm --filter @o4t/web build
pnpm dlx wrangler dev --config apps/cloudflare/wrangler.toml
```

## Deployment safety

Do not deploy this foundation as the production application yet. The existing login, Meta OAuth, session, and account-discovery endpoints still live in the Node/Fastify API and have not been ported. No secrets or live Meta publishing configuration belong in this directory.
