# DubHacks2026

# Later

Wait. Save. Smile.

A local shopping prototype: shoppers choose exact products and authorize a temporary Visa sandbox hold; merchant campaigns automatically compete with offers within stock, margin, delivery and incentive-budget limits. Shopper offer selection does not place an order or charge a card.

## Run locally

Requires Node.js 22+. The app itself has no npm runtime dependencies.

```sh
cp outputs/visa-sandbox/.env.example outputs/visa-sandbox/.env
cp outputs/committed-cart/.env.example outputs/committed-cart/.env
# Enter your own sandbox credentials in those local files.
npm start
```

Open http://localhost:4318 for the shopper page, or http://localhost:4318/#merchant for the merchant manager. Missing credentials disable the associated Visa/search integration. No production payments are supported.

## Chrome extension

Load `outputs/amazon-extension` unpacked at `chrome://extensions`. The toolbar popup reads Amazon product/cart pages and supported public USD product metadata on other shopping sites. The in-page Wait & save button is available on Amazon.

If Chrome assigns a different development extension ID, update the exact extension origin in `outputs/committed-cart/server.mjs` to match. Full setup and limitations: [extension README](outputs/amazon-extension/README.md).

## Merchant campaigns and agents

Create a campaign, import a CSV catalog, set inventory and pricing limits, preview, then activate. The server worker responds automatically every two seconds. New campaigns start paused. Merchant inventory and prices must be entered or imported; no merchant data or campaign state is included in this repository.

The merchant manager includes Campaigns, Catalog, Offers and a Connect an agent panel with local stdio MCP configuration. [Merchant workflow, pricing math and MCP tools](outputs/committed-cart/MERCHANTS.md).

## Tests

```sh
npm test
# Optional extension DOM tests:
npm install
npm run test:extension
```

The merchant integration test uses an isolated local port and synthetic carts. It makes no Visa requests. Live Visa sandbox authorization is an explicit app action, never part of the default test suite.

## Credentials and scope

Only blank `.env.example` templates are committed. Visa/SerpAPI keys, `.env` files, MCP credentials, local payment state, caches, logs and captured screenshots are excluded. Supply your own keys locally. This is a loopback-only shared merchant demo, not a production service or a demonstrated high-throughput payments system.

[Shopper/API details](outputs/committed-cart/README.md) · [Visa sandbox setup](outputs/visa-sandbox/README.md)

## Hosted MCP demo

The merchant dashboard and authenticated Streamable HTTP MCP service are available at https://later-merchant-mcp.vercel.app. It uses separate private persistent storage. Synthetic intent creation has been removed; only confirmed sandbox authorization records can qualify. No hosted payment endpoints, local cart synchronization, or Visa credentials are configured yet. See [hosted setup and testing](HOSTED-MCP.md) for connection, access-key handling, and deployment details.

## Devpost and demo wording

“Today, Later verifies purchase intent with a real Visa Acceptance sandbox authorization and lets merchants compete for the cart. Next, Visa Intelligent Commerce could let shoppers authenticate a purchase instruction with a budget and deadline, so Later can complete checkout when a qualifying offer arrives.”

Show the working authorization and offer flow first. Label Intelligent Commerce as the roadmap: access approval, card enrollment, purchase instructions, and merchant checkout are not implemented or verified in this build. Intelligent Commerce provides authenticated instructions, agent-bound credentials and payment controls; it does not create the authorization hold. A shopper’s final purchase still requires approval in the current prototype. Do not show a staged instruction ID or claim an order was placed.
