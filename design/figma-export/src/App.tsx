import { useRef, useState } from "react";

type BagKind = "happy" | "wink" | "shy" | "cool" | "market" | "gift";
type FrameId = "cart" | "terms" | "hold" | "waiting" | "offers" | "confirm" | "success" | "expired" | "raise";

type Offer = {
  store: string;
  price: number;
  savings: number;
  delivery: string;
  reason: string;
  bag: BagKind;
  color: string;
};

const colors = {
  red: "#ff5c4d",
  yellow: "#ffca3a",
  pink: "#ff78b7",
  blue: "#3997f0",
  green: "#35c99a",
  purple: "#8f6eea",
};

const offers: Offer[] = [
  {
    store: "Northstar Audio",
    price: 184,
    savings: 35,
    delivery: "Free delivery · Tomorrow",
    reason: "New, sealed · 2-year warranty",
    bag: "market",
    color: colors.green,
  },
  {
    store: "Sound Supply Co.",
    price: 189,
    savings: 30,
    delivery: "Free delivery · Wed, Jun 18",
    reason: "Authorized seller · Free returns",
    bag: "wink",
    color: colors.yellow,
  },
  {
    store: "City Tech Outlet",
    price: 192,
    savings: 27,
    delivery: "$4.99 delivery · Tomorrow",
    reason: "Open-box excellent · 1-year warranty",
    bag: "happy",
    color: colors.red,
  },
];

function BagIcon({
  kind,
  color,
  className = "",
}: {
  kind: BagKind;
  color: string;
  className?: string;
}) {
  const common = {
    fill: "none",
    stroke: "#17201f",
    strokeWidth: 4.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg
      className={className}
      viewBox="0 0 160 160"
      role="img"
      aria-label={`${kind} shopping bag mascot`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {kind === "happy" && (
        <>
          <path fill={color} d="M32 52c1-8 7-13 15-13h68c8 0 14 5 15 13l11 79c1 8-5 15-13 15H31c-8 0-14-7-13-15Z" />
          <path {...common} d="M52 53c0-26 13-38 29-38s29 12 29 38" />
          <path {...common} d="M54 91c13 13 38 14 54-1" />
          <path fill="#17201f" d="M54 74a5 5 0 1 0 0 .1M108 74a5 5 0 1 0 0 .1" />
        </>
      )}
      {kind === "wink" && (
        <>
          <path fill={color} d="M27 55c0-8 6-13 14-13h78c8 0 14 5 14 13l7 78c1 8-5 14-13 14H34c-8 0-14-6-13-14Z" />
          <path {...common} d="M50 54c1-24 13-36 31-36 17 0 29 12 30 36" />
          <path {...common} d="M54 79c4-4 9-4 13 0M103 77l9 3M104 83l8-3M58 101c14 10 32 10 45 0" />
        </>
      )}
      {kind === "shy" && (
        <>
          <path fill={color} d="M38 61c1-7 6-11 13-11h58c7 0 12 4 13 11l9 68c1 8-5 14-13 14H42c-8 0-14-6-13-14Z" />
          <path {...common} d="M58 62c0-20 9-31 23-31s23 11 23 31" />
          <path fill="#17201f" d="M61 86a4 4 0 1 0 0 .1M101 86a4 4 0 1 0 0 .1" />
          <path {...common} d="M73 102c5-4 11-4 16 0" />
          <path stroke="#df408b" strokeWidth="3.5" strokeLinecap="round" d="M48 98h9M105 98h9" />
        </>
      )}
      {kind === "cool" && (
        <>
          <path fill={color} d="M29 55c0-8 6-13 14-13h74c8 0 14 5 14 13l9 77c1 8-5 15-13 15H33c-8 0-14-7-13-15Z" />
          <path {...common} d="M51 54c0-25 12-37 30-37s30 12 30 37" />
          <path fill="#17201f" d="m48 77 28-3-2 18-15 2c-6 1-10-3-10-9Zm64 0-28-3 2 18 15 2c6 1 10-3 10-9Z" />
          <path {...common} d="M76 78h9M68 109c8 4 17 4 25 0" />
        </>
      )}
      {kind === "market" && (
        <>
          <path fill={color} d="M31 53c1-7 6-11 13-11h72c7 0 12 4 13 11l12 78c1 8-5 15-13 15H31c-8 0-14-7-13-15Z" />
          <path {...common} d="M49 54c0-24 13-37 31-37s31 13 31 37" />
          <path {...common} strokeWidth="3.8" d="M51 75l12 2M99 77l12-2" />
          <path fill="#17201f" d="M57 80a3.5 3.5 0 1 0 0 .1M105 80a3.5 3.5 0 1 0 0 .1" />
          <path {...common} strokeWidth="3.8" d="M68 99c8 6 17 6 25 0" />
        </>
      )}
      {kind === "gift" && (
        <>
          <path fill={color} d="M34 55c1-8 7-13 15-13h64c8 0 14 5 15 13l9 76c1 8-5 15-13 15H37c-8 0-14-7-13-15Z" />
          <path {...common} d="M54 56c0-24 11-36 27-36s27 12 27 36" />
          <path {...common} d="M81 42c-3-14-20-16-22-6-2 9 11 12 22 6Zm0 0c3-14 20-16 22-6 2 9-11 12-22 6Z" />
          <path fill="#17201f" d="M58 82a4.5 4.5 0 1 0 0 .1M104 82a4.5 4.5 0 1 0 0 .1" />
          <path {...common} d="M64 100c10 9 23 9 33 0" />
        </>
      )}
    </svg>
  );
}

function BrandHeader({ step, onBack }: { step: number; onBack?: () => void }) {
  return (
    <>
      <header className="popup-header">
        {onBack ? (
          <button className="icon-button" type="button" onClick={onBack} aria-label="Go back">
            ←
          </button>
        ) : (
          <span className="header-spacer" />
        )}
        <div className="wordmark">mercatus<span>.</span></div>
        <span className="header-spacer" aria-hidden="true" />
      </header>
      <div className="progress-track" aria-label={`Step ${step} of 6`}>
        <span style={{ width: `${Math.min(step / 6, 1) * 100}%` }} />
      </div>
    </>
  );
}

function Frame({
  id,
  number,
  label,
  active,
  frameRef,
  children,
}: {
  id: FrameId;
  number: string;
  label: string;
  active: boolean;
  frameRef: (node: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`state-frame ${active ? "is-active" : ""}`} id={id} ref={frameRef}>
      <div className="frame-label"><span>{number}</span>{label}</div>
      <div className="popup">{children}</div>
    </section>
  );
}

function PrimaryButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button className="primary-button" type="button" onClick={onClick}>{children}</button>;
}

function ShopperPrototype() {
  const [active, setActive] = useState<FrameId>("cart");
  const [deadline, setDeadline] = useState("1 hour");
  const [ceiling, setCeiling] = useState(190);
  const [raisedCeiling, setRaisedCeiling] = useState(199);
  const [equivalents, setEquivalents] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(offers[0]);
  const frameRefs = useRef<Partial<Record<FrameId, HTMLElement | null>>>({});

  const goTo = (id: FrameId) => {
    setActive(id);
    window.setTimeout(() => {
      frameRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 10);
  };

  const acceptOffer = (offer: Offer) => {
    setSelectedOffer(offer);
    goTo("confirm");
  };

  const savings = 219 - selectedOffer.price;
  const tax = selectedOffer.price * 0.089;
  const total = selectedOffer.price + tax;

  return (
    <main className="prototype-shell">
      <div className="prototype-intro">
        <div>
          <p className="eyebrow">Chrome extension · Popup flow</p>
          <h1>Wait a little.<br /><span>Save a lot.</span></h1>
        </div>
        <p className="intro-copy">Merchant agents compete for your cart. You stay in control and approve every purchase.</p>
      </div>

      <nav className="flow-map" aria-label="Mercatus flow states">
        {(["cart", "terms", "hold", "waiting", "offers", "confirm", "success", "expired", "raise"] as FrameId[]).map((id, index) => (
          <button className={active === id ? "active" : ""} key={id} onClick={() => goTo(id)} type="button">
            <span>{index + 1}</span>{id}
          </button>
        ))}
      </nav>

      <div className="flow-board">
        <Frame id="cart" number="01" label="Cart detected" active={active === "cart"} frameRef={(node) => { frameRefs.current.cart = node; }}>
          <BrandHeader step={1} />
          <div className="popup-scroll">
            <div className="product-heading">
              <div>
                <p className="overline">Cart detected</p>
                <h2>Wireless Headphones</h2>
                <p className="muted">campuselectronics.com</p>
              </div>
              <BagIcon kind="happy" color={colors.red} className="bag bag-wave" />
            </div>
            <div className="buy-now-row"><span>Buy now</span><strong>$219</strong></div>
            <div className="savings-card">
              <div className="savings-top">
                <div><span>Wait &amp; save</span><small>Estimated price</small></div>
                <div className="price-stack"><strong>$184</strong><small>Save ~$35</small></div>
              </div>
              <div className="segment-control">
                {["15 min", "1 hour", "Overnight"].map((option) => (
                  <button type="button" key={option} className={deadline === option ? "selected" : ""} onClick={() => setDeadline(option)}>{option}</button>
                ))}
              </div>
            </div>
            <p className="hint">More time gives merchants a better chance to beat your price.</p>
          </div>
          <div className="popup-footer">
            <div className="pay-row"><span>Pay with <b className="visa">VISA</b></span><span>•••• 4242</span></div>
            <PrimaryButton onClick={() => goTo("terms")}>Wait &amp; save <span>→</span></PrimaryButton>
          </div>
        </Frame>

        <Frame id="terms" number="02" label="Set your terms" active={active === "terms"} frameRef={(node) => { frameRefs.current.terms = node; }}>
          <BrandHeader step={2} onBack={() => goTo("cart")} />
          <div className="popup-scroll">
            <div className="mascot-heading">
              <BagIcon kind="market" color={colors.green} className="bag" />
              <div><p className="overline">You’re in control</p><h2>Set your terms</h2></div>
            </div>
            <label className="field-label" htmlFor="ceiling">Your price ceiling</label>
            <div className="money-input"><span>$</span><input id="ceiling" min="1" max="219" type="number" value={ceiling} onChange={(event) => setCeiling(Number(event.target.value))} /></div>
            <p className="field-help">We’ll only show you offers at or below this price.</p>
            <fieldset>
              <legend>Deadline</legend>
              <div className="segment-control deadline-segments">
                {[
                  ["15 min", "Fastest"],
                  ["1 hour", "Best balance"],
                  ["Overnight", "Best chance to save"],
                ].map(([option, detail]) => (
                  <button type="button" className={deadline === option ? "selected" : ""} key={option} onClick={() => setDeadline(option)}>
                    <b>{option}</b><small>{detail}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Match preference</legend>
              <div className="toggle-row">
                <button className={!equivalents ? "selected" : ""} type="button" onClick={() => setEquivalents(false)}>Same product only</button>
                <button className={equivalents ? "selected" : ""} type="button" onClick={() => setEquivalents(true)}>Allow equivalents</button>
              </div>
            </fieldset>
          </div>
          <div className="popup-footer">
            <PrimaryButton onClick={() => goTo("hold")}>Review hold <span>→</span></PrimaryButton>
          </div>
        </Frame>

        <Frame id="hold" number="03" label="Approve hold" active={active === "hold"} frameRef={(node) => { frameRefs.current.hold = node; }}>
          <BrandHeader step={3} onBack={() => goTo("terms")} />
          <div className="popup-scroll center-content">
            <BagIcon kind="cool" color={colors.blue} className="bag bag-large" />
            <p className="overline">One quick check</p>
            <h2>Approve a temporary hold</h2>
            <p className="body-copy">Hold up to <strong>${ceiling || 190}</strong> on Visa •••• 4242.</p>
            <div className="notice-card">
              <div className="notice-icon">i</div>
              <p><strong>This is not a charge.</strong><br />Charged only if you accept an offer. Auto-released today at {deadline === "15 min" ? "3:45 PM" : deadline === "Overnight" ? "8:00 AM" : "4:30 PM"}.</p>
            </div>
            <div className="secure-note"><span>✓</span> Protected by Visa purchase security</div>
          </div>
          <div className="popup-footer">
            <PrimaryButton onClick={() => goTo("waiting")}>Approve hold</PrimaryButton>
            <button className="text-button" type="button" onClick={() => goTo("terms")}>Not now</button>
          </div>
        </Frame>

        <Frame id="waiting" number="04" label="Merchants reviewing" active={active === "waiting"} frameRef={(node) => { frameRefs.current.waiting = node; }}>
          <BrandHeader step={4} onBack={() => goTo("hold")} />
          <div className="popup-scroll center-content waiting-content">
            <div className="search-orbit">
              <span /><span /><span />
              <BagIcon kind="wink" color={colors.yellow} className="bag bag-large bag-bob" />
            </div>
            <p className="overline live"><span /> Search in progress</p>
            <h2>3 merchants reviewing</h2>
            <p className="body-copy muted">They’re checking inventory and preparing their best offer.</p>
            <div className="countdown"><strong>46:18</strong><span>remaining</span></div>
            <div className="waiting-steps">
              <div className="done"><span>✓</span><b>Request sent</b></div>
              <div className="active"><span>2</span><b>Merchants reviewing</b></div>
              <div><span>3</span><b>Best offers arrive</b></div>
            </div>
          </div>
          <div className="popup-footer">
            <button className="secondary-button danger" type="button" onClick={() => goTo("expired")}>Cancel <span>(releases hold)</span></button>
          </div>
        </Frame>

        <Frame id="offers" number="05" label="Offers arrived" active={active === "offers"} frameRef={(node) => { frameRefs.current.offers = node; }}>
          <BrandHeader step={5} onBack={() => goTo("waiting")} />
          <div className="popup-scroll">
            <div className="offers-heading">
              <div><p className="overline">Nice work waiting</p><h2>3 offers arrived</h2></div>
              <div className="save-badge">Save up to<br /><strong>$35</strong></div>
            </div>
            <div className="offer-list">
              {offers.map((offer, index) => (
                <article className={index === 0 ? "offer-card best" : "offer-card"} key={offer.store}>
                  {index === 0 && <span className="best-tag">BEST OFFER</span>}
                  <div className="merchant-row">
                    <BagIcon kind={offer.bag} color={offer.color} className="merchant-bag" />
                    <div><h3>{offer.store}</h3><span className="rating">★ 4.{9 - index} <i>Verified</i></span></div>
                    <div className="offer-price"><strong>${offer.price}</strong><span>Save ${offer.savings}</span></div>
                  </div>
                  <div className="offer-details"><span>{offer.delivery}</span><span>{offer.reason}</span></div>
                  <button type="button" onClick={() => acceptOffer(offer)}>Accept offer <span>→</span></button>
                </article>
              ))}
            </div>
          </div>
        </Frame>

        <Frame id="confirm" number="06" label="Confirm purchase" active={active === "confirm"} frameRef={(node) => { frameRefs.current.confirm = node; }}>
          <BrandHeader step={6} onBack={() => goTo("offers")} />
          <div className="popup-scroll">
            <div className="mascot-heading">
              <BagIcon kind="cool" color={colors.blue} className="bag" />
              <div><p className="overline">Final approval</p><h2>Confirm purchase</h2></div>
            </div>
            <div className="confirm-product">
              <div className="product-thumb">WH</div>
              <div><b>Wireless Headphones</b><span>Black · New</span></div>
              <strong>${selectedOffer.price.toFixed(2)}</strong>
            </div>
            <div className="merchant-summary"><span>Sold by</span><b>{selectedOffer.store}</b><small>★ 4.9 · Verified merchant</small></div>
            <div className="breakdown">
              <p><span>Item subtotal</span><span>${selectedOffer.price.toFixed(2)}</span></p>
              <p><span>Delivery</span><span className="green">Free</span></p>
              <p><span>Estimated tax</span><span>${tax.toFixed(2)}</span></p>
              <p className="total"><strong>Total</strong><strong>${total.toFixed(2)}</strong></p>
              <p className="saved-line"><span>You save</span><strong>${savings.toFixed(2)}</strong></p>
            </div>
            <div className="pay-card"><span className="visa">VISA</span><span>•••• 4242</span><small>Change</small></div>
            <p className="fine-print">By confirming, you authorize Mercatus to complete this purchase with {selectedOffer.store}.</p>
          </div>
          <div className="popup-footer">
            <PrimaryButton onClick={() => goTo("success")}>Confirm and pay · ${total.toFixed(2)}</PrimaryButton>
          </div>
        </Frame>

        <Frame id="success" number="07" label="Success" active={active === "success"} frameRef={(node) => { frameRefs.current.success = node; }}>
          <BrandHeader step={6} />
          <div className="popup-scroll center-content success-content">
            <div className="confetti" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
            </div>
            <BagIcon kind="gift" color={colors.purple} className="bag success-bag" />
            <p className="overline">Deal done</p>
            <h2>You saved <span>${savings}!</span></h2>
            <p className="body-copy muted">Your headphones are on the way.</p>
            <div className="success-card">
              <div><span>Order total</span><strong>${total.toFixed(2)}</strong></div>
              <div><span>Arrives</span><strong>Tomorrow</strong></div>
              <div><span>Sold by</span><strong>{selectedOffer.store}</strong></div>
            </div>
            <p className="confirmation-note">Receipt sent to alex@example.com</p>
          </div>
          <div className="popup-footer">
            <PrimaryButton onClick={() => goTo("cart")}>Done</PrimaryButton>
          </div>
        </Frame>

        <Frame id="expired" number="08" label="No matching offer" active={active === "expired"} frameRef={(node) => { frameRefs.current.expired = node; }}>
          <BrandHeader step={4} onBack={() => goTo("waiting")} />
          <div className="popup-scroll center-content expired-content">
            <BagIcon kind="shy" color={colors.pink} className="bag bag-large" />
            <p className="overline">Search ended</p>
            <h2>No offer met your price</h2>
            <p className="body-copy muted">Your hold was released. You were not charged.</p>
            <div className="released-card"><span>✓</span><div><b>$190.00 hold released</b><small>Visa •••• 4242</small></div></div>
            <p className="encouragement">You can still buy at the original price, or adjust your terms and try again.</p>
          </div>
          <div className="popup-footer dual-actions">
            <button className="secondary-button" type="button" onClick={() => goTo("cart")}>Buy now · $219</button>
            <PrimaryButton onClick={() => goTo("raise")}>Raise my ceiling</PrimaryButton>
          </div>
        </Frame>

        <Frame id="raise" number="09" label="Raise your ceiling" active={active === "raise"} frameRef={(node) => { frameRefs.current.raise = node; }}>
          <BrandHeader step={3} onBack={() => goTo("expired")} />
          <div className="popup-scroll">
            <div className="mascot-heading">
              <BagIcon kind="wink" color={colors.yellow} className="bag" />
              <div><p className="overline">Try again</p><h2>Raise your ceiling</h2></div>
            </div>
            <div className="ceiling-comparison">
              <div><span>Previous ceiling</span><strong>${ceiling}</strong></div>
              <span>→</span>
              <div><span>New ceiling</span><strong>${raisedCeiling}</strong></div>
            </div>
            <label className="field-label" htmlFor="raised-ceiling">New price ceiling</label>
            <div className="money-input">
              <span>$</span>
              <input id="raised-ceiling" min={ceiling + 1} max="219" type="number" value={raisedCeiling} onChange={(event) => setRaisedCeiling(Number(event.target.value))} />
            </div>
            <p className="market-range">Offers for this item typically land between <strong>$195 and $205.</strong></p>
            <fieldset className="raise-deadline">
              <legend>Deadline</legend>
              <div className="segment-control deadline-segments">
                {[
                  ["15 min", "Fastest"],
                  ["1 hour", "Best balance"],
                  ["Overnight", "Best chance to save"],
                ].map(([option, detail]) => (
                  <button type="button" className={deadline === option ? "selected" : ""} key={option} onClick={() => setDeadline(option)}>
                    <b>{option}</b><small>{detail}</small>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="new-hold-line">
              <span className="notice-icon">i</span>
              <p>New hold up to <strong>${raisedCeiling}</strong> on Visa •••• 4242. Charged only if you accept an offer.</p>
            </div>
          </div>
          <div className="popup-footer">
            <PrimaryButton onClick={() => goTo("waiting")}>Approve new hold <span>→</span></PrimaryButton>
          </div>
        </Frame>
      </div>
    </main>
  );
}

type DashboardTab = "campaigns" | "catalog" | "offers";

const campaignRows = [
  { id: 1, name: "Headphones recovery", store: "Campus Electronics", bag: "happy" as BagKind, color: colors.red, strategy: "Beat best price", budget: 500, remaining: 342, offers: 148, selected: 31, reserved: 1840, live: true },
  { id: 2, name: "Free shipping close", store: "Northstar Audio", bag: "cool" as BagKind, color: colors.blue, strategy: "Match + free shipping", budget: 350, remaining: 128, offers: 92, selected: 24, reserved: 960, live: true },
  { id: 3, name: "Summer stock clearout", store: "City Tech Outlet", bag: "market" as BagKind, color: colors.green, strategy: "Clear inventory", budget: 800, remaining: 615, offers: 76, selected: 19, reserved: 2125, live: true },
  { id: 4, name: "Accessories win-back", store: "Sound Supply Co.", bag: "wink" as BagKind, color: colors.yellow, strategy: "Beat best price", budget: 250, remaining: 250, offers: 0, selected: 0, reserved: 0, live: false },
];

const catalogRows = [
  { product: "AeroQuiet Pro Headphones", sku: "AQ-440-BLK", price: 219, stock: 84, margin: "38%", cost: 135.78, campaigns: 2 },
  { product: "Studio Mini Bluetooth Speaker", sku: "SM-210-CRM", price: 89, stock: 146, margin: "42%", cost: 51.62, campaigns: 1 },
  { product: "Everyday Wireless Earbuds", sku: "EW-105-WHT", price: 59, stock: 312, margin: "31%", cost: 40.71, campaigns: 2 },
  { product: "Braided USB-C Cable", sku: "BC-020-BLU", price: 24, stock: 18, margin: "55%", cost: 10.8, campaigns: 1 },
];

const offerRows = [
  { product: "AeroQuiet Pro Headphones", ceiling: 190, offer: 184, status: "Accepted", time: "12 sec ago" },
  { product: "Everyday Wireless Earbuds", ceiling: 52, offer: 49, status: "Sent", time: "38 sec ago" },
  { product: "Studio Mini Bluetooth Speaker", ceiling: 75, offer: 72, status: "Declined", time: "2 min ago" },
  { product: "AeroQuiet Pro Headphones", ceiling: 195, offer: 189, status: "Accepted", time: "4 min ago" },
  { product: "Braided USB-C Cable", ceiling: 20, offer: 21, status: "Expired", time: "7 min ago" },
];

function MerchantNav() {
  return (
    <header className="merchant-nav">
      <a className="merchant-wordmark" href="/">mercatus<span>.</span></a>
      <div className="nav-actions">
        <span className="dashboard-test-pill">Test mode</span>
        <button className="merchant-account" type="button" aria-label="Open Campus Electronics account menu">
          <BagIcon kind="happy" color={colors.red} className="account-bag" />
          <span>Campus Electronics</span>
          <i>⌄</i>
        </button>
      </div>
    </header>
  );
}

function CampaignPanel({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [launched, setLaunched] = useState(false);
  const [reviewingProducts, setReviewingProducts] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState(["AeroQuiet Pro Headphones"]);
  const [strategy, setStrategy] = useState("Beat best price");
  const [minimumMargin, setMinimumMargin] = useState(18);
  const [dailyBudget, setDailyBudget] = useState(100);
  const [offerLimit, setOfferLimit] = useState(15);

  const toggleProduct = (product: string) => {
    setSelectedProducts((current) => current.includes(product) ? current.filter((item) => item !== product) : [...current, product]);
  };
  const selectedCatalogProducts = catalogRows.filter((item) => selectedProducts.includes(item.product));
  const stepLabels = ["Products", "Pricing", "Budget", "Review"];
  const goToStep = (nextStep: number) => {
    if (nextStep > 1 && selectedProducts.length === 0) return;
    setReviewingProducts(false);
    setStep(nextStep);
  };

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="campaign-drawer" aria-label="Create campaign">
        <div className="drawer-header">
          <div>
            <p className="overline">{launched ? "Ready to recover carts" : `Step ${step} of 4`}</p>
            <h2>{launched ? "Campaign launched" : "Create campaign"}</h2>
          </div>
          <button className="drawer-close" type="button" onClick={onClose} aria-label="Close panel">×</button>
        </div>
        {!launched && (
          <div className="campaign-steps">
            {stepLabels.map((label, index) => (
              <button
                type="button"
                className={index + 1 === step ? "active" : index + 1 < step ? "complete" : ""}
                disabled={index + 1 > 1 && selectedProducts.length === 0}
                onClick={() => goToStep(index + 1)}
                key={label}
              >
                <span>{index + 1 < step ? "✓" : index + 1}</span>
                <b>{label}</b>
              </button>
            ))}
          </div>
        )}

        {launched ? (
          <div className="launch-success">
            <div className="launch-rays" />
            <BagIcon kind="gift" color={colors.purple} className="launch-bag" />
            <h3>Headphones recovery is live</h3>
            <p>Mercatus can now make qualified offers automatically within your rules and budget.</p>
            <div className="launch-summary"><span>{selectedProducts.length} {selectedProducts.length === 1 ? "product" : "products"}</span><span>${dailyBudget}/day</span><span>{minimumMargin}% min. margin</span></div>
          </div>
        ) : (
          <div className="drawer-content">
            {step === 1 && !reviewingProducts && (
              <div className="panel-step">
                <h3>Choose products</h3>
                <p>Select the products this campaign can make offers for.</p>
                <label className="drawer-search"><span>⌕</span><input placeholder="Search products or SKU" /></label>
                <div className="product-picker">
                  {catalogRows.map((item) => (
                    <label className={selectedProducts.includes(item.product) ? "picked" : ""} key={item.sku}>
                      <input type="checkbox" checked={selectedProducts.includes(item.product)} onChange={() => toggleProduct(item.product)} />
                      <span className="campaign-product-image"><i>{item.product.slice(0, 2).toUpperCase()}</i></span>
                      <span className="campaign-product-copy">
                        <b>{item.product}</b>
                        <small>{item.sku}</small>
                        <span><strong>${item.price}</strong><em>{item.stock} in stock</em><em>{item.margin} margin</em></span>
                      </span>
                      <span className="product-check" aria-hidden="true" />
                    </label>
                  ))}
                </div>
              </div>
            )}
            {step === 1 && reviewingProducts && (
              <div className="panel-step product-review-step">
                <h3>Review products</h3>
                <p>Confirm the products this campaign can make offers for.</p>
                <div className="selected-product-review">
                  {selectedCatalogProducts.map((item) => (
                    <article key={item.sku}>
                      <span className="campaign-product-image"><i>{item.product.slice(0, 2).toUpperCase()}</i></span>
                      <div className="selected-product-main"><b>{item.product}</b><small>{item.sku}</small></div>
                      <dl>
                        <div><dt>Current price</dt><dd>${item.price.toFixed(2)}</dd></div>
                        <div><dt>Stock</dt><dd>{item.stock}</dd></div>
                        <div><dt>Margin</dt><dd>{item.margin}</dd></div>
                        <div><dt>Lowest allowed</dt><dd>${(item.price * (1 - minimumMargin / 100)).toFixed(2)}</dd></div>
                      </dl>
                      <button type="button" onClick={() => toggleProduct(item.product)}>Remove</button>
                    </article>
                  ))}
                </div>
              </div>
            )}
            {step === 2 && (
              <div className="panel-step">
                <h3>Set your offer rules</h3>
                <p>Your agent only makes offers that meet these guardrails.</p>
                <label className="drawer-field">Minimum margin <div><input value={minimumMargin} onChange={(event) => setMinimumMargin(Number(event.target.value))} type="number" /><span>%</span></div></label>
                <fieldset className="strategy-picker">
                  <legend>Strategy</legend>
                  {[
                    ["Beat best price", "Offer just below the shopper’s best verified price."],
                    ["Match + free shipping", "Match the best price and remove delivery cost."],
                    ["Clear inventory", "Use available margin to move aging stock."],
                  ].map(([name, copy]) => (
                    <label className={strategy === name ? "picked" : ""} key={name}>
                      <input type="radio" checked={strategy === name} onChange={() => setStrategy(name)} />
                      <span><b>{name}</b><small>{copy}</small></span>
                    </label>
                  ))}
                </fieldset>
              </div>
            )}
            {step === 3 && (
              <div className="panel-step">
                <h3>Protect your budget</h3>
                <p>Reservations prevent overlapping offers from overspending.</p>
                <div className="budget-grid">
                  <label className="drawer-field">Daily budget <div><span>$</span><input value={dailyBudget} onChange={(event) => setDailyBudget(Number(event.target.value))} type="number" /></div></label>
                  <label className="drawer-field">Per-offer limit <div><span>$</span><input value={offerLimit} onChange={(event) => setOfferLimit(Number(event.target.value))} type="number" /></div></label>
                </div>
                <div className="budget-preview">
                  <p><span>Estimated daily offers</span><strong>32–48</strong></p>
                  <p><span>Estimated selections</span><strong>8–12</strong></p>
                  <p><span>Maximum daily spend</span><strong>${dailyBudget}</strong></p>
                </div>
                <div className="info-callout"><span>i</span><p>Budget is reserved when an offer is sent and released when it expires or is declined.</p></div>
              </div>
            )}
            {step === 4 && (
                <div className="panel-step">
                  <h3>Review campaign</h3>
                  <p>Confirm your settings before the agent starts making offers.</p>
                <div className="review-products">
                  {selectedCatalogProducts.map((item) => (
                    <article key={item.sku}>
                      <span className="campaign-product-image"><i>{item.product.slice(0, 2).toUpperCase()}</i></span>
                      <div><b>{item.product}</b><small>{item.sku}</small></div>
                      <p><span>Current price</span><strong>${item.price.toFixed(2)}</strong></p>
                      <p><span>Lowest allowed</span><strong>${(item.price * (1 - minimumMargin / 100)).toFixed(2)}</strong></p>
                    </article>
                  ))}
                </div>
                <div className="plain-language-review">
                  <p>Mercatus may offer up to <strong>${offerLimit} off {selectedCatalogProducts[0]?.product ?? "selected products"}</strong> when a shopper&apos;s ceiling is within your <strong>{minimumMargin}% minimum margin</strong>, up to <strong>${dailyBudget}/day</strong>.</p>
                  <dl><div><dt>Pricing strategy</dt><dd>{strategy}</dd></div><div><dt>Products included</dt><dd>{selectedProducts.length}</dd></div><div><dt>Budget reservations</dt><dd>Released when offers expire</dd></div></dl>
                </div>
                <label className="approval-check"><input type="checkbox" defaultChecked /><span>Pause offers automatically if catalog data becomes stale.</span></label>
              </div>
            )}
          </div>
        )}

        <div className="drawer-footer">
          {launched ? (
            <button className="dashboard-primary" type="button" onClick={onClose}>View campaign</button>
          ) : (
            <>
              <div className="drawer-footer-hint">
                {step === 1 && selectedProducts.length === 0 && <span>Select at least one product</span>}
              </div>
              <button
                className="dashboard-secondary"
                type="button"
                onClick={() => {
                  if (reviewingProducts) setReviewingProducts(false);
                  else if (step === 1) onClose();
                  else goToStep(step - 1);
                }}
              >
                {reviewingProducts ? "Back to products" : step === 1 ? "Cancel" : "Back"}
              </button>
              <button
                className="dashboard-primary"
                type="button"
                disabled={step === 1 && selectedProducts.length === 0}
                onClick={() => {
                  if (reviewingProducts) goToStep(2);
                  else if (step === 1) setReviewingProducts(true);
                  else if (step === 4) setLaunched(true);
                  else goToStep(step + 1);
                }}
              >
                {reviewingProducts ? "Continue" : step === 1 ? "Review products" : step === 4 ? "Launch campaign" : "Continue"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function CopyField({ label, value, masked = false, onRegenerate }: { label: string; value: string; masked?: boolean; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyValue = async () => {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <label className="connection-field">
      <span>{label}</span>
      <div>
        <input type={masked ? "password" : "text"} readOnly value={value} />
        {onRegenerate && <button type="button" onClick={onRegenerate}>Regenerate</button>}
        <button type="button" onClick={copyValue}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </label>
  );
}

function AgentModal({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState("mrc_live_8f4a2c91b75e");
  const [connected, setConnected] = useState(false);
  const regenerate = () => setToken(`mrc_live_${Math.random().toString(36).slice(2, 14)}`);

  return (
    <div className="drawer-backdrop agent-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="agent-modal" aria-label="Connect an agent">
        <div className="drawer-header">
          <div><p className="overline">Agent connection</p><h2>Connect your AI agent</h2></div>
          <button className="drawer-close" type="button" onClick={onClose} aria-label="Close modal">×</button>
        </div>
        <div className="agent-modal-content">
          <p className="agent-intro">Let your own AI agent respond to shopper requests. It works within your campaign rules: margin floors and budgets are always enforced.</p>
          <div className={connected ? "connection-status connected" : "connection-status"}>
            <i /><div><b>{connected ? "Connected · last active 2 min ago" : "Not connected"}</b><span>{connected ? "Your agent is ready to receive requests." : "Complete the setup steps below to connect."}</span></div>
            <button type="button" onClick={() => setConnected(!connected)}>{connected ? "Disconnect" : "Check connection"}</button>
          </div>
          <div className="connection-fields">
            <CopyField label="MCP server URL" value="https://mcp.mercatus.com/v1/campus-electronics" />
            <CopyField label="Access token" value={token} masked onRegenerate={regenerate} />
          </div>
          <div className="agent-columns">
            <section>
              <h3>Connect an MCP-compatible agent</h3>
              <ol>
                <li><span>1</span><p>Add the server URL to your agent&apos;s MCP configuration.</p></li>
                <li><span>2</span><p>Set the access token as a secure environment variable.</p></li>
                <li><span>3</span><p>Restart your agent, then check the connection above.</p></li>
              </ol>
            </section>
            <section className="permissions-list">
              <h3>Agent permissions</h3>
              <ul>
                <li className="allowed"><span>✓</span>Read incoming requests</li>
                <li className="allowed"><span>✓</span>Read campaigns and catalog</li>
                <li className="allowed"><span>✓</span>Send offers within campaign limits</li>
                <li className="blocked"><span>×</span>Charge shoppers</li>
                <li className="blocked"><span>×</span>See shopper personal details</li>
              </ul>
            </section>
          </div>
        </div>
        <div className="drawer-footer"><button className="dashboard-primary" type="button" onClick={onClose}>Done</button></div>
      </section>
    </div>
  );
}

function ProductDetailDrawer({ product, onClose }: { product: (typeof catalogRows)[number]; onClose: () => void }) {
  const margin = Number(product.margin.replace("%", ""));
  const lowestOffer = product.price * (1 - margin / 100);
  return (
    <div className="product-drawer-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="product-detail-drawer" aria-label={`${product.product} details`}>
        <div className="drawer-header">
          <div><p className="overline">Product details</p><h2>{product.product}</h2></div>
          <button className="drawer-close" type="button" onClick={onClose} aria-label="Close product details">×</button>
        </div>
        <div className="product-detail-content">
          <div className="detail-product-hero">
            <span className="detail-product-image">{product.product.slice(0, 2).toUpperCase()}</span>
            <div><span>{product.sku}</span><h3>{product.product}</h3><p>Synced 8 minutes ago</p></div>
          </div>
          <div className="detail-metrics">
            <div><span>Current price</span><strong>${product.price.toFixed(2)}</strong></div>
            <div><span>Stock</span><strong>{product.stock}</strong><small>units available</small></div>
            <div><span>Unit cost</span><strong>${product.cost.toFixed(2)}</strong></div>
            <div><span>Margin</span><strong>{product.margin}</strong><small>at current price</small></div>
          </div>
          <div className="lowest-offer-card">
            <span>Lowest allowed offer</span><strong>${lowestOffer.toFixed(2)}</strong>
            <p>Based on the current {product.margin} margin floor. Campaign rules can set a higher minimum.</p>
          </div>
          <section className="detail-section">
            <div className="detail-section-heading"><h3>Included in campaigns</h3><span>{product.campaigns}</span></div>
            <div className="included-campaigns">
              {campaignRows.slice(0, product.campaigns).map((campaign) => (
                <div key={campaign.id}><BagIcon kind={campaign.bag} color={campaign.color} className="store-bag" /><span><b>{campaign.name}</b><small>{campaign.strategy}</small></span><i className={campaign.live ? "live" : ""}>{campaign.live ? "Live" : "Paused"}</i></div>
              ))}
            </div>
          </section>
          <section className="detail-section">
            <div className="detail-section-heading"><h3>Recent offers</h3><button type="button">View all</button></div>
            <div className="recent-product-offers">
              {offerRows.filter((_, index) => index < 3).map((offer, index) => (
                <div key={`${offer.time}-${index}`}><span><b>${Math.min(offer.offer, product.price - 5).toFixed(2)}</b><small>Ceiling ${Math.min(offer.ceiling, product.price - 2).toFixed(2)}</small></span><span className={`offer-status ${offer.status.toLowerCase()}`}>{offer.status}</span><time>{offer.time}</time></div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

function CampaignsTable() {
  const [campaigns, setCampaigns] = useState(campaignRows);
  const toggleCampaign = (id: number) => setCampaigns((rows) => rows.map((row) => row.id === id ? { ...row, live: !row.live } : row));

  return (
    <div className="data-card campaign-table-card">
      <div className="table-toolbar">
        <div><h3>All campaigns</h3><span>{campaigns.filter((item) => item.live).length} active of {campaigns.length}</span></div>
        <div className="table-tools"><button type="button">Filter</button><button type="button">Columns</button></div>
      </div>
      <div className="table-scroll">
        <table className="data-table campaigns-table">
          <thead><tr><th>Status</th><th>Campaign</th><th>Strategy</th><th>Daily budget</th><th>Offers</th><th>Selected</th><th>Reserved</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {campaigns.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="status-cell">
                    <button className={row.live ? "mini-toggle on" : "mini-toggle"} type="button" onClick={() => toggleCampaign(row.id)} aria-label={`${row.live ? "Pause" : "Start"} ${row.name}`}><span /></button>
                    <span className={row.live ? "status-pill live" : "status-pill paused"}>{row.live ? "Live" : "Paused"}</span>
                  </div>
                </td>
                <td><div className="campaign-name"><BagIcon kind={row.bag} color={row.color} className="store-bag" /><span><b>{row.name}</b><small>{row.store}</small></span></div></td>
                <td><span className="strategy-pill">{row.strategy}</span></td>
                <td><div className="budget-cell"><span><b>${row.budget}</b> / day</span><small>${row.remaining} remaining</small><i><span style={{ width: `${(row.remaining / row.budget) * 100}%` }} /></i></div></td>
                <td><b>{row.offers}</b></td>
                <td><b>{row.selected}</b><small className="cell-rate">{row.offers ? `${Math.round(row.selected / row.offers * 100)}%` : "—"}</small></td>
                <td><b>${row.reserved.toLocaleString()}</b></td>
                <td><div className="row-actions"><button type="button">Edit</button><button type="button">Preview</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OffersFeed() {
  return (
    <div className="offers-layout">
      <div className="data-card">
        <div className="table-toolbar">
          <div><h3>Live offer feed</h3><span className="live-indicator"><i />Updating automatically</span></div>
          <button className="feed-filter" type="button">All statuses</button>
        </div>
        <div className="table-scroll">
          <table className="data-table offers-feed-table">
            <thead><tr><th>Product</th><th>Shopper ceiling</th><th>Offer made</th><th>Status</th><th>Time</th></tr></thead>
            <tbody>
              {offerRows.map((row, index) => (
                <tr className="feed-row" style={{ animationDelay: `${index * 90}ms` }} key={`${row.product}-${row.time}`}>
                  <td><div className="feed-product"><span className="catalog-thumb">{row.product.slice(0, 2).toUpperCase()}</span><b>{row.product}</b>{row.status === "Accepted" && <BagIcon kind="gift" color={colors.purple} className="accepted-bag" />}</div></td>
                  <td>${row.ceiling.toFixed(2)}</td>
                  <td><b>${row.offer.toFixed(2)}</b></td>
                  <td><span className={`offer-status ${row.status.toLowerCase()}`}>{row.status}</span></td>
                  <td><span className="time-cell">{row.time}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="data-card compact-empty">
        <BagIcon kind="wink" color={colors.yellow} className="empty-bag" />
        <h3>No offers yet</h3>
        <p>Active campaigns respond automatically.</p>
        <span>Accessories win-back</span>
      </aside>
    </div>
  );
}

function CatalogTable() {
  const [selectedProduct, setSelectedProduct] = useState<(typeof catalogRows)[number] | null>(null);
  return (
    <>
      <div className="catalog-layout">
        <div className="data-card">
          <div className="table-toolbar">
            <div><h3>Product catalog</h3><span>560 products synced 8 minutes ago</span></div>
            <button className="feed-filter" type="button">Search catalog</button>
          </div>
          <div className="table-scroll">
            <table className="data-table catalog-table">
              <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Margin</th><th>Campaigns</th></tr></thead>
              <tbody>
                {catalogRows.map((row) => (
                  <tr className="clickable-product-row" key={row.sku} onClick={() => setSelectedProduct(row)}>
                    <td><div className="feed-product"><span className="catalog-thumb">{row.product.slice(0, 2).toUpperCase()}</span><span><b>{row.product}</b><small>{row.sku}</small></span></div></td>
                    <td><b>${row.price.toFixed(2)}</b></td>
                    <td><span className={row.stock < 25 ? "low-stock" : ""}>{row.stock} units</span></td>
                    <td>{row.margin}</td>
                    <td><span className="campaign-count">{row.campaigns}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="data-card catalog-error">
          <BagIcon kind="shy" color={colors.pink} className="error-bag" />
          <div><span className="error-label">Sync issue</span><h3>18 products need attention</h3><p>Inventory data is missing or older than 24 hours. Offers are paused for these products.</p><button type="button">Review products</button></div>
        </aside>
      </div>
      {selectedProduct && <ProductDetailDrawer product={selectedProduct} onClose={() => setSelectedProduct(null)} />}
    </>
  );
}

function MerchantDashboard() {
  const [tab, setTab] = useState<DashboardTab>("campaigns");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);

  return (
    <main className="merchant-page">
      <MerchantNav />
      <div className="dashboard-shell">
        <section className="dashboard-heading">
          <div><p className="dashboard-kicker">Overview · June 10–16</p><h1>Merchant manager</h1><p>Campaigns that make the right offer, automatically.</p></div>
          <div className="heading-actions"><button className="dashboard-secondary" type="button" onClick={() => setAgentModalOpen(true)}>Connect an agent</button><button className="dashboard-primary" type="button" onClick={() => setDrawerOpen(true)}>+ Create campaign</button></div>
        </section>

        <section className="recovery-banner">
          <BagIcon kind="happy" color={colors.red} className="recovery-bag" />
          <div className="recovery-copy"><p>This week’s recovered revenue</p><h2><strong>$1,240</strong> recovered this week from carts that would have been abandoned</h2><span><i /> 18.4% above last week</span></div>
          <div className="chart-wrap">
            <div className="chart-meta"><span>$400</span><span>7 days</span></div>
            <svg className="line-chart" viewBox="0 0 300 92" role="img" aria-label="Recovered revenue rose over the past seven days">
              <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff5c4d" stopOpacity=".26" /><stop offset="1" stopColor="#ff5c4d" stopOpacity="0" /></linearGradient></defs>
              <path className="chart-area" d="M3 78C26 75 33 63 56 66s37 7 56-9 32-27 51-19 30 25 51 6 42-15 82-35v80H3Z" />
              <path className="chart-line" d="M3 78C26 75 33 63 56 66s37 7 56-9 32-27 51-19 30 25 51 6 42-15 82-35" />
              <circle cx="296" cy="9" r="4" />
            </svg>
            <div className="chart-days"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
          </div>
        </section>

        <section className="stats-grid">
          {[
            ["Active campaigns", "3", "of 4 total", "neutral"],
            ["Offers sent", "316", "+22% vs last week", "up"],
            ["Shopper selections", "74", "23.4% selection rate", "up"],
            ["Incentives reserved", "$4,925", "$1,208 available", "neutral"],
            ["Conversion rate", "18.7%", "+3.2 pts", "up"],
            ["Incremental Visa volume", "$12,840", "+$2,140 this week", "up"],
          ].map(([label, value, detail, tone]) => (
            <article className="stat-card" key={label}><span>{label}</span><strong>{value}</strong><small className={tone}>{tone === "up" && "↑ "}{detail}</small></article>
          ))}
        </section>

        <section className="workspace">
          <div className="workspace-tabs" role="tablist">
            {(["campaigns", "catalog", "offers"] as DashboardTab[]).map((item) => <button className={tab === item ? "active" : ""} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} key={item}>{item}</button>)}
          </div>
          {tab === "campaigns" && <CampaignsTable />}
          {tab === "catalog" && <CatalogTable />}
          {tab === "offers" && <OffersFeed />}
        </section>
      </div>
      <footer className="merchant-footer"><span>mercatus<span>.</span></span><p>Offer reservations protect your budget and stock.</p><span>Visa acceptance rules apply</span></footer>
      {drawerOpen && <CampaignPanel onClose={() => setDrawerOpen(false)} />}
      {agentModalOpen && <AgentModal onClose={() => setAgentModalOpen(false)} />}
    </main>
  );
}

export default function App() {
  return window.location.pathname === "/popup" ? <ShopperPrototype /> : <MerchantDashboard />;
}
