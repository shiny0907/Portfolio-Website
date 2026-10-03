// ABOUT ME / PORTFOLIO: pixel letters set along the ring of the gray bracket arcs, fixed on either side of the eye
import { renderer, camera, reduceMotion, clamp, lerp, camBase } from '../core.js';
import { FONT, makeScramble, scrambleState } from '../pixel-font.js';
import { state } from '../state.js';
import { grid, projectToGrid } from './grid.js';
import { placeName } from './name.js';

// Side labels: stacked pixel letters along the outer gray ring, left and right. They can't be destroyed.
export const SIDE_LABELS = [
  { text: 'ABOUT ME', side: -1, h: 0, hovered: false },
  { text: 'PORTFOLIO', side: 1, h: 0, hovered: false }
];
const LABEL_LEVELS = Array.from({ length: 9 }, function (_, k) {
  const f = k / 8, a = [201, 212, 222];
  return 'rgb(' + a.map(function (v) { return Math.round(v + (255 - v) * f); }).join(',') + ')';
});
export let hoveredLabel = null;
const LABEL_RADIUS = 2.27;   // world units, the gray bracket arcs
export const LABEL_Z = -1.2;        // same depth as the rings
export const labelGlyphs = [];      // { rows, x, y } in device pixels, plus appear timing
export let labelPx = 3;
export const labelGeo = { cx: 0, cy: 0, cx0: 0, cy0: 0, ppu: 1, R: 0, dirty: true };
function pushLabelGlyphs(lab, startAt, spread) {
  for (let k = 0; k < lab.text.length; k++) {
    const ch = lab.text[k];
    const sc = makeScramble(1, 0)[0];
    sc.start = reduceMotion ? 0 : startAt + (spread ? k * 0.035 : Math.random() * 0.6);
    sc.end = reduceMotion ? 0 : sc.start + 0.2 + Math.random() * 0.3;
    labelGlyphs.push({
      label: lab, index: k, ch: ch, rows: ch === ' ' ? null : FONT[ch],
      x: 0, y: 0, along: 0, w: 0, a: 0, dirX: 1, dirY: 0, appearAt: 0, scr: sc
    });
  }
}
SIDE_LABELS.forEach(function (lab) { pushLabelGlyphs(lab, 0.7, false); });
// Swap a label's word (ABOUT ME <-> BACK), decoding the new word in
export function setLabelText(lab, text, startAt) {
  for (let k = labelGlyphs.length - 1; k >= 0; k--) if (labelGlyphs[k].label === lab) labelGlyphs.splice(k, 1);
  lab.text = text;
  pushLabelGlyphs(lab, startAt, true);
  layoutLabels();
}

export function layoutLabels() {
  camera.updateMatrixWorld();
  placeName();
  const c = projectToGrid(0, 0, LABEL_Z);
  const e = projectToGrid(LABEL_RADIUS, 0, LABEL_Z);
  labelGeo.cx0 = c[0];
  labelGeo.cy0 = c[1];
  labelGeo.R = Math.abs(e[0] - c[0]);
  labelGeo.ppu = labelGeo.R / LABEL_RADIUS;   // device pixels per world unit at the rings' depth
  labelGeo.cx = labelGeo.cx0;   // placeLabels() follows the eye from here
  labelGeo.cy = labelGeo.cy0;
  labelPx = Math.max(2, Math.round(labelGeo.R / 100));
  const glyphH = 7 * labelPx;
  const step = glyphH + labelPx * 2;   // spacing between stacked letters, measured along the curve
  SIDE_LABELS.forEach(function (lab) {
    const items = labelGlyphs.filter(function (g) { return g.label === lab; });
    const lens = items.map(function (g) { return g.rows ? step : step * 0.5; }); // spaces take half a step
    const total = lens.reduce(function (a, b) { return a + b; }, 0) - step;
    let along = -total / 2;
    items.forEach(function (g, k) {
      if (k > 0) along += (lens[k - 1] + lens[k]) / 2;
      g.along = along;
      g.w = (g.rows ? g.rows[0].length : 3) * labelPx;
    });
  });
  labelGeo.dirty = true;
}

// Position every label letter on its curve. The words stay put (ABOUT ME at 9 o'clock, PORTFOLIO at 3)
// instead of turning with the brackets; only the ring's centre moves, travelling with the eye.
function placeLabels() {
  const ncx = labelGeo.cx0 + state.rigX * labelGeo.ppu * (camBase.z - LABEL_Z) / camBase.z;
  if (Math.abs(ncx - labelGeo.cx) > 0.25) { labelGeo.cx = ncx; labelGeo.dirty = true; }
  if (!labelGeo.dirty) return;
  labelGeo.dirty = false;
  const ang = 0;
  const R = labelGeo.R, lp = labelPx, glyphH = 7 * lp;
  for (let k = 0; k < labelGlyphs.length; k++) {
    const g = labelGlyphs[k];
    // Right side reads top to bottom with the angle decreasing; the left side mirrors it
    const a = g.label.side > 0 ? ang - g.along / R : ang + Math.PI + g.along / R;
    // Just outside the curve: clear the letter's box in whatever direction the curve faces
    const r = R + lp * 3 + 0.5 * (Math.abs(Math.cos(a)) * g.w + Math.abs(Math.sin(a)) * glyphH);
    g.x = Math.round(labelGeo.cx + r * Math.cos(a) - g.w / 2);
    g.y = Math.round(labelGeo.cy - r * Math.sin(a) - glyphH / 2);
    g.a = a;
    g.dirX = Math.cos(a);
    g.dirY = -Math.sin(a);
  }
}

// Hover detection, the selection rail, then the letters themselves
export function drawLabels(ctx, t, dt) {
  placeLabels();
  ctx.globalAlpha = 1;
  const lp = labelPx;

  // Hover: which label (if any) is under the cursor
  const mx = (state.mouse.x + 1) / 2 * grid.w, my = (1 - state.mouse.y) / 2 * grid.h;
  hoveredLabel = null;
  SIDE_LABELS.forEach(function (lab) {
    let over = false;
    if (state.hasPointer && state.booted && !state.firing) {
      const pad = lp * 3;
      for (let k = 0; k < labelGlyphs.length && !over; k++) {
        const g = labelGlyphs[k];
        if (g.label !== lab || !g.rows) continue;
        if (mx > g.x - pad && mx < g.x + g.w + pad && my > g.y - pad && my < g.y + 7 * lp + pad) over = true;
      }
    }
    if (over && !lab.hovered && !reduceMotion) {
      // Hover in: the word re-decodes in a quick wave from first letter to last
      labelGlyphs.forEach(function (g) {
        if (g.label !== lab) return;
        g.scr.start = Math.min(g.scr.start, t + g.index * 0.03);
        g.scr.end = t + g.index * 0.03 + 0.12;
      });
    }
    lab.hovered = over;
    if (over) hoveredLabel = lab;
    lab.h += ((over ? 1 : 0) - lab.h) * Math.min(1, dt * (over ? 10 : 6));
    if (lab.h < 0.002) lab.h = 0;
  });
  renderer.domElement.style.cursor = (hoveredLabel || state.overEar || state.overEye) ? 'pointer' : '';

  // Selection rail: a dotted red arc that draws itself along the hovered word
  SIDE_LABELS.forEach(function (lab) {
    if (lab.h <= 0.01) return;
    const gs = labelGlyphs.filter(function (g) { return g.label === lab && g.rows; });
    const a0 = gs[0].a, a1 = gs[gs.length - 1].a;
    const rr = labelGeo.R + lp * 1.5;
    const n = Math.max(2, Math.floor(Math.abs(a1 - a0) * rr / (lp * 3)));
    const shown = Math.floor((n + 1) * Math.min(1, lab.h * 1.3));
    ctx.globalAlpha = Math.min(1, lab.h * 1.5);
    ctx.fillStyle = '#ff0a1e';
    for (let i = 0; i < shown; i++) {
      const a = lerp(a0, a1, i / n);
      ctx.fillRect(Math.round(labelGeo.cx + rr * Math.cos(a) - lp / 2), Math.round(labelGeo.cy - rr * Math.sin(a) - lp / 2), lp, lp);
    }
    ctx.globalAlpha = 1;
  });

  for (let k = 0; k < labelGlyphs.length; k++) {
    const g = labelGlyphs[k];
    if (!g.rows) continue;
    const st = scrambleState(g.scr, t, g.rows[0].length);
    if (st === 'hidden') continue;
    const draw = st || g.rows;
    // Hover pushes letters outward in a staggered wave, brightens them, and adds a red glitch shadow
    const lab = g.label;
    const local = clamp(lab.h * 1.6 - (g.index / lab.text.length) * 0.6, 0, 1);
    const e = local * local * (3 - 2 * local);
    const off = e * lp * 2.5;
    const gx = g.x + Math.round(g.dirX * off), gy = g.y + Math.round(g.dirY * off);
    if (e > 0.05) {
      const jit = lab.hovered && !reduceMotion && Math.random() < 0.08 ? (Math.random() < 0.5 ? -lp : lp) : 0;
      const sx = gx + Math.round(g.dirX * lp) + jit, sy = gy + Math.round(g.dirY * lp);
      ctx.globalAlpha = 0.8 * e;
      ctx.fillStyle = '#ff0a1e';
      for (let ry = 0; ry < draw.length; ry++) {
        const row = draw[ry];
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] === '#') ctx.fillRect(sx + rx * lp, sy + ry * lp, lp, lp);
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = st ? '#ff0a1e' : LABEL_LEVELS[Math.round(e * 8)];
    for (let ry = 0; ry < draw.length; ry++) {
      const row = draw[ry];
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] === '#') ctx.fillRect(gx + rx * lp, gy + ry * lp, lp, lp);
      }
    }
  }
}
