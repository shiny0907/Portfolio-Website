// The 5x7 pixel typeface used for all system text, plus the glitch scramble that decodes it
import { reduceMotion } from './core.js';

export const LABEL_COLOR = '#c9d4de';

// Pixel typeface: every pixel of a letter is one square of the grid
export const FONT = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  // Digits are all five wide, so the clock never shifts as the time changes
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.', '.', '#', '.', '#', '.', '.'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  '.': ['.', '.', '.', '.', '.', '.', '#'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....']
};

// ---- Text scramble for the pixel font ----
// Glitch glyphs are grouped by width so a scrambling letter never changes the text's width.
const GLITCH_EXTRA = [
  ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
  ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
  ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ['.#.', '.#.', '.#.', '.#.', '.#.', '...', '.#.'],
  ['...', '.#.', '.#.', '###', '.#.', '.#.', '...'],
  ['...', '...', '###', '...', '###', '...', '...'],
  ['#.#', '.#.', '#.#', '.#.', '#.#', '.#.', '#.#']
];
const GLITCH_POOL = {};
Object.keys(FONT).concat(GLITCH_EXTRA.map(function (_, i) { return '~' + i; })).forEach(function (key) {
  const rows = key[0] === '~' && key.length > 1 ? GLITCH_EXTRA[+key.slice(1)] : FONT[key];
  const wdt = rows[0].length;
  if (wdt < 3) return;
  (GLITCH_POOL[wdt] = GLITCH_POOL[wdt] || []).push(rows);
});
// Per-character scramble state: hidden before `start`, glitching until `end`, then final
export function makeScramble(len, appear) {
  const out = [];
  for (let i = 0; i < len; i++) {
    const start = reduceMotion ? 0 : appear + Math.random() * 0.35;
    out.push({ start: start, end: reduceMotion ? 0 : start + 0.2 + Math.random() * 0.5, glyph: null, next: 0 });
  }
  return out;
}
// Returns 'hidden', a glitch glyph, or null (show the real character)
export function scrambleState(c, t, wdt) {
  if (t < c.start) return 'hidden';
  if (t >= c.end) return null;
  const pool = GLITCH_POOL[wdt];
  if (!pool) return null;
  if (!c.glyph || t >= c.next || c.glyph[0].length !== wdt) {
    c.glyph = pool[Math.random() * pool.length | 0];
    c.next = t + 0.04 + Math.random() * 0.05;
  }
  return c.glyph;
}
// Re-scramble a short run of characters starting now
export function glitchRun(arr, t, from, to) {
  const len = 2 + (Math.random() * 4 | 0);
  const first = from + (Math.random() * Math.max(1, to - from - len + 1) | 0);
  for (let i = first; i < Math.min(to, first + len); i++) {
    arr[i].start = Math.min(arr[i].start, t + (i - first) * 0.03);
    arr[i].end = t + 0.25 + Math.random() * 0.35;
  }
}

// Draw a string in the pixel font. colorAt(index) picks each character's colour; scr is optional scramble state.
export function drawPixelText(ctx, str, x, y, px, colorAt, scr, t) {
  let cx = x;
  for (let k = 0; k < str.length; k++) {
    const rows = FONT[str[k]];
    if (!rows) { cx += 3 * px; continue; }
    const wdt = rows[0].length;
    let draw = rows, col = colorAt(k);
    if (scr) {
      const st = scrambleState(scr[k], t, wdt);
      if (st === 'hidden') { cx += (wdt + 1) * px; continue; }
      if (st) { draw = st; col = '#ff0a1e'; }
    }
    ctx.fillStyle = col;
    for (let ry = 0; ry < draw.length; ry++) {
      for (let rx = 0; rx < draw[ry].length; rx++) {
        if (draw[ry][rx] === '#') ctx.fillRect(cx + rx * px, y + ry * px, px, px);
      }
    }
    cx += (wdt + 1) * px;
  }
}
export function pixelTextWidth(str, px) {
  let wdt = 0;
  for (let k = 0; k < str.length; k++) {
    const rows = FONT[str[k]];
    wdt += rows ? (rows[0].length + 1) * px : 3 * px;
  }
  return wdt - px;
}
