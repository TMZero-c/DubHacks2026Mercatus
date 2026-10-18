# Committed — shopper intent + merchant offers

Local shopping prototype. Node.js 24.x; run `npm ci` from the workspace before starting. No Sites hosting or ChatGPT login is required.

From the workspace: `node outputs/committed-cart/server.mjs`
From an extracted distribution: `node committed-cart/server.mjs`
Open http://localhost:4318.

## 1. Purchase intent
Enter exact items/variants, quantities, all-in unit budgets, acceptable sellers, delivery deadline, and duration. Opt into sharing to the local merchant board. Confirm sandbox authorization. A full Visa Acceptance AUTHORIZED response for the exact amount enables the intent. Product details are user-entered, not independently verified. The optional ../amazon-extension imports selected Amazon.com cart items for review; no Amazon API or checkout integration is implemented.

## 2. Merchant campaigns
Open http://localhost:4318/#merchant. Create a paused campaign, import a catalog once, set pricing/margin, daily incentives, stock and fulfillment constraints, preview matches, then activate. A server-side worker responds to matching open intents automatically every two seconds. Campaign, Catalog and Offers views show delivery and reservation metrics. Enter or import your catalog; new campaigns start paused.

A local stdio MCP bridge lets agents read performance, create/preview campaigns, change rules and activate/pause them using the same guarded API. Click Connect an agent for configuration. No ChatGPT login or external AI provider is required. See [MERCHANTS.md](MERCHANTS.md) for the full workflow, pricing math, API/MCP setup, tests and production scale boundaries.

Merchant identity, inventory and eligibility remain self-declared. The role switch is one shared local demo workspace, not production merchant authentication. Shopper selection does not purchase, capture or settle funds.

## Payment and privacy boundaries
Reads sandbox HTTP Signature credentials from ../visa-sandbox/.env on the server. The distribution contains only a blank .env.example. Never distribute the filled .env. The extension selects a server-side public test fixture by alias; no card number, CVV or billing address is submitted from the extension. No real funds are reserved, no real shopper is authenticated, and this does not establish legally binding or portable purchase intent. The verification API is our local server assertion, not a Visa-signed attestation.

Carts and merchant campaigns persist in .local/state.json (Git-ignored); old cart-only state migrates automatically. Session ownership uses an HttpOnly SameSite cookie. Visa API credentials and private TMS references are never returned to browser clients. The extension displays only the public test fixture or masked saved-card details. Shared cart items, budgets, conditions and optional product links are visible to any local demo merchant. Do not enter sensitive links.

At expiration, verification becomes inactive immediately. While the server runs, it attempts reversal within 15 seconds. Offline operation delays reversal. Unknown/interrupted outcomes become needs_review and block new authorizations for that session: reconcile in the sandbox portal before any retry. Never delete state to bypass uncertain outcomes. Partial approvals need manual reconciliation using the amount actually authorized. Selecting another merchant after authorization is not validated by these sandbox tests.

## Checks
`node outputs/committed-cart/test.mjs` (or `node committed-cart/test.mjs` from the distribution).
`node outputs/visa-sandbox/test.mjs` checks request signing separately.
Browser-tested: $180 sandbox authorization -> published intent -> $165 merchant offer -> shopper selection -> reversal. No real order.


## Hosted card entry (Microform)
In the Chrome extension, review a cart, confirm consent, then Wait & save. Select the public Visa test fixture or a saved test card in the same popup. Release commitment reverses the sandbox authorization.

To add a card, the extension sends `{testCard:"visa-1111", consent:true}`. To authorize a hold afterward, it sends the bound cart's `{flow, cardId}`. Neither request contains PAN, CVV or billing details over HTTP loopback. The server rejects raw card/billing bodies and unknown aliases, then resolves the approved alias to Visa's public test card and fixed example billing details internally. Only the backend sends card data to the remote TMS API over HTTPS/TLS; saved-card authorization uses `paymentInformation.paymentInstrument.id` with capture:false. The compatibility test-card authorization endpoint also supplies the fixture server-side and sends it to Visa only over HTTPS/TLS. PAN, CVV and billing data are never persisted or logged by Later. This alias-based sandbox mechanism does not accept personal cards and is not a production hosted-fields integration. HTTP signatures authenticate requests and protect integrity; they do not encrypt payloads.

The optional standalone Microform path remains available for development: Visa/Cybersource-hosted fields return a short-lived RS256 token, which the server validates and consumes once before sending tokenInformation.transientTokenJwt. Visa rejected chrome-extension origins in its Microform capture-context validation, so this path cannot be claimed as the extension’s inline payment mechanism.

No real holds or automatic purchases occur. This does not establish identity or a binding purchase promise. Production card acceptance needs merchant/acquirer onboarding and an approved commercial model; one merchant’s authorization is not transferable to another seller.

Verified in Chrome: hosted fields loaded, test card tokenized, full $180 authorization approved, reversal confirmed. Unit checks: node committed-cart/microform.test.mjs (from the extracted parent folder).

Official reference: https://developer.cybersource.com/docs/cybs/en-us/digital-accept-flex/developer/all/rest/digital-accept/microform-integ-v2/microform-integ-getting-started-v2.html

## Saved test cards with Visa Token Management Service

Click **Add card** in the extension to save the selected public test fixture in Visa Acceptance's remote TMS sandbox. This action creates no cart commitment, authorization hold or payment. After saving, a separate **Authorize hold** action approves the bound cart amount using the saved card. Saving creates an instrument identifier with `POST /tms/v1/instrumentidentifiers`, then a payment instrument with `POST /tms/v1/paymentinstruments`. The TMS request uses the documented textual card type `visa`; Payments' numeric type code is a different field convention. No CVV is sent to a vault endpoint.

Future authorizations send `paymentInformation.paymentInstrument.id` to Visa rather than sending the card number again. This is a reusable reference in our merchant's vault; it is not a network token or a card another merchant can charge. It does not grant Amazon checkout access, and selecting an offer still does not place an order.

Saved-card APIs use the current session owner:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/cards` | Return opaque local IDs, Visa brand, last four digits and expiration dates for this session's saved cards. |
| `POST /api/cards` | Submit `{testCard:"visa-1111", consent:true}` to save the server-side public fixture through TMS only. Return masked `card` and `cards`; no authorization or cart is created. Missing explicit consent, unknown aliases and raw card/billing bodies are rejected. |
| `POST /api/commit-card` | Compatibility endpoint for `{flow, testCard:"visa-1111", saveCard, tokenizeCard}`. The popup's normal flow uses separate card saving and saved-card authorization instead. |
| `POST /api/commit-saved-card` | Use `{flow, cardId}` to authorize the immutable cart bound to that flow. Browser-supplied prices and provider token IDs cannot replace its terms. |
| `POST /api/cards/delete` | Use `{id}` to delete the Visa payment instrument. Local deletion completes only after Visa confirms HTTP 204. |

The default private storage is `.local/card-vault/` beneath the server state directory. TMS references and owner associations are encrypted with AES-256-GCM and an independent 0600 key file; the directory is 0700. PAN, CVV and billing details are never written to this store. Only opaque local card IDs and masked metadata cross the browser boundary. The directory and credentials must remain excluded from Git and deployment artifacts. `LATER_STATE_DIR` can relocate all local server state.

Unconfirmed creation is recorded durably and blocks another attempt to create the same saved card until reconciled. Unconfirmed deletion disables the credential locally and retains its encrypted reference for a safe deletion retry. Removing a payment instrument does not delete its shared instrument identifier, which other payment instruments may reference. The private card/basket HMAC remains compatible with the existing duplicate-intent check; it is not proof of a unique person.

Provider errors expose only a generic browser message. Server code may inspect the error's nonenumerable `diagnostics` property for HTTP status, a redacted endpoint, reason code and allowlisted field names. Raw provider messages, field values, card data and TMS identifiers are excluded.

Actual remote sandbox verification on October 18, 2026: TMS saving succeeded, two separate $1.00 authorizations using the saved payment instrument returned `AUTHORIZED`, both reversals returned `REVERSED`, and payment-instrument deletion returned HTTP 204. A local QA merchant offer of $0.90 was selected as part of the review flow; this was not a capture or a purchase. No production funds moved. Trusted Agent Protocol is not part of this extension payment flow.

Run `node --test outputs/committed-cart/card-vault.test.mjs outputs/committed-cart/card-routes.test.mjs` for offline vault and HTTP integration checks. The HTTP test copies source modules into isolation, loads no real credentials, and replaces all provider requests with explicit offline fixtures. It covers consent, session ownership, immutable cart terms, token-only reuse, deletion, replay rejection and private-data boundaries; it does not perform the remote verification above.

Official references: [Create a TMS payment instrument](https://developer.visaacceptance.com/docs/cybs/en-us/tms/developer/ctv/rest/tms/tms-pi-tkn/tms-pi-tkn-create-intro/tms-pi-tkn-create-ex-rest.html), [authorize with a payment instrument](https://developer.visaacceptance.com/docs/vas/en-us/payments/developer/ctv/rest/payments/payment-tms-process-intro/tms-pi-tkn-pay-intro.html), [delete a payment instrument](https://developer.visaacceptance.com/docs/vas/en-us/tms/developer/all/rest/tms.html).

## Browser identity
Later includes SVG/PNG favicon, Apple touch icon, web manifest, theme color, description and Open Graph/Twitter preview tags. The local prototype is noindex. Social image URLs currently point to localhost; replace them with the public origin when deploying. External social crawlers cannot access localhost. No offline payment caching or service worker is installed.

## Live price comparison
SerpApi Google Shopping is connected through the backend-only `SERPAPI_API_KEY` in committed-cart/.env. No key is sent to the browser or included in downloads. Click Find current prices to search one selected item. Only product search text is sent, never card/account details. Results cache for one hour; identical in-flight requests are deduplicated; local uncached calls are limited to 20/hour. Provider account limits still apply.

Results require a recognized store name, matching brand/product anchor, exact model tokens and stated numerical/color/specification constraints, and at least 85% substantive word coverage. This is conservative text matching, not independent verification of product or merchant. Missing/mismatched variants are excluded; no match is a valid outcome. Installments and explicit used/refurbished listings are excluded. Delivery/tax may be incomplete; listing price differences are not guaranteed checkout savings. Searches edited away from the cart’s default query do not show a budget comparison.

Verified live: Sony WH-1000XM5 Black yielded 4 candidates and 31 rejected results in the app. The imported dog biscuits had no sufficiently close result. No order or payment was sent by comparison. Unit tests: node committed-cart/shopping.test.mjs.

Price cards render only for strict matching listings below the selected unit budget. Equal/higher/no-result searches render no comparison card. Qualified lower listed prices replace the corresponding unit-price baseline in the waiting scenario, multiplied by quantity; other cart items keep their budgets. Tax/delivery uncertainty remains visible. Authorization amounts remain unchanged.

## Extension toolbar popup
Later opens in the compact Chrome toolbar popup. No sidebar or new tab. Native sandbox card entry renders inside the same popup. A short-lived, owner-scoped flow links it to the cart without persisting card data to extension storage. See amazon-extension/README.md for installation and permissions.

Search cache now persists for one hour across restarts, includes empty results, merges simultaneous lookups, and retains the hourly request counter. Cached results are timestamped; no search runs just from opening Later.
