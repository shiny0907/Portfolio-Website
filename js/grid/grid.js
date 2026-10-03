import { stage, renderer, camera, reduceMotion, TAU, lerp } from '../core.js';
import { page } from '../pages.js';
import { photoHit, drawPhotoOnGrid } from '../about.js';
import { NAME_COLS, nameMap, drawName } from './name.js';
import { drawLabels } from './labels.js';
import { drawCorners } from './corners.js';
import { drawContactBeam } from '../contact.js';

// ---------- The grid universe behind everything ----------
// An invisible lattice of perfect squares. Where the laser hits, squares burn solid red,
// the breach spreads a little, holds briefly, then heals square by square.
const gridCanvas = document.createElement('canvas');
gridCanvas.className = 'grid';
gridCanvas.setAttribute('aria-hidden', 'true');
stage.insertBefore(gridCanvas, renderer.domElement);
gridCanvas.style.zIndex = '0';
renderer.domElement.style.zIndex = '2';
const gctx = gridCanvas.getContext('2d');
export const grid = { dpr: 1, w: 0, h: 0, cell: 24, ox: 0, oy: 0, cells: new Map(), dirty: true, lastX: null, lastY: null, nameShift: 0, nameShiftY: 0 };
const GRID_MAX = 40000;
const GRID_HOLD = 1.5, GRID_FADE = 1.0;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const KEY = (i, j) => (i + 5000) * 10000 + (j + 5000);

export function resizeGrid(w, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  grid.dpr = dpr;
  grid.w = Math.round(w * dpr);
  grid.h = Math.round(h * dpr);
  gridCanvas.width = grid.w;
  gridCanvas.height = grid.h;
  // Square size is set by the name: 60% of the width on desktop, most of it on phones
  const share = w < 700 ? 0.9 : 0.6;
  grid.cell = Math.max(4, Math.floor(grid.w * share / NAME_COLS));
  const C = grid.cell;
  // Square (0, 0) sits exactly on the centre of the screen. Indices are relative to it,
  // so burned squares keep their place when the window is resized.
  grid.ox = Math.round(grid.w / 2 - C / 2);
  grid.oy = Math.round(grid.h / 2 - C / 2);
  grid.dirty = true;
}

const _lp = new THREE.Vector3();
export function projectToGrid(x, y, z) {
  _lp.set(x, y, z).project(camera);
  return [(_lp.x + 1) / 2 * grid.w, (1 - _lp.y) / 2 * grid.h];
}

function igniteCell(i, j, t, gen) {
  const key = KEY(i, j);
  // A direct laser hit destroys a square of the name for good; spreading cracks can't touch it
  const nb = nameMap.get(KEY(i - grid.nameShift, j - grid.nameShiftY));
  if (nb && nb.state !== 2) {
    if (gen === 0 && nb.state === 0 && t >= nb.appearAt) { nb.state = 1; nb.dieAt = t; }
    return;
  }
  const c = grid.cells.get(key);
  if (c) {
    if (gen === 0) { c.gen = 0; c.lastHit = t; c.heat = 1; }
    return;
  }
  if (grid.cells.size >= GRID_MAX) return;
  grid.cells.set(key, { i: i, j: j, born: t, gen: gen, lastHit: t, heat: 1, delay: Math.random() * 0.8 });
  grid.dirty = true;
}

function igniteAt(px, py, t) {
  photoHit(px, py, t);
  const fx = (px - grid.ox) / grid.cell, fy = (py - grid.oy) / grid.cell;
  const ci = Math.floor(fx), cj = Math.floor(fy);
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      if (Math.hypot(ci + di + 0.5 - fx, cj + dj + 0.5 - fy) < 0.95) igniteCell(ci + di, cj + dj, t, 0);
    }
  }
}

// Burn along the path between frames so fast sweeps leave a continuous trail
export function igniteTrail(px, py, t) {
  if (grid.lastX === null) {
    igniteAt(px, py, t);
  } else {
    const d = Math.hypot(px - grid.lastX, py - grid.lastY);
    const steps = Math.min(60, Math.max(1, Math.ceil(d / (grid.cell * 0.5))));
    for (let s = 1; s <= steps; s++) {
      igniteAt(lerp(grid.lastX, px, s / steps), lerp(grid.lastY, py, s / steps), t);
    }
  }
  grid.lastX = px;
  grid.lastY = py;
  if (!reduceMotion && Math.random() < 0.12) {
    const a = Math.random() * TAU, r = (1.2 + Math.random() * 1.2) * grid.cell;
    igniteCell(Math.floor((px + Math.cos(a) * r - grid.ox) / grid.cell), Math.floor((py + Math.sin(a) * r - grid.oy) / grid.cell), t, 1);
  }
}

export function updateGrid(t, dt) {
  const ctx = gctx, C = grid.cell;

  // Spread for a moment after burning, then hold, then fade out
  const spawn = [];
  grid.cells.forEach(function (c, key) {
    if (!reduceMotion && c.gen < 3 && t - c.born < 0.6 && Math.random() < dt * 1.6) {
      const d = DIRS[Math.random() * 4 | 0];
      spawn.push(c.i + d[0], c.j + d[1], c.gen + 1);
    }
    if (t - c.lastHit > GRID_HOLD + c.delay) {
      c.heat -= dt / GRID_FADE;
      if (c.heat <= 0) grid.cells.delete(key);
    }
  });
  for (let k = 0; k < spawn.length; k += 3) igniteCell(spawn[k], spawn[k + 1], t, spawn[k + 2]);

  ctx.clearRect(0, 0, grid.w, grid.h);

  // The name (slides off to the right in whole squares when the About page opens)
  drawName(ctx, t);

  // Your photo (About page), on the grid layer so the laser can knock squares out of it
  drawPhotoOnGrid(ctx, t);

  // Page transition: a jagged wall of squares sweeps across like a tear in the grid,
  // with a hot leading edge and a short tail that fades out behind it. No scattered burns.
  // After the move ends the tear keeps sliding off the edge while it breaks apart, instead of vanishing
  drawTear(ctx, t);

  // Burning squares
  grid.cells.forEach(function (c) {
    let a = Math.min(1, c.heat);
    if (a < 1 && !reduceMotion && Math.random() < 0.1) a *= 0.25; // glitch flicker while healing
    ctx.globalAlpha = a;
    ctx.fillStyle = t - c.born < 0.12 ? '#ff8f99' : '#ff0a1e';
    ctx.fillRect(grid.ox + c.i * C, grid.oy + c.j * C, C, C);
  });
  ctx.globalAlpha = 1;

  // Side labels, in front of the burns
  // Contact page: the data channel from the parked eye up to the page
  drawContactBeam(ctx, t);

  drawLabels(ctx, t, dt);

  // Corners, and the occasional text glitch
  drawCorners(ctx, t);
}

function drawTear(ctx, t) {
  const C = grid.cell;
  const tearFade = page.moving ? 0 : (page.endAt ? (t - page.endAt) / 0.45 : 1);
  if ((page.moving || tearFade < 1) && page.vertical) {
    // Contact comes down from above: the same jagged tear, turned on its side, sweeping down the screen
    const dir = page.toQ > page.fromQ ? 1 : -1;
    const cj = Math.floor((page.q * grid.h - grid.oy) / C);
    const cols0 = Math.floor(-grid.ox / C), cols1 = Math.ceil((grid.w - grid.ox) / C);
    const TAIL = [1, 0.55, 0.3, 0.15, 0.06];
    const exit = Math.round(tearFade * 7);
    for (let i = cols0; i <= cols1; i++) {
      const lead = cj + dir * (page.jag[(i % 64 + 64) % 64] + exit);
      for (let k = TAIL.length - 1; k >= 0; k--) {
        if (tearFade > 0 && !reduceMotion && Math.random() < tearFade * 0.85) continue;
        ctx.globalAlpha = TAIL[k] * (1 - tearFade);
        ctx.fillStyle = k === 0 ? '#ff8f99' : '#ff0a1e';
        ctx.fillRect(grid.ox + i * C, grid.oy + (lead - dir * k) * C, C, C);
      }
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (page.moving || tearFade < 1) {
    const dir = page.to > page.from ? 1 : -1;
    const pfSide = page.to === -1 || page.from === -1;
    const ci = Math.floor(((pfSide ? 1 + page.p : page.p) * grid.w - grid.ox) / C);
    const rows0 = Math.floor(-grid.oy / C), rows1 = Math.ceil((grid.h - grid.oy) / C);
    const TAIL = [1, 0.55, 0.3, 0.15, 0.06];
    const exit = Math.round(tearFade * 7);          // squares travelled past the edge
    for (let j = rows0; j <= rows1; j++) {
      const lead = ci + dir * (page.jag[(j % 64 + 64) % 64] + exit);
      for (let k = TAIL.length - 1; k >= 0; k--) {
        if (tearFade > 0 && !reduceMotion && Math.random() < tearFade * 0.85) continue;   // dissolving
        ctx.globalAlpha = TAIL[k] * (1 - tearFade);
        ctx.fillStyle = k === 0 ? '#ff8f99' : '#ff0a1e';
        ctx.fillRect(grid.ox + (lead - dir * k) * C, grid.oy + j * C, C, C);
      }
    }
    ctx.globalAlpha = 1;
  }
}
