// Navigation between the hero, About (left), Portfolio (right) and Contact (above), and the eye travelling with the page
import { nowSec, clamp, camBase } from './core.js';
import { state, beatRings } from './state.js';
import { SIDE_LABELS, setLabelText, setLabelShown } from './grid/labels.js';
import { aboutEl, aboutEnter } from './about.js';
import { pfEl } from './portfolio.js';
import { contactEl, contactEnter } from './contact.js';
import { rig } from './eye/eyeball.js';
import { hud, aura } from './eye/hud.js';
import { EYE_PARK_X, EYE_PARK_Y } from './layout.js';
import { caseActive, closeCase, routeCase } from './case.js';

// Each label opens its page and becomes BACK; BACK returns to the hero.
const LABEL_PAGE = ['about', 'portfolio', 'contact'];
const LABEL_TEXT = ['ABOUT ME', 'PORTFOLIO', 'CONTACT'];
export function labelClicked(lab) {
  if (page.target === 'hero') openPage(LABEL_PAGE[SIDE_LABELS.indexOf(lab)]);
  else closePage();
}

// ---------- Pages: About sits left of the hero, Portfolio right, Contact above ----------
// p is the sideways position (1 About, -1 Portfolio), q the vertical one (1 Contact)
export const page = {
  target: 'hero', p: 0, q: 0, from: 0, to: 0, fromQ: 0, toQ: 0, vertical: false,
  start: -10, moving: false, pushed: false, routed: false, decoded: false, jag: new Array(64).fill(0)
};
const PAGE_DUR = 1.15;
const PAGE_POS = { hero: [0, 0], about: [1, 0], portfolio: [-1, 0], contact: [0, 1] };
function goPage(name) {
  if (!state.booted || page.target === name || !PAGE_POS[name]) return;
  const t = nowSec();
  page.target = name;
  page.from = page.p; page.to = PAGE_POS[name][0];
  page.fromQ = page.q; page.toQ = PAGE_POS[name][1];
  page.vertical = page.toQ !== page.fromQ;
  page.start = t;
  page.moving = true;
  // A fresh tear pattern each time: each row's (or column's) edge sits 0 to 2 squares ahead, varying smoothly
  let v = Math.random() * 3;
  for (let j = 0; j < 64; j++) { v = clamp(v + (Math.random() - 0.5) * 1.6, 0, 2.99); page.jag[j] = Math.floor(v); }
  if (name !== 'about') page.decoded = false;
  // The word on the visible arc decodes into its new meaning mid-flight
  SIDE_LABELS.forEach(function (lab, i) {
    const want = LABEL_PAGE[i] === name ? 'BACK' : LABEL_TEXT[i];
    if (lab.text !== want) setLabelText(lab, want, t + 0.3);
  });
  // Spin the clock rings up like gears while the eye travels
  const spin = (page.to - page.from) + (page.toQ - page.fromQ) > 0 ? 1 : -1;
  beatRings.forEach(function (r) { r.target += spin * Math.sign(r.step) * Math.PI / 2; });
  aboutEl.setAttribute('aria-hidden', name === 'about' ? 'false' : 'true');
  pfEl.setAttribute('aria-hidden', name === 'portfolio' ? 'false' : 'true');
  contactEl.setAttribute('aria-hidden', name === 'contact' ? 'false' : 'true');
  if (name === 'about') aboutEnter(t);
  if (name === 'contact') contactEnter(t);
}
function openPage(name) {
  goPage(name);
  try { history.pushState({ page: name }, '', '#' + name); page.pushed = true; } catch (err) { page.pushed = false; }
}
function closePage() {
  if (page.pushed) { page.pushed = false; try { history.back(); return; } catch (err) { /* fall through */ } }
  try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (err) { /* optional */ }
  goPage('hero');
}
function isReload() {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav) return nav.type === 'reload';
    return performance.navigation && performance.navigation.type === 1;   // older browsers
  } catch (err) { return false; }
}
function pageFromHash() {
  const h = location.hash.slice(1);
  if (/^case\//.test(h)) return 'portfolio';   // a case study lives inside Portfolio
  return h === 'about' || h === 'portfolio' || h === 'contact' ? h : 'hero';
}
window.addEventListener('popstate', function () {
  // After any back/forward (or a hand-edited hash) the entry behind this one could be anything, so BACK
  // must no longer use history.back(); otherwise leaving About could land on Portfolio
  page.pushed = false;
  routeCase(location.hash.slice(1));   // opens or closes a case study as needed
  goPage(pageFromHash());
});
window.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  if (caseActive()) closeCase();   // Escape leaves a case study first, back to Portfolio
  else if (page.target !== 'hero') closePage();
});

// Trackpad swipes (and the mouse wheel on the hero) move between pages instead of the browser's back/forward
// gesture. The swipe drags the world: swipe right pulls About in from the left, swipe left pulls Portfolio in
// from the right, swipe down (or scroll up) pulls Contact down from above; the opposite swipe brings the hero back.
// One page per swipe, never two. After a swipe fires, further motion in that direction (its momentum, or the
// same swipe carrying on) is ignored until the fingers leave the pad, which shows up as a break in the event
// stream; and the same direction can never fire twice within 400 ms. Swiping the other way works straight
// away, even mid-transition (the page just reverses).
const swipe = { acc: 0, lastAt: 0, dir: '', blockDir: '', firedAt: -1e9, firedDir: '', interval: 16 };
window.addEventListener('wheel', function (e) {
  const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const dx = e.deltaX * scale, dy = e.deltaY * scale;
  const horizontal = Math.abs(dx) > Math.abs(dy);
  if (horizontal) {
    e.preventDefault();                          // no browser back/forward swipe
    if (page.target === 'contact' || caseActive()) return;
  } else {
    // Vertical only navigates on the hero and Contact (About scrolls its text, Portfolio steps its carousel)
    if (page.target !== 'hero' && page.target !== 'contact') return;
    e.preventDefault();
  }
  const d = horizontal ? dx : dy;
  const now = performance.now(), dir = (horizontal ? 'x' : 'y') + (d < 0 ? '-' : '+'), gap = now - swipe.lastAt;
  // A break is a pause clearly longer than the usual event spacing (which grows if frames are slow)
  const isBreak = gap > Math.max(80, swipe.interval * 4);
  if (!isBreak) swipe.interval += (Math.min(gap, 200) - swipe.interval) * 0.2;
  if (isBreak) swipe.blockDir = '';                        // fingers lifted: everything re-arms
  if (isBreak || dir !== swipe.dir) swipe.acc = 0;
  swipe.lastAt = now;
  swipe.dir = dir;
  if (dir === swipe.blockDir) return;
  swipe.acc += d;
  if (Math.abs(swipe.acc) < 60) return;
  swipe.acc = 0;
  if (now - swipe.firedAt < 400 && dir === swipe.firedDir) { swipe.blockDir = dir; return; }
  swipe.blockDir = dir;
  swipe.firedAt = now;
  swipe.firedDir = dir;
  // With natural trackpad scrolling, fingers moving right (or down) give a negative delta
  if (horizontal) {
    const right = dx < 0;
    if (page.target === 'hero') openPage(right ? 'about' : 'portfolio');
    else if (page.target === 'about' && !right) closePage();
    else if (page.target === 'portfolio' && right) closePage();
  } else {
    const down = dy < 0;
    if (page.target === 'hero' && down) openPage('contact');
    else if (page.target === 'contact' && !down) closePage();
  }
}, { passive: false });

// Page transition progress, and the eye travelling to (or from) its parking spot
export function updatePage(t) {
  // A link straight to #about, #portfolio or #contact opens that page as soon as the eye has booted.
  // A reload always starts on the hero, though: the hash is just left over from browsing, so drop it.
  if (!page.routed && state.booted) {
    page.routed = true;
    if (isReload()) { try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (err) { /* optional */ } }
    else if (pageFromHash() !== 'hero') { goPage(pageFromHash()); routeCase(location.hash.slice(1)); }
  }
  if (page.moving) {
    const k01 = clamp((t - page.start) / PAGE_DUR, 0, 1);
    const e01 = k01 < 0.5 ? 4 * k01 * k01 * k01 : 1 - Math.pow(-2 * k01 + 2, 3) / 2;
    page.p = page.from + (page.to - page.from) * e01;
    page.q = page.fromQ + (page.toQ - page.fromQ) * e01;
    if (k01 >= 1) { page.moving = false; page.endAt = t; }
  }
  // Labels whose spot the parked eye cuts in half are hidden: CONTACT away from the hero's vertical line,
  // the side labels on (or on the way to) Contact
  // (all of them while a case study is open or opening: the eye is gone, so there's no ring to sit on)
  const sideOn = page.target !== 'contact' && page.q < 0.02 && !caseActive();
  const topOn = (page.target === 'hero' || page.target === 'contact') && Math.abs(page.p) < 0.02 && !caseActive();
  setLabelShown(SIDE_LABELS[0], sideOn, t);
  setLabelShown(SIDE_LABELS[1], sideOn, t);
  setLabelShown(SIDE_LABELS[2], topOn, t);
}

export function updateTravel(dt) {
  // The eye travels in step with the page (right edge for About, left edge for Portfolio, bottom edge for Contact),
  // so it stays the same distance from the sliding content the whole way
  // (diving into a case study, it leaves its parking spot for the middle of the screen)
  const tx = page.p * EYE_PARK_X * (1 - state.dive.center), ty = -page.q * EYE_PARK_Y;
  const rh = dt / 2;
  for (let s2 = 0; s2 < 2; s2++) {
    state.vRigX += ((tx - state.rigX) * 170 - state.vRigX * 22) * rh;
    state.rigX += state.vRigX * rh;
    state.vRigY += ((ty - state.rigY) * 170 - state.vRigY * 22) * rh;
    state.rigY += state.vRigY * rh;
  }
  rig.position.x = state.rigX;
  // The rings sit deeper than the eye, so perspective would slide them toward the centre when the eye
  // moves. Scale their offset by depth so they stay perfectly centred on the eye on screen.
  const dz = camBase.z;
  hud.position.x = state.rigX * (dz - hud.position.z) / dz;
  hud.position.y = state.rigY * (dz - hud.position.z) / dz;
  aura.position.x = state.rigX * (dz - aura.position.z) / dz;
  aura.position.y = state.rigY * (dz - aura.position.z) / dz;
  // While it travels the eye braces: ears fold back, lids narrow
  const speed = Math.hypot(state.vRigX, state.vRigY);
  state.travel += (clamp(speed / 3, 0, 1) - state.travel) * Math.min(1, dt * 10);
}
