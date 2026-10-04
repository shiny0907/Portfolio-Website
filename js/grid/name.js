// SHINING YU: the name built from grid squares, lit by the eye's gaze and destroyable by the laser
import { hint, reduceMotion } from '../core.js';
import { FONT, drawPixelText, pixelTextWidth, LABEL_COLOR } from '../pixel-font.js';
import { state, beatRings } from '../state.js';
import { page } from '../pages.js';
import { grid, KEY, projectToGrid } from './grid.js';
import { LABEL_Z, labelGlyphs, labelPx } from './labels.js';
import { startEyeReaction } from '../reactions.js';
import { scrLeft, scrRight } from './corners.js';

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

  // Red alert light behind everything while the name is breached
  drawAlarm(ctx, t);

  // The name (slides off to the right in whole squares when the About page opens)
  const scanR = C * 7;
  grid.nameShift = Math.round(page.p * (grid.w / C + NAME_COLS / 2 + 2));
  // ...and slides down off the bottom the same way when Contact comes down from above
  grid.nameShiftY = Math.round(page.q * (grid.h / C + 2));
  const ns = grid.nameShift, nsy = grid.nameShiftY;
  for (let k = 0; k < nameBlocks.length; k++) {
    const b = nameBlocks[k];
    if (b.state >= 2 || t < b.appearAt) continue;   // 2 destroyed, 3 flying back in (drawn below)
    if (grid.ox + (b.i + ns) * C > grid.w || grid.ox + (b.i + ns + 1) * C < 0) continue;
    if (grid.oy + (b.j + nsy) * C > grid.h) continue;
    let a = 1, col, lit = 0;
    {
      const dx = grid.ox + (b.i + ns + 0.5) * C - state.gazeX, dy = grid.oy + (b.j + nsy + 0.5) * C - state.gazeY;
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
    if (b.state === 0) col = breachColour(b, t) || col;
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    // The brightest squares get a soft white glow
    if (lit >= 5 && b.state === 0) {
      ctx.shadowColor = 'rgba(255,255,255,' + ((lit - 4) * 0.15).toFixed(2) + ')';
      ctx.shadowBlur = C * 0.9;
    }
    ctx.fillRect(grid.ox + (b.i + ns) * C, grid.oy + (b.j + nsy) * C, C, C);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  drawFlying(ctx, t, ns, nsy);
  drawBreachMessage(ctx, t);
}

// ---------- Breach: laser off every square of the name and the whole system goes to red alert ----------
// 0.0  a shockwave of red squares bursts out from where the name was, the screen tears into sliding slices,
//      the eye startles, the rings spin hard and an alarm pulses in from the edges
// 0.55 SYSTEM BREACH slams in letter by letter on the name's own squares, while an error log types in top left
// 2.3  the message scrambles out; the name's squares stream in from the screen edges and lock into place
//      left to right, the log's integrity readout counting up to 100%
// 4.2  everything has landed: the name flashes white, a softer wave rings out, SYSTEM RESTORED
const BREACH_MSG = 'SYSTEM BREACH';
const B_GLITCH = 0.5, B_MSG = 0.55, B_OUT = 2.3, B_FLY = 2.5, B_LAND = 4.2, B_DONE = 5.2;
const BREACH_PIX = [1, 0, 0.6, 0.34, 0, 0.6, 0];   // same stutter as the click glitch
const breach = { active: false, start: 0, slammed: false, rebuilt: false, finalAt: -10, count: 0, msg: null, landed: 0, log: [] };
try { breach.count = +sessionStorage.getItem('breach-count') || 0; } catch (err) { breach.count = 0; }
// The tear of the shockwaves: how far ahead each direction runs, varying smoothly round the ring
const shockJag = (function () {
  const out = [];
  let v = 0;
  for (let k = 0; k < 48; k++) { v = Math.max(-1.5, Math.min(1.5, v + (Math.random() - 0.5) * 1.2)); out.push(v); }
  return out;
})();

// Scramble every character of a text, starting now
function scrambleAll(arr, t, dur) {
  arr.forEach(function (c, i) {
    c.start = Math.min(c.start, t + i * 0.02);
    c.end = t + dur * (0.5 + Math.random() * 0.5);
  });
}
const two = function (n) { return (n < 10 ? '0' : '') + n; };
const pct = function (f) { const n = Math.round(f * 100); return (n < 100 ? '0' : '') + (n < 10 ? '0' : '') + n + '%'; };

function startBreach(t) {
  breach.active = true;
  breach.start = t;
  breach.slammed = false;
  breach.rebuilt = false;
  breach.finalAt = -10;
  breach.landed = 0;
  breach.count++;
  try { sessionStorage.setItem('breach-count', String(breach.count)); } catch (err) { /* private mode: count just won't persist */ }
  // The message: each letter slams in (no decode), then scrambles back out
  breach.msg = BREACH_MSG.split('').map(function (ch, k) {
    const at = reduceMotion ? t + B_MSG : t + B_MSG + k * 0.045;
    const outAt = reduceMotion ? t + B_OUT : t + B_OUT + Math.random() * 0.18;
    return { start: at, end: at, outAt: outAt, gone: reduceMotion ? outAt : outAt + 0.1 + Math.random() * 0.15, glyph: null, next: 0 };
  });
  // The error log, one line at a time
  const L = function (key, value, at) { return { key: key, value: value, at: t + at }; };
  breach.log = [
    L('NAME.DAT', 'CORRUPTED', 0.75), L('FIREWALL', 'DOWN', 1.05), L('INTEGRITY', '000%', 1.35),
    L('BREACH COUNT', two(breach.count), 1.65), L('REBUILD', '', B_FLY), L('SYSTEM', 'RESTORED', B_LAND + 0.1)
  ];
  state.glitchUntil = Math.max(state.glitchUntil, t + B_GLITCH);   // glow flicker
  startEyeReaction('startle', t);
  if (reduceMotion) return;
  state.shakeUntil = t + 0.6;
  // Every bit of system text breaks up, and every ring spins hard
  scrambleAll(scrLeft, t, 0.6);
  scrambleAll(scrRight.slice(0, scrRight.length - 8), t, 0.6);      // never the clock digits
  scrambleAll(labelGlyphs.filter(function (g) { return g.rows; }).map(function (g) { return g.scr; }), t, 0.6);
  beatRings.forEach(function (r, i) { r.target += Math.sign(r.step) * Math.PI * (i < 3 ? 1.5 : 1); });
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
  if (!breach.slammed && e >= B_MSG) {
    // The message lands with a jolt
    breach.slammed = true;
    if (!reduceMotion) { state.shakeUntil = t + 0.35; beatRings[4].angle -= 0.45; }
  }
  if (!breach.rebuilt && e >= B_FLY) {
    // Every square of the name flies in from a screen edge, landing roughly left to right
    breach.rebuilt = true;
    const C = grid.cell, cols = Math.ceil(grid.w / C), rows = Math.ceil(grid.h / C);
    const i0 = Math.floor(-grid.ox / C) - 2, j0 = Math.floor(-grid.oy / C) - 2;
    const span = B_LAND - B_FLY - 0.6;
    nameBlocks.forEach(function (b) {
      b.glitchUntil = 0;
      if (reduceMotion) { b.state = 0; b.appearAt = t - 1; return; }
      b.state = 3;
      const side = Math.random();
      if (side < 0.35) { b.fromI = i0 + Math.random() * (cols + 4); b.fromJ = j0; }               // top
      else if (side < 0.675) { b.fromI = i0; b.fromJ = j0 + Math.random() * (rows + 4); }       // left
      else { b.fromI = i0 + cols + 4; b.fromJ = j0 + Math.random() * (rows + 4); }              // right
      b.launchAt = t + (b.gx / NAME_COLS) * span + Math.random() * 0.12;
      b.landAt = b.launchAt + 0.38 + Math.random() * 0.1;
      b.appearAt = b.landAt;
    });
  }
  if (breach.rebuilt) {
    let n = 0;
    for (let k = 0; k < nameBlocks.length; k++) {
      const b = nameBlocks[k];
      if (b.state === 3 && t >= b.landAt) b.state = 0;
      if (b.state === 0) n++;
    }
    breach.landed = n / nameBlocks.length;
    if (n === nameBlocks.length && breach.finalAt < 0) {
      breach.finalAt = t;
      if (!reduceMotion) { beatRings[3].angle += 0.5; beatRings[4].angle -= 0.6; }
    }
  }
  if (e >= B_DONE && breach.finalAt > 0) breach.active = false;
}

// The eye's pixel stutter during the glitch (grid-aligned pixel size, 0 = sharp)
export function breachPix(t) {
  if (!breach.active || reduceMotion) return 0;
  const e = t - breach.start;
  if (e >= B_GLITCH) return 0;
  return Math.round(grid.cell * (BREACH_PIX[Math.floor(e / 0.07)] || 0));
}
// Landing: each square flashes white, then red, then settles. All landed: the whole name flashes white.
function breachColour(b, t) {
  if (breach.finalAt > 0 && t - breach.finalAt < 0.16) return '#ffffff';
  if (b.landAt && t >= b.landAt && t - b.landAt < 0.05) return '#ffffff';
  return null;
}

// The name's centre, in grid squares (it moves with the page)
function nameCentre() {
  return [nameAt.firstCol + grid.nameShift + NAME_COLS / 2, nameAt.topRow + grid.nameShiftY + NAME_ROWS / 2];
}

// Alarm: red light pulsing in from the screen edges, behind everything (drawn before the name)
function drawAlarm(ctx, t) {
  if (!breach.active) return;
  const e = t - breach.start;
  const fade = e < 0.1 ? e / 0.1 : e > B_FLY ? Math.max(0, 1 - (e - B_FLY) / 0.6) : 1;
  if (fade <= 0) return;
  const pulse = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(e * Math.PI * 2 * 1.4 - Math.PI / 2);
  const w = grid.w, h = grid.h;
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.hypot(w, h) * 0.55);
  g.addColorStop(0, 'rgba(255,10,30,0)');
  g.addColorStop(1, 'rgba(255,10,30,' + (0.32 * pulse * fade).toFixed(3) + ')');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// SYSTEM BREACH on the name's own squares (full squares when it fits, half squares on narrow screens)
function drawBreachMessage(ctx, t) {
  if (!breach.active || !breach.msg || t - breach.start >= B_FLY) return;
  const C = grid.cell, units = pixelTextWidth(BREACH_MSG, 1) - 1;
  const px = units * C <= grid.w * 0.94 ? C : Math.max(1, Math.floor(C / 2));
  const cen = nameCentre();
  const left = grid.ox + Math.round(cen[0] - units * px / C / 2) * C;
  const top = grid.oy + Math.round(cen[1] - 7 * px / C / 2) * C;
  let x = left;
  for (let k = 0; k < BREACH_MSG.length; k++) {
    const ch = BREACH_MSG[k], c = breach.msg[k], age = t - c.start;
    const wdt = FONT[ch] ? FONT[ch][0].length : 2;
    if (age >= 0) {
      // Slams down from two pixels up, white-hot for a moment
      const drop = reduceMotion ? 0 : age < 0.03 ? 2 : age < 0.06 ? 1 : 0;
      const col = !reduceMotion && age < 0.09 ? '#ffd6da' : '#ff0a1e';
      // While it holds, a letter now and then jumps sideways for a frame
      const jit = !reduceMotion && age > 0.2 && Math.random() < 0.03 ? (Math.random() < 0.5 ? -px : px) : 0;
      drawPixelText(ctx, ch, x + jit, top - drop * px, px, function () { return col; }, [c], t);
    }
    x += (wdt + 1) * px;
  }
}

// Squares in flight: snapped to the grid as they go, with a short fading trail
function drawFlying(ctx, t, ns, nsy) {
  if (!breach.active || !breach.rebuilt || reduceMotion) return;
  const C = grid.cell;
  const posAt = function (b, tt) {
    const f = Math.max(0, Math.min(1, (tt - b.launchAt) / (b.landAt - b.launchAt)));
    const k = 1 - Math.pow(1 - f, 3);
    return [Math.round(b.fromI + (b.i + ns - b.fromI) * k), Math.round(b.fromJ + (b.j + nsy - b.fromJ) * k)];
  };
  for (let k = 0; k < nameBlocks.length; k++) {
    const b = nameBlocks[k];
    if (b.state !== 3 || t < b.launchAt) continue;
    for (let s = 3; s >= 0; s--) {
      const p = posAt(b, t - s * 0.035);
      ctx.globalAlpha = [1, 0.5, 0.28, 0.12][s];
      ctx.fillStyle = s === 0 ? '#ff8f99' : '#ff0a1e';
      ctx.fillRect(grid.ox + p[0] * C, grid.oy + p[1] * C, C, C);
    }
  }
  ctx.globalAlpha = 1;
}

// A ring of squares running out from the name: hot leading edge, short fading tail, ragged like the page tear
function drawShock(ctx, t, at, speed, reach, strength) {
  const e = t - at;
  if (e < 0 || reduceMotion) return;
  const C = grid.cell, cen = nameCentre();
  const R = e * speed;
  const fade = Math.max(0, 1 - R / reach) * strength;
  if (fade <= 0) return;
  const i0 = Math.floor(-grid.ox / C), i1 = Math.ceil((grid.w - grid.ox) / C);
  const j0 = Math.floor(-grid.oy / C), j1 = Math.ceil((grid.h - grid.oy) / C);
  const TAIL = [1, 0.55, 0.28, 0.12];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cen[0], dy = (j + 0.5 - cen[1]) * 1.15;
      const a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1;
      const edge = R + shockJag[Math.floor(a * shockJag.length) % shockJag.length];
      const k = Math.floor(edge - Math.hypot(dx, dy));
      if (k < 0 || k >= TAIL.length) continue;
      ctx.globalAlpha = TAIL[k] * fade * (Math.random() < 0.1 ? 0.3 : 1);
      ctx.fillStyle = k === 0 ? '#ff8f99' : '#ff0a1e';
      ctx.fillRect(grid.ox + i * C, grid.oy + j * C, C, C);
    }
  }
  ctx.globalAlpha = 1;
}

// Error log, top left under the corner text: lines type in; the integrity readout and a bar of squares count up as the name rebuilds
function drawLog(ctx, t) {
  const e = t - breach.start;
  const cpx = labelPx, d = grid.dpr || 1;
  const margin = Math.round(Math.max(16, Math.min(48, grid.w / d * 0.03)) * d);   // same as the corner texts
  const lineH = 11 * cpx, KEY_W = 15;
  const shown = breach.log.filter(function (l) { return t >= l.at; });
  const leaving = Math.max(0, (e - (B_DONE - 0.35)) / 0.35);   // scrambles away just after SYSTEM RESTORED
  let y = margin + 7 * cpx + 2 * lineH;
  shown.forEach(function (l) {
    let value = l.value;
    if (l.key === 'INTEGRITY') value = breach.rebuilt ? pct(breach.landed) : '000%';
    const head = '> ' + l.key + ' ' + '.'.repeat(Math.max(2, KEY_W - l.key.length)) + ' ';
    const full = head + value;
    const typed = reduceMotion ? full.length : Math.floor((t - l.at) / 0.012);
    const str = full.slice(0, typed);
    drawPixelText(ctx, str, margin, y, cpx, function (k) {
      if (leaving && Math.random() < leaving) return 'rgba(0,0,0,0)';
      if (k === 0) return '#ff0a1e';
      if (k >= head.length) return l.key === 'SYSTEM' ? '#ffffff' : '#ff0a1e';
      return str[k] === '.' ? '#6f7b87' : LABEL_COLOR;
    }, null, t);
    // REBUILD: a bar of squares filling as the name lands
    if (l.key === 'REBUILD' && typed >= head.length && leaving < 0.5) {
      const bx = margin + pixelTextWidth(head, cpx), seg = 10, sw = 4 * cpx, gap = cpx;
      for (let s = 0; s < seg; s++) {
        ctx.fillStyle = s < Math.round(breach.landed * seg) ? '#ff0a1e' : '#2a3038';
        ctx.fillRect(bx + s * (sw + gap), y + cpx, sw, 5 * cpx);
      }
    }
    y += lineH;
  });
}

// Drawn last on the grid layer, over everything: the shockwaves, the log, and the screen tearing
export function drawBreachFx(ctx, t) {
  if (!breach.active) return;
  const reach = Math.hypot(grid.w, grid.h) / grid.cell;
  drawShock(ctx, t, breach.start, 70, reach, 1);
  if (breach.finalAt > 0) drawShock(ctx, t, breach.finalAt, 45, reach * 0.4, 0.55);
  drawLog(ctx, t);
  // The screen tears: bands of the grid layer slide sideways, in bursts
  const e = t - breach.start;
  if (!reduceMotion && (e < 0.45 || (e > B_MSG && e < B_MSG + 0.12) || (e > B_MSG && e < B_OUT && Math.random() < 0.04))) tearSlices(ctx);
}

// Copy a few horizontal bands and put them back shifted sideways by whole squares
let sliceCv = null;
function tearSlices(ctx) {
  const C = grid.cell, w = grid.w, h = grid.h;
  if (!sliceCv) sliceCv = document.createElement('canvas');
  if (sliceCv.width !== w || sliceCv.height !== h) { sliceCv.width = w; sliceCv.height = h; }
  const sg = sliceCv.getContext('2d');
  const n = 2 + (Math.random() * 4 | 0);
  for (let k = 0; k < n; k++) {
    const bh = C * (1 + (Math.random() * 3 | 0));
    const by = grid.oy + Math.floor(Math.random() * Math.max(1, (h - bh - grid.oy) / C)) * C;
    const dx = (Math.random() < 0.5 ? -1 : 1) * C * (1 + (Math.random() * 3 | 0));
    sg.clearRect(0, by, w, bh);
    sg.drawImage(ctx.canvas, 0, by, w, bh, 0, by, w, bh);
    ctx.clearRect(0, by, w, bh);
    ctx.drawImage(sliceCv, 0, by, w, bh, dx, by, w, bh);
  }
}
