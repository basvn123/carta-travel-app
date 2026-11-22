/**
 * The opening screen (G5, HANDBOOK "Opening screen"). The markup is static in
 * index.html so it paints in the first frame; this module runs it once the
 * bundle has loaded:
 *
 *   - draws the relief along the bottom from real ground (Chamonix's peaks),
 *   - takes the words in the reader's language from LoadingScreen.jsx,
 *   - says so in plain words when loading takes longer than SLOW_MS,
 *   - lifts the whole screen away like a curtain when nothing holds it.
 *
 * Who holds it: LoadingScreen.jsx while the app waits on the session or the
 * data (holdBootSplash / releaseBootSplash). BootSplashSettle in main.jsx
 * calls settleBootSplash after the first commit, so any screen that never
 * waits (the styleguide, a shared trip, the gate, an error) lifts it at once.
 *
 * Imported first by main.jsx. No React here: the splash lives outside #root.
 */
import { reliefPeaks, layoutRelief } from './relief.js';

/* The relief's ground: the peaks in Chamonix's own dossier
   (public/dossier/gem-chamonix.json, nearby.mountains, 2026-11). The relief
   rules hold here too: real peaks only, a real height printed. */
const GROUND_SEED = 'gem:chamonix';
const GROUND = [
  { name: 'Aiguille du Midi', elev_m: 3842, km: 5.2, bearing: 'S' },
  { name: 'Mont Blanc', elev_m: 4806, km: 10.1, bearing: 'S' },
  { name: 'Le Brévent', elev_m: 2525, km: 2.7, bearing: 'NW' },
  { name: 'Aiguille Verte', elev_m: 4122, km: 7.9, bearing: 'E' },
  { name: 'Pointe Percée', elev_m: 2750, km: 24.5, bearing: 'W' },
];

/** The opening plays out in about this long (06-boot-splash.css delays). */
export const INTRO_MS = 1500;
/** After this long on screen, one plain line says it is slow. */
export const SLOW_MS = 4000;
const LIFT_MS = 720;
const SEEN_KEY = 'carta.splash.seen.v1';

/**
 * How long the splash still waits before it lifts, once nothing holds it.
 * The opening plays to its end only the first time in a browser session;
 * after that, and under automation, the app is never kept waiting for it.
 */
export function liftDelay({ now, shownAt, firstVisit, automated }) {
  if (automated || !firstVisit) return 0;
  return Math.max(0, Math.min(INTRO_MS, shownAt + INTRO_MS - now));
}

const doc = typeof document !== 'undefined' ? document : null;
const splash = () => (doc ? doc.getElementById('boot-splash') : null);
const automated = () => typeof navigator !== 'undefined' && navigator.webdriver === true;
const reducedMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const isShown = (el) => !!el && el.dataset.state !== 'done' && getComputedStyle(el).display !== 'none';

function firstVisit() {
  try { return !window.sessionStorage.getItem(SEEN_KEY); } catch { return false; }
}
function markSeen() {
  try { window.sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* storage blocked */ }
}

function restoreThemeColor() {
  const meta = doc?.querySelector('meta[name="theme-color"][data-app]');
  if (meta) meta.setAttribute('content', meta.dataset.app);
}
function splashThemeColor() {
  const meta = doc?.querySelector('meta[name="theme-color"][data-app]');
  const umber = getComputedStyle(doc.documentElement).getPropertyValue('--umber-800').trim();
  if (meta && umber) meta.setAttribute('content', umber);
}

let holds = 0;
let shownAt = 0;
let pendingLift = 0;
let slowTimer = 0;
let lift = null;
let words = { tagline: '', slow: '', lang: 'en' };
let drawnFor = '';

/* ---- The relief ------------------------------------------------------ */
const PEAKS = reliefPeaks(GROUND);
// The label names the highest peak, which layoutRelief always keeps (spots
// follow the peaks' order and only later ones give way on overlap).
const spotText = () => {
  let n = String(PEAKS[0].m);
  try { n = new Intl.NumberFormat(words.lang || 'en').format(PEAKS[0].m); } catch { /* unknown locale */ }
  return `${PEAKS[0].name} ${n} m`;
};

function drawRelief(el) {
  const zone = el.querySelector('.boot-relief');
  if (!zone) return;
  const w = Math.round(zone.clientWidth);
  const h = Math.round(zone.clientHeight);
  const key = `${w}x${h}`;
  if (!w || !h || key === drawnFor) return;
  const drawn = layoutRelief(PEAKS, { w, h, seed: GROUND_SEED });
  if (!drawn) return;
  const animate = !drawnFor;
  drawnFor = key;
  const p = drawn.paths;
  // DOM calls, not innerHTML: no markup string reaches the page (semgrep
  // carta-dom-inner-html, docs/security/static-analysis.md).
  const NS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'boot-art');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('focusable', 'false');
  const path = (cls, d) => {
    if (!d) return;
    const n = doc.createElementNS(NS, 'path');
    n.setAttribute('class', cls);
    n.setAttribute('d', d);
    svg.append(n);
  };
  path('relief-shade relief-faint', p.sh2); path('relief-shade', p.sh1);
  path('relief-lit relief-faint', p.lit2); path('relief-lit', p.lit1);
  path('relief-shade relief-index', p.is); path('relief-lit relief-index', p.il);
  zone.replaceChildren(svg);
  // One height only, the highest: the line a reader can check.
  const top = drawn.spots[0];
  if (top) {
    const spot = doc.createElement('span');
    spot.className = 'relief-spot';
    spot.style.left = `${top.x}px`;
    spot.style.top = `${top.y}px`;
    const tri = doc.createElement('i');
    tri.className = 'relief-tri';
    const label = doc.createElement('span');
    label.dataset.boot = 'height';
    label.textContent = spotText();
    spot.append(tri, label);
    zone.append(spot);
  }
  if (!animate) zone.querySelectorAll('.boot-art, .relief-spot').forEach((n) => { n.style.animation = 'none'; });
}

/* ---- Words ----------------------------------------------------------- */
function showSlow() {
  const el = splash();
  const line = el?.querySelector('[data-boot="slow"]');
  if (line && isShown(el)) line.textContent = words.slow;
}
function startSlowTimer(from) {
  clearTimeout(slowTimer);
  const el = splash();
  el?.querySelector('[data-boot="slow"]')?.replaceChildren();
  const wait = Math.max(0, SLOW_MS - (performance.now() - from));
  slowTimer = setTimeout(() => { slowTimer = -1; showSlow(); }, wait);
}

/** LoadingScreen passes the words in the reader's language. */
export function setBootSplashWords({ tagline = '', slow = '', lang = 'en' } = {}) {
  words = { tagline, slow, lang };
  const el = splash();
  if (!el) return;
  const tag = el.querySelector('[data-boot="tagline"]');
  if (tag && tag.textContent !== tagline) tag.textContent = tagline;
  if (slowTimer === -1) showSlow();
  const height = el.querySelector('[data-boot="height"]');
  if (height) height.textContent = spotText();
  if (isShown(el)) drawRelief(el);
}

/* ---- Hold, release, lift --------------------------------------------- */
function finish() {
  const el = splash();
  lift = null;
  clearTimeout(slowTimer);
  if (!el) return;
  el.dataset.state = 'done';
  // Drop the lift's forwards fills, so a later hold shows the screen in
  // place. CSS animations (they carry animationName) belong to the sheet.
  el.getAnimations({ subtree: true }).forEach((a) => { if (!('animationName' in a)) a.cancel(); });
  restoreThemeColor();
  markSeen();
}

function runLift() {
  pendingLift = 0;
  const el = splash();
  if (holds > 0 || !el || el.dataset.state === 'done' || lift) return;
  if (!isShown(el)) { finish(); return; }
  if (automated() || reducedMotion()) { finish(); return; }
  el.dataset.state = 'lifting';
  const radius = getComputedStyle(el).getPropertyValue('--radius-stage').trim() || '16px';
  el.querySelector('.boot-stack')?.animate(
    [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-48px)', opacity: 0 }],
    { duration: 420, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
  );
  lift = el.animate(
    [
      { transform: 'translateY(0)', borderBottomLeftRadius: '0px', borderBottomRightRadius: '0px' },
      { transform: 'translateY(-100%)', borderBottomLeftRadius: radius, borderBottomRightRadius: radius },
    ],
    { duration: LIFT_MS, easing: 'cubic-bezier(0.7, 0, 0.2, 1)', fill: 'forwards' },
  );
  lift.finished.then(finish, () => {});
}

function scheduleLift() {
  if (pendingLift || holds > 0) return;
  const el = splash();
  if (!el || el.dataset.state === 'done') return;
  // A tick first: StrictMode releases and holds again in the same commit.
  const delay = liftDelay({
    now: performance.now(), shownAt, firstVisit: firstVisit(), automated: automated() || reducedMotion(),
  });
  pendingLift = setTimeout(runLift, Math.max(16, delay));
}

/** Keep the splash up (the app is still waiting). Returns nothing. */
export function holdBootSplash() {
  const el = splash();
  if (!el) return;
  holds += 1;
  clearTimeout(pendingLift);
  pendingLift = 0;
  if (lift) { lift.cancel(); lift = null; el.querySelector('.boot-stack')?.getAnimations().forEach((a) => a.cancel()); }
  const wasShown = isShown(el) && el.dataset.state !== 'lifting';
  if (el.dataset.state === 'done' || el.dataset.state === 'lifting') el.classList.add('no-intro');
  el.dataset.state = 'held';
  if (!wasShown) {
    shownAt = performance.now();
    splashThemeColor();
    startSlowTimer(shownAt);
  }
  drawRelief(el);
}

/** The app stopped waiting. The splash lifts when nothing else holds it. */
export function releaseBootSplash() {
  holds = Math.max(0, holds - 1);
  if (holds === 0) scheduleLift();
}

/** After the first commit: lift unless a screen is holding it. */
export function settleBootSplash() {
  if (holds === 0) scheduleLift();
}

/* ---- At module load ---------------------------------------------------- */
(function boot() {
  const el = splash();
  if (!el) return;
  if (!isShown(el)) { restoreThemeColor(); return; }
  // Shown since the first paint (a plain app load, not a prerendered page).
  const paint = performance.getEntriesByName?.('first-contentful-paint')?.[0];
  shownAt = paint ? paint.startTime : 0;
  startSlowTimer(shownAt);
  // A tap once the app is ready skips what is left of the opening.
  el.addEventListener('pointerdown', () => {
    if (holds === 0 && pendingLift) { clearTimeout(pendingLift); runLift(); }
  });
  requestAnimationFrame(() => drawRelief(el));
}());
