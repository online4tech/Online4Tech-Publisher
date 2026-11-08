# Deployment Requirements

## Why GitHub alone is not enough

GitHub stores the source code and runs CI checks. GitHub Pages can serve the static web interface, but it cannot keep the Fastify API and scheduled publishing worker running continuously. A scheduled post must still be processed when the browser is closed, so the API and worker need a persistent runtime.

## Required production services

1. **Web frontend** — static HTTPS hosting; it can be deployed separately from the backend.
2. **API service** — persistent Node.js 22+ process running the Fastify application.
3. **Worker service** — persistent Node.js process for scheduled jobs and publishing retries. It must run independently of the web browser.
4. **PostgreSQL** — managed database with automated backups and private network access.
5. **Redis** — managed Redis for the job queue; private network access only.
6. **Object storage** — private S3-compatible storage for uploaded media. MinIO is currently included for local development, not assumed to be the production storage provider.

## Hosting platform requirements

Choose a provider that supports:
- Docker containers or persistent Node.js services.
- Separate API and worker processes.
- Managed PostgreSQL and Redis, or secure private connectivity to them.
- Persistent environment secrets.
- HTTPS and a stable public API URL.
- Outbound HTTPS access to Meta Graph API endpoints.
- Logs, restart policies, health checks, and database backups.

A static-only host is not sufficient for the API/worker.

## Secrets and Meta configuration

Configure secrets only in the backend host's secret manager:
- `META_APP_ID`
- `META_APP_SECRET`
- Meta login configuration ID
- OAuth redirect URI
- Token-encryption key
- Database and Redis connection strings

Never place Meta secrets or access tokens in:
- GitHub repository files or commits.
- Vite variables or frontend build settings.
- Browser local storage.
- Screenshots, support messages, or logs.

The OAuth redirect URI configured at Meta must exactly match the backend callback URL. Do not enable publishing until OAuth state validation, token encryption, admin authentication, asset discovery, and permission checks are implemented and tested.

## Deployment order

1. Select the hosting provider and create isolated staging services.
2. Deploy PostgreSQL and Redis with private access and backups.
3. Deploy the API and verify `/api/health` and `/api/ready`.
4. Deploy the worker and verify it can reach Redis and PostgreSQL.
5. Configure the Meta OAuth redirect URI and backend secrets.
6. Complete OAuth and verify Page/Instagram assets and granted permissions.
7. Run controlled test publishing before enabling scheduled production posts.

## Current status

No hosting provider has been selected and no production service is deployed. The temporary Meta token-test endpoint is disabled by default and deliberately unavailable in production.


## Local container status

The repository now includes Dockerfiles for the API and worker and a Compose profile that starts PostgreSQL, Redis, MinIO, API, and worker together. The API is bound to localhost port 4000. The worker connects to Redis and remains running, but does not consume publishing jobs yet.

These containers are a local development/staging scaffold, not a production-hardened release image. Before production, create a compiled, minimal runtime image; run migrations as a controlled release step; use managed/private data services; add authenticated admin access; and implement the actual queue processor with idempotent publish/reconciliation behavior.

## Local smoke checks

- `GET http://localhost:4000/api/health` should return `status: ok`.
- `GET http://localhost:4000/api/ready` should return `status: ready` when PostgreSQL is available.
- The worker logs should report a successful Redis connection.
- No publishing action should run in this stage.


## CI runtime verification

The GitHub Actions run for the current feature branch successfully:
- Installed workspace dependencies and generated Prisma Client.
- Passed TypeScript checks and workspace build.
- Validated the Docker Compose configuration.
- Built the API and worker container images.
- Started PostgreSQL, Redis, API, and worker containers.
- Confirmed the API database readiness endpoint and the worker's Redis connection.
- Shut down the local test services after the smoke test.

This is a CI-hosted smoke test, not a deployment to a public hosting provider and not a live Meta API acceptance test.
