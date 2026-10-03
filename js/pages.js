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
export const page = { target: 'hero', p: 0, from: 0, to: 0, start: -10, moving: false, pushed: false, decoded: false, jag: new Array(64).fill(0) };
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
// browser's back/forward gesture. Swipe left = one page left, swipe right = one page right.
// One page per gesture: trackpads keep sending momentum events, so it re-arms only after a short pause.
const swipe = { acc: 0, lastAt: 0, locked: false };
window.addEventListener('wheel', function (e) {
  const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const dx = e.deltaX * scale, dy = e.deltaY * scale;
  if (Math.abs(dx) <= Math.abs(dy)) return;   // vertical scrolling is left alone (About text, the carousel)
  e.preventDefault();                          // no browser back/forward swipe
  const now = performance.now();
  if (now - swipe.lastAt > 250) { swipe.acc = 0; swipe.locked = false; }   // a new gesture
  swipe.lastAt = now;
  if (swipe.locked || page.moving) return;
  swipe.acc += dx;
  if (Math.abs(swipe.acc) < 60) return;
  swipe.locked = true;
  // With natural trackpad scrolling, fingers moving left give a positive deltaX
  const left = swipe.acc > 0;
  if (page.target === 'hero') { if (left) openAbout(); else openPortfolio(); }
  else if (page.target === 'about' && !left) closeAbout();
  else if (page.target === 'portfolio' && left) closeAbout();
}, { passive: false });

// Page transition progress, and the eye travelling to (or from) its parking spot
export function updatePage(t) {
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
