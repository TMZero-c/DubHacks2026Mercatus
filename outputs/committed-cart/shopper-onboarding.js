const STORAGE_KEY = 'mercatusShopperOnboardingSeen';

const SLIDES = [
  {
    bag: '/assets/bags/red-happy.svg',
    color: '#ff5c4d',
    title: 'Name your price',
    body: "Set the most you'll pay for anything in your cart.",
  },
  {
    bag: '/assets/bags/yellow-wink.svg',
    color: '#ffca3a',
    title: 'Let merchants compete',
    body: 'Stores send you their best offers while you wait.',
  },
  {
    bag: '/assets/bags/blue-sunglasses.svg',
    color: '#3997f0',
    title: 'Pay only if you say yes',
    body: 'A temporary Visa hold, not a charge. Released automatically if nothing fits.',
  },
];

let index = 0;
let touchStartX = 0;
let finishing = null;
let preferSignup = false;
let bound = false;

function $(sel) {
  return document.querySelector(sel);
}

function root() {
  return $('#shopperOnboarding');
}

function renderSlide(i) {
  const slide = SLIDES[i];
  const el = root();
  el.style.setProperty('--onboarding-accent', slide.color);
  $('#shopperOnboardingBag').src = slide.bag;
  $('#shopperOnboardingTitle').textContent = slide.title;
  $('#shopperOnboardingBody').textContent = slide.body;
  const bag = $('#shopperOnboardingBag');
  bag.classList.remove('is-bounce');
  void bag.offsetWidth;
  bag.classList.add('is-bounce');
  el.querySelectorAll('.onboarding-dot').forEach((dot, di) => {
    const active = di === i;
    dot.classList.toggle('is-active', active);
    dot.setAttribute('aria-selected', String(active));
    dot.tabIndex = active ? 0 : -1;
  });
  $('#shopperOnboardingNext').textContent = i === SLIDES.length - 1 ? 'Get started' : 'Next';
  index = i;
}

function go(delta) {
  const next = Math.max(0, Math.min(SLIDES.length - 1, index + delta));
  if (next !== index) renderSlide(next);
}

function markSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {}
}

function hide() {
  const el = root();
  if (!el) return;
  el.hidden = true;
  document.body.classList.remove('shopper-onboarding-only');
  document.removeEventListener('keydown', onKey);
}

function finish({ signup } = {}) {
  markSeen();
  hide();
  const goSignup = signup != null ? signup : preferSignup;
  finishing?.({ signup: !!goSignup });
}

function onKey(e) {
  if (root()?.hidden) return;
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (index === SLIDES.length - 1) finish({ signup: true });
    else go(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    go(-1);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    finish({ signup: false });
  }
}

function bindOnce() {
  if (bound) return;
  bound = true;
  const dots = $('#shopperOnboardingDots');
  dots.replaceChildren(
    ...SLIDES.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'onboarding-dot';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', `Slide ${i + 1}`);
      b.addEventListener('click', () => renderSlide(i));
      return b;
    })
  );
  $('#shopperOnboardingSkip').addEventListener('click', () => finish({ signup: false }));
  $('#shopperOnboardingNext').addEventListener('click', () => {
    if (index >= SLIDES.length - 1) finish({ signup: true });
    else go(1);
  });
  const stage = $('#shopperOnboardingStage');
  stage.addEventListener(
    'touchstart',
    (e) => {
      touchStartX = e.changedTouches[0]?.clientX || 0;
    },
    { passive: true }
  );
  stage.addEventListener(
    'touchend',
    (e) => {
      const x = e.changedTouches[0]?.clientX || 0;
      const dx = x - touchStartX;
      if (Math.abs(dx) < 48) return;
      if (dx < 0) {
        if (index >= SLIDES.length - 1) finish({ signup: true });
        else go(1);
      } else go(-1);
    },
    { passive: true }
  );
  document.addEventListener('keydown', onKey);
}

function show({ onDone, signup = false } = {}) {
  bindOnce();
  preferSignup = !!signup;
  finishing = onDone;
  document.body.classList.add('shopper-onboarding-only', 'auth-locked');
  const auth = $('#authGate');
  if (auth) auth.style.visibility = 'hidden';
  root().hidden = false;
  renderSlide(0);
  $('#shopperOnboardingNext')?.focus();
}

export function ensureShopperOnboarding({ onDone, force = false } = {}) {
  try {
    if (!force && localStorage.getItem(STORAGE_KEY)) return Promise.resolve(false);
  } catch {}
  return new Promise((resolve) => {
    show({
      signup: true,
      onDone: (result) => {
        const auth = $('#authGate');
        if (auth) auth.style.visibility = '';
        onDone?.(result);
        resolve(true);
      },
    });
  });
}

export function replayShopperOnboarding({ onDone } = {}) {
  return ensureShopperOnboarding({ onDone, force: true });
}

window.ensureShopperOnboarding = ensureShopperOnboarding;
window.replayShopperOnboarding = replayShopperOnboarding;
