# Committed — shopper intent + merchant offers

Local-only prototype. Node.js 22+. No additional packages, Sites hosting, or ChatGPT login.

From the workspace: `node outputs/committed-cart/server.mjs`
From an extracted distribution: `node committed-cart/server.mjs`
Open http://localhost:4318.

## Shopper sign-in

With `MONGODB_URI` set in `.env`, the web app requires the same email/password account as the Chrome extension before the cart UI opens. Sign up or log in on the landing gate; sessions are stored in `localStorage` and sent as `Authorization: Bearer` to shopper APIs. Use **Log out** in the header to end the session.

## 1. Purchase intent
Enter exact items/variants, quantities, all-in unit budgets, acceptable sellers, delivery deadline, and duration. Opt into sharing to the local merchant board. Confirm sandbox authorization. A full Visa Acceptance AUTHORIZED response for the exact amount enables the intent. Product details are user-entered, not independently verified. The optional ../amazon-extension imports selected Amazon.com cart items for review; no Amazon API or checkout integration is implemented.

## 2. Merchant campaigns
Open http://localhost:4318/#merchant. Create a paused campaign, import a catalog once, set pricing/margin, daily incentives, stock and fulfillment constraints, preview matches, then activate. A server-side worker responds to matching open intents automatically every two seconds. Campaign, Catalog and Offers views show delivery and reservation metrics. Enter or import your catalog; new campaigns start paused.

A local stdio MCP bridge lets agents read performance, create/preview campaigns, change rules and activate/pause them using the same guarded API. Click Connect an agent for configuration. No ChatGPT login or external AI provider is required. See [MERCHANTS.md](MERCHANTS.md) for the full workflow, pricing math, API/MCP setup, tests and production scale boundaries.

Merchant identity, inventory and eligibility remain self-declared. The role switch is one shared local demo workspace, not production merchant authentication. Shopper selection does not purchase, capture or settle funds.

## Payment and privacy boundaries
Reads sandbox HTTP Signature credentials from ../visa-sandbox/.env on the server. The distribution contains only a blank .env.example. Never distribute the filled .env. Cards and billing details are entered explicitly through secure card entry; no real funds are reserved, no real shopper is authenticated, and this does not establish legally binding or portable purchase intent. The verification API is our local server assertion, not a Visa-signed attestation.

Carts and merchant campaigns persist in .local/state.json (Git-ignored); old cart-only state migrates automatically. Session ownership uses an HttpOnly SameSite cookie. Credential values and card data are never returned to browser clients. Shared cart items, budgets, conditions and optional product links are visible to any local demo merchant. Do not enter sensitive links.

At expiration, verification becomes inactive immediately. While the server runs, it attempts reversal within 15 seconds. Offline operation delays reversal. Unknown/interrupted outcomes become needs_review and block new authorizations for that session: reconcile in the sandbox portal before any retry. Never delete state to bypass uncertain outcomes. Partial approvals need manual reconciliation using the amount actually authorized. Selecting another merchant after authorization is not validated by these sandbox tests.

## Checks
`node outputs/committed-cart/test.mjs` (or `node committed-cart/test.mjs` from the distribution).
`node outputs/visa-sandbox/test.mjs` checks request signing separately.
Browser-tested: $180 sandbox authorization -> published intent -> $165 merchant offer -> shopper selection -> reversal. No real order.


## Hosted card entry (Microform)
Open http://localhost:4318 (the exact origin is required). Enter a cart, confirm consent, then Wait & save. Billing details and sandbox card entry appear in the same dialog. Enter a sandbox card from Visa’s testing guide. Release commitment reverses the sandbox authorization.

The embedded website and extension flow accepts an explicitly entered sandbox card and billing details, sends them to the loopback server, and forwards Visa’s documented paymentInformation.card and orderInformation.billTo fields to the remote Payments API with capture:false. Card details, CVV and billing data are never persisted or logged. There is no preset-card endpoint or fallback. This direct card entry is sandbox-only and is not a production hosted-fields integration.

The optional standalone Microform path remains available for development: Visa/Cybersource-hosted fields return a short-lived RS256 token, which the server validates and consumes once before sending tokenInformation.transientTokenJwt. Visa rejected chrome-extension origins in its Microform capture-context validation, so this path cannot be claimed as the extension’s inline payment mechanism.

No real holds or automatic purchases occur. This does not establish identity or a binding purchase promise. Production card acceptance needs merchant/acquirer onboarding and an approved commercial model; one merchant’s authorization is not transferable to another seller.

Verified in Chrome: hosted fields loaded, test card tokenized, full $180 authorization approved, reversal confirmed. Unit checks: node committed-cart/microform.test.mjs (from the extracted parent folder).

Official reference: https://developer.cybersource.com/docs/cybs/en-us/digital-accept-flex/developer/all/rest/digital-accept/microform-integ-v2/microform-integ-getting-started-v2.html

## Browser identity
Later includes SVG/PNG favicon, Apple touch icon, web manifest, theme color, description and Open Graph/Twitter preview tags. The local prototype is noindex. Social image URLs currently point to localhost; replace them with the public origin when deploying. External social crawlers cannot access localhost. No offline payment caching or service worker is installed.

## Live price comparison
SerpApi Google Shopping is connected through the backend-only `SERPAPI_API_KEY` in committed-cart/.env. No key is sent to the browser or included in downloads. Click Check prices to search one selected item. Only product search text is sent, never card/account details. Results cache for one hour; identical in-flight requests are deduplicated; local uncached calls are limited to 20/hour. Provider account limits still apply.

Find other sellers calls Gemini with Google Search grounding through the backend-only `GEMINI_API_KEY` in the same `.env`. The optional `GEMINI_MODEL` defaults to `gemini-3.8-flash`. The key stays on the server. The panel lists other sites and the USD price Gemini found for the selected product. Those listings do not change the cart budget or the Visa hold. The same one-hour cache, in-flight deduplication, and 20-request local hourly cap apply separately from SerpApi.

Results require a recognized store name, matching brand/product anchor, exact model tokens and stated numerical/color/specification constraints, and at least 85% substantive word coverage. This is conservative text matching, not independent verification of product or merchant. Missing/mismatched variants are excluded; no match is a valid outcome. Installments and explicit used/refurbished listings are excluded. Delivery/tax may be incomplete; listing price differences are not guaranteed checkout savings. Searches edited away from the cart’s default query do not show a budget comparison.

Verified live: Sony WH-1000XM5 Black yielded 4 candidates and 31 rejected results in the app. The imported dog biscuits had no sufficiently close result. No order or payment was sent by comparison. Unit tests: node committed-cart/shopping.test.mjs.

Price cards render only for strict matching listings below the selected unit budget. Equal/higher/no-result searches render no comparison card. Qualified lower listed prices replace the corresponding unit-price baseline in the waiting scenario, multiplied by quantity; other cart items keep their budgets. Tax/delivery uncertainty remains visible. Authorization amounts remain unchanged.

## Extension toolbar popup
Later opens in the compact Chrome toolbar popup. No sidebar or new tab. Native sandbox card entry renders inside the same popup. A short-lived, owner-scoped flow links it to the cart without persisting card data to extension storage. See amazon-extension/README.md for installation and permissions.

Search cache now persists for one hour across restarts, includes empty results, merges simultaneous lookups, and retains the hourly request counter. Cached results are timestamped; no search runs just from opening Later.
