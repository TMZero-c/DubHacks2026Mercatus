# Hosted merchant MCP on Vercel

Production workspace: https://later-merchant-mcp.vercel.app

Streamable HTTP endpoint: https://later-merchant-mcp.vercel.app/mcp

The hosted workspace is separate from the local Visa sandbox application. It contains synthetic test carts only. No Visa, SerpAPI, local card-hold records or local MCP credentials are uploaded. There are no hosted payment endpoints.

## Connect an MCP client

Use an MCP client with Streamable HTTP and custom authorization header support:

```json
{
  "mcpServers": {
    "later-merchant": {
      "url": "https://later-merchant-mcp.vercel.app/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_WORKSPACE_ACCESS_KEY"
      }
    }
  }
}
```

The access key is issued privately by the workspace owner. Never put it in a URL, repository, shared screenshot or public chat. The same key opens the merchant dashboard login. This is a shared, key-protected hackathon workspace, not per-merchant production authentication. OAuth-only remote clients need an OAuth integration; this endpoint does not pretend to support OAuth discovery or sign-in.

Use the official MCP Inspector or another compatible client with transport set to Streamable HTTP, the endpoint above, and its Authorization header set privately. The `scripts/mcp-smoke.mjs` client also tests the remote service through the official SDK:

```sh
node scripts/mcp-smoke.mjs https://later-merchant-mcp.vercel.app /path/to/private-access-key-file
```

The key file is read locally, never written to stdout or the repository. This check creates synthetic fixtures and leaves its campaign paused. It verifies initialization, seven tools, preview, activation, automatic offer submission, idempotency, durable reads, unauthenticated rejection and blocked secret/payment paths.

## Tools and test workflow

Six merchant controls are retained: overview, intents, preview, create campaign, update campaign, and run. Hosted create requires `requestId` so retrying cannot create duplicate campaigns. A seventh tool, `merchant_add_test_intent`, creates explicit synthetic carts without calling Visa. It requires `requestId` and exact item objects containing name, variant, price (USD decimal string), and quantity.

1. Create a campaign with the supplied catalog, stock and pricing limits. It starts paused.
2. Preview matches, then activate within the merchant's instructions.
3. Call `merchant_add_test_intent` with matching items, or click **Add test cart** in the dashboard for the example headphones/case basket.
4. Read overview and offers to see the generated quote and reserved incentive/stock.
5. Pause the campaign after the test.

The hosted worker runs on new test carts, campaign activation/update, or `merchant_run`. It does not depend on a background timer surviving a serverless request. Dashboard reads reconcile expiration for display without creating offers. The local app retains its two-second background worker.

## Persistence and concurrency

Private Vercel Blob stores the entire hosted demo workspace. Reads bypass CDN cache. Uncompressed reads retain strong ETags, and conditional writes use compare-and-swap with bounded retries. Creating the first snapshot never overwrites an existing one. No-op transactions skip writes. State survives function cold starts and deployments. This storage model is suitable for testing, not a claim of production commerce throughput.

## Secret management

`MERCHANT_ACCESS_KEY` is a sensitive Vercel production environment variable. Blob read/write credentials are supplied server-side through the connected private store. Local copies of deployment credentials and the access key are git-ignored and excluded by `.vercelignore`. Only private storage can access the workspace snapshot. The public build output contains no credentials.

All MCP requests and merchant API access require a valid bearer token or a signed, Secure/HttpOnly/SameSite browser session. Untrusted browser origins are rejected. The login page never stores the access key in localStorage, and responses containing workspace data use `Cache-Control: private, no-store`.

The root public output contains only robots.txt. Functions serve an explicit asset allowlist; arbitrary repository files, `.env` and `.local` paths are not served. Hosted deployment excludes the Visa transport and extension directories. No payment tool is registered.

This checkout installs `.githooks/pre-commit` as its Git hook. Other clones can opt into the same guard with `git config core.hooksPath .githooks`. Before committing changes, stage only intended source/config files, then run `node scripts/check-publish-secrets.mjs`. This compares the exact Git index to local deployment secret values without printing them and rejects forbidden files and common credential patterns. Blank `.env.example` templates remain safe to commit.

To rotate the access key, generate a new random key privately, update the sensitive Vercel environment variable, and redeploy. Old bearer keys and signed browser sessions then stop working. Do not change keys through commits or reuse the local Visa/MCP secrets.

## Deploy

```sh
npm install
npm run test:hosted
npx vercel deploy --prod
```

The project is linked under the owner's Vercel account. GitHub auto-deploy requires the repository owner to install/authorize Vercel for this repository; the current deployment is published by CLI and does not rely on that access.
