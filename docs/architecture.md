# Online4Tech Publisher — Architecture

## Product goal
A private publishing workspace for Online4Tech that manages Facebook Page and Instagram Professional content through Meta's official APIs. Metricool is not part of the target architecture.

## Initial stack
- Web: React, TypeScript, Vite, Tailwind CSS.
- API: Node.js, TypeScript, REST endpoints.
- Data: PostgreSQL with Prisma.
- Scheduling: persistent worker backed by Redis/BullMQ.
- Deployment: separate web, API, database, Redis, and worker services.

## Main modules
1. Authentication and app users.
2. Meta OAuth connection and account discovery.
3. Media library and upload validation.
4. Post composer and channel-specific validation.
5. Calendar planner (day/week/month).
6. Durable publishing queue and worker.
7. Publishing history, retries, and audit events.

## Post lifecycle
Draft → Scheduled → Publishing → Published
                         ↘ Failed → retry / reschedule
Scheduled → Cancelled

Transitions must be enforced server-side. A post may be published at most once per scheduled occurrence. Use database transactions, a unique publish-attempt/idempotency key, and worker locks.

## Important design rules
- All Meta API calls happen on the server.
- Never expose app secrets or access tokens to browser code.
- Encrypt stored tokens at rest; support revocation and reconnection.
- Store timestamps in UTC and display/schedule using Africa/Cairo by default.
- Do not claim success until Meta returns a successful publishing response.
- Retry only transient failures; do not endlessly retry permission, validation, or media errors.
- Keep an audit trail for connect, schedule, edit, cancel, publish, and failure actions.
- Meta API versions, permissions, media requirements, and account eligibility must be verified against current official documentation before implementation.

## Delivery phases
1. Foundation and local development workflow.
2. Meta app setup, OAuth, and Page/Instagram discovery.
3. Composer, media handling, and calendar.
4. Durable scheduler and publishing worker.
5. Observability, security hardening, and end-to-end tests.
6. Production deployment and real account acceptance tests.
