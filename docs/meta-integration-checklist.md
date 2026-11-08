# Meta Integration Checklist

This checklist is intentionally a gate: do not implement against guessed permissions or endpoints.

## Meta developer setup
- [ ] Create/select a Meta developer app owned by the business.
- [ ] Configure the app's use case and required products for Facebook Pages and Instagram.
- [ ] Configure valid OAuth redirect URIs and HTTPS application domains.
- [ ] Add privacy policy, data deletion instructions, and business contact details as required.
- [ ] Determine whether App Review, Advanced Access, and/or Business Verification are required for the intended accounts and production use.

## Account prerequisites
- [ ] Facebook Page is accessible to the authorizing person/business.
- [ ] Instagram account is Professional (Business or Creator).
- [ ] Instagram account is correctly linked to the intended Facebook Page where required by the current API flow.
- [ ] Verify the authorizing user has sufficient Page/Business permissions.

## Engineering gates
- [ ] Confirm current Graph API version and official publishing documentation.
- [ ] Confirm the exact minimum permissions for Page discovery, Page publishing, Instagram publishing, and insights (if needed).
- [ ] Implement OAuth state validation and secure token exchange on the server.
- [ ] Encrypt tokens at rest; never request tokens or passwords in chat or commit them.
- [ ] Handle token expiry, revocation, reauthorization, and permission loss.
- [ ] Validate supported post types, media formats, file sizes, and publishing limits.
- [ ] Add real-account tests only after the app is configured and authorized.

## Launch gate
No production publishing until OAuth, permissions, account discovery, media validation, duplicate prevention, failure handling, and real scheduled publishing have all been tested successfully.
