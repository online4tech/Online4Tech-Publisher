# Cloudflare Workers Migration Plan

## Scope and safety

This migration is isolated on `feature/cloudflare-workers-migration`, based on
`feature/meta-oauth-account-discovery`. It does not modify `main`, merge PR #8,
deploy a public Worker, or change any production service.

The current Fastify API and Node.js worker remain the reference implementation
until the Cloudflare implementation passes equivalent tests. Meta publishing
must remain disabled throughout the migration.

No secrets, access tokens, database URLs, or encryption keys belong in Git.

## Target architecture

- **Frontend:** serve the React/Vite build through Cloudflare Worker Assets on the same `workers.dev` origin as the API, avoiding cross-origin admin cookies. Keep the GitHub Pages site separate and unchanged.
- **HTTP API and Meta OAuth:** a native Cloudflare Worker Fetch handler using Web APIs; the existing Fastify server starts a Node HTTP listener and is not imported into the Worker entry.
- **PostgreSQL:** retain the existing Supabase project and Prisma schema.
  Evaluate Cloudflare Hyperdrive in front of the existing Supabase Session
  Pooler connection. Use Prisma 6.19 with `@prisma/adapter-pg` and `pg`.
  Validate TLS, pooler compatibility, migrations, and transaction behavior
  against staging before switching any live traffic.
- **Admin sessions and OAuth state:** retain the existing Upstash Redis
  database, but replace ioredis calls with the official Upstash REST client.
  Preserve hashed session tokens, one-time OAuth state consumption, TTLs,
  rate limiting, and atomicity. Do not weaken state validation.
- **Scheduling:** replace BullMQ/ioredis worker processes with Cloudflare
  Queues and a Cron Trigger. PostgreSQL remains the source of truth for
  scheduled jobs; Cron finds due rows and enqueues idempotent work. Queue
  consumers re-check job state and use database idempotency/locking before
  processing. A queue message alone is never proof that a post was published.
- **Media:** use a private Supabase Storage bucket initially, with server-issued
  short-lived signed upload URLs. Validate file type, size, ownership, and
  storage paths server-side. Do not expose service-role credentials in the
  browser. Revisit R2 only if measured storage or egress needs justify it.

## Migration stages

### Stage 0 — isolate and document

- [x] Create a dedicated migration branch from the Meta OAuth feature branch.
- [x] Record the target architecture and safeguards.
- [x] Keep PR #8 open and unmerged; migration work remains isolated from `main`.

### Stage 1 — Worker foundation

- [x] Add a native Fetch entry point and Wrangler configuration.
- [x] Add typed Worker bindings for the current Worker routes; deployment binding IDs and secrets remain environment configuration.
- [x] Implement health checks, same-origin checks, session endpoints, and API error handling.
- [x] Add Worker service/HTTP/token-vault tests to CI (execution still needs confirmation).
- [ ] Keep all publishing routes unavailable.

### Stage 2 — data access

- [x] Add Prisma 6.19 PostgreSQL driver adapter dependencies and a Hyperdrive-backed Worker client factory.
- [ ] Configure Hyperdrive without committing its ID or database credentials.
- [ ] Test Supabase Session Pooler connectivity, TLS, Prisma transactions,
      and existing migrations in staging.
- [ ] Keep the Node-based local development adapter working where practical.

### Stage 3 — sessions and OAuth

- [ ] Replace ioredis session operations with Upstash REST operations.
- [x] Preserve atomic one-time OAuth state consumption, session binding, and rate limits.
- [x] Port Meta OAuth start/callback, permission discovery, and encrypted account persistence (requires deployed secrets and Hyperdrive binding for runtime validation).
- [ ] Verify cookie attributes, allowed origins, redirect URI, and token
      encryption under the Worker runtime.
- [ ] Confirm that tokens never appear in responses or logs.

### Stage 4 — media and scheduled jobs

- [ ] Create a private Storage bucket and implement signed uploads.
- [ ] Port durable scheduling to Cron + Queues with database idempotency.
- [ ] Add retry classification, dead-letter handling, and publishing audit logs.
- [ ] Do not enable real publishing until separate acceptance tests pass.

### Stage 5 — staging and cutover

- [ ] Deploy only to a staging Worker first.
- [ ] Configure secrets through Cloudflare's secret manager, never Git.
- [ ] Verify OAuth, account discovery, database health, session expiry,
      uploads, queue delivery, retries, and observability.
- [ ] Update the frontend API base URL only after staging acceptance.
- [ ] Keep the old implementation available for rollback until cutover passes.

## Free-plan and reliability notes

Cloudflare's Free plan has usage limits. Queue messages have 24-hour retention
on the Free plan, so the database scheduler must be able to rediscover and
re-enqueue due jobs safely. Cron and queue processing must remain bounded and
idempotent. The application must report when a quota or provider limit prevents
a scheduled action; it must never silently mark a post as published.

Supabase Storage and Upstash also have their own quotas and policies. "Free"
does not mean unlimited or guaranteed perpetual availability. Check current
account limits before production use.

## Reference documentation

- Cloudflare Workers Node.js compatibility:
  https://developers.cloudflare.com/workers/runtime-apis/nodejs/
- Cloudflare Hyperdrive with Prisma:
  https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/prisma-orm/
- Prisma Cloudflare Workers guide:
  https://www.prisma.io/docs/guides/deployment/cloudflare-workers
- Hono on Cloudflare Workers:
  https://hono.dev/docs/getting-started/cloudflare-workers
- Cloudflare Queues limits:
  https://developers.cloudflare.com/queues/platform/limits/
- Upstash integration for Workers:
  https://developers.cloudflare.com/workers/databases/third-party-integrations/upstash/
- Supabase signed uploads:
  https://supabase.com/docs/guides/storage/uploads/standard-uploads
