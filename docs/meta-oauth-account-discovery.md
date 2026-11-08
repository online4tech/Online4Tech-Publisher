# Meta OAuth and Account Discovery

## Flow

This implementation uses the Facebook Login for Business configuration already created in the Meta app. The configured `config_id` is sent to Meta; the app does not build a separate scope list into the authorization URL because the configuration defines the requested permissions.

1. An authenticated administrator opens `GET /api/admin/meta/oauth/start`.
2. The API creates a cryptographically random, one-time `state` value, stores only its hash in Redis for 10 minutes, and binds it to the current admin session digest.
3. The browser is redirected to Facebook Login for Business with `client_id`, exact `redirect_uri`, `config_id`, `response_type=code`, and `state`.
4. Meta returns an authorization code to `GET /api/meta/oauth/callback`. The callback atomically consumes the state, verifies that the initiating admin session is still active, and exchanges the code server-side.
5. The API checks `/me` and `/me/permissions`, then discovers Pages using `/me/accounts` and each Page's linked `instagram_business_account`.
6. User and Page tokens are encrypted with the existing AES-256-GCM token vault before they are persisted. Raw tokens are never returned to the browser.
7. The browser returns to the dashboard with a status indicator only. The API exposes account metadata and permission readiness through the authenticated `GET /api/admin/meta/status` endpoint.

The callback route suppresses request URL logging because the incoming URL contains a short-lived authorization code and OAuth state.

## Required backend settings

- `META_APP_ID`
- `META_APP_SECRET`
- `META_CONFIG_ID`
- `META_OAUTH_REDIRECT_URI` — must exactly match the URI registered in the Meta app. Use HTTPS in production.
- `TOKEN_ENCRYPTION_KEY` — canonical base64 for a random 32-byte key; keep it only in the API secret store.
- `ADMIN_USER_EMAIL` — internal owner record used to associate connected Meta assets with this single-admin Publisher workspace.
- `REDIS_URL` — required for one-time OAuth state and admin sessions.

Never put the App Secret, access tokens, or encryption key in Vite variables, GitHub source, browser storage, screenshots, or chat.

## Permission checks and publishing gate

The API checks these Facebook Login for Business permissions:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

The current Meta setup reported during implementation did not yet show `pages_show_list` or `pages_manage_posts`. The connection can therefore be recorded as needing reauthorization, with any discoverable assets retained, but the readiness endpoint will keep the affected platform unavailable.

`GET /api/admin/meta/status` returns granted and missing permissions, discovered Facebook Pages and linked professional Instagram accounts, and separate `facebookReady` / `instagramReady` flags. It deliberately returns `publishingEnabled: false`. No publishing route is enabled by this integration PR.

For Instagram through Facebook Login, a professional Instagram account must be linked to a Facebook Page. Consumer Instagram accounts are not supported by this route.

## Operational prerequisites

GitHub Pages is a static host and cannot run this OAuth callback, Redis session store, database, or background worker. Before attempting a live connection, deploy the API and Redis/PostgreSQL to a persistent HTTPS-capable backend, set the backend secrets there, and register that exact callback URI in Meta.

The first acceptance test should connect only the administrator's own test Page and linked professional Instagram account. Verify discovered account IDs, granted scopes, token encryption, reconnect, logout, and permission-denied behavior before enabling any publishing implementation.
