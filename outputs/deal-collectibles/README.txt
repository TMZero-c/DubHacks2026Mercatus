Mercatus collectible deals — public Solana TESTNET

This module is integrated into outputs/amazon-extension/popup.html, through the Deal passes button. It uses the extension's existing styling and Mercatus login. The /extension/popup.html web entry serves those same popup sources for invite links and browser verification. Reload the installed unpacked extension to load the updated files.

Setup
  npm run setup:collectibles
  Fund the printed protocol public key through https://faucet.solana.com/ (choose testnet).
  Configure the existing Visa sandbox environment.
  Configure MONGODB_URI, or opt into local development sign-in with LATER_SANDBOX_LOGIN=1 in outputs/committed-cart/.env.
  npm start

No local validator or VM is used. RPC is fixed to https://api.testnet.solana.com and its genesis hash is checked. There is no mainnet or devnet fallback. The protocol is the only wallet; shoppers, creators and merchants have ordinary application accounts. All token accounts are owned by the protocol and represent custody assignments. Application ownership is not self custody.

Flow
  Create the test merchant's three-edition drop.
  Share an edition via a one-use invite link.
  Another signed-in Mercatus account claims the NFT. It may share again.
  The holder approves the $0.85 public Visa test-card purchase.
  The NFT freezes before authorization/capture. After capture acceptance its redemption metadata becomes immutable, while the token remains a collectible keepsake.

On-chain representation
  Token-2022 metadata lives on chain. Each edition has decimals=0, supply=1, and revoked mint authority.
  The manifest is itself a frozen, immutable NFT. It lists all three eligible edition mint addresses, price, expiry, product, creator pseudonym and referral terms. A fourth arbitrary mint is not a member of the approved drop.
  Sharing commits a hash of the invite. Claiming transfers the single token between protocol-owned token accounts and updates its opaque beneficiary tag atomically. No email, password, Visa token or card number is put on chain.
  Redemption revokes metadata-update and freeze authority, preserving a permanently frozen NFT with a hash of the payment receipt. Expiry and merchant fulfillment are checked by the application/participating merchant, not a custom on-chain checkout program.
  Every submitted transaction is signed only by the protocol, durably recorded before broadcast, checked for successful finalized status, and read back from the network. Explorer links use cluster=testnet. Refreshing does not resubmit a payment.

Verify without any secret or application database
  node outputs/deal-collectibles/verify-public.mjs <mint> <protocol-public-key>

Tests
  npm run test:collectibles
  Unit fixtures are explicitly confined to test files; they are never used by the app or live verification run.

Boundaries
  The initial campaign is explicitly the Mercatus sandbox merchant's approved three-pass offer. It does not claim that Amazon or other retailers approved copying their prices.
  Visa TMS, authorization and capture use the existing remote sandbox. Inventory and fulfillment are fixtures. PENDING capture is accepted for processing, not final settlement.
  The five-cent creator referral amount is a pending test accounting entry. It is not a paid reward; fulfillment, settlement and return handling must precede any real payout.
  The app backend remains the project's local development server. Solana transactions run on the public testnet. Invite links become remotely accessible when the app is deployed at a public origin.
  Public RPC calls are paced and rate limits back off. An interrupted mint can resume the same drop and transaction journal from the collection; it never creates replacement edition IDs. An expired issuance transaction can receive a new blockhash only after the historical signature is absent, finalized height exceeds its validity, and the NFT still has zero supply. The expired signed attempt stays in the private journal.
  Partial/uncertain payment operations stay reserved and need reconciliation. The app does not retry ambiguous card payments automatically. Do not delete private state to retry them.
  .local/collectibles and sandbox-auth.sqlite are private ignored state; never publish the protocol key or card vault.

Branding and utility
  Mercatus editions use name Mercatus · Deal N, symbol MERCATUS and Mercatus sandbox merchant terms. A fresh Mercatus drop replaces the historical Later demo in the active walkthrough; historical chain records remain unchanged.
  The NFT is the single-use price entitlement. Creators distribute capped merchant offers; followers redeem them with USD Visa payment; creator referral credit stays pending settlement. Artwork is secondary to this utility.
  The generated marketplace artwork is included in the extension, with its SHA-256 hash committed in immutable on-chain campaign terms. The image itself is served with the app; it is not uploaded to a public NFT image gateway.

Merchant-defined deals and MCP
  The merchant manager has a Shareable deals section with create, issuance status,
  resume, share-link creation, and copy-link actions. The form requires public-term approval.
  Browser requests use the current account's Bearer token; every collection is account-scoped.
  The local MCP credential controls its own separate sandbox merchant collection.
  No caller-supplied owner or shopper ID is accepted. Claimed shopper passes remain shopper-owned.

  Tools: merchant_deals, merchant_create_deals, merchant_resume_deals,
  merchant_share_deal, merchant_redeem_test_deal, merchant_verify_deal.
  HTTP: GET /api/merchant/deals; POST /api/merchant/deals/{create,resume,share,redeem,verify}.
  Create body: {approved:true,requestId:"unique-request-id",deal:{product,merchant,
  priceCents,quantity,expiresAt,rewardCents}}.
  Terms: USD cents 1–100000, 1–5 passes per drop, expiry 5 minutes–30 days ahead,
  referral credit >=0 and below price, product <=80 UTF-8 bytes, merchant <=60 bytes.
  The cap keeps maximum immutable terms inside a Solana transaction; tested by serialization.
  Multiple drops are supported. Repeating requestId with identical terms returns the original
  job; changing terms under that key is rejected. Resume uses {id:dropId}.
  Share uses {id:passId}; poll merchant_deals for completion and shareUrl.
  Redeem uses {id:passId,approved:true,testCard:"visa-1111"}, and requires ownership.
  Merchant tools cannot redeem a shopper's claimed pass. The shopper uses the existing
  authenticated claim/redeem endpoints and explicit purchase confirmation.
  All purchase totals, order receipts, invite previews, and pending referral amounts derive
  from immutable drop terms. PENDING Visa capture is not settled money.
  No new wallets for merchants or shoppers; protocol-only signing on public TESTNET.

  The legacy shopper-only demo issuance remains for compatibility with old walkthroughs.
  Existing immutable historical drops are not rewritten. The merchant creation flow is configurable.
  Tests cover custom terms through share/claim/redeem, duplicate creation, ownership,
  invalid terms, maximum transaction size, ambiguous payment handling, HTTP and MCP.

UI
  The extension uses locally bundled daisyUI components. Coupon opens a single receipt section.
  Header includes deals, persistent account-scoped product history, and logout icons.
  Rebuild deal styles with node work/mercatus-ui/build-daisy.mjs.

Reusable campaign links
  POST /api/merchant/deals/campaign {id:dropId}, or MCP merchant_share_campaign.
  Converts a fully unallocated active drop to a campaign. Returns the same code on retry.
  GET merchant deals exposes campaignUrl, totalUses and remainingUses per drop.
  One authenticated customer account can claim once; claims durably reserve capacity before
  a chain operation, and uncertain claims stay reserved for reconciliation. A claimed pass is
  single-use and cannot be transferred; customers can copy the reusable campaign link instead.
  This is one per account, not verified-human identity. Current total-use cap is 1–5 per drop.
  Existing partially distributed legacy drops retain their individual share links.
