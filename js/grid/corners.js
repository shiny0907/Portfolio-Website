// Corner texts: the role on the left, the Washington DC clock on the right, OPEN TO WORK bottom left,
// and the random text glitches
import { reduceMotion, clamp, hint, stage } from '../core.js';
import { makeScramble, glitchRun, drawPixelText, pixelTextWidth, LABEL_COLOR } from '../pixel-font.js';
import { state } from '../state.js';
import { grid } from './grid.js';
import { SIDE_LABELS, labelGlyphs, labelPx } from './labels.js';

export const CLOCK_APPEAR = reduceMotion ? 0 : 1.1;
export const CORNER_LEFT = 'UI/UX DESIGNER';
export const CLOCK_PLACE = 'WASHINGTON DC';
export const CORNER_STATUS = 'OPEN TO WORK';
export const scrLeft = makeScramble(CORNER_LEFT.length, CLOCK_APPEAR);
export const scrRight = makeScramble(CLOCK_PLACE.length + 2 + 8, CLOCK_APPEAR);
export const scrStatus = makeScramble(CORNER_STATUS.length, CLOCK_APPEAR + 0.2);
let textGlitchNext = 4;
// Washington DC time (Eastern), whatever the visitor's own time zone is
let dcClock = null;
try {
  dcClock = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
} catch (err) { dcClock = null; }
let dcCacheSec = -1, dcCache = '';
function dcTime() {
  const sec = Math.floor(Date.now() / 1000);
  if (sec !== dcCacheSec) { dcCacheSec = sec; dcCache = dcTimeNow(); }
  return dcCache;
}
function dcTimeNow() {
  const pad = (n) => (n < 10 ? '0' : '') + n;
  if (dcClock) {
    const parts = {};
    dcClock.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    const hh = parts.hour === '24' ? '00' : parts.hour;
    return hh + ':' + parts.minute + ':' + parts.second;
  }
  const now = new Date();
  return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
}

export function drawCorners(ctx, t) {
  // Every few seconds, whatever you're doing, a bit of text scrambles. The corner texts come up most often.
  if (!reduceMotion && state.booted && t > textGlitchNext) {
    const r = Math.random();
    if (r < 0.25) glitchRun(scrLeft, t, 0, CORNER_LEFT.length);
    else if (r < 0.5) glitchRun(scrRight, t, 0, CLOCK_PLACE.length);
    else if (r < 0.7) glitchRun(scrStatus, t, 0, CORNER_STATUS.length);
    else {
      const lab = SIDE_LABELS[r < 0.85 ? 0 : 1];
      const items = labelGlyphs.filter(function (g) { return g.label === lab && g.rows; });
      glitchRun(items.map(function (g) { return g.scr; }), t, 0, items.length);
    }
    textGlitchNext = t + 2 + Math.random() * 3;
  }

  // Corners: role on the left, Washington DC 24-hour clock on the right. Seconds tick with the rings.
  const cpx = labelPx;
  const margin = Math.round(clamp(grid.w / grid.dpr * 0.03, 16, 48) * grid.dpr);
  drawPixelText(ctx, CORNER_LEFT, margin, margin, cpx, function () { return LABEL_COLOR; }, scrLeft, t);
  let str = CLOCK_PLACE + '  ' + dcTime();
  let scr = scrRight;
  const leftW = pixelTextWidth(CORNER_LEFT, cpx), gap = 6 * cpx;
  let y = margin;
  // Narrow screens: shorten to "DC 12:34:56", and drop to a second line if it still doesn't fit
  if (margin + leftW + gap + pixelTextWidth(str, cpx) > grid.w - margin) {
    str = 'DC  ' + dcTime();
    scr = scrRight.slice(CLOCK_PLACE.length - 2);
    if (margin + leftW + gap + pixelTextWidth(str, cpx) > grid.w - margin) y = margin + 11 * cpx;
  }
  const x = grid.w - margin - pixelTextWidth(str, cpx);
  drawPixelText(ctx, str, x, y, cpx, function (k) {
    return k >= str.length - 2 ? '#ff0a1e' : LABEL_COLOR;
  }, scr, t);

  // Bottom left: OPEN TO WORK behind a red status square that blinks once a second (steady with reduced motion)
  let by = grid.h - margin - 7 * cpx;
  // On narrow screens the hint line runs the full width along the bottom, so sit just above it
  if (grid.w / grid.dpr < 700 && hint && hint.offsetHeight) {
    const top = (hint.getBoundingClientRect().top - stage.getBoundingClientRect().top) * grid.dpr;
    by = Math.min(by, Math.round(top - 4 * cpx - 7 * cpx));
  }
  if (t >= CLOCK_APPEAR && (reduceMotion || (t % 1) < 0.6)) {
    ctx.fillStyle = '#ff0a1e';
    ctx.fillRect(margin, by + cpx, 5 * cpx, 5 * cpx);
  }
  drawPixelText(ctx, CORNER_STATUS, margin + 9 * cpx, by, cpx, function () { return LABEL_COLOR; }, scrStatus, t);
}
