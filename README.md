# DubHacks2026

# Later

Good things come to those who wait.

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

## Visa integrations verified against the remote sandbox

- **Token Management Service Instrument Identifier:** the popup offers an unchecked option to tokenize the entered test card and check duplicate carts. The server calls `POST /tms/v1/instrumentidentifiers` before authorization. In the live check, the same public test card returned HTTP 201 and then HTTP 200 with the same merchant-vault identifier. Later discards that payment identifier and retains only a domain-separated HMAC of the card-and-basket identity. A matching unresolved basket from another session is rejected before another hold. Raw card numbers, CVVs, billing details, and TMS identifiers are never persisted. This is an opt-in duplicate check within this merchant vault, not proof of a unique person or a global identity service. Untokenized commitments do not receive the `cardDeduplicated` flag.
- **Transaction Details:** `GET /tss/v2/transactions/{id}` checks the stored transaction ID, merchant, order reference, currency, total and authorized amounts, and successful authorization application. Reads begin after five minutes, retry at five-minute intervals up to five attempts, and cache successful matches. Only an allowlisted receipt summary is stored. Mismatches quarantine the intent. Reporting proves a historical sandbox authorization record; it does not prove that a hold is still active, a purchase completed, or real money moved.

Both integrations use the existing Visa Acceptance sandbox credentials server-side. Neither requires Intelligent Commerce access. Default automated tests use offline fixtures. A separate live check exercised tokenization, one $19.89 authorization, cross-session duplicate rejection, and a confirmed reversal. These integrations run on the local payment server; the hosted merchant service still has no Visa credentials or payment endpoints.

API references: [TMS](https://developer.visaacceptance.com/docs/vas/en-us/tms/developer/all/rest/tms.html), [Transaction Search and Details](https://developer.visaacceptance.com/docs/vas/en-us/txn-search/developer/all/rest/txn-search.html).

## Proposed Visa + Solana architecture — not deployed

The useful onchain feature is a **merchant-funded USDC reward for choosing an offer**. For example, a merchant locks a $5 reward with a firm offer. The shopper approves the purchase through the card checkout; after authenticated purchase confirmation, the program releases that merchant-funded reward. Expired or cancelled offers return unused funds under explicit rules. Selecting an offer in this prototype is not purchase confirmation and must never trigger a payout.

Keep private product baskets, personal information, search, matching, Visa requests and reconciliation in a conventional API, database and durable queue. Use a Solana program for reward escrow and single-use offer acceptance/settlement. Give each intent/offer its own program-derived account; avoid a single global writable counter or vault. Store an opaque, salted commitment to terms, expiration, permitted participants and settlement state. Keep payment identifiers, card fingerprints, addresses, raw cart contents and API credentials offchain.

Solana programs cannot call the Visa HTTP API. A narrowly scoped Later attestor would verify an authenticated final payment event and submit an idempotent completion instruction. That is trust in Later's attestor, not a Visa-signed onchain proof. The design must bind offer, shopper payout wallet, amount, mint and deadlines, reject replay/double payout, and define cancellation/refund/dispute handling. Never treat a reporting receipt or an expiring authorization as final settlement. A card authorization at Later also cannot simply be transferred to an unrelated winning merchant.

Start on ordinary Solana devnet with a standard program. 100,000 events/day averages 1.16 events/second; 100,000/hour averages 27.8. Peak traffic, account contention, RPC/indexing, storage rent and fees need measurement. A private SVM/ephemeral rollup is a later option if measured requirements justify its extra operation and trust assumptions. The current JSON-file/whole-Blob storage is also a demo constraint and needs replacement before this volume.

[Solana Attestations](https://solana.com/docs/tools/attestations) is a possible shared receipt registry; it is not escrow. Visa already supports USDC settlement on Solana for participating institutions, but our sandbox credentials do not grant access to that institutional settlement program. [Visa's announcement](https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.21951.html).
