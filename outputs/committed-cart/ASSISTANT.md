# Later shopping assistant

The extension conversation turns a shopper's instructions into a reviewable draft and explains merchant offers. It does not authorize payments, select an offer, place an order, browse a store, or write long-term memory. Those actions remain explicit, separate application operations.

## Configuration and honest unavailable state

Set `GEMINI_API_KEY` only in the server's private environment. The server creates `createShoppingAssistant({apiKey, model})`; `model` defaults to the app's existing `gemini-3.8-flash` setting. The fixed HTTPS Google endpoint receives the key in `x-goog-api-key`, never in a URL or prompt. Missing credentials produce `assistant_unconfigured` / HTTP 503 and make no provider call. The interface can still expose editable shopping terms and deterministic deal analysis. It must never substitute a canned answer and present it as Gemini.

The harness uses the [Gemini generateContent API](https://ai.google.dev/api/generate-content) with JSON Schema output, following Google's [structured output guidance](https://ai.google.dev/gemini-api/docs/structured-output). No SDK, model tool, external browse tool, or client-side key is required.

## Boundary contract

```js
const assistant = createShoppingAssistant({apiKey, model});
const result = await assistant.chat({
  owner: authenticatedOwnerId, // local rate/cache scope, never sent to Google
  message,
  history: [{role: 'user', text: 'Only new items, please.'}],
  context: {
    cart: {items: [{name, variant, quantity, cents}], amount, currency: 'USD'},
    terms: {maxTotalCents, minimumSavingsCents, waitHours, deliveryBy, condition: 'new'},
    offers: serverOwnedCurrentSnapshotOffers,
    listings: cachedServerSearchCandidates,
    timeZone: 'America/Los_Angeles',
    locked: false
  }
});
// {reply, proposal: fullTerms | null,
//  analysis: {offers: [{id, merchant, totalCents, savingsCents,
//    deliveryDate, eligible, reasons}], bestOfferId}, configured: true}
```

The HTTP layer must authenticate the owner, reconstruct the cart from validated items or the owner's stored cart, and read merchant offers/search candidates from server state. It must reject client-supplied offers, prices presented as offers, context IDs from other owners, and arbitrary prompt/context fields. Filter stored offers by `snapshotHash === cart.digest` before calling the harness. `analyzeDeals` does not independently fetch a cart or prove a merchant's identity/inventory.

Product metadata, merchant text and transcript are untrusted data in a single user data envelope; the system instruction is a separate provider field. A fresh context allowlist excludes card/account fields, addresses, URLs, cart IDs, Visa references and arbitrary input keys. Raw offer IDs are replaced by temporary `offer_1` handles for the provider. Email patterns, payment-number patterns and labeled credentials are removed from free text. These are defense in depth; the conversation must never request payment details. Payment forms use their existing dedicated flow.

## Terms and evidence

`normalizeShoppingTerms(input, {cartTotalCents, now})` accepts only the five documented fields. Both money fields are integer cents. The maximum is positive and at most the cart total; minimum savings is nonnegative and smaller than the total. The tighter of those two price conditions applies and the normalized result expresses both consistently. Supported waits are exactly 15 minutes, one hour, twelve hours and twenty-four hours. Unsupported waits are rejected, not rounded. Delivery is a real `YYYY-MM-DD` date on or after today's Los Angeles calendar date. Only `new` is supported.

`analyzeDeals({cart, terms, offers, now})` uses server-owned merchant all-in totals, exact-match and conditions confirmations, submission status, expiry, new condition, and delivery deadline. It recomputes cents, savings, eligibility and reasons in code. Its recommended offer is the cheapest eligible offer, then earliest delivery, then stable ID. Search listings do not enter this calculation: their tax, shipping and exact availability remain unverified. Current merchant offers are self-declared and are not proof of inventory or fulfillment.

Gemini's output is validated again independently of the schema. Unknown fields, malformed JSON, blocked/truncated candidates, tools, unknown/ineligible recommendation IDs, unsupported terms, HTML/links, leaked credential patterns and certain unsupported numerical claims are rejected. The application always returns the deterministic recommendation, not a model ranking. Generated prose remains advisory: numerical checks cannot prove every natural-language claim or its association with a merchant. Render the deterministic evidence alongside prose and use it for every action decision.

An active/locked cart rejects any term proposal. Existing historical locked commitments may retain a past delivery deadline for explanation; their past dates and expired offers cannot become eligible recommendations. New/unlocked terms and every generated proposal must still pass the current-date boundary. An unlocked proposal is still only a draft: an explicit shopper Apply action is required, followed by the existing separate consent to authorize a hold. The full original cart authorization amount does not silently become the proposed discounted purchase price.

## Resource and privacy limits

Messages are at most 1,200 characters, history at most eight user/assistant messages, cart at most eight items and $500, search context at most eight candidates, merchant analysis at most 100 offers, and reply at most 700 characters. Provider output is capped at 1,600 tokens and parsed text at 12,000 characters. An abort controller plus a wall-clock race enforce a twenty-second deadline, including a hanging body read. Malformed/provider errors are sanitized; provider response bodies are never logged or exposed.

There are at most 24 uncached attempts per authenticated owner per hour, two active requests per owner, 24 active requests globally and 500 live owner quota entries. In-flight duplicates and sixty-second responses are scoped to owner, current terms, product data, evidence and transcript. Offer expiry is checked before cache lookup and bounds the cached lifetime. Eligibility is recomputed when the provider answers; an offer expiring during the request invalidates the answer rather than returning stale advice. Cache entries are bounded to 160 and held only in process; no conversation history or private provider output is written to disk by this module. A restart clears this cache and quota. Use durable quota storage if scaling across server instances.

## Verification

Run `node --test outputs/committed-cart/shopping-assistant.test.mjs`. Tests use only injected offline provider fixtures and a fixed clock. They cover strict term validation, deal math and expiry, request privacy, malicious product metadata, missing keys, cache/owner separation, rate limiting, unsupported prices, model-proposed actions, locked carts, bad JSON, safety/truncation/tool outputs, sanitized failures, and a timed-out hanging provider. They establish harness behavior; a real key is still needed for a live Gemini end-to-end check.
