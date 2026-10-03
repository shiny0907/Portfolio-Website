// SHINING YU: the name built from grid squares, lit by the eye's gaze and destroyable by the laser
import { hint, reduceMotion } from '../core.js';
import { FONT, makeScramble, drawPixelText, pixelTextWidth, LABEL_COLOR } from '../pixel-font.js';
import { state, beatRings } from '../state.js';
import { page } from '../pages.js';
import { grid, KEY, projectToGrid } from './grid.js';
import { LABEL_Z, labelGlyphs } from './labels.js';
import { scrLeft, scrRight } from './corners.js';
import { sfx } from '../sound.js';

const NAME_TEXT = 'SHINING YU';
const NAME_ROWS = 7, LETTER_GAP = 1, WORD_GAP = 3;
// The name is dim, like it's set into the grid; squares near where the eye is looking light up
const NAME_DIM = [201, 212, 222], NAME_LIT = [255, 255, 255];   // resting colour matches the corner text (#c9d4de)
const NAME_LEVELS = Array.from({ length: 9 }, function (_, k) {
  const f = k / 8;
  return 'rgb(' + NAME_DIM.map(function (v, i) { return Math.round(v + (NAME_LIT[i] - v) * f); }).join(',') + ')';
});
// Lay the glyphs out once, in name-local square coordinates
const nameBlocks = [];
export const NAME_COLS = (function () {
  let x = 0;
  for (let c = 0; c < NAME_TEXT.length; c++) {
    const ch = NAME_TEXT[c];
    if (ch === ' ') { x += WORD_GAP; continue; }
    const rows = FONT[ch];
    const wdt = rows[0].length;
    for (let gy = 0; gy < NAME_ROWS; gy++) {
      for (let gx = 0; gx < wdt; gx++) {
        if (rows[gy][gx] !== '#') continue;
        nameBlocks.push({
          gx: x + gx, gy: gy, i: 0, j: 0,
          state: 0,                 // 0 alive, 1 being destroyed, 2 gone
          appearAt: reduceMotion ? 0 : 0.35 + Math.random() * 1.1,   // assembles as the eye boots
          dieAt: 0, glitchUntil: 0
        });
      }
    }
    x += wdt;
    if (c < NAME_TEXT.length - 1 && NAME_TEXT[c + 1] !== ' ') x += LETTER_GAP;
  }
  return x;
})();
export const nameMap = new Map();
const nameAt = { topRow: 0, firstCol: 0 };
let nameGlitchNext = 6;

// Name sits low, with its top tucked under the lower edge of the clock rings
export function placeName() {
  const C = grid.cell;
  const ringBottom = projectToGrid(0, -2.12, LABEL_Z)[1];
  const fromRing = Math.floor((ringBottom - grid.oy) / C) - 2;
  const lastAllowed = Math.floor((grid.h - 44 * grid.dpr - grid.oy) / C) - 1;
  const topRow = Math.min(fromRing, lastAllowed - (NAME_ROWS - 1));
  const firstCol = -Math.floor(NAME_COLS / 2);
  nameAt.topRow = topRow;
  nameAt.firstCol = firstCol;
  nameMap.clear();
  nameBlocks.forEach(function (b) {
    b.i = firstCol + b.gx;
    b.j = topRow + b.gy;
    nameMap.set(KEY(b.i, b.j), b);
  });
  hint.style.bottom = '14px';
}

export function drawName(ctx, t) {
  const C = grid.cell;
  updateBreach(t);
  // Rare glitch: one square of the name flickers red
  if (state.booted && !reduceMotion && t > nameGlitchNext) {
    const alive = nameBlocks.filter(function (b) { return b.state === 0; });
    if (alive.length) alive[Math.random() * alive.length | 0].glitchUntil = t + 0.15;
    nameGlitchNext = t + 5 + Math.random() * 4;
  }

  // The name (slides off to the right in whole squares when the About page opens)
  const scanR = C * 7;
  grid.nameShift = Math.round(page.p * (grid.w / C + NAME_COLS / 2 + 2));
  const ns = grid.nameShift;
  for (let k = 0; k < nameBlocks.length; k++) {
    const b = nameBlocks[k];
    if (b.state === 2 || t < b.appearAt) continue;
    if (grid.ox + (b.i + ns) * C > grid.w || grid.ox + (b.i + ns + 1) * C < 0) continue;
    let a = 1, col, lit = 0;
    {
      const dx = grid.ox + (b.i + ns + 0.5) * C - state.gazeX, dy = grid.oy + (b.j + 0.5) * C - state.gazeY;
      const f = Math.max(0, 1 - Math.hypot(dx, dy) / scanR);
      lit = Math.round(Math.pow(f, 1.2) * 8);
      col = NAME_LEVELS[lit];
    }
    if (b.state === 1) {
      const e = t - b.dieAt;
      if (e < 0.08) col = '#ff8f99';
      else if (e < 0.33) col = '#ff0a1e';
      else if (e < 0.63) {
        col = '#ff0a1e';
        a = 1 - (e - 0.33) / 0.3;
        if (!reduceMotion && Math.random() < 0.25) a *= 0.2;
      } else { b.state = 2; continue; }
    } else if (t - b.appearAt < 0.12 || t < b.glitchUntil) {
      col = '#ff0a1e';
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    // The brightest squares get a soft white glow
    if (lit >= 5 && b.state === 0) {
      ctx.shadowColor = 'rgba(255,255,255,' + ((lit - 4) * 0.15).toFixed(2) + ')';
      ctx.shadowBlur = C * 0.9;
    }
    ctx.fillRect(grid.ox + (b.i + ns) * C, grid.oy + b.j * C, C, C);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  drawBreachMessage(ctx, t);
}

// ---------- Breach: laser off every square of the name and the system reacts ----------
// Glitch (0.5 s), SYSTEM BREACH decodes in where the name was, holds, scrambles out, then the name rebuilds
const BREACH_MSG = 'SYSTEM BREACH';
const B_GLITCH = 0.5, B_OUT = 2.0, B_REBUILD = 2.4, B_REBUILD_DUR = 1.5;
const BREACH_PIX = [1, 0, 0.6, 0.34, 0, 0.6, 0];   // same stutter as the click glitch
const breach = { active: false, start: 0, kicked: false, rebuilt: false, count: 0, msg: null, sub: null, subText: '' };
try { breach.count = +sessionStorage.getItem('breach-count') || 0; } catch (err) { breach.count = 0; }

// Scramble every character of a text, starting now
function scrambleAll(arr, t, dur) {
  arr.forEach(function (c, i) {
    c.start = Math.min(c.start, t + i * 0.02);
    c.end = t + dur * (0.5 + Math.random() * 0.5);
  });
}
// A message decodes in at `inAt` and scrambles back out by `goneBy`
function messageScramble(len, inAt, outAt, goneBy) {
  const scr = makeScramble(len, inAt);
  scr.forEach(function (c) {
    c.outAt = reduceMotion ? goneBy : outAt + Math.random() * 0.15;
    c.gone = reduceMotion ? goneBy : Math.min(goneBy, c.outAt + 0.1 + Math.random() * 0.15);
  });
  return scr;
}

function startBreach(t) {
  breach.active = true;
  breach.start = t;
  breach.rebuilt = false;
  breach.count++;
  try { sessionStorage.setItem('breach-count', String(breach.count)); } catch (err) { /* private mode: count just won't persist */ }
  breach.msg = messageScramble(BREACH_MSG.length, t + B_GLITCH, t + B_OUT, t + B_REBUILD);
  breach.subText = breach.count > 1 ? 'BREACH ' + (breach.count < 10 ? '0' : '') + breach.count : '';
  breach.sub = breach.subText ? messageScramble(breach.subText.length, t + B_GLITCH + 0.35, t + B_OUT, t + B_REBUILD) : null;
  state.glitchUntil = Math.max(state.glitchUntil, t + B_GLITCH);   // glow flicker
  sfx('breach');
  if (reduceMotion) return;
  // Every bit of system text breaks up, and the HUD rings jolt
  scrambleAll(scrLeft, t, 0.6);
  scrambleAll(scrRight.slice(0, scrRight.length - 8), t, 0.6);      // never the clock digits
  scrambleAll(labelGlyphs.filter(function (g) { return g.rows; }).map(function (g) { return g.scr; }), t, 0.6);
  beatRings[3].angle -= 0.5;
  beatRings[4].angle += 0.7;
}

function updateBreach(t) {
  if (!breach.active) {
    // Fires the moment the last living square takes a direct hit
    for (let k = 0; k < nameBlocks.length; k++) {
      const b = nameBlocks[k];
      if (b.state === 0) return;
    }
    startBreach(t);
    return;
  }
  const e = t - breach.start;
  if (!reduceMotion && !breach.kicked && e > 0.25) {
    breach.kicked = true;
    beatRings[4].angle -= 0.45;
  }
  if (!breach.rebuilt && e >= B_REBUILD) {
    // The name comes back square by square in random order, each one flashing red as it lands
    breach.rebuilt = true;
    nameBlocks.forEach(function (b) {
      b.state = 0;
      b.glitchUntil = 0;
      b.appearAt = reduceMotion ? t - 1 : t + Math.random() * B_REBUILD_DUR;
    });
  }
  if (e >= B_REBUILD + B_REBUILD_DUR) {
    breach.active = false;
    breach.kicked = false;
  }
}

// The eye's pixel stutter during the glitch (grid-aligned pixel size, 0 = sharp)
export function breachPix(t) {
  if (!breach.active || reduceMotion) return 0;
  const e = t - breach.start;
  if (e >= B_GLITCH) return 0;
  return Math.round(grid.cell * (BREACH_PIX[Math.floor(e / 0.07)] || 0));
}

function drawBreachMessage(ctx, t) {
  if (!breach.active || t - breach.start >= B_REBUILD) return;
  const C = grid.cell, ns = grid.nameShift;
  // Half-square pixels so it fits wherever the name does; edges snapped to the grid
  const px = Math.max(1, Math.floor(C / 2));
  const cx = grid.ox + (nameAt.firstCol + ns + NAME_COLS / 2) * C;
  const snap = function (x) { return grid.ox + Math.round((x - grid.ox) / C) * C; };
  const top = grid.oy + (nameAt.topRow + (breach.sub ? 1 : 2)) * C;
  const red = function () { return '#ff0a1e'; };
  drawPixelText(ctx, BREACH_MSG, snap(cx - pixelTextWidth(BREACH_MSG, px) / 2), top, px, red, breach.msg, t);
  if (breach.sub) {
    const sp = Math.max(1, Math.floor(C / 4));
    drawPixelText(ctx, breach.subText, snap(cx - pixelTextWidth(breach.subText, sp) / 2), top + 4 * C, sp,
      function () { return LABEL_COLOR; }, breach.sub, t);
  }
}
