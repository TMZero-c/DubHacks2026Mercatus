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

- **Token Management Service:** the demo popup selects Visa's public test fixture using the alias `visa-1111`. Its PAN, CVV and fixed example billing details exist only on the server. **Add card** saves it through TMS without creating a cart commitment or placing a hold. A separate approval authorizes the cart using the saved card. Saving calls `POST /tms/v1/instrumentidentifiers`, then `POST /tms/v1/paymentinstruments`; future authorizations use `paymentInformation.paymentInstrument.id`. Provider references are encrypted with AES-256-GCM in private 0600 local storage. The browser receives only an opaque local card ID, brand, last four digits and expiration. The identifier-only duplicate-check path still discards the provider reference and retains its domain-separated HMAC; both paths use compatible card/basket identities to reject matching unresolved commitments. PAN, CVV and billing details are never persisted by Later. This is merchant-scoped tokenization, not a network token, unique-person verification, or authority to spend at another merchant. [Saved-card APIs and lifecycle](outputs/committed-cart/README.md#saved-test-cards-with-visa-token-management-service).
- **Transaction Details:** `GET /tss/v2/transactions/{id}` checks the stored transaction ID, merchant, order reference, currency, total and authorized amounts, and successful authorization application. Reads begin after five minutes, retry at five-minute intervals up to five attempts, and cache successful matches. Only an allowlisted receipt summary is stored. Mismatches quarantine the intent. Reporting proves a historical sandbox authorization record; it does not prove that a hold is still active, a purchase completed, or real money moved.

Both integrations use the existing Visa Acceptance sandbox credentials server-side. Neither requires Intelligent Commerce access. Default automated tests use offline fixtures. A separate live check exercised tokenization, one $19.89 authorization, cross-session duplicate rejection, and a confirmed reversal. These integrations run on the local payment server; the hosted merchant service still has no Visa credentials or payment endpoints.

**Transport:** the extension's HTTP loopback requests to `http://localhost:4318` contain only cart terms, flow IDs, the `visa-1111` selection alias or opaque saved-card IDs. No PAN, CVV or billing details cross that local hop; `/api/commit-card` rejects raw card/billing bodies and unknown aliases. The backend supplies the fixed public test fixture internally and sends payment data to `https://apitest.visaacceptance.com` over HTTPS/TLS. Visa HTTP Signatures authenticate requests and protect integrity; signatures do not encrypt payloads. Saved-card authorizations send the private TMS payment-instrument reference to Visa rather than PAN/CVV.

The optional website Microform development path uses Visa-hosted fields and short-lived tokens. It is separate from the extension's current alias-based demo selection. Actual remote TMS verification also confirmed two $1.00 token authorizations, both authorization reversals, and HTTP 204 payment-instrument deletion. No purchase or production payment occurred.

API references: [TMS](https://developer.visaacceptance.com/docs/vas/en-us/tms/developer/all/rest/tms.html), [Transaction Search and Details](https://developer.visaacceptance.com/docs/vas/en-us/txn-search/developer/all/rest/txn-search.html).

## Solana offer compute engine

The optional **Solana devnet** campaign engine executes merchant quote rules inside a native Solana program. Visa Acceptance still verifies the card authorization offchain. Later's trusted attestor registers a time-limited intent; the program calculates a price, reserves shared merchant stock and daily incentives, and records selection and release. It adds no waiting reward or commission payment. Selecting an offer is not a purchase, capture, or settlement.

Campaigns publish list prices, minimum prices, inventory, seller-rule hashes, and incentive limits. Cost and gross-margin inputs stay in the payment service; the service derives each minimum price before publication. The program enforces that floor and the remaining budget when it calculates each quote. Product hashes and timing are public and can be guessed from known catalog information; they are not encrypted. The merchant must explicitly opt in to publishing **test** policy data. No card data, Visa identifiers, billing information, credentials, or customer names go onchain.

The program uses separate policy, intent, quote, and merchant/product stock accounts. Stock is shared across that merchant's campaigns to prevent duplicate reservation. It enforces expiry, a single selection, seller and delivery constraints, and the best available quote ceiling. The API only publishes a Solana offer after confirmed execution and account readback. Failed or uncertain confirmation does not fall back to a locally calculated offer. Publication, selection, and release can be retried. When the Visa backing becomes inactive, the worker revokes the onchain intent and releases its reservations. Selecting an API offer also revokes an outstanding Solana intent. These changes require confirmed worker transactions; until they land, the existing onchain expiry is the upper bound. Policy and intent account rent currently remains allocated; this prototype needs a cleanup lifecycle and a production audit before mainnet.

Build and verification:

```sh
npm run build:solana
npm run test:solana
npm run deploy:solana
```

The build script creates private test keypairs under ignored `.local/solana-market/` and sends only the Rust program source plus the public attestor address to the official Solana Playground compiler. Its cached toolchain may differ from the local Cargo lockfile. `test:solana` loads the compiled ELF into LiteSVM and executes signed Solana transactions; this is offline VM verification, not a devnet deployment. `deploy:solana` requires the official Solana CLI and enough free devnet SOL, then verifies the deployed binary before writing deployment metadata. All scripts are fixed to devnet. Never fund these wallets with mainnet assets.

The local payment service exposes the optional campaign engine when real devnet deployment metadata exists. The hosted Vercel merchant MCP does not hold chain or Visa private keys and rejects Solana campaigns. Its ordinary API campaigns remain supported. Matching, search, card handling, and reconciliation stay offchain. This is a shared executable pricing policy, not a claim that Solana replaces every backend service or can call Visa HTTP APIs.

The attestor and program upgrade authority remain trusted in this prototype. Each merchant currently uses the local operator's test wallet. Separate merchant wallet onboarding, durable transaction jobs, confidential execution, account cleanup, and load testing are future work. No throughput claim or private SVM/rollup deployment is implied.

## Paid agent access on the Solana chain (x402 V2)

Merchants' agents can buy one current, published Visa-backed cart snapshot for **0.001 test USDC on Solana devnet**. `GET /api/agent` lists product identities and resource URLs without exposing the cart budget, card identifiers, or shopper identity. Request an intent resource with a unique UUID `requestId`; the API returns an x402 V2 `PAYMENT-REQUIRED` header. The official Solana client signs the exact USDC amount, the public x402 testnet facilitator verifies and settles it, and Later checks Solana confirmation before returning the snapshot and `PAYMENT-RESPONSE` receipt. No custom Solana program deployment is required for this payment route.

The facilitator sponsors transaction fees. The recipient's USDC associated token account must already exist. Discovery advertises payments only after checking that account and the facilitator's exact V2/devnet support. The API accepts only the devnet USDC mint and network; there is no automatic mainnet mode. The recipient address is public configuration (`LATER_X402_PAY_TO`), not a server signing key.

A paid agent can submit one offer at the snapshot's `offerEndpoint`, using the same `requestId` and original `PAYMENT-SIGNATURE`. This does not charge another fee or buy the product. Repeated identical offers return the original offer; changed terms under the same purchase are rejected. Existing authenticated merchant MCP tools remain an administrative workspace interface.

Payment retries must reuse the same request ID **and signed transaction**. The private ledger binds that payment to one resource, stores confirmed fulfillment, and lets a retry recover its original receipt without authorizing a second payment. An uncertain settlement returns no cart. A closed intent rejects new purchases; a previously completed purchase can retrieve its dated snapshot with `activeNow: false`. A hold qualifies interest, not a guaranteed eventual purchase.

The local Visa payment service can sync its own confirmed, consented sandbox intents to the hosted API using server-only `LATER_HOSTED_ACCESS_KEY`. The hosted ingress is authenticated Later attestation, not an independently verified Visa signature. It receives no PAN, CVV, billing address, TMS fingerprint, or Visa API credential. It keeps the authorization reference private and excludes it from paid responses. Merchant offers sync back to the local extension, and selection/release updates close the hosted intent. The sync worker must remain running; expiry also bounds availability.

A test-agent client persists its signed request under an ignored private directory before submitting payment:

```sh
node outputs/agent-payments/buy.mjs \
  https://later-merchant-mcp.vercel.app/api/agent/intents/INTENT_UUID \
  /absolute/path/to/test-agent-keypair.json \
  /absolute/path/to/.local/purchase.json \
  EXPECTED_PUBLIC_RECIPIENT_ADDRESS
```

The client is restricted to Later's local/hosted origins, the Solana devnet USDC mint, the expected recipient, and exactly 0.001 test USDC. Reuse that private request file for retries. `npm run test:x402` uses explicitly offline facilitator fixtures for failure, replay, privacy, and persistence checks; it does not claim a network settlement.

**Visa and revenue:** the USDC micropayment goes to the API operator, not to Visa. Visa's role here is card-backed intent qualification and the card commerce the marketplace can generate. This prototype authorizes and reverses in the Visa sandbox; it does not charge a real card or complete the winning merchant's purchase. Visa's institutional USDC settlement offering on Solana is a separate issuer/acquirer integration, not something enabled by these sandbox keys. A production launch needs merchant card checkout plus the appropriate payment partners, and a production facilitator/network configuration rather than switching this demo to mainnet.

References: [Solana x402 V2](https://solana.com/docs/payments/agentic-payments/x402), [x402 facilitator](https://github.com/x402-foundation/x402/blob/main/docs/core-concepts/facilitator.md), [Visa USDC settlement on Solana](https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.21951.html).

Live verification completed on Solana devnet: a real Visa Acceptance sandbox authorization qualified the cart; an agent paid 0.001 test USDC; the offer returned to the local shopper and was selected; the Visa authorization was then reversed. An identical retry returned the original receipt. [Confirmed Solana transaction](https://explorer.solana.com/tx/4jYNLQrFKD3kwfBQBieYrBvJezLNAWjxKvMaXkNTsyqFbxAJ2YRJekLGbmehGeGYEjK2UNQ595u2hK6optWd16HJ?cluster=devnet). RPC token balances showed exactly −1,000/+1,000 base units between the two distinct project wallets. No production assets were used.
