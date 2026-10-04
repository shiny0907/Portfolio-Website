// Case studies. VIEW CASE STUDY dives into the eye: it turns to face you, opens wide, and rushes forward until
// its pupil fills the screen, breaks into grid squares, and the squares dissolve to show the case study.
// BACK reverses it. Inside, the laser is off and the eye is hidden (you're inside it).
// For now every project gets the same shell: its real title, role and description, and COMING SOON sections.
// Fill a project in by giving it a `caseStudy` object in projects.js (keys match CASE_SECTIONS below).
import { reduceMotion, nowSec, clamp, smoothstep } from './core.js';
import { makeScramble, drawPixelText, pixelTextWidth, LABEL_COLOR } from './pixel-font.js';
import { state, beatRings, dive } from './state.js';
import { page } from './pages.js';
import { grid } from './grid/grid.js';
import { PROJECTS } from './projects.js';
import { pfEl, showProject } from './portfolio.js';
import { rig } from './eye/eyeball.js';
import { hud, aura } from './eye/hud.js';

const caseEl = document.getElementById('case');
const inner = document.getElementById('caseInner');
const veil = document.getElementById('caseVeil'), veilCtx = veil.getContext('2d');

const CASE_SECTIONS = [
  ['overview', 'OVERVIEW'], ['problem', 'PROBLEM'], ['process', 'PROCESS'],
  ['decisions', 'KEY DECISIONS'], ['design', 'FINAL DESIGN'], ['learned', 'WHAT I LEARNED']
];
export const slugOf = function (p) { return p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
export function caseIndexOf(slug) {
  for (let k = 0; k < PROJECTS.length; k++) if (slugOf(PROJECTS[k]) === slug) return k;
  return -1;
}

// The dive's shared values live in state.js (dive), so the eye and gaze can read them without importing this module
const IN = { zoom0: 0.35, zoom1: 1.15, pix0: 0.8, cover: 1.15, done: 1.65 };
const OUT = { cover: 0.35, zoom1: 1.1, face0: 0.8, done: 1.3 };
export function caseActive() { return dive.open || dive.dir !== 0; }
// Inside a case study the corner texts are drawn on this overlay (above the 3D machine room) instead of the grid
export function caseOverlay() { return dive.open ? veilCtx : null; }

// ---- Opening and closing ----
export function openCase(k) {
  if (caseActive() || page.target !== 'portfolio' || page.moving) return;
  try { history.pushState({ page: 'case' }, '', '#case/' + slugOf(PROJECTS[k])); dive.pushed = true; } catch (err) { dive.pushed = false; }
  startIn(k);
}
export function closeCase() {
  if (!dive.open || dive.dir !== 0) return;
  if (dive.pushed) { dive.pushed = false; try { history.back(); return; } catch (err) { /* fall through */ } }
  try { history.replaceState(null, '', '#portfolio'); } catch (err) { /* optional */ }
  startOut();
}
// From the address bar or back/forward: #case/<slug> opens (once Portfolio is up); anything else closes
export function routeCase(hash) {
  dive.pushed = false;
  const m = /^case\/(.+)$/.exec(hash);
  if (m) {
    const k = caseIndexOf(m[1]);
    if (k < 0) return false;
    if (dive.open && dive.dir === 0 && k !== dive.idx) swapTo(k);
    else if (!dive.open) dive.pending = k;
    return true;
  }
  if (dive.open && dive.dir === 0) startOut();
  dive.pending = -1;
  return false;
}
function startIn(k) {
  dive.idx = k;
  dive.dir = 1;
  dive.start = nowSec();
  dive.returnFocus = document.activeElement;
  if (!reduceMotion) beatRings.forEach(function (r) { r.target += Math.sign(r.step) * Math.PI; });
}
function startOut() {
  dive.dir = -1;
  dive.start = nowSec();
  if (!reduceMotion) beatRings.forEach(function (r) { r.target -= Math.sign(r.step) * Math.PI; });
}
function swapTo(k) {
  dive.dir = 2;
  dive.start = nowSec();
  dive.swapTo = k;
  try { history.replaceState({ page: 'case' }, '', '#case/' + slugOf(PROJECTS[k])); } catch (err) { /* optional */ }
}

// ---- The page ----
const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
let titleCv = null, heads = [], titleScr = null, built = -1;
function build(k, t) {
  const p = PROJECTS[k], cs = p.caseStudy || {};
  const next = PROJECTS[(k + 1) % PROJECTS.length];
  const two = function (n) { return (n < 10 ? '0' : '') + n; };
  const meta = [['ROLE', p.role], p.year ? ['WHEN', p.year] : null, ['FOCUS', p.tags.join(' / ')]].filter(Boolean);
  const body = function (key) {
    const v = key === 'overview' ? (cs.overview || p.desc) : cs[key];
    if (!v) return '<div class="case-soon"><span>COMING SOON</span><i></i><i></i><i></i></div>';
    return (Array.isArray(v) ? v : [v]).map(function (para) { return '<p>' + esc(para) + '</p>'; }).join('');
  };
  inner.innerHTML =
    '<header class="case-head">' +
      '<button class="pf-case case-back" type="button" data-nofire data-cursor="EXIT">BACK TO PORTFOLIO</button>' +
      '<p class="case-count">CASE STUDY ' + two(k + 1) + ' / ' + two(PROJECTS.length) + '</p>' +
      '<canvas class="case-title" aria-hidden="true"></canvas>' +
      '<h2 class="sr-only">' + esc(p.title) + ' case study</h2>' +
      '<dl class="case-meta">' + meta.map(function (m) { return '<div><dt>' + m[0] + '</dt><dd>' + esc(m[1]) + '</dd></div>'; }).join('') + '</dl>' +
    '</header>' +
    '<figure class="case-cover"><img src="' + p.cover + '" alt="' + esc(p.title) + ' design, top of the page"></figure>' +
    CASE_SECTIONS.map(function (s) {
      return '<section class="case-section"><canvas class="case-h" data-text="' + s[1] + '" aria-hidden="true"></canvas>' +
        '<h3 class="sr-only">' + s[1].toLowerCase() + '</h3>' + body(s[0]) + '</section>';
    }).join('') +
    '<footer class="case-foot">' +
      '<button class="pf-case case-back" type="button" data-nofire data-cursor="EXIT">BACK TO PORTFOLIO</button>' +
      '<button class="pf-case case-next" type="button" data-nofire data-cursor="NEXT">NEXT: ' + esc(next.title) + '</button>' +
    '</footer>';
  inner.querySelectorAll('.case-back').forEach(function (b) { b.addEventListener('click', closeCase); });
  inner.querySelector('.case-next').addEventListener('click', function () {
    if (dive.open && dive.dir === 0) {
      const nk = (dive.idx + 1) % PROJECTS.length;
      try { history.replaceState({ page: 'case' }, '', '#case/' + slugOf(PROJECTS[nk])); } catch (err) { /* optional */ }
      dive.dir = 2; dive.start = nowSec(); dive.swapTo = nk;
    }
  });
  titleCv = inner.querySelector('.case-title');
  heads = Array.prototype.map.call(inner.querySelectorAll('.case-h'), function (cv) {
    return { cv: cv, text: cv.dataset.text, scr: makeScramble(cv.dataset.text.length, t + 0.3), drawn: false };
  });
  titleScr = makeScramble(p.title.length, t);
  built = k;
  caseEl.scrollTop = 0;
}
function fit(cv, W, H) {
  const d = grid.dpr || 1;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; cv.style.width = (W / d) + 'px'; cv.style.height = (H / d) + 'px'; return true; }
  return false;
}
function drawPage(t) {
  if (built < 0) return;
  const d = grid.dpr || 1, p = PROJECTS[built];
  // The title as big as fits, up to 7 px per pixel
  const avail = Math.max(100, inner.clientWidth - 2) * d;
  const px = clamp(Math.floor(avail / pixelTextWidth(p.title, 1)), Math.round(2 * d), Math.round(7 * d));
  fit(titleCv, pixelTextWidth(p.title, px), 7 * px);
  const g = titleCv.getContext('2d');
  g.clearRect(0, 0, titleCv.width, titleCv.height);
  drawPixelText(g, p.title, 0, 0, px, function () { return LABEL_COLOR; }, titleScr, t);
  heads.forEach(function (h) {
    const hp = Math.max(1, Math.round(2 * d));
    const resized = fit(h.cv, pixelTextWidth(h.text, hp), 7 * hp);
    const busy = h.scr.some(function (c) { return t < c.end; });
    if (h.drawn && !busy && !resized) return;
    const hg = h.cv.getContext('2d');
    hg.clearRect(0, 0, h.cv.width, h.cv.height);
    drawPixelText(hg, h.text, 0, 0, hp, function () { return '#ff0a1e'; }, h.scr, t);
    h.drawn = !busy;
  });
}

// ---- The veil: the pupil itself. Covering the screen it's black with a red core square in the middle; it
// dilates open from the centre as a circle snapped to the grid, a single red iris ring on its edge, and the
// case study shows through. Coming out it constricts back down the same way. ----
function drawVeil(amount) {
  const W = grid.w, H = grid.h;
  if (veil.width !== W || veil.height !== H) { veil.width = W; veil.height = H; }
  veilCtx.clearRect(0, 0, W, H);
  if (amount <= 0) return;
  const C = grid.cell;
  const i0 = Math.floor(-grid.ox / C) - 1, i1 = Math.ceil((W - grid.ox) / C);
  const j0 = Math.floor(-grid.oy / C) - 1, j1 = Math.ceil((H - grid.oy) / C);
  const cx = (W / 2 - grid.ox) / C, cy = (H / 2 - grid.oy) / C;
  const f = 1 - amount, open = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
  const R = open * (Math.hypot(W, H) / 2 / C + 3);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i + 0.5 - cx, j + 0.5 - cy);
      if (d < R) continue;
      const x = grid.ox + i * C, y = grid.oy + j * C;
      veilCtx.fillStyle = '#090c0f';
      veilCtx.fillRect(x, y, C, C);
      // The iris ring: one red square deep, with a faint second row behind it
      if (d < R + 1) { veilCtx.fillStyle = '#ff0a1e'; veilCtx.fillRect(x, y, C, C); }
      else if (d < R + 2) { veilCtx.globalAlpha = 0.28; veilCtx.fillStyle = '#ff0a1e'; veilCtx.fillRect(x, y, C, C); veilCtx.globalAlpha = 1; }
    }
  }
}

// ---- Per frame ----
const easeIn = function (x) { return x * x * x; };
const easeOut = function (x) { return 1 - Math.pow(1 - x, 3); };
const easeInOut = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const PIX = [0.17, 0.25, 0.36, 0.5, 0.75, 1];   // the pupil breaking into grid squares, smallest first
export function updateCase(t) {
  // A #case/ link (or back/forward to one) opens once Portfolio has arrived, with that project centred
  if (dive.pending >= 0 && page.target === 'portfolio' && !page.moving && dive.dir === 0 && !dive.open && state.booted) {
    showProject(dive.pending);
    startIn(dive.pending);
    dive.pending = -1;
  }
  const e = t - dive.start;
  let veilAmt = 0;
  if (dive.dir === 1) {
    if (built !== dive.idx) build(dive.idx, t);
    const rm = reduceMotion;
    dive.face = rm ? 1 : smoothstep(0, 0.5, e);
    dive.center = rm ? 1 : easeOut(clamp(e / 0.6, 0, 1));
    dive.wide = dive.face;
    dive.z = rm ? 0 : easeIn(clamp((e - IN.zoom0) / (IN.zoom1 - IN.zoom0), 0, 1));
    // (only until the pupil covers the screen: the machine room inside is drawn sharp)
    dive.pix = rm || e < IN.pix0 || e >= IN.cover ? 0 : PIX[Math.min(PIX.length - 1, Math.floor((e - IN.pix0) / ((IN.cover - IN.pix0) / PIX.length)))];
    const cover = rm ? 0 : IN.cover;
    dive.hidden = e >= cover;
    dive.fade = dive.face;
    veilAmt = e < cover ? 0 : 1 - clamp((e - cover) / (IN.done - IN.cover), 0, 1);
    if (e >= cover && !dive.open) {
      dive.open = true;
      dive.titleAt = t;
      titleScr = makeScramble(PROJECTS[dive.idx].title.length, t);
      heads.forEach(function (h) { h.scr = makeScramble(h.text.length, t + 0.3); h.drawn = false; });
      const back = inner.querySelector('.case-back');
      if (back) try { back.focus({ preventScroll: true }); } catch (err) { /* focus is a nicety */ }
    }
    if (e >= (rm ? 0.3 : IN.done)) { dive.dir = 0; dive.pix = 0; veilAmt = 0; }
  } else if (dive.dir === -1) {
    const rm = reduceMotion;
    const cover = rm ? 0.15 : OUT.cover;
    veilAmt = e < cover ? clamp(e / cover, 0, 1) : 1 - clamp((e - cover) / 0.25, 0, 1);
    if (e >= cover && dive.open) dive.open = false;
    dive.hidden = e < cover;
    // Pulls back slowly at first, so the pupil still fills the screen as the veil lets go, then speeds away
    dive.z = rm ? 0 : e < cover ? 1 : 1 - easeInOut(clamp((e - cover) / (OUT.zoom1 - cover), 0, 1));
    dive.pix = rm || e < cover ? 0 : PIX[Math.max(0, PIX.length - 1 - Math.floor((e - cover) / 0.06))];
    if (e - cover > 0.06 * PIX.length) dive.pix = 0;
    dive.face = rm ? 0 : 1 - smoothstep(OUT.face0, OUT.done, e);
    dive.center = dive.face;
    dive.wide = rm ? 0 : 1 - smoothstep(cover, OUT.zoom1, e);
    dive.fade = rm ? 0 : 1 - smoothstep(OUT.zoom1 - 0.2, OUT.done, e);
    if (e >= (rm ? 0.4 : OUT.done)) {
      dive.dir = 0; dive.face = dive.center = dive.wide = dive.z = dive.pix = dive.fade = 0; veilAmt = 0;
      const f = dive.returnFocus || pfEl.querySelector('.pf-case');
      if (f && f.focus) try { f.focus({ preventScroll: true }); } catch (err) { /* nicety */ }
    }
  } else if (dive.dir === 2) {
    // Next project: the veil closes, the page swaps, the veil opens
    veilAmt = e < 0.25 ? e / 0.25 : 1 - clamp((e - 0.25) / 0.4, 0, 1);
    if (e >= 0.25 && built !== dive.swapTo) { dive.idx = dive.swapTo; build(dive.idx, t); showProject(dive.idx); }
    if (e >= 0.65) { dive.dir = 0; veilAmt = 0; }
  }
  if (dive.dir === 0 && !dive.open) dive.hidden = false;

  // Apply: the case page, the portfolio behind it, the eye and its rings
  caseEl.style.visibility = dive.open ? 'visible' : 'hidden';
  caseEl.setAttribute('aria-hidden', dive.open ? 'false' : 'true');
  pfEl.style.opacity = (1 - dive.fade).toFixed(3);
  pfEl.style.pointerEvents = dive.fade > 0.5 ? 'none' : '';
  rig.visible = hud.visible = aura.visible = !dive.hidden;
  if (dive.open) drawPage(t);
  drawVeil(reduceMotion ? 0 : veilAmt);
}
