import { stage, reduceMotion, nowSec, clamp, lerp, camBase } from './core.js';
import { makeScramble, drawPixelText, pixelTextWidth, LABEL_COLOR } from './pixel-font.js';
import { state } from './state.js';
import { page } from './pages.js';
import { grid } from './grid/grid.js';
import { labelGeo, LABEL_Z } from './grid/labels.js';
import { EYE_PARK_X } from './layout.js';
import { PROJECTS } from './projects.js';
import { glanceAt } from './gaze.js';

export const pfEl = document.getElementById('pf');

// ---------- Portfolio page: a looping vertical carousel, details that decode, and a position track ----------
const PN = PROJECTS.length;
const pfCarousel = document.getElementById('pfCarousel');
const pfInner = pfEl.querySelector('.pf-inner');
const pfTitle = document.getElementById('pfTitle'), pfTitleCtx = pfTitle.getContext('2d');
const pfTrack = document.getElementById('pfTrack'), pfTrackCv = document.getElementById('pfTrackCv'), pfTrackCtx = pfTrackCv.getContext('2d');
const car = { pos: 0, vel: 0, target: 0, cur: -1, acc: 0, last: 0, h0: 200, w0: 320, titleScr: null, titleText: '' };
const pfCards = PROJECTS.map(function (pr, k) {
  const el = document.createElement('div');
  el.className = 'pf-card';
  el.dataset.click = 'card';
  el.dataset.k = k;
  el.setAttribute('aria-hidden', 'true');
  const cv = document.createElement('canvas');
  el.appendChild(cv);
  pfCarousel.appendChild(el);
  return { el: el, cv: cv };
});
// Card art: the project's cover image cropped to fill the card, with red corner brackets
PROJECTS.forEach(function (pr, k) {
  pr.img = new Image();
  pr.img.onload = function () { if (car.w0) drawCardArt(k); };
  pr.img.src = pr.cover;
});
function drawCardArt(k) {
  const c = pfCards[k], dpr = grid.dpr, pr = PROJECTS[k];
  const W = Math.round(car.w0 * dpr), H = Math.round(car.h0 * dpr);
  c.art = c.art || document.createElement('canvas');
  c.art.width = W; c.art.height = H;
  c.shown = -1;   // force the visible canvas to refresh
  const g = c.art.getContext('2d');
  g.fillStyle = '#0d1115'; g.fillRect(0, 0, W, H);
  if (pr.img && pr.img.complete && pr.img.naturalWidth) {
    // Always show the design's full width (like a browser window), trimming only below the fold
    const ia = pr.img.naturalWidth / pr.img.naturalHeight, ra = W / H;
    let sx = 0, sy = 0, sw = pr.img.naturalWidth, sh = pr.img.naturalHeight;
    if (ra >= ia) { sh = sw / ra; } else { sw = sh * ra; sx = (pr.img.naturalWidth - sw) / 2; }
    g.imageSmoothingQuality = 'high';
    g.drawImage(pr.img, sx, sy, sw, sh, 0, 0, W, H);
  }
  const b = Math.max(2, Math.round(2.5 * dpr)), L = b * 6;
  g.fillStyle = '#ff0a1e';
  g.fillRect(0, 0, L, b); g.fillRect(0, 0, b, L);
  g.fillRect(W - L, 0, L, b); g.fillRect(W - b, 0, b, L);
  g.fillRect(0, H - b, L, b); g.fillRect(0, H - L, b, L);
  g.fillRect(W - L, H - b, L, b); g.fillRect(W - b, H - L, b, L);
}
// Copy a card's art to its visible canvas at a given pixel size (1 = full detail)
const CARD_PIX = [26, 18, 12, 8, 5, 3];
function showCard(c, px) {
  if (c.shown === px || !c.art) return;
  c.shown = px;
  const W = c.art.width, H = c.art.height;
  const w = Math.max(1, Math.ceil(W / px)), h = Math.max(1, Math.ceil(H / px));
  c.cv.width = w; c.cv.height = h;
  c.cv.style.imageRendering = px > 1 ? 'pixelated' : 'auto';
  const g = c.cv.getContext('2d');
  g.imageSmoothingEnabled = true;
  g.drawImage(c.art, 0, 0, w, h);
}
export function layoutPortfolio() {
  const w = stage.clientWidth || window.innerWidth;
  const ppuCss = labelGeo.ppu / grid.dpr;
  const left = labelGeo.cx0 / grid.dpr + (-EYE_PARK_X * (camBase.z - LABEL_Z) / camBase.z + 2.75) * ppuCss;
  const narrow = w - left < w * 0.58;
  pfEl.classList.toggle('is-narrow', narrow);
  pfEl.style.setProperty('--pf-left', Math.max(0, left) + 'px');
  // Card size: the centre card takes about a quarter of the carousel's height
  const cw = pfCarousel.clientWidth || 400, ch = pfCarousel.clientHeight || 600;
  // Wider cards on wide carousels, and the centre card grows with the screen
  const ar = cw / ch > 1.15 ? 1.78 : 1.6;
  car.h0 = Math.max(110, Math.min(ch * 0.46, cw * 0.94 / ar));
  car.w0 = car.h0 * ar;
  pfCards.forEach(function (c, k) {
    c.el.style.width = car.w0 + 'px';
    c.el.style.height = car.h0 + 'px';
    drawCardArt(k);
  });
  car.titleText = '';   // force the title to redraw at the new size
}
const interpAt = function (a, arr) {
  const i = Math.min(arr.length - 2, Math.floor(a));
  return lerp(arr[i], arr[Math.min(arr.length - 1, i + 1)], Math.min(1, a - i));
};
function pfEnter(t) {
  positionCards();
  pfCards.forEach(function (c) { showCard(c, 1); });
  const cur = ((Math.round(car.pos) % PN) + PN) % PN;
  car.enterAt = 0;
  car.cur = cur;
  pfSetDetails(cur, t);
  car.titleScr = null;
  drawTrack(t);
  drawPfTitle(t);
}
function pfSetDetails(k, t) {
  const pr = PROJECTS[k];
  const n = (k + 1 < 10 ? '0' : '') + (k + 1), tot = (PN < 10 ? '0' : '') + PN;
  document.getElementById('pfCount').innerHTML = '<b>' + n + '</b> / ' + tot;
  document.getElementById('pfTitleText').textContent = pr.title;
  document.getElementById('pfMeta').textContent = pr.year ? pr.role + ', ' + pr.year : pr.role;
  document.getElementById('pfDesc').textContent = pr.desc;
  document.getElementById('pfTags').innerHTML = pr.tags.map(function (tg) { return '<span>' + tg + '</span>'; }).join('');
  document.getElementById('pfNote').textContent = '';
  car.titleScr = makeScramble(pr.title.length, Math.max(t, car.enterAt || 0));
  car.titleText = pr.title;
  pfCards.forEach(function (c, i) { c.el.classList.toggle('is-current', i === k); });
}
// Every title shares one pixel size, sized so the longest one still fits the details column
const pfDetails = pfTitle.parentElement;
const pfTitleUnits = Math.max.apply(null, PROJECTS.map(function (p) { return pixelTextWidth(p.title, 1); }));
function drawPfTitle(t) {
  if (!car.titleText) return;
  const vw = stage.clientWidth || window.innerWidth;
  const dpr = grid.dpr;
  const fitD = Math.floor(pfDetails.clientWidth * dpr / pfTitleUnits);
  const pxD = Math.max(2, Math.min(Math.round((vw >= 1700 ? 6 : vw >= 1300 ? 5 : 4) * dpr), fitD));
  const W = pixelTextWidth(car.titleText, pxD), H = 7 * pxD;
  if (pfTitle.width !== W || pfTitle.height !== H) {
    pfTitle.width = W; pfTitle.height = H;
    pfTitle.style.width = (W / dpr) + 'px'; pfTitle.style.height = (H / dpr) + 'px';
  }
  pfTitleCtx.clearRect(0, 0, W, H);
  drawPixelText(pfTitleCtx, car.titleText, 0, 0, pxD, function () { return LABEL_COLOR; }, car.titleScr, t);
}
function pfStep(dir) {
  if (page.target !== 'portfolio') return;
  car.target += dir;
}
export function pfClick(el) {
  if (el.dataset.click === 'track') {
    const k = trackIndexAt(state.clientY);
    let o = k - car.target;
    o = ((o % PN) + PN) % PN; if (o > PN / 2) o -= PN;
    car.target += o;
    return;
  }
  if (el.dataset.click === 'card') {
    const k = +el.dataset.k;
    let o = k - car.target;
    o = ((o % PN) + PN) % PN; if (o > PN / 2) o -= PN;
    if (o !== 0) { car.target += o; return; }
  }
  // Centre card or the button: case studies come later
  const t = nowSec();
  car.titleScr = makeScramble(car.titleText.length, t);
  document.getElementById('pfNote').textContent = 'CASE STUDY COMING SOON';
}
// Scroll wheel / trackpad moves one project per notch, with a short cooldown so trackpads don't race
window.addEventListener('wheel', function (e) {
  if (page.target !== 'portfolio') return;
  e.preventDefault();
  car.acc += e.deltaY;
  const now = performance.now();
  if (Math.abs(car.acc) > 40 && now - car.last > 220) {
    pfStep(Math.sign(car.acc));
    car.acc = 0;
    car.last = now;
  }
}, { passive: false });
window.addEventListener('keydown', function (e) {
  if (page.target !== 'portfolio') return;
  if (e.key === 'ArrowDown' || e.key === 'PageDown') { pfStep(1); e.preventDefault(); }
  if (e.key === 'ArrowUp' || e.key === 'PageUp') { pfStep(-1); e.preventDefault(); }
});
export function updatePortfolio(t, dt) {
  const vis = page.p < -0.001;
  pfEl.style.visibility = vis ? 'visible' : 'hidden';
  if (!vis) return;
  // Rides the tear the same way, mirrored
  pfEl.style.transform = 'translateX(' + ((1 + page.p) * (stage.clientWidth || window.innerWidth)).toFixed(1) + 'px)';
  // Carousel spring
  const h = dt / 2;
  for (let s2 = 0; s2 < 2; s2++) {
    car.vel += ((car.target - car.pos) * 140 - car.vel * 22) * h;
    car.pos += car.vel * h;
  }
  positionCards();
  pfCards.forEach(function (c) { showCard(c, 1); });
  const cur = ((Math.round(car.pos) % PN) + PN) % PN;
  if (cur !== car.cur) {
    // A new project lands in the centre: the eye glances over to present it (not while the page is still arriving)
    if (car.cur >= 0 && !page.moving && page.target === 'portfolio') {
      const p = centerCardPoint();
      if (p) glanceAt(p, 0.8);
    }
    car.cur = cur;
    pfSetDetails(cur, t);
  }
  drawTrack(t);
  drawPfTitle(t);
}

// ---- Position track: a HUD-style gauge (numbered ticks, a scanning highlight, and a red pointer) ----
const trackState = { lastFrac: null, glitchUntil: 0 };
function trackY(k, top, span) { return top + (k + 0.5) / PN * span; }
function drawTrack(t) {
  const dpr = grid.dpr;
  const W = Math.round(pfTrackCv.clientWidth * dpr), H = Math.round(pfTrackCv.clientHeight * dpr);
  if (!W || !H) return;
  if (pfTrackCv.width !== W) pfTrackCv.width = W;
  if (pfTrackCv.height !== H) pfTrackCv.height = H;
  const g = pfTrackCtx;
  g.clearRect(0, 0, W, H);
  const u = Math.max(1, Math.round(dpr));            // one hairline
  const px = Math.max(1, Math.round(2 * dpr));       // pixel-font size
  const top = 4 * px, span = H - 8 * px;
  // Center the gauge by its real width (arrow 9px left of the rail, numbers end 14px right of it);
  // px rounds up on some scalings (dpr 1.25 -> 3), so a fixed midpoint would clip the numbers
  const railX = Math.round((W - 23 * px) / 2) + 9 * px;
  const frac = ((car.pos % PN) + PN) % PN;
  // When the loop wraps the pointer jumps; make the jump a glitch instead of a slide
  if (trackState.lastFrac !== null && Math.abs(frac - trackState.lastFrac) > PN / 2) trackState.glitchUntil = t + 0.2;
  trackState.lastFrac = frac;
  const my = top + ((frac + 0.5) % PN) / PN * span;
  const reach = span / PN * 0.9;
  // Rail
  g.fillStyle = 'rgba(201,212,222,0.16)';
  g.fillRect(railX, top - 2 * px, u, span + 4 * px);
  // Ticks: a major tick at each project, three minor ticks between, brightening near the pointer
  for (let i = -2; i < PN * 4 + 2; i++) {
    const y = top + (i / 4 + 0.5) / PN * span;
    if (y < top - px || y > top + span + px) continue;
    const major = ((i % 4) + 4) % 4 === 0;
    const b = clamp(1 - Math.abs(y - my) / reach, 0, 1);
    g.fillStyle = 'rgba(201,212,222,' + ((major ? 0.35 : 0.14) + (major ? 0.65 : 0.5) * b).toFixed(3) + ')';
    const len = (major ? 5 : 2.5) * px + Math.round(b * 2 * px);
    g.fillRect(railX - len, Math.round(y), len, u);
  }
  // Project numbers on the right of the rail
  for (let k = 0; k < PN; k++) {
    const y = Math.round(trackY(k, top, span));
    const b = clamp(1 - Math.abs(y - my) / reach, 0, 1);
    const label = (k + 1 < 10 ? '0' : '') + (k + 1);
    g.globalAlpha = k === car.cur ? 1 : 0.3 + 0.7 * b;
    drawPixelText(g, label, railX + 3 * px, y - Math.round(3.5 * px), px, function () {
      return k === car.cur ? '#ff0a1e' : LABEL_COLOR;
    });
  }
  g.globalAlpha = 1;
  // Pointer: a red pixel arrow on the left, and a hairline across the rail
  const glitch = t < trackState.glitchUntil && !reduceMotion;
  const jy = Math.round(my + (glitch ? (Math.random() - 0.5) * 6 * px : 0));
  if (!glitch || Math.random() > 0.3) {
    g.fillStyle = '#ff0a1e';
    const ax = railX - 9 * px;
    for (let r = 0; r < 4; r++) g.fillRect(ax + r * px, jy - (3 - r) * px, px, (3 - r) * 2 * px + px);
    g.fillRect(ax + 4 * px, jy, railX - ax - 4 * px + 2 * px, u);
  }
}
// Centre slot of the carousel in CSS pixels, where the current card sits
export function centerCardPoint() {
  if (page.p > -0.5) return null;
  const r = pfCarousel.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: car.w0, h: car.h0 };
}
// The numbered row of the track under a client point, as a CSS-pixel rect (for the cursor's target lock)
export function trackRowAt(clientY) {
  const r = pfTrackCv.getBoundingClientRect();
  if (!r.height) return null;
  const k = trackIndexAt(clientY);
  const px = Math.max(1, Math.round(2 * grid.dpr)) / grid.dpr;
  const top = 4 * px, span = r.height - 8 * px;
  const y = r.top + top + (k + 0.5) / PN * span;
  return { k: k, x: r.left, y: y - 6 * px, w: r.width, h: 12 * px };
}
function trackIndexAt(clientY) {
  const r = pfTrackCv.getBoundingClientRect();
  const px = Math.max(1, Math.round(2 * grid.dpr)) / grid.dpr;
  const top = 4 * px, span = r.height - 8 * px;
  return clamp(Math.floor(((clientY - r.top - top) / span) * PN), 0, PN - 1);
}
function positionCards() {
  for (let k = 0; k < PN; k++) {
    let o = k - car.pos;
    o = ((o % PN) + PN) % PN; if (o > PN / 2) o -= PN;
    const a = Math.abs(o);
    const sc = interpAt(a, [1, 0.76, 0.58, 0.44]);
    const gy = interpAt(a, [0, 0.93, 1.62, 2.15]) * car.h0 * Math.sign(o);
    const op = interpAt(a, [1, 0.55, 0.28, 0]);
    const el = pfCards[k].el;
    el.style.transform = 'translate(-50%, -50%) translateY(' + gy.toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')';
    el.style.opacity = op.toFixed(3);
    el.style.zIndex = String(10 - Math.round(a * 2));
    el.style.pointerEvents = op < 0.1 ? 'none' : '';
  }
}
