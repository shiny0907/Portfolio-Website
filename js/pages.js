// Navigation between the hero, About (left) and Portfolio (right), and the eye travelling with the page
import { nowSec, clamp, camBase } from './core.js';
import { state, beatRings } from './state.js';
import { SIDE_LABELS, setLabelText } from './grid/labels.js';
import { aboutEl, aboutEnter } from './about.js';
import { pfEl } from './portfolio.js';
import { rig } from './eye/eyeball.js';
import { hud, aura } from './eye/hud.js';
import { EYE_PARK_X } from './layout.js';
import { sfx } from './sound.js';

// ABOUT ME opens the About page and becomes BACK; BACK returns to the hero.
// PORTFOLIO still just announces the click ('hero:navigate') until that page exists.
export function labelClicked(lab) {
  const t = nowSec();
  if (lab === SIDE_LABELS[0]) {
    if (page.target === 'hero') openAbout(); else closeAbout();
    return;
  }
  if (page.target === 'hero') openPortfolio(); else closeAbout();
}

// ---------- Pages: About sits to the left of the hero ----------
export const page = { target: 'hero', p: 0, from: 0, to: 0, start: -10, moving: false, pushed: false, routed: false, decoded: false, jag: new Array(64).fill(0) };
const PAGE_DUR = 1.15;
function goPage(name) {
  if (!state.booted || page.target === name) return;
  const t = nowSec();
  page.target = name;
  page.from = page.p;
  page.to = name === 'about' ? 1 : name === 'portfolio' ? -1 : 0;
  page.start = t;
  page.moving = true;
  sfx('whoosh');
  // A fresh tear pattern each time: each row's edge sits 0 to 2 squares ahead, varying smoothly
  let v = Math.random() * 3;
  for (let j = 0; j < 64; j++) { v = clamp(v + (Math.random() - 0.5) * 1.6, 0, 2.99); page.jag[j] = Math.floor(v); }
  if (name !== 'about') page.decoded = false;
  // The word on the visible arc decodes into its new meaning mid-flight
  if (name === 'about') setLabelText(SIDE_LABELS[0], 'BACK', t + 0.3);
  else if (name === 'portfolio') setLabelText(SIDE_LABELS[1], 'BACK', t + 0.3);
  else {
    if (SIDE_LABELS[0].text !== 'ABOUT ME') setLabelText(SIDE_LABELS[0], 'ABOUT ME', t + 0.3);
    if (SIDE_LABELS[1].text !== 'PORTFOLIO') setLabelText(SIDE_LABELS[1], 'PORTFOLIO', t + 0.3);
  }
  // Spin the clock rings up like gears while the eye travels
  const spin = page.to > page.from ? 1 : -1;
  beatRings.forEach(function (r) { r.target += spin * Math.sign(r.step) * Math.PI / 2; });
  aboutEl.setAttribute('aria-hidden', name === 'about' ? 'false' : 'true');
  pfEl.setAttribute('aria-hidden', name === 'portfolio' ? 'false' : 'true');
    if (name === 'about') aboutEnter(t);
}
function openAbout() {
  goPage('about');
  try { history.pushState({ page: 'about' }, '', '#about'); page.pushed = true; } catch (err) { page.pushed = false; }
}
function openPortfolio() {
  goPage('portfolio');
  try { history.pushState({ page: 'portfolio' }, '', '#portfolio'); page.pushed = true; } catch (err) { page.pushed = false; }
}
function closeAbout() {
  if (page.pushed) { page.pushed = false; try { history.back(); return; } catch (err) { /* fall through */ } }
  try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (err) { /* optional */ }
  goPage('hero');
}
window.addEventListener('popstate', function () {
  if (location.hash === '#about') goPage('about');
  else if (location.hash === '#portfolio') goPage('portfolio');
  else { page.pushed = false; goPage('hero'); }
});
window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && page.target !== 'hero') closeAbout();
});

// Two-finger sideways swipes move between the pages (About | Hero | Portfolio) instead of the
// browser's back/forward gesture. The swipe drags the world: swipe right pulls About in from the left,
// swipe left pulls Portfolio in from the right, and the opposite swipe brings the hero back.
// One page per swipe. After a swipe the trackpad keeps sending fading momentum events, so the gesture stays
// locked until the motion speeds up again (a fresh swipe), changes direction, or pauses. Momentum only fades.
// Swipes also work mid-transition: the page just reverses or carries on from wherever it is.
const swipe = { acc: 0, lastAt: 0, dir: 0, locked: false, hist: [], peak: 0, trough: Infinity };
const avg = function (a, n) { const s = a.slice(-n); return s.reduce(function (x, y) { return x + y; }, 0) / s.length; };
window.addEventListener('wheel', function (e) {
  const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const dx = e.deltaX * scale, dy = e.deltaY * scale;
  if (Math.abs(dx) <= Math.abs(dy)) return;   // vertical scrolling is left alone (About text, the carousel)
  e.preventDefault();                          // no browser back/forward swipe
  const now = performance.now(), ad = Math.abs(dx), dir = Math.sign(dx);
  if (now - swipe.lastAt > 200 || dir !== swipe.dir) { swipe.hist = []; swipe.acc = 0; swipe.locked = false; }
  swipe.lastAt = now;
  swipe.dir = dir;
  swipe.hist.push(ad);
  if (swipe.hist.length > 24) swipe.hist.shift();
  // After a swipe fires, wait for its motion to peak and fade; speeding up again after that is a new swipe
  if (swipe.locked) {
    if (swipe.trough === Infinity) {
      swipe.peak = Math.max(swipe.peak, ad);
      if (ad < swipe.peak * 0.6) swipe.trough = ad;   // momentum is fading
    } else {
      swipe.trough = Math.min(swipe.trough, ad);
      if (avg(swipe.hist, 3) > Math.max(8, swipe.trough * 2)) { swipe.locked = false; swipe.acc = 0; }
    }
  }
  if (swipe.locked) return;
  swipe.acc += dx;
  if (Math.abs(swipe.acc) < 60) return;
  swipe.locked = true;
  swipe.peak = ad;
  swipe.trough = Infinity;
  // With natural trackpad scrolling, fingers moving right give a negative deltaX
  const right = swipe.acc < 0;
  if (page.target === 'hero') { if (right) openAbout(); else openPortfolio(); }
  else if (page.target === 'about' && !right) closeAbout();
  else if (page.target === 'portfolio' && right) closeAbout();
}, { passive: false });

// Page transition progress, and the eye travelling to (or from) its parking spot
export function updatePage(t) {
  // A link straight to #about or #portfolio opens that page as soon as the eye has booted
  if (!page.routed && state.booted) {
    page.routed = true;
    if (location.hash === '#about') goPage('about');
    else if (location.hash === '#portfolio') goPage('portfolio');
  }
  if (page.moving) {
    const k01 = clamp((t - page.start) / PAGE_DUR, 0, 1);
    const e01 = k01 < 0.5 ? 4 * k01 * k01 * k01 : 1 - Math.pow(-2 * k01 + 2, 3) / 2;
    page.p = page.from + (page.to - page.from) * e01;
    if (k01 >= 1) { page.moving = false; page.endAt = t; }
  }
}

export function updateTravel(dt) {
  // The eye travels in step with the page (right edge for About, left edge for Portfolio),
  // so it stays the same distance from the sliding content the whole way
  const target = page.p * EYE_PARK_X;
  const rh = dt / 2;
  for (let s2 = 0; s2 < 2; s2++) {
    state.vRigX += ((target - state.rigX) * 170 - state.vRigX * 22) * rh;
    state.rigX += state.vRigX * rh;
  }
  rig.position.x = state.rigX;
  // The rings sit deeper than the eye, so perspective would slide them toward the centre when the eye
  // moves sideways. Scale their offset by depth so they stay perfectly centred on the eye on screen.
  const dz = camBase.z;
  hud.position.x = state.rigX * (dz - hud.position.z) / dz;
  aura.position.x = state.rigX * (dz - aura.position.z) / dz;
  // While it travels the eye braces: ears fold back, lids narrow
  state.travel += (clamp(Math.abs(state.vRigX) / 3, 0, 1) - state.travel) * Math.min(1, dt * 10);
}
