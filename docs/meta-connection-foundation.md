# Meta Connection Foundation

This branch adds a first, server-only connection check for the Meta app.

## Runtime environment

Set these variables in the API host's secret/environment settings, not in GitHub source files:

- `META_APP_ID`: Meta app ID.
- `META_APP_SECRET`: Meta app secret (reserved for the OAuth/code-exchange stage).
- `META_CONFIG_ID`: the Meta Login configuration ID.
- `META_ACCESS_TOKEN`: the generated server-side access token.
- `META_CONNECTION_TEST_KEY`: a separate strong random key used only to protect the temporary connection-test endpoint.
- `META_GRAPH_API_VERSION`: currently defaults to `v27.0`; recheck Meta's changelog before upgrading.

The repository's `.gitignore` excludes `.env` files while allowing the placeholder-only `.env.example`.

## Endpoints

- `GET /api/meta/status`: reports only whether the required settings are present. It never returns credentials.
- `POST /api/meta/connection-test`: requires the `x-meta-connection-test-key` header and calls Meta's `/me?fields=id,name` endpoint using a Bearer authorization header.

The connection-test endpoint verifies only that Meta accepts the supplied token. It does **not** prove that Instagram assets are assigned or that publishing and messaging permissions are granted. Those checks must be implemented separately against the exact asset and permission model configured in the Meta app.

## Security notes

- Never commit the access token, app secret, or connection-test key.
- Never place Meta credentials in Vite/client-side variables.
- The test key is an interim guard for this foundation endpoint; before exposing connection controls in the dashboard, replace it with the application's authenticated admin session and authorization checks.
- The API does not log the token or Meta response body.
- No publishing or messaging action is enabled by this change.

## Current API version

Meta announced Graph API v27.0 on November 4, 2026. Confirm current support and endpoint requirements in Meta's changelog before production rollout:
https://developers.meta.com/resources/blog/
