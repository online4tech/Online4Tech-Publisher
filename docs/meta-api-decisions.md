# Meta API Discovery — Decisions Before OAuth

## Verified from Meta's Facebook Login for Business documentation

- Facebook Login for Business is Meta's preferred authorization solution for technology providers building integrations with Meta business tools.
- The Meta app must be a **Business** app.
- The login configuration in Meta App Dashboard defines the token type, assets, and permissions requested.
- The authorization dialog uses a configuration ID (`config_id`) for Facebook Login for Business. For Business Integration System User tokens, Meta documents the Authorization Code grant and a server-to-server code exchange.
- Meta distinguishes two token models:
  - **User access token:** suited to actions taken in real time based on the app user's input.
  - **Business Integration System User access token:** suited to programmatic automated actions on business assets without requiring a user to be present, but requires the Tech Provider / business-portfolio setup described by Meta.
- Apps serving businesses they do not own or manage require Advanced Access through App Review. Meta also describes ongoing review requirements for Advanced Access.
- Meta explicitly advises requesting only the minimum permissions needed.

## Permission shortlist for this product

| Capability | Candidate permission | Decision |
|---|---|---|
| Discover Pages | `pages_show_list` | Required for account discovery |
| Read Page engagement/metadata needed by the integration | `pages_read_engagement` | Validate endpoint dependency before requesting |
| Publish to Facebook Page | `pages_manage_posts` | Required for Page publishing |
| Discover/read linked professional Instagram account | `instagram_basic` | Required for Instagram account discovery |
| Publish Instagram content | `instagram_content_publish` | Required for Instagram publishing |
| Publish Facebook video | `publish_video` | Request only if video publishing is included in the first supported release |
| Instagram insights | `instagram_manage_insights` | Defer until analytics scope is defined |
| Page insights | `read_insights` | Defer until analytics scope is defined |
| Business asset administration | `business_management` | Do not request unless the selected token/asset flow requires it |

The permissions above are a shortlist, not a final OAuth scope string. Endpoint dependencies, access level, and review requirements must be rechecked in the Meta App Dashboard and current endpoint references before implementation.

## Decisions intentionally left open

1. **Token model:** choose User access token for a private single-admin workflow only if Meta's app configuration and token lifecycle support the required unattended scheduled publishing. Otherwise evaluate Business Integration System User tokens and the required Tech Provider/business-portfolio onboarding. Do not assume either model is enabled.
2. **Graph API version:** do not hard-code a version from a third-party guide or an old documentation example. Select and pin the currently supported version when the Meta app is configured and the official version/changelog can be verified.
3. **Access level:** begin with app-role/test-account access. Determine Standard vs Advanced Access and Business Verification from the actual app use case and assets. Do not build a public multi-business onboarding flow in v1.
4. **Insights:** keep analytics optional and display unavailable metrics as unavailable, never as zero.

## Implementation safeguards

- OAuth callback must validate a cryptographically random, one-time `state` value.
- Exchange authorization codes server-side only.
- Keep App Secret and access tokens out of the browser, repository, logs, and chat.
- Encrypt persisted tokens at rest and support revoke/reconnect states.
- Persist each Facebook and Instagram target independently.
- Do not automatically retry an ambiguous publish request unless reconciliation proves that no post was created.
- Do not enable production publishing until real-account acceptance tests pass.

## Official Meta reference

- [Facebook Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business)
- [Instagram Platform — Content Publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing)
- [Pages API — Posts](https://developers.facebook.com/docs/pages-api/posts)
- [Meta App Review](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/)
