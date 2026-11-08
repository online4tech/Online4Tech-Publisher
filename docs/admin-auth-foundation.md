# Single-admin authentication foundation

The API now provides a single-admin login boundary for dashboard administration routes.

## Backend configuration

Set these values only in the API runtime environment or its secret manager:

- `ADMIN_PASSWORD_HASH`: generated locally with `node scripts/create-admin-password-hash.mjs`. The script reads the password without echoing it and prints only a scrypt hash. Use at least 12 characters.
- `ADMIN_SESSION_SECRET`: a stable, random 32-byte key encoded as base64. Generate with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.

Never put either value in frontend variables, Git, browser storage, screenshots, or chat. Do not reuse the Meta app secret or token as the session key.

## Endpoints

- `POST /api/admin/login` accepts a JSON body containing `password`. It returns a generic success response and sets an HttpOnly, SameSite=Strict session cookie.
- `GET /api/admin/session` reports whether the current browser session is authenticated.
- `POST /api/admin/logout` clears the session cookie.

Sessions expire after eight hours. Cookies are marked Secure in production. Mutating requests under `/api/admin/*` must include the exact configured frontend Origin. All admin routes other than login/logout are protected by the shared pre-handler, so new admin endpoints inherit the authentication check.

Login attempts are limited to five per IP per 15-minute window. This limiter is process-local and is suitable only for the current single-API-instance foundation; before horizontal scaling, move rate-limit state to Redis or an equivalent shared store.

## Important limitations

This is a single-admin access foundation, not a complete user-management system. It does not yet create user records, support password reset, or provide multi-user roles. The dashboard UI is not yet wired to these endpoints. Do not expose the API publicly until HTTPS, backend secrets, deployment controls, and operational monitoring are configured.

The temporary Meta connection-test endpoint remains disabled by default and unavailable in production. No Meta publishing, messaging, or OAuth operation is enabled by this change.
