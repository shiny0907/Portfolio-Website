// Custom cursor (mouse and trackpad only): red pixel brackets that live on the grid, lock onto anything
// clickable, charge while firing, and leave a short trail of squares on fast moves. Touch keeps the normal behaviour.
import { stage, camera, reduceMotion, clamp } from './core.js';
import { makeScramble, drawPixelText, pixelTextWidth, LABEL_COLOR } from './pixel-font.js';
import { state } from './state.js';
import { page } from './pages.js';
import { grid } from './grid/grid.js';
import { hoveredLabel, labelBounds, labelPx } from './grid/labels.js';
import { rig } from './eye/eyeball.js';
import { trackRowAt } from './portfolio.js';
import { POKE_MAX } from './input.js';
import { catAt } from './cats.js';
import { CLOCK_APPEAR } from './grid/corners.js';

const root = document.documentElement;
const fine = window.matchMedia ? window.matchMedia('(pointer: fine)') : null;
const cv = document.createElement('canvas');
cv.className = 'cursor';
cv.setAttribute('aria-hidden', 'true');
stage.appendChild(cv);
const ctx = cv.getContext('2d');

const cur = {
  touch: false, lastDraw: 0, lastT: 0, lastTg: null, lastTgAt: -1, frameMs: 16, slow: false, lastFrame: 0,
  key: '', from: null, to: null, flyStart: -1,   // bracket frame and its fly-out tween
  label: '', labelScr: null, scrText: '',
  fireStart: 0, trail: [], lastCell: null
};
const FLY = 0.09;

// Touch never gets the custom cursor; a mouse or pen brings it back
window.addEventListener('pointermove', function (e) { cur.touch = e.pointerType === 'touch'; }, { passive: true });
window.addEventListener('pointerdown', function (e) { cur.touch = e.pointerType === 'touch'; }, { passive: true });
window.addEventListener('pointerover', function (e) { cur.touch = e.pointerType === 'touch'; }, { passive: true });
if (window.__ptr) cur.touch = window.__ptr.pointerType === 'touch';

// Safety net: the native cursor is only hidden while this one is actually drawing.
// If frames stop arriving (an error, a stalled loop) the system cursor comes straight back.
setInterval(function () {
  if (document.visibilityState === 'visible' && performance.now() - cur.lastDraw > 400) {
    root.classList.remove('cursor-on');
    cur.slow = true;   // and stays native until frames are smooth again
    cur.frameMs = Math.max(cur.frameMs, 120);
  }
}, 200);

// Mouse and trackpad only. Once the pointer has been seen, the cursor stays drawn where it was last, even
// after the pointer leaves the window or the window loses focus. (Browsers don't say where the pointer is
// until it first moves, so until then only the coordinate readout shows, with dashes.)
function mouseDevice() { return fine && fine.matches && !cur.touch; }
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
// Each ear's outline: a sample of its real vertices in its own pivot space, measured once, then projected
// every frame. (A box around the tilted triangle left a lot of empty frame.)
const earPoints = new Map();
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
function earRect(ear) {
  let pts = earPoints.get(ear);
  if (!pts) {
    pts = [];
    ear.pivot.updateMatrixWorld(true);
    _inv.copy(ear.pivot.matrixWorld).invert();
    ear.pivot.traverse(function (o) {
      if (!o.geometry || !o.geometry.attributes.position || !o.visible) return;
      if (o.material && o.material.transparent && o.material.opacity < 0.2) return;   // faint glows don't count
      const pos = o.geometry.attributes.position;
      _m.multiplyMatrices(_inv, o.matrixWorld);
      const step = Math.max(1, Math.floor(pos.count / 40));
      for (let k = 0; k < pos.count; k += step) pts.push(new THREE.Vector3().fromBufferAttribute(pos, k).applyMatrix4(_m));
    });
    earPoints.set(ear, pts);
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let k = 0; k < pts.length; k++) {
    const p = toGrid(_v.copy(pts[k]).applyMatrix4(ear.pivot.matrixWorld));
    x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const two = function (n) { return (n < 10 ? '0' : '') + n; };

// What the pointer is over right now: { key, rect, label } or null
function findTarget() {
  if (state.firing) return null;
  // Text targets already say what they are, so the readout says what clicking does
  if (hoveredLabel) return { key: 'lab:' + hoveredLabel.text, rect: labelBounds(hoveredLabel), side: true, label: hoveredLabel.text === 'BACK' ? 'EXIT' : 'OPEN' };
  if (state.overEar) return { key: 'ear' + state.overEar.side, rect: earRect(state.overEar), tight: true, label: state.overEar.side < 0 ? 'EAR L' : 'EAR R' };
  if (state.overEye) return { key: 'eye', rect: eyeRect(), label: 'EYE' };
  // Contact page cats: a target lock with the cat's name (shooting them is the point)
  if (page.target === 'contact') { const cat = catAt(state.clientX, state.clientY); if (cat) return cat; }
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

// Frame a target, centred on it, with the same gap on every side (rounding frames up to whole grid squares
// left uneven gaps). The side labels (one letter wide) get half a square, the ears (traced from their outline)
// a quarter, everything else 0.35 of a square.
function frameFor(r, side, tight) {
  const p = Math.round(grid.cell * (side ? 0.5 : tight ? 0.25 : 0.35));
  return { x: Math.round(r.x - p), y: Math.round(r.y - p), w: Math.round(r.w + 2 * p), h: Math.round(r.h + 2 * p) };
}

function brackets(r, u, L, col) {
  const x = Math.round(r.x), y = Math.round(r.y), w = Math.round(r.w), h = Math.round(r.h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, L, u); ctx.fillRect(x, y, u, L);
  ctx.fillRect(x + w - L, y, L, u); ctx.fillRect(x + w - u, y, u, L);
  ctx.fillRect(x, y + h - u, L, u); ctx.fillRect(x, y + h - L, u, L);
  ctx.fillRect(x + w - L, y + h - u, L, u); ctx.fillRect(x + w - u, y + h - L, u, L);
}

// Bottom-right corner: which grid square the red frame is on, counted from the centre square of the site (0, 0).
// Y counts up, like a graph. Locked onto a target, it reads the target's centre square.
// It decodes in with the other corner texts, never during the loading screen.
let coordScr = null, coordsOn = false;
function drawCoords(fr, t) {
  if (!coordsOn || t < CLOCK_APPEAR) return;
  const C = grid.cell, cpx = labelPx;
  const fmt = function (n) { const a = Math.abs(n); return (n < 0 ? '-' : '+') + (a < 10 ? '0' : '') + a; };
  let str = 'X ---  Y ---';   // pointer not seen yet
  if (fr) {
    const ci = Math.floor((fr.x + fr.w / 2 - grid.ox) / C), cj = Math.floor((fr.y + fr.h / 2 - grid.oy) / C);
    str = 'X ' + fmt(ci) + '  Y ' + fmt(-cj);
  }
  if (!coordScr || coordScr.length !== str.length) coordScr = makeScramble(str.length, coordScr ? t : CLOCK_APPEAR);
  const margin = Math.round(clamp(grid.w / grid.dpr * 0.03, 16, 48) * grid.dpr);   // same as the top corners
  // Inside a case study it sits over the machine room: a thin dark halo keeps it readable
  if (state.dive.open) { ctx.shadowColor = 'rgba(5, 7, 10, 0.95)'; ctx.shadowBlur = Math.round(4 * grid.dpr); }
  drawPixelText(ctx, str, grid.w - margin - pixelTextWidth(str, cpx), grid.h - margin - 7 * cpx, cpx, function (k) {
    return str[k] === 'X' || str[k] === 'Y' ? LABEL_COLOR : '#ff0a1e';
  }, coordScr, t);
  ctx.shadowBlur = 0;
}

export function drawCursor(t, loading) {
  coordsOn = !loading;
  if (cv.width !== grid.w || cv.height !== grid.h) { cv.width = grid.w; cv.height = grid.h; }
  ctx.clearRect(0, 0, cv.width, cv.height);
  trackFrameRate();
  // The scene clock restarts when the loading screen hands over; drop anything timed on the old clock
  if (t < cur.lastT - 0.05) { cur.flyStart = -1; cur.trail = []; cur.scrText = ''; cur.labelScr = null; coordScr = null; }
  cur.lastT = t;
  cur.lastDraw = performance.now();   // the loop is alive
  if (!mouseDevice()) { root.classList.remove('cursor-on'); return; }
  if (state.hasPointer) cur.seen = true;
  if (!cur.seen) { root.classList.remove('cursor-on'); drawCoords(null, t); return; }

  const C = grid.cell, d = grid.dpr;
  const u = Math.max(2, Math.round(1.5 * d));                 // one pixel of the cursor
  const mx = (state.mouse.x + 1) / 2 * grid.w, my = (1 - state.mouse.y) / 2 * grid.h;
  const ci = Math.floor((mx - grid.ox) / C), cj = Math.floor((my - grid.oy) / C);
  // Slow frames: the system cursor takes over (a canvas cursor would lag), but the readout keeps counting
  if (cur.slow) { root.classList.remove('cursor-on'); drawCoords({ x: grid.ox + ci * C, y: grid.oy + cj * C, w: C, h: C }, t); return; }
  root.classList.add('cursor-on');

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
  // A lock holds for a moment after the pointer slips off a target's edge, so edges don't flicker the frame
  let tg = findTarget();
  if (tg) { cur.lastTg = tg; cur.lastTgAt = t; }
  else if (cur.lastTg && t - cur.lastTgAt < 0.15 && !state.firing) tg = cur.lastTg;
  const cell = { x: grid.ox + ci * C, y: grid.oy + cj * C, w: C, h: C };
  const key = tg && tg.rect ? tg.key : 'cell';
  const goal = tg && tg.rect ? frameFor(tg.rect, tg.side, tg.tight) : cell;
  if (key !== cur.key) {
    // Fly between the old frame and the new one (rest -> lock, lock -> lock, lock -> rest)
    cur.from = cur.to ? cur.to : goal;
    cur.flyStart = (reduceMotion || (key === 'cell' && cur.key === 'cell')) ? -1 : t;
    cur.key = key;
    cur.label = tg && tg.rect ? tg.label : '';
  }
  cur.to = goal;
  let fr = goal;
  if (cur.flyStart >= 0 && t - cur.flyStart < FLY) {
    const k = (t - cur.flyStart) / FLY, e = 1 - (1 - k) * (1 - k);
    fr = { x: cur.from.x + (goal.x - cur.from.x) * e, y: cur.from.y + (goal.y - cur.from.y) * e,
      w: cur.from.w + (goal.w - cur.from.w) * e, h: cur.from.h + (goal.h - cur.from.h) * e };
  }

  // Charging: holding to fire pulls the brackets in a pixel at a time and fills a 4-segment bar
  if (!state.firing) cur.fireStart = t;
  const charge = state.firing ? clamp((t - cur.fireStart) / 0.6, 0, 1) : 0;
  // Blocked: holding on the eye (its no-fire zone). A quick click is a poke, so this only shows once the press is too long to be one.
  const blocked = state.pointerDown && state.inNoFire && !state.firing && t - state.pointerDownAt > POKE_MAX;
  // The frame pops out three pixels when the laser starts, then steps back in onto the square
  const out = state.firing && !reduceMotion ? Math.max(0, 3 - Math.floor((t - cur.fireStart) / 0.05)) * u : 0;
  if (out) fr = { x: fr.x - out, y: fr.y - out, w: fr.w + 2 * out, h: fr.h + 2 * out };
  const L = Math.max(3 * u, Math.round(Math.min(fr.w, fr.h) * 0.3));
  // White-hot while firing so the frame still reads on top of red burns
  brackets(fr, u, Math.min(L, 8 * u), blocked ? '#6f7b87' : state.firing ? '#ff8f99' : '#ff0a1e');

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
  // (re-decodes whenever the text changes)
  const readout = blocked ? 'NO FIRE' : cur.key !== 'cell' ? cur.label : '';
  if (readout !== cur.scrText) { cur.scrText = readout; cur.labelScr = readout ? makeScramble(readout.length, t) : null; }
  if (readout) {
    const px = u;
    const w = pixelTextWidth(readout, px);
    let lx = Math.round(fr.x + fr.w + 3 * u), ly = Math.round(fr.y);
    if (lx + w > grid.w - 4 * u) lx = Math.round(fr.x - 3 * u - w);
    if (ly < 2 * u) ly = Math.round(fr.y + fr.h - 7 * px);
    const col = blocked ? '#6f7b87' : '#ff0a1e';
    drawPixelText(ctx, readout, lx, ly, px, function () { return col; }, cur.labelScr, t);
  }
  // Blocked: a small pixel X beside the pointer (light with a dark outline, since it always sits over the red eye)
  if (blocked) {
    const ox = Math.round(mx + 4 * u), oy = Math.round(my + 4 * u);
    [['rgba(9,12,15,0.85)', 1], ['#c9d4de', 0]].forEach(function (pass) {
      const o = pass[1];
      ctx.fillStyle = pass[0];
      for (let k = 0; k < 5; k++) {
        ctx.fillRect(ox + k * u - o, oy + k * u - o, u + 2 * o, u + 2 * o);
        ctx.fillRect(ox + (4 - k) * u - o, oy + k * u - o, u + 2 * o, u + 2 * o);
      }
    });
  }

  drawCoords(fr, t);

  // The real pointer position, so aiming stays exact
  // 4 CSS px with a 1 px dark outline, so it reads on the photo, the name and red burns alike
  const dot = Math.max(4, Math.round(4 * d)), ol = Math.max(1, Math.round(d));
  const dx = Math.round(mx - dot / 2), dy = Math.round(my - dot / 2);
  ctx.fillStyle = 'rgba(9,12,15,0.85)';
  ctx.fillRect(dx - ol, dy - ol, dot + 2 * ol, dot + 2 * ol);
  ctx.fillStyle = '#ffd6da';
  ctx.fillRect(dx, dy, dot, dot);
}
