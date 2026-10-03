// SHINING YU: the name built from grid squares, lit by the eye's gaze and destroyable by the laser
import { hint, reduceMotion } from '../core.js';
import { FONT } from '../pixel-font.js';
import { state } from '../state.js';
import { page } from '../pages.js';
import { grid, KEY, projectToGrid } from './grid.js';
import { LABEL_Z } from './labels.js';

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
let nameGlitchNext = 6;

// Name sits low, with its top tucked under the lower edge of the clock rings
export function placeName() {
  const C = grid.cell;
  const ringBottom = projectToGrid(0, -2.12, LABEL_Z)[1];
  const fromRing = Math.floor((ringBottom - grid.oy) / C) - 2;
  const lastAllowed = Math.floor((grid.h - 44 * grid.dpr - grid.oy) / C) - 1;
  const topRow = Math.min(fromRing, lastAllowed - (NAME_ROWS - 1));
  const firstCol = -Math.floor(NAME_COLS / 2);
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
}
