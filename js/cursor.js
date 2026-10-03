// Custom cursor (mouse and trackpad only): red pixel brackets that live on the grid, lock onto anything
// clickable, charge while firing, and leave a short trail of squares on fast moves. Touch keeps the normal behaviour.
import { stage, camera, reduceMotion, clamp } from './core.js';
import { makeScramble, drawPixelText, pixelTextWidth } from './pixel-font.js';
import { state } from './state.js';
import { page } from './pages.js';
import { grid } from './grid/grid.js';
import { hoveredLabel, labelBounds } from './grid/labels.js';
import { rig } from './eye/eyeball.js';
import { trackRowAt } from './portfolio.js';

const root = document.documentElement;
const fine = window.matchMedia ? window.matchMedia('(pointer: fine)') : null;
const cv = document.createElement('canvas');
cv.className = 'cursor';
cv.setAttribute('aria-hidden', 'true');
stage.appendChild(cv);
const ctx = cv.getContext('2d');

const cur = {
  touch: false, lastDraw: 0, frameMs: 16, slow: false, lastFrame: 0,
  key: '', from: null, to: null, flyStart: -1,   // bracket frame and its fly-out tween
  label: '', labelScr: null,
  fireStart: 0, trail: [], lastCell: null
};
const FLY = 0.09;

// Touch never gets the custom cursor; a mouse or pen brings it back
window.addEventListener('pointermove', function (e) { cur.touch = e.pointerType === 'touch'; }, { passive: true });
window.addEventListener('pointerdown', function (e) { cur.touch = e.pointerType === 'touch'; }, { passive: true });

// Safety net: the native cursor is only hidden while this one is actually drawing.
// If frames stop arriving (an error, a stalled loop) the system cursor comes straight back.
setInterval(function () {
  if (document.visibilityState === 'visible' && performance.now() - cur.lastDraw > 400) {
    root.classList.remove('cursor-on');
    cur.slow = true;   // and stays native until frames are smooth again
    cur.frameMs = Math.max(cur.frameMs, 120);
  }
}, 200);

function active() {
  return fine && fine.matches && !cur.touch && state.hasPointer && state.booted && !cur.slow;
}
// A canvas cursor can only be as smooth as the frame loop. If frames get slow (under about 10 fps)
// hand back to the native cursor, and only take over again once things are smooth, so it never flickers.
function trackFrameRate() {
  const now = performance.now();
  if (cur.lastFrame) cur.frameMs += (Math.min(1000, now - cur.lastFrame) - cur.frameMs) * 0.2;
  cur.lastFrame = now;
  if (!cur.slow && cur.frameMs > 100) cur.slow = true;
  else if (cur.slow && cur.frameMs < 50) cur.slow = false;
}

// ---- Targets, as rects in grid-canvas device pixels ----
function domRect(el) {
  const r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect(), d = grid.dpr;
  return { x: (r.left - sr.left) * d, y: (r.top - sr.top) * d, w: r.width * d, h: r.height * d };
}
const _v = new THREE.Vector3(), _e = new THREE.Vector3();
function toGrid(v) { v.project(camera); return [(v.x + 1) / 2 * grid.w, (1 - v.y) / 2 * grid.h]; }
function eyeRect() {
  const c = toGrid(_v.copy(rig.position));
  const e = toGrid(_e.set(rig.position.x + 1.08, rig.position.y, rig.position.z));
  const r = Math.abs(e[0] - c[0]);
  return { x: c[0] - r, y: c[1] - r, w: 2 * r, h: 2 * r };
}
// Each ear's bounding box in its own pivot space, measured once, then projected every frame
const earBoxes = new Map();
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
function earRect(ear) {
  let box = earBoxes.get(ear);
  if (!box) {
    box = new THREE.Box3();
    ear.pivot.updateMatrixWorld(true);
    _inv.copy(ear.pivot.matrixWorld).invert();
    ear.pivot.traverse(function (o) {
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(_m.multiplyMatrices(_inv, o.matrixWorld)));
    });
    earBoxes.set(ear, box);
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < 8; k++) {
    _v.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).applyMatrix4(ear.pivot.matrixWorld);
    const p = toGrid(_v);
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const two = function (n) { return (n < 10 ? '0' : '') + n; };

// What the pointer is over right now: { key, rect, label } or null
function findTarget() {
  if (state.firing) return null;
  // Text targets already say what they are, so the readout says what clicking does
  if (hoveredLabel) return { key: 'lab:' + hoveredLabel.text, rect: labelBounds(hoveredLabel), label: hoveredLabel.text === 'BACK' ? 'EXIT' : 'OPEN' };
  if (state.overEar) return { key: 'ear' + state.overEar.side, rect: earRect(state.overEar), label: state.overEar.side < 0 ? 'EAR L' : 'EAR R' };
  if (state.overEye) return { key: 'eye', rect: eyeRect(), label: 'EYE' };
  const el = document.elementFromPoint(state.clientX, state.clientY);
  const hit = el && el.closest ? el.closest('[data-click], [data-cursor]') : null;
  if (!hit) return null;
  if (hit.dataset.click && page.target !== 'portfolio') return null;   // the portfolio controls only work on that page
  if (hit.dataset.click === 'track') {
    const row = trackRowAt(state.clientY);
    if (!row) return null;
    const sr = stage.getBoundingClientRect(), d = grid.dpr;
    return { key: 'track' + row.k, rect: { x: (row.x - sr.left) * d, y: (row.y - sr.top) * d, w: row.w * d, h: row.h * d }, label: 'TRACK ' + two(row.k + 1) };
  }
  if (hit.dataset.click === 'card') return { key: 'card' + hit.dataset.k, rect: domRect(hit), label: 'CARD ' + two(+hit.dataset.k + 1) };
  return { key: 'el:' + (hit.id || hit.dataset.click || hit.dataset.cursor), rect: domRect(hit), label: hit.dataset.cursor || '' };
}

// Frame a target: a little breathing room, sized up to whole grid squares, centred on the target
// (snapping the position to the grid too pushed the frame off-centre)
function frameFor(r) {
  const C = grid.cell, pad = C * 0.25;
  const w = Math.ceil((r.w + 2 * pad) / C) * C, h = Math.ceil((r.h + 2 * pad) / C) * C;
  return { x: Math.round(r.x + r.w / 2 - w / 2), y: Math.round(r.y + r.h / 2 - h / 2), w: w, h: h };
}

function brackets(r, u, L, col) {
  const x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, L, u); ctx.fillRect(x, y, u, L);
  ctx.fillRect(x + w - L, y, L, u); ctx.fillRect(x + w - u, y, u, L);
  ctx.fillRect(x, y + h - u, L, u); ctx.fillRect(x, y + h - L, u, L);
  ctx.fillRect(x + w - L, y + h - u, L, u); ctx.fillRect(x + w - u, y + h - L, u, L);
}

export function drawCursor(t) {
  if (cv.width !== grid.w || cv.height !== grid.h) { cv.width = grid.w; cv.height = grid.h; }
  ctx.clearRect(0, 0, cv.width, cv.height);
  trackFrameRate();
  cur.lastDraw = performance.now();   // the loop is alive
  if (!active()) { root.classList.remove('cursor-on'); return; }
  root.classList.add('cursor-on');

  const C = grid.cell, d = grid.dpr;
  const u = Math.max(2, Math.round(1.5 * d));                 // one pixel of the cursor
  const mx = (state.mouse.x + 1) / 2 * grid.w, my = (1 - state.mouse.y) / 2 * grid.h;
  const ci = Math.floor((mx - grid.ox) / C), cj = Math.floor((my - grid.oy) / C);

  // Trail: fast moves leave a few faint squares along the path, gone in a quarter second
  if (!reduceMotion && !state.firing && cur.lastCell) {
    const di = ci - cur.lastCell[0], dj = cj - cur.lastCell[1], n = Math.max(Math.abs(di), Math.abs(dj));
    if (n >= 2) {
      for (let s = 1; s < n && s < 6; s++) cur.trail.push({ i: cur.lastCell[0] + Math.round(di * s / n), j: cur.lastCell[1] + Math.round(dj * s / n), at: t });
      if (cur.trail.length > 8) cur.trail.splice(0, cur.trail.length - 8);
    }
  }
  cur.lastCell = [ci, cj];
  cur.trail = cur.trail.filter(function (p) { return t - p.at < 0.25; });
  cur.trail.forEach(function (p) {
    ctx.globalAlpha = 0.35 * (1 - (t - p.at) / 0.25);
    ctx.fillStyle = '#ff0a1e';
    ctx.fillRect(grid.ox + p.i * C, grid.oy + p.j * C, C, C);
  });
  ctx.globalAlpha = 1;

  // Resting frame: the grid square under the pointer (jumps in whole squares). Locked: the target, snapped out to the grid.
  const tg = findTarget();
  const cell = { x: grid.ox + ci * C, y: grid.oy + cj * C, w: C, h: C };
  const key = tg && tg.rect ? tg.key : 'cell';
  const goal = tg && tg.rect ? frameFor(tg.rect) : cell;
  if (key !== cur.key) {
    // Fly between the old frame and the new one (rest -> lock, lock -> lock, lock -> rest)
    cur.from = cur.to ? cur.to : goal;
    cur.flyStart = (reduceMotion || (key === 'cell' && cur.key === 'cell')) ? -1 : t;
    cur.key = key;
    cur.label = tg && tg.rect ? tg.label : '';
    cur.labelScr = cur.label ? makeScramble(cur.label.length, t) : null;
  }
  cur.to = goal;
  let fr = goal;
  if (cur.flyStart >= 0 && t - cur.flyStart < FLY) {
    const k = (t - cur.flyStart) / FLY, e = 1 - (1 - k) * (1 - k);
    fr = { x: cur.from.x + (goal.x - cur.from.x) * e, y: cur.from.y + (goal.y - cur.from.y) * e,
      w: cur.from.w + (goal.w - cur.from.w) * e, h: cur.from.h + (goal.h - cur.from.h) * e };
  }

  // Charging: holding to fire pulls the brackets in a pixel at a time and fills a 4-segment bar.
  // Inside the eye the first 0.3 s of a hold is a poke, so the bar fills over that window first.
  if (!state.firing) cur.fireStart = t;
  let charge = 0;
  if (state.firing) charge = clamp((t - cur.fireStart) / 0.6, 0, 1);
  else if (state.pointerDown && state.inNoFire) charge = clamp((t - state.pointerDownAt) / 0.3, 0, 1) * 0.75;
  // The frame pops out three pixels when the laser starts, then steps back in onto the square
  const out = state.firing && !reduceMotion ? Math.max(0, 3 - Math.floor((t - cur.fireStart) / 0.05)) * u : 0;
  if (out) fr = { x: fr.x - out, y: fr.y - out, w: fr.w + 2 * out, h: fr.h + 2 * out };
  const L = Math.max(3 * u, Math.round(Math.min(fr.w, fr.h) * 0.3));
  // White-hot while firing so the frame still reads on top of red burns
  brackets(fr, u, Math.min(L, 8 * u), state.firing ? '#ff8f99' : '#ff0a1e');

  if (charge > 0) {
    const segW = 2 * u, gap = u, n = 4;
    const bx = Math.round(fr.x + fr.w / 2 - (n * segW + (n - 1) * gap) / 2), by = Math.round(fr.y + fr.h + 2 * u);
    for (let s = 0; s < n; s++) {
      ctx.globalAlpha = charge * n > s ? 1 : 0.25;
      ctx.fillStyle = '#ff0a1e';
      ctx.fillRect(bx + s * (segW + gap), by, segW, u);
    }
    ctx.globalAlpha = 1;
  }

  // Readout beside a locked target, decoding in
  if (cur.label && cur.key !== 'cell') {
    const px = u;
    const w = pixelTextWidth(cur.label, px);
    let lx = Math.round(fr.x + fr.w + 3 * u), ly = Math.round(fr.y);
    if (lx + w > grid.w - 4 * u) lx = Math.round(fr.x - 3 * u - w);
    if (ly < 2 * u) ly = Math.round(fr.y + fr.h - 7 * px);
    drawPixelText(ctx, cur.label, lx, ly, px, function () { return '#ff0a1e'; }, cur.labelScr, t);
  }

  // The real pointer position, so aiming stays exact
  const dot = Math.max(2, Math.round(2 * d));
  ctx.fillStyle = '#ffd6da';
  ctx.fillRect(Math.round(mx - dot / 2), Math.round(my - dot / 2), dot, dot);
}
