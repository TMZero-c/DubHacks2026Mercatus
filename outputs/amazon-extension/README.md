# Later — Chrome extension

## Sign-in (MongoDB Atlas)

Shopper sign-up and log-in are required before the cart UI opens. Accounts are stored in your MongoDB Atlas cluster through the local backend (the extension never talks to Atlas directly).

1. Copy `outputs/committed-cart/.env.example` to `outputs/committed-cart/.env` if you do not already have one.
2. Set `MONGODB_URI` to your Atlas connection string (keep this file local; it is git-ignored).
3. From the repo root: `npm install` then `npm start`.
4. Load or reload `outputs/amazon-extension` unpacked at `chrome://extensions`.
5. Open the Later popup, create an account or log in, then use Wait & save as before.

Session tokens live in `chrome.storage.local` and are sent as `Authorization: Bearer` to `http://localhost:4318`. Use **Log out** in the popup header to end the session.

Start the backend with `node outputs/committed-cart/server.mjs` (or `npm start`). In Chrome 127+, load this folder unpacked at `chrome://extensions`, or reload the existing Later extension. Refresh any open Amazon pages after an update.

## Shopper experience

The 430 × 600 toolbar popup uses packaged extension files, a compact product card, conversational terms, an inline editor and a pinned composer. It does not open a website, sidebar or payment window. The page itself does not scroll; longer conversations have an internal message area. Multiple products use previous/next controls. Shopping pages show their current items; unrelated pages show Review past orders. History is an explicit, read-only view of recorded waits and offers, not proof of a completed purchase. Account-scoped drafts and recent messages restore only for the same cart. Opening or reopening never restores payment consent. Sign-in requires the configured backend.

On Amazon, the in-page Wait & save button opens this popup. The toolbar can read selected items in the full Amazon cart and Amazon product pages. On other HTTPS stores, it can read a single product exposed through public USD Product JSON-LD metadata. Missing/ambiguous metadata and non-USD prices are rejected, rather than guessed. This is not universal cart support. It never reads payment or account fields.

Review & wait shows the target price, minimum savings, waiting period, delivery deadline, and the separate full-cart Visa test hold. Card entry and confirmation remain in the same popup. The demo only accepts Visa's public test card, shown in read-only fields. Adding the card sends a public fixture alias to the loopback server, which creates remote TMS instrument-identifier/payment-instrument references and encrypts them locally. The browser receives only masked metadata and an opaque local saved-card ID. Adding a card does not authorize a hold. A separate explicit authorization uses the TMS reference through Visa Acceptance's remote sandbox, with capture disabled. No PAN, CVV or billing data is sent from the extension to the loopback API. Sandbox approvals are based on actual remote responses.

You can compare another product while an existing cart waits; View waiting cart returns to that commitment. The server still permits only one unresolved hold per session.

## Conversational shopping

Set `GEMINI_API_KEY` in the backend's private `outputs/committed-cart/.env` when ready, then restart the backend. Optional `GEMINI_ASSISTANT_MODEL` overrides the default model. No key goes into extension files. Until configured, chat displays a connection state and the manual term editor works normally; no simulated AI reply is substituted.

Gemini interprets instructions for the exact selected items and proposes a complete set of terms. **Apply terms** is explicit. Chat cannot authorize a hold, select an offer or place an order. Merchant offer eligibility, all-in cents, savings and ranking are calculated in code. Cached search candidates remain unverified listings and cannot become confirmed offers. Active commitment terms are immutable and are enforced in merchant pricing and offer selection. The harness includes scoped caching, quotas, timeout and malformed-response handling, bounded context and privacy projections. See [the harness contract](../committed-cart/ASSISTANT.md).

## Permissions and API

The only permissions are activeTab, scripting and storage; the only host permission is `http://localhost:4318/*`. Other shopping pages are accessed on explicit toolbar action using activeTab. No all-sites background access, cookies API, browsing history, telemetry or client-side API keys.

The local API accepts credentialed requests from the pinned development extension origin `chrome-extension://kahjaomahjnhcppboeagnjclfbnjgjje` and the localhost shopper page. If the unpacked extension receives a different ID, update `extensionOrigin` in `server.mjs`. It rejects POSTs from foreign website origins. Visa keys and SerpApi keys remain in local `.env` files and are excluded from archives.

## Prices and estimates

Search runs only on Find a lower price. Normalized queries and empty results are cached for one hour in the popup and on the backend; backend caching survives restarts and concurrent queries share a request. A card appears only for a strictly lower listed price. Only that lower price feeds the waiting model, with quantity included. Prices remain listing candidates; the compact result asks shoppers to check variant, tax and delivery.

The waiting number is explicitly an estimate using the existing merchant margin / acquisition-cost model, not a guaranteed merchant offer. Live offers require an authorized, published intent and retain the existing expiry and selection checks.

## Verification

Offline regression tests cover conversational proposals, explicit Apply, manual editing without a key, account and cart changes, late responses, immutable held terms, price and delivery gates, fresh imports, reopen restoration, offline rendering, images, lower/equal/empty results, quantity-aware estimates, cache reuse, consent, inline secure-card flow and hold state. Generic-store fixtures cover Product and @graph metadata, currency and ambiguity. Native Chrome was used to verify the actual Amazon image, compact popup, confirmation and reopening with the selected wait time preserved.

