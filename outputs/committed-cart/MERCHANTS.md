# Later Merchant Manager

Open http://localhost:4318/#merchant with the local server running:

```sh
node outputs/committed-cart/server.mjs
```

The merchant side now uses a campaign workflow inspired by Meta's campaign/ad-set controls: catalog, objective, delivery status, pricing strategy, schedule, budget, and performance. It is **not an ad exchange and does not connect to Meta or Google advertising accounts**. Merchants offer an incentive directly to an open purchase intent.

## Merchant workflow

1. Create a campaign. Add products once, import a CSV, or use a current open cart as a template. A cart template leaves cost blank and stock at zero so the merchant supplies those facts.
2. Set an all-in price and cost per product, available stock, daily incentive budget, maximum incentive per cart, minimum gross margin, maximum discount, delivery days, return policy, and the exact shopper seller requirement you can satisfy.
3. Confirm inventory/eligibility, then preview. A preview makes no offers and reserves no inventory or budget. Only active, published, unselected intents are included.
4. Save. New campaigns are paused. Activate with the delivery switch to let the worker make offers automatically. It runs every two seconds while the server is on, even if the browser is closed.
5. Review Campaigns, Catalog, and Offers. Pause to edit pricing/catalog. Pausing stops new offers; existing offers remain available until their expiry. Shopper selections are not purchases or revenue.

Click **Use example** in the campaign editor to load fictional **Example · Headphone offers** catalog/inventory values. Saved campaigns start paused. Use it with the shopper page's example cart, or replace it with merchant-supplied facts. The example is not a live business or an inventory feed.

CSV headers (USD amounts; stock is an integer):

```csv
name,variant,unitPrice,cost,stock,url
Sony WH-1000XM4,Black · New,150.00,90.00,5,https://example.com/product
```

`url` is optional. CSV supports quoted commas and escaped quotes, at most 200 products/250 KB. Product and variant names must match the committed cart after case/punctuation normalization. A similar model or different variant never substitutes automatically. URLs are references, not scraped or fetched. A catalog feed with stable product identifiers would replace this strict text identity in production.

## Pricing and reservations

For each exact item, the price floor is the larger of:

- all-in catalog price × (1 − maximum discount);
- unit cost / (1 − minimum gross margin).

Floors are rounded up to cents. The basket floor also preserves the per-cart incentive cap and remaining daily incentive budget. In **Beat best price**, the agent offers one cent below the current best unexpired offer (or the shopper's budget), provided that price stays above the floor. **Maximum discount** offers the lowest permitted price. If no profitable price beats the current best, no offer is sent.

The incentive is catalog total minus offered total, never an invented advertising fee or claimed money transfer. Live offers reserve their full incentive and units immediately, preventing the same stock or incentive budget from being promised repeatedly. Stock reservations are shared across campaigns with the same normalized business name and exact product/variant; if their stock declarations differ, the lowest declared stock is used conservatively. The daily budget uses UTC offer-creation dates. Selection keeps the reservation while the shopper's commitment remains active. Reservations release on offer expiry, another merchant's selection, or an inactive/released commitment. No capture, fulfillment, fee collection or settlement is implemented.

One campaign submits at most one offer per immutable cart snapshot. The worker cannot rebid on that same intent after expiration. The existing shopper price/deadline/consent gates also validate each automatic offer. A selected offer's original terms are unaffected by later campaign edits.

## Headless API

All paths are under `/api/merchant/`. Browser writes require the exact local origin. The stdio bridge uses a random bearer credential stored only in `.local/mcp-key` (mode 0600). The key is never included in browser configuration or distribution archives.

- `GET state`: campaigns, summary metrics, newest 100 offer decisions.
- `GET intents`: open published intent summaries, no card credentials or shopper identity.
- `GET connection`: a ready-to-copy local MCP configuration.
- `POST campaigns`: create paused. Accepts optional `requestId` for idempotent create retries.
- `POST update`: `id` plus `status: "active" | "paused"`, or edited rules while paused.
- `POST preview`: full proposed campaign fields, or `{ "campaignId": "…" }`.
- `POST run`: evaluate active campaigns now. Normal background processing needs no caller.

The campaign create/update shape is documented by the MCP tool JSON schemas in `merchant-mcp.mjs`. Amount inputs are USD decimal strings; output amounts are integer cents.

## MCP

Click **Connect an agent** for the exact configuration using this machine's Node executable and project path. Example for an extracted distribution:

```json
{
  "mcpServers": {
    "later-merchant": {
      "command": "node",
      "args": ["/absolute/path/to/committed-cart/merchant-mcp.mjs"]
    }
  }
}
```

Tools: `merchant_overview`, `merchant_intents`, `merchant_preview`, `merchant_create_campaign`, `merchant_update_campaign`, and `merchant_run`. The bridge implements newline-delimited stdio MCP, initialization, ping, tool discovery and tool calls. It reads the private local key and calls only loopback merchant endpoints. No shopper payment tools are exposed.

Use a **local MCP client that supports stdio**. Remote ChatGPT-style connectors cannot connect directly to this local stdio process: supporting one requires a separately deployed authenticated Streamable HTTP transport and production tenant authorization. This prototype does not sign in to ChatGPT, register a connector, or send merchant data to an AI provider. A connected client chooses its own model/provider. Its agent can plan and configure; the deterministic pricing worker enforces the same limits regardless of the model.

Suggested agent instruction: “Use my provided catalog and stock. Create a paused campaign with a $100 daily incentive budget, maximum $20 per cart, at least 20% gross margin and 15% maximum discount. Preview current matches, explain exclusions, and activate only when I ask.”

## Local prototype boundaries and scale

This is one shared local demo merchant workspace, not authenticated multi-merchant tenancy. Merchant identity, stock, tax-inclusive pricing, returns and seller eligibility are merchant attestations, not independently checked. Shopper card holds remain sandbox-only. Do not expose the loopback server publicly.

Campaign lookup is indexed by exact product/variant so unrelated merchants are not evaluated against each cart. Offer creation and reservation accounting occur synchronously in a single worker and persist with carts in one atomic state snapshot (`format: 2`, backward-compatible migration from old cart-only state). Restart preserves campaigns, decisions and deduplication. The worker does not require the browser or an LLM API key.

This is **not a demonstrated 100,000-orders/second system**. At that scale, the same API and campaign model would need an event stream, durable queue, partitioned product index, transactional inventory/budget reservations, merchant authentication and order/fulfillment reconciliation. Local limits are 100 campaigns and 200 catalog products per campaign. The prototype does not claim Meta ad infrastructure, real inventory connections or production throughput.

## Verification

```sh
node outputs/committed-cart/merchant.test.mjs
node outputs/committed-cart/merchant-api.test.mjs
```

The HTTP/MCP test starts an isolated server on port 4326 and synthetic cart state under the temporary directory. It checks migration, paused creation, dry run, activation, automatic offer propagation to shopper state, selection analytics, idempotency, authentication/origin boundaries, private key permissions, MCP discovery/calls and restart persistence. It makes no Visa requests and does not alter the running demo's carts or holds.

References: [Meta campaign/ad-set SDK](https://github.com/facebook/facebook-php-business-sdk/blob/main/DEVELOPER_GUIDE.md), [Meta API examples](https://www.postman.com/meta/facebook-marketing-api/folder/8123rwa/adsets), [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).

## Hosted test workspace

A separate authenticated Vercel deployment now exposes Streamable HTTP at https://later-merchant-mcp.vercel.app/mcp. It has no synthetic-intent tool or payment endpoints. It is not yet connected to the local Visa-authorized carts. The local stdio instructions above remain valid. See [HOSTED-MCP.md](../../HOSTED-MCP.md) for the remote client configuration, private access keys, storage and test workflow.
