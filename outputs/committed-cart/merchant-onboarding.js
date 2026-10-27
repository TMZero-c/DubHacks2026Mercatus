const STORAGE_KEY = 'mercatusMerchantOnboardingSeen';

const SLIDES = [
  {
    bag: '/assets/bags/red-happy.svg',
    color: '#ff5c4d',
    title: 'Meet shoppers ready to buy',
    body: 'Every request comes with a price, a deadline, and a Visa hold.',
  },
  {
    bag: '/assets/bags/green-determined.svg',
    color: '#35c99a',
    title: 'Set your rules once',
    body: 'Choose products, minimum margins, and a daily budget.',
  },
  {
    bag: '/assets/bags/purple-bow.svg',
    color: '#8f6eea',
    title: 'Offers go out automatically',
    body: 'Your campaigns, or your own AI agent, respond within your limits.',
  },
];

let index = 0;
let touchStartX = 0;
let openCampaign = false;
let bound = false;

function $(sel) {
  return document.querySelector(sel);
}

function dialog() {
  return $('#merchantOnboarding');
}

function renderSlide(i) {
  const slide = SLIDES[i];
  const root = dialog();
  root.style.setProperty('--onboarding-accent', slide.color);
  $('#merchantOnboardingBag').src = slide.bag;
  $('#merchantOnboardingTitle').textContent = slide.title;
  $('#merchantOnboardingBody').textContent = slide.body;
  const bag = $('#merchantOnboardingBag');
  bag.classList.remove('is-bounce');
  void bag.offsetWidth;
  bag.classList.add('is-bounce');
  root.querySelectorAll('.onboarding-dot').forEach((dot, di) => {
    const active = di === i;
    dot.classList.toggle('is-active', active);
    dot.setAttribute('aria-selected', String(active));
    dot.tabIndex = active ? 0 : -1;
  });
  const last = i === SLIDES.length - 1;
  $('#merchantOnboardingNext').textContent = last ? 'Create your first campaign' : 'Next';
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

function closeAndMaybeCampaign() {
  const d = dialog();
  if (d.open) d.close();
  markSeen();
  if (openCampaign) {
    openCampaign = false;
    $('#newCampaign')?.click();
  }
}

function finish({ campaign = false } = {}) {
  openCampaign = !!campaign;
  closeAndMaybeCampaign();
}

function onKey(e) {
  const d = dialog();
  if (!d?.open) return;
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (index === SLIDES.length - 1) finish({ campaign: true });
    else go(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    go(-1);
  }
}

function bindOnce() {
  if (bound) return;
  bound = true;
  const dots = $('#merchantOnboardingDots');
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
  $('#merchantOnboardingSkip').addEventListener('click', () => finish({ campaign: false }));
  $('#merchantOnboardingNext').addEventListener('click', () => {
    if (index >= SLIDES.length - 1) finish({ campaign: true });
    else go(1);
  });
  const stage = $('#merchantOnboardingStage');
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
        if (index >= SLIDES.length - 1) finish({ campaign: true });
        else go(1);
      } else go(-1);
    },
    { passive: true }
  );
  document.addEventListener('keydown', onKey);
  dialog().addEventListener('cancel', (e) => {
    e.preventDefault();
    finish({ campaign: false });
  });
}

function show() {
  bindOnce();
  const d = dialog();
  if (!d) return;
  renderSlide(0);
  if (!d.open) d.showModal();
  $('#merchantOnboardingNext')?.focus();
}

export function maybeShowMerchantOnboarding() {
  try {
    if (localStorage.getItem(STORAGE_KEY)) return false;
  } catch {
    return false;
  }
  show();
  return true;
}

export function replayMerchantOnboarding() {
  show();
}

window.maybeShowMerchantOnboarding = maybeShowMerchantOnboarding;
window.replayMerchantOnboarding = replayMerchantOnboarding;
