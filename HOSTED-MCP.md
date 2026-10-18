# Hosted merchant MCP on Vercel

Workspace: https://later-merchant-mcp.vercel.app

Streamable HTTP endpoint: https://later-merchant-mcp.vercel.app/mcp

The hosted merchant workspace is separate from the local Visa sandbox application. There are no hosted payment endpoints, Visa credentials, local cart synchronization, or Intelligent Commerce purchase instructions configured. An empty intent list is expected until an authenticated integration imports confirmed sandbox records. No synthetic carts or successful Visa responses can be created through the hosted service.

## Connect a client

Use Streamable HTTP with a private authorization header:

```json
{
  "mcpServers": {
    "later-merchant": {
      "url": "https://later-merchant-mcp.vercel.app/mcp",
      "headers": {"Authorization": "Bearer YOUR_WORKSPACE_ACCESS_KEY"}
    }
  }
}
```

The workspace owner supplies the key privately. Never put it in a URL, repository, screenshot, or shared chat. It also opens the dashboard. Authentication is a shared hackathon workspace key, not per-merchant production authentication. OAuth-only clients require a separate OAuth integration.

Six tools are available: overview, intents, preview, create campaign, update campaign, and run. Create requires a requestId for safe retries. Campaigns start paused. Preview creates no offers or reservations. Active campaigns can submit quotes only against exact matching, published, unexpired carts backed by a confirmed Visa sandbox transaction ID and full authorized amount. Campaign actions are Later operations, not Visa API requests or purchases.

Legacy synthetic carts, test campaigns, and their offers remain stored for audit but are excluded from the live workspace, matching, and metrics. The synthetic-intent tool and endpoint have been removed.

## Verify the deployment

```sh
node scripts/mcp-smoke.mjs https://later-merchant-mcp.vercel.app /path/to/private-access-key-file
```

This read-only check uses the official MCP SDK for initialization, six-tool discovery, workspace reads, authorization rejection, and secret-path exclusion. It does not create fake leads, campaigns, authorizations, or transactions. Offline tests use isolated fixtures and never establish live Visa access.

## Persistence and secrets

Private Vercel Blob stores the workspace snapshot. Reads bypass cache and request uncompressed content for strong ETags. Conditional writes use bounded compare-and-swap retries; first creation cannot overwrite an existing snapshot. No-op transactions skip writes. This storage design is suitable for a prototype, not a production-throughput claim.

MERCHANT_ACCESS_KEY is a sensitive Vercel environment variable. Blob credentials remain server-side. Local deployment credentials and filled environment files are ignored by Git and excluded by .vercelignore. Authenticated responses use private/no-store caching. Browser sessions are signed, Secure, HttpOnly, and SameSite=Strict. Foreign browser origins are rejected. Functions serve an explicit public asset allowlist, never arbitrary files.

The pre-commit hook scans staged source against available local credential values and rejects private files and credential patterns. Other clones can enable it with `git config core.hooksPath .githooks`. Run `node scripts/check-publish-secrets.mjs` before publishing. Only blank .env.example templates belong in Git.

## Visa Intelligent Commerce access

A Developer account alone does not establish API entitlement. The Acceptance purchase-instruction flow requires an enabled merchant account, token requester ID, relationship ID, TMS/passkey services, and authenticated card enrollment. Its `/acp/v1` interfaces must not be confused with the separate VDP `/vacp/v1` APIs or credential types. No instruction ID, assurance result, enrollment, or order completion is fabricated while access is pending.

An instruction records a scoped purchase mandate; it does not itself reserve funds. A separate confirmed authorization can provide sandbox funding evidence. The eventual winning seller still needs a supported checkout arrangement: one merchant’s authorization cannot simply be captured by another merchant. The current app requires separate purchase approval and reverses expired holds; it does not automatically place an order.

Official prerequisites: https://developer.visaacceptance.com/docs/vas/en-us/intelligent-commerce/developer/all/rest/intelligent-commerce/intelligent-commerce-intro-requirements.html

## Deploy

```sh
npm install
npm run test:hosted
npx --yes vercel@64.5.0 deploy --prod
```

The project is linked to the owner’s Vercel account. CLI deployment works; GitHub automatic deployment still requires repository-owner authorization.
