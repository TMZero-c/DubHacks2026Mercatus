# Later — Chrome extension

Start the backend with `node outputs/committed-cart/server.mjs`. In Chrome 127+, load this folder unpacked at `chrome://extensions`, or reload the existing Later extension. Refresh any open Amazon pages after an update.

## Shopper experience

The 410 × 584 toolbar popup is built entirely from packaged extension files. The whole popup, including billing and sandbox card entry, uses packaged extension UI. There is no embedded website or remote script. Product image, name, quantity, cart price, wait choices, comparison and Visa action fit together. Multiple items use previous/next controls instead of an expanding list. Opening checks the active tab before showing a cart. Product/cart pages show the current page’s items; other websites and browser pages show a neutral Review past orders entry. History is an explicit, read-only view of recorded waits and offers, with four entries per page. It does not imply a purchase was completed. Stored drafts are never automatically displayed on unrelated pages. Wait choices and matching price caches are retained for the current shopping cart. If the backend is unavailable, the cart remains visible with a retry message.

On Amazon, the in-page Wait & save button opens this popup. The toolbar can read selected items in the full Amazon cart and Amazon product pages. On other HTTPS stores, it can read a single product exposed through public USD Product JSON-LD metadata. Missing/ambiguous metadata and non-USD prices are rejected, rather than guessed. This is not universal cart support. It never reads payment or account fields.

Wait & save shows consent, then collects billing details and an explicitly entered sandbox card inside the same toolbar box. It sends a real authorization request to Visa Acceptance’s remote sandbox with capture disabled. No preset PAN, fictional billing data, or simulated approval is used. Visa Microform rejects chrome-extension origins, so this prototype uses the Payments API directly through the loopback server. This is sandbox-only card handling, not a production hosted-fields integration. A 10-minute owner-scoped card flow keeps payment fields out of extension storage; success is based on the remote response. Card details are not saved.

You can compare another product while an existing cart waits; View waiting cart returns to that commitment. The server still permits only one unresolved hold per session.

## Permissions and API

The only permissions are activeTab, scripting and storage; the only host permission is `http://localhost:4318/*`. Other shopping pages are accessed on explicit toolbar action using activeTab. No all-sites background access, cookies API, browsing history, telemetry or client-side API keys.

The local API accepts credentialed requests from the exact installed development extension origin `chrome-extension://kahjaomahjnhcppboeagnjclfbnjgjje`. If an unpacked installation receives a different ID, update `extensionOrigin` in `server.mjs`. It rejects POSTs from foreign website origins. Visa keys and SerpApi keys remain in local `.env` files and are excluded from archives.

## Prices and estimates

Search runs only on Find a lower price. Normalized queries and empty results are cached for one hour in the popup and on the backend; backend caching survives restarts and concurrent queries share a request. A card appears only for a strictly lower listed price. Only that lower price feeds the waiting model, with quantity included. Prices remain listing candidates; the compact result asks shoppers to check variant, tax and delivery.

The waiting number is explicitly an estimate using the existing merchant margin / acquisition-cost model, not a guaranteed merchant offer. Live offers require an authorized, published intent and retain the existing expiry and selection checks.

## Verification

Offline regression tests cover fresh imports, reopen restoration, offline rendering, images, lower/equal/empty results, quantity-aware estimates, cache reuse, consent, inline secure-card flow and hold state. Generic-store fixtures cover Product and @graph metadata, currency and ambiguity. Native Chrome was used to verify the actual Amazon image, compact popup, confirmation and reopening with the selected wait time preserved.

