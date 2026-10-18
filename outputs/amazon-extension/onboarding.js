const STORAGE_KEY = 'mercatusShopperOnboardingSeen';

const SLIDES = [
  {
    bag: 'assets/bags/red-happy.svg',
    color: '#ff5c4d',
    title: 'Name your price',
    body: "Set the most you'll pay for anything in your cart.",
  },
  {
    bag: 'assets/bags/yellow-wink.svg',
    color: '#ffca3a',
    title: 'Let merchants compete',
    body: 'Stores send you their best offers while you wait.',
  },
  {
    bag: 'assets/bags/blue-sunglasses.svg',
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

function $(id) {
  return document.getElementById(id);
}

function renderSlide(i) {
  const slide = SLIDES[i];
  const root = $('onboarding');
  root.style.setProperty('--onboarding-accent', slide.color);
  $('onboardingBag').src = slide.bag;
  $('onboardingTitle').textContent = slide.title;
  $('onboardingBody').textContent = slide.body;
  const bag = $('onboardingBag');
  bag.classList.remove('is-bounce');
  void bag.offsetWidth;
  bag.classList.add('is-bounce');
  document.querySelectorAll('.onboarding-dot').forEach((dot, di) => {
    const active = di === i;
    dot.classList.toggle('is-active', active);
    dot.setAttribute('aria-selected', String(active));
    dot.tabIndex = active ? 0 : -1;
  });
  const last = i === SLIDES.length - 1;
  $('onboardingNext').textContent = last ? 'Get started' : 'Next';
  index = i;
}

function go(delta) {
  const next = Math.max(0, Math.min(SLIDES.length - 1, index + delta));
  if (next !== index) renderSlide(next);
}

async function finish({ signup } = {}) {
  await chrome.storage.local.set({ [STORAGE_KEY]: true }).catch(() => {});
  hide();
  const goSignup = signup != null ? signup : preferSignup;
  if (typeof finishing === 'function') finishing({ signup: !!goSignup });
}

function hide() {
  const root = $('onboarding');
  if (!root) return;
  root.hidden = true;
  document.body.classList.remove('onboarding-only');
  document.removeEventListener('keydown', onKey);
}

function onKey(e) {
  if ($('onboarding')?.hidden) return;
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
  const dots = $('onboardingDots');
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
  $('onboardingSkip').addEventListener('click', () => finish({ signup: false }));
  $('onboardingNext').addEventListener('click', () => {
    if (index >= SLIDES.length - 1) finish({ signup: true });
    else go(1);
  });
  const stage = $('onboardingStage');
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
      if (Math.abs(dx) < 40) return;
      if (dx < 0) {
        if (index >= SLIDES.length - 1) finish({ signup: true });
        else go(1);
      } else go(-1);
    },
    { passive: true }
  );
}

function show({ onDone, signup = false } = {}) {
  bindOnce();
  preferSignup = !!signup;
  finishing = onDone;
  document.body.classList.add('onboarding-only');
  $('auth').hidden = true;
  $('onboarding').hidden = false;
  renderSlide(0);
  document.addEventListener('keydown', onKey);
  $('onboardingNext').focus();
}

export async function ensureShopperOnboarding({ onDone } = {}) {
  const stored = await chrome.storage.local.get(STORAGE_KEY).catch(() => ({}));
  if (stored[STORAGE_KEY]) return false;
  await new Promise((resolve) => {
    show({
      signup: true,
      onDone: (result) => {
        onDone?.(result);
        resolve(result);
      },
    });
  });
  return true;
}

export function replayShopperOnboarding({ onDone } = {}) {
  return new Promise((resolve) => {
    show({
      signup: true,
      onDone: (result) => {
        onDone?.(result);
        resolve(result);
      },
    });
  });
}
