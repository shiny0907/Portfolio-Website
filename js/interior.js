// Inside the eye: the machine room around a case study. Two tall strips of machinery in the side margins
// (a girder, gear trains that tick on the eye's clock, pistons, cables, and CRT monitors with live feeds),
// matrix rain behind them on the grid layer, and scrolling drives it all: the strips slide past slower than
// the text, the gears turn with the scroll, and the terminal monitor shows which section you're reading.
// Nothing sits behind the text column or over the corner texts, and it hides when the margins are too thin.
import { scene, camera, camBase, renderer, reduceMotion, srgb, clamp } from './core.js';
import { drawPixelText, pixelTextWidth, LABEL_COLOR } from './pixel-font.js';
import { state, beatRings } from './state.js';
import { grid } from './grid/grid.js';
import { M } from './eye/materials.js';
import { bake } from './cat-model.js';
import { PROJECTS } from './projects.js';

const TAU = Math.PI * 2;
const caseEl = document.getElementById('case');
const RED = srgb(0xff0a1e);
const glow = new THREE.MeshBasicMaterial({ color: RED, toneMapped: false });
const glowDim = new THREE.MeshBasicMaterial({ color: RED.clone().multiplyScalar(0.35), toneMapped: false });
const DEPTH = -1.2;           // the plane the machinery sits on (behind the eye's usual spot)
const PANEL_HALF = 470;       // CSS px: half the text column's dark panel (see .case::before)
const STRIP_W = 0.9;          // design width of a strip, in half-screen-heights
const PARALLAX = 0.4;         // the machinery moves at this share of the scroll speed

const root = new THREE.Group();
root.visible = false;
scene.add(root);

function add(parent, geo, mat, x, y, z, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  if (rz) m.rotation.z = rz;
  parent.add(m);
  return m;
}
const unitBox = new THREE.BoxGeometry(1, 1, 1);
function box(parent, mat, sx, sy, sz, x, y, z, rz) { const m = add(parent, unitBox, mat, x, y, z, rz); m.scale.set(sx, sy, sz); return m; }

// ---- Gears ----
function gearGeometry(teeth, r, depth, thick) {
  const s = new THREE.Shape(), step = TAU / teeth, rr = r - depth;
  for (let k = 0; k < teeth; k++) {
    const a = k * step;
    [[a, rr], [a + step * 0.14, r], [a + step * 0.4, r], [a + step * 0.54, rr], [a + step * 0.77, rr]].forEach(function (q, i) {
      const x = Math.cos(q[0]) * q[1], y = Math.sin(q[0]) * q[1];
      if (k === 0 && i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    });
  }
  // Axle hole and lightening holes between the spokes
  const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.14, 0, TAU, true); s.holes.push(hole);
  if (r > 0.18) {
    const n = teeth > 18 ? 6 : 5;
    for (let k = 0; k < n; k++) {
      const a = k / n * TAU, h = new THREE.Path();
      h.absarc(Math.cos(a) * rr * 0.55, Math.sin(a) * rr * 0.55, rr * 0.2, 0, TAU, true);
      s.holes.push(h);
    }
  }
  return new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelOffset: -0.008, bevelSegments: 1, curveSegments: 10 })
    .translate(0, 0, -thick / 2);
}
const gears = [];
function gear(parent, teeth, r, x, y, mat, drive) {
  const g = new THREE.Group();
  g.position.set(x, y, 0);
  g.userData.live = true;
  add(g, gearGeometry(teeth, r, Math.min(0.05, r * 0.16), 0.05), mat);
  add(g, new THREE.TorusGeometry(r * 0.62, 0.006, 4, 40), glowDim, 0, 0, 0.032);
  add(g, new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.08, 18).rotateX(Math.PI / 2), M.chrome);
  add(g, new THREE.CircleGeometry(r * 0.08, 12), glow, 0, 0, 0.042);
  parent.add(g);
  gears.push({ g: g, ratio: drive.ratio, phase: drive.phase });
  return g;
}
// A train: each gear meshes with the one before it, at the given angle, turning the other way.
// Angles are measured outward (0 = away from the text column, PI/2 = up) and mirrored for the left side,
// so trains always fan out toward the screen edge, never into the text.
function train(parent, side, x, y, list, mat0) {
  let prev = null;
  list.forEach(function (it, k) {
    const r = it.teeth * 0.0175;
    let gx = x, gy = y, ratio = 1, phase = 0;
    if (prev) {
      const d = prev.r + r - Math.min(0.05, r * 0.16) * 0.55;
      const at = side > 0 ? it.at : Math.PI - it.at;
      gx = prev.x + Math.cos(at) * d; gy = prev.y + Math.sin(at) * d;
      it = { teeth: it.teeth, at: at };
      ratio = -prev.ratio * prev.teeth / it.teeth;
      phase = it.at + Math.PI + Math.PI / it.teeth - (prev.phase - it.at) * prev.teeth / it.teeth;
    }
    gear(parent, it.teeth, r, gx, gy, k === 0 ? mat0 : k % 2 ? M.armorLight : M.chrome, { ratio: ratio, phase: phase });
    prev = { x: gx, y: gy, r: r, teeth: it.teeth, ratio: ratio, phase: phase };
  });
}

// ---- Pistons ----
const pistons = [];
function piston(parent, x, y, len, phase) {
  box(parent, M.armor, 0.07, len, 0.07, x, y, -0.02);
  box(parent, glowDim, 0.012, len * 0.8, 0.012, x + 0.036, y, 0.02);
  const rod = new THREE.Group();
  rod.userData.live = true;
  rod.position.set(x, y - len / 2, 0);
  add(rod, new THREE.CylinderGeometry(0.018, 0.018, len * 0.7, 10), M.chrome, 0, -len * 0.3, 0);
  box(rod, M.armorLight, 0.09, 0.05, 0.08, 0, -len * 0.66, 0);
  parent.add(rod);
  pistons.push({ rod: rod, y0: y - len / 2, amp: len * 0.18, phase: phase });
}

// ---- Monitors: a CRT in a bezel, a canvas screen behind glass, a status light ----
const monitors = [];
const glass = new THREE.MeshPhysicalMaterial({ color: srgb(0x9aa6b2), roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 1.4 });
function monitor(parent, x, y, w, h, kind) {
  const cv = document.createElement('canvas');
  cv.width = 192; cv.height = Math.round(192 * h / w);
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  box(parent, M.armor, w + 0.08, h + 0.08, 0.12, x, y, 0.02);
  box(parent, M.dark, w + 0.02, h + 0.02, 0.01, x, y, 0.085);
  add(parent, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), x, y, 0.092);
  add(parent, new THREE.PlaneGeometry(w, h), glass, x, y, 0.1);
  box(parent, glow, 0.03, 0.012, 0.01, x + w / 2 - 0.03, y - h / 2 - 0.022, 0.09);
  for (let k = 0; k < 3; k++) box(parent, M.dark, 0.05, 0.008, 0.01, x - w / 2 + 0.05 + k * 0.07, y - h / 2 - 0.022, 0.09);
  // Bolts at the bezel corners
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (c) {
    add(parent, new THREE.CylinderGeometry(0.012, 0.012, 0.012, 8).rotateX(Math.PI / 2), M.chrome, x + c[0] * (w / 2 + 0.02), y + c[1] * (h / 2 + 0.02), 0.085);
  });
  monitors.push({ cv: cv, g: cv.getContext('2d'), tex: tex, kind: kind, seed: Math.random() * 10 });
}

// ---- A strip of machinery. Built in half-screen-height units, x measured outward from the text column ----
function strip(side) {
  const s = new THREE.Group();
  const X = function (xo) { return side * xo; };
  // Structure: a girder near the inner edge with rivets, and a thinner rail further out
  box(s, M.armor, 0.06, 7.2, 0.06, X(0.06), -2.4, -0.12);
  box(s, M.armorLight, 0.022, 7.2, 0.08, X(0.06), -2.4, -0.1);
  for (let k = 0; k < 28; k++) add(s, new THREE.CylinderGeometry(0.01, 0.01, 0.012, 6).rotateX(Math.PI / 2), M.chrome, X(0.06), 1.1 - k * 0.25, -0.08);
  box(s, M.dark, 0.035, 7.2, 0.035, X(0.78), -2.4, -0.16);
  box(s, glowDim, 0.006, 7.2, 0.006, X(0.06) + side * 0.034, -2.4, -0.09);
  // Cross braces between the two
  for (let k = 0; k < 6; k++) {
    const y = 0.8 - k * 1.25;
    box(s, M.dark, 0.74, 0.03, 0.03, X(0.42), y, -0.14, side * 0.5);
  }
  if (side < 0) {
    monitor(s, X(0.42), 0.42, 0.6, 0.44, 'optic');
    train(s, side, X(0.6), -0.62, [{ teeth: 26 }, { teeth: 14, at: 2.0 }, { teeth: 9, at: 0.5 }], M.armor);
    piston(s, X(0.22), -1.25, 0.5, 0); piston(s, X(0.36), -1.3, 0.42, 1.6);
    monitor(s, X(0.42), -2.05, 0.6, 0.46, 'log');
    train(s, side, X(0.45), -3.0, [{ teeth: 18 }, { teeth: 24, at: -0.4 }, { teeth: 10, at: -2.0 }], M.armorLight);
    monitor(s, X(0.42), -4.0, 0.56, 0.4, 'wave');
  } else {
    train(s, side, X(0.6), 0.5, [{ teeth: 22 }, { teeth: 12, at: 2.0 }, { teeth: 16, at: -0.6 }], M.armor);
    monitor(s, X(0.4), -0.55, 0.6, 0.44, 'wave');
    train(s, side, X(0.66), -1.6, [{ teeth: 30 }, { teeth: 11, at: 4.2 }], M.armorLight);
    monitor(s, X(0.4), -2.6, 0.58, 0.46, 'radar');
    piston(s, X(0.2), -3.35, 0.5, 0.8); piston(s, X(0.34), -3.4, 0.44, 2.4);
    train(s, side, X(0.55), -4.2, [{ teeth: 20 }, { teeth: 13, at: 2.2 }], M.armor);
  }
  // A couple of cables snaking down, each with a light running inside
  [0.24, 0.52].forEach(function (xo, k) {
    const pts = [];
    for (let q = 0; q <= 14; q++) pts.push(new THREE.Vector3(X(xo + Math.sin(q * 0.9 + k * 2) * 0.05), 1.2 - q * 0.5, -0.18));
    const curve = new THREE.CatmullRomCurve3(pts);
    add(s, new THREE.TubeGeometry(curve, 80, 0.016, 6, false), M.dark);
    add(s, new THREE.TubeGeometry(curve, 80, 0.005, 4, false), glowDim, 0, 0, 0.012);
  });
  bake(s);
  root.add(s);
  return s;
}
const strips = [strip(-1), strip(1)];

// ---- Monitor feeds (drawn a dozen times a second) ----
const reading = { idx: 0, name: 'OVERVIEW', count: 6, project: '' };
function feed(m, t) {
  const g = m.g, W = m.cv.width, H = m.cv.height;
  g.fillStyle = '#05070a';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ff0a1e';
  if (m.kind === 'optic') {
    // The eye's own view: a pixel iris, its rings stepping round, a target drifting
    const cx = W / 2, cy = H / 2;
    for (let r = 10; r < H / 2 - 4; r += 9) {
      const n = 24, rot = t * (r % 2 ? 0.6 : -0.4) + m.seed;
      for (let k = 0; k < n; k++) {
        if ((k + Math.floor(r / 9)) % 3 === 0) continue;
        const a = rot + k / n * TAU;
        g.globalAlpha = 0.35 + 0.65 * (r / (H / 2));
        g.fillRect(Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy + Math.sin(a) * r) - 1, 3, 3);
      }
    }
    g.globalAlpha = 1;
    g.fillRect(cx - 3, cy - 3, 6, 6);
    const tx = cx + Math.sin(t * 0.7) * 40, ty = cy + Math.cos(t * 0.9) * 22;
    g.fillStyle = '#ffd6da';
    g.fillRect(tx - 8, ty, 5, 1); g.fillRect(tx + 4, ty, 5, 1); g.fillRect(tx, ty - 8, 1, 5); g.fillRect(tx, ty + 4, 1, 5);
    drawPixelText(g, 'OPTIC FEED', 6, 6, 1, function () { return LABEL_COLOR; }, null, t);
  } else if (m.kind === 'wave') {
    // Two scrolling traces
    [[0.35, 1, '#ff0a1e'], [0.7, 0.5, '#6f7b87']].forEach(function (tr) {
      g.fillStyle = tr[2];
      for (let x = 0; x < W; x += 2) {
        const y = H * tr[0] + Math.sin(x * 0.07 + t * 3 * tr[1] + m.seed) * 10 * tr[1] + Math.sin(x * 0.19 - t * 5) * 4;
        g.fillRect(x, Math.round(y), 2, 2);
      }
    });
    g.fillStyle = '#1b2026';
    for (let x = 0; x < W; x += 24) g.fillRect(x, 0, 1, H);
    drawPixelText(g, 'SIGNAL', 6, 6, 1, function () { return LABEL_COLOR; }, null, t);
  } else if (m.kind === 'radar') {
    const cx = W / 2, cy = H / 2 + 6, R = H / 2 - 12;
    g.fillStyle = '#1b2026';
    for (let k = 1; k <= 3; k++) for (let a = 0; a < TAU; a += 0.06) g.fillRect(Math.round(cx + Math.cos(a) * R * k / 3), Math.round(cy + Math.sin(a) * R * k / 3), 1, 1);
    const sw = t * 1.6 + m.seed;
    for (let k = 0; k < 14; k++) {
      const a = sw - k * 0.05;
      g.fillStyle = '#ff0a1e';
      g.globalAlpha = 1 - k / 14;
      for (let r = 0; r < R; r += 2) g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
    g.globalAlpha = 1;
    // Blips that light up as the sweep passes
    for (let k = 0; k < 5; k++) {
      const a = m.seed * 3 + k * 1.3, r = R * (0.3 + (k * 0.17) % 0.6);
      const since = ((sw - a) % TAU + TAU) % TAU;
      g.globalAlpha = Math.max(0, 1 - since / 2.5);
      g.fillStyle = '#ffd6da';
      g.fillRect(Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy + Math.sin(a) * r) - 1, 3, 3);
    }
    g.globalAlpha = 1;
    drawPixelText(g, 'SCAN', 6, 6, 1, function () { return LABEL_COLOR; }, null, t);
  } else {
    // The terminal: what's loaded, and which section you're reading
    const two = function (n) { return (n < 10 ? '0' : '') + n; };
    const lines = [
      ['> LOAD CASE', LABEL_COLOR], ['  ' + reading.project, '#ff0a1e'], ['> SECTIONS ' + two(reading.count), LABEL_COLOR],
      ['> READING ' + two(reading.idx + 1), LABEL_COLOR], ['  ' + reading.name, '#ff0a1e']
    ];
    lines.forEach(function (l, k) { drawPixelText(g, l[0], 6, 8 + k * 11, 1, function () { return l[1]; }, null, t); });
    // A progress bar of squares for how far down the page you are, and a blinking cursor
    const prog = caseEl.scrollHeight > caseEl.clientHeight ? caseEl.scrollTop / (caseEl.scrollHeight - caseEl.clientHeight) : 0;
    for (let k = 0; k < 12; k++) { g.fillStyle = k < Math.round(prog * 12) ? '#ff0a1e' : '#1b2026'; g.fillRect(6 + k * 8, H - 16, 6, 6); }
    if (Math.floor(t * 2) % 2 === 0) { g.fillStyle = LABEL_COLOR; g.fillRect(6 + pixelTextWidth('> ', 1), 8 + 5 * 11, 5, 7); }
  }
  // Scanlines
  g.globalAlpha = 0.25; g.fillStyle = '#000';
  for (let y = 0; y < H; y += 2) g.fillRect(0, y, W, 1);
  g.globalAlpha = 1;
  m.tex.needsUpdate = true;
}

// ---- Matrix rain behind the machinery, on the grid layer, in the margins only ----
const rain = [];
export function drawInteriorRain(ctx, t) {
  if (!root.visible || reduceMotion || !layout.ok) return;
  const C = grid.cell, d = grid.dpr || 1;
  const band = Math.round(((Math.max(16, Math.min(48, grid.w / d * 0.03))) + 52) * d);
  const left = (grid.w / 2 - (PANEL_HALF + 8) * d), right = grid.w - left;
  const cols = Math.ceil(grid.w / C);
  if (rain.length !== cols) { rain.length = 0; for (let i = 0; i < cols; i++) rain.push({ y: Math.random() * grid.h, v: 3 + Math.random() * 6, len: 4 + (Math.random() * 8 | 0), on: Math.random() < 0.5 }); }
  for (let i = 0; i < cols; i++) {
    const x = grid.ox + i * C;
    if (x + C > left && x < right) continue;
    const r = rain[i];
    if (!r.on) continue;
    const headJ = Math.floor((r.y + t * r.v * C) % (grid.h + r.len * C) / C) - r.len;
    for (let k = 0; k < r.len; k++) {
      const y = (headJ + k) * C + grid.oy;
      if (y < band || y > grid.h - band) continue;
      ctx.globalAlpha = k === r.len - 1 ? 0.5 : 0.04 + 0.18 * k / r.len;
      ctx.fillStyle = k === r.len - 1 ? '#ff8f99' : '#ff0a1e';
      ctx.fillRect(x + C * 0.25, y + C * 0.25, C * 0.5, C * 0.5);
    }
  }
  ctx.globalAlpha = 1;
}

// ---- Per frame ----
const layout = { ok: false, H: 1, scale: 1 };
let lastFeed = 0, lastScroll = 0, scrollSpin = 0;
export function updateInterior(t, dt) {
  const show = state.dive.open;
  root.visible = show;
  const cv = renderer.domElement;
  // While inside, the 3D layer fades out at the top and bottom bands too, so nothing covers the corner texts
  const mask = show ? 'linear-gradient(to bottom, transparent calc(var(--edge) + 34px), #000 calc(var(--edge) + 60px), #000 calc(100% - var(--edge) - 60px), transparent calc(100% - var(--edge) - 34px))' : '';
  if (cv.style.maskImage !== mask) { cv.style.webkitMaskImage = mask; cv.style.maskImage = mask; }
  if (!show) { layout.ok = false; return; }

  // Fit the strips to the margins either side of the text column, at the machinery's depth
  const vw = window.innerWidth, vh = window.innerHeight;
  const H = (camBase.z - DEPTH) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const margin = (vw / 2 - PANEL_HALF) / (vh / 2);                  // in half-screen-heights
  layout.ok = margin > 0.32;
  strips.forEach(function (s) { s.visible = layout.ok; });
  if (!layout.ok) return;
  const sc = clamp(margin / (STRIP_W + 0.1), 0.45, 1.3);
  const scroll = caseEl.scrollTop;
  const lift = reduceMotion ? 0 : scroll / (vh / 2) * PARALLAX;     // half-screen-heights
  strips.forEach(function (s, k) {
    const side = k === 0 ? -1 : 1;
    s.scale.setScalar(H * sc);
    // The top of the strip (local y 0.9) sits just under the top corner band; scrolling lifts it
    s.position.set(side * (PANEL_HALF / (vh / 2) + 0.04) * H, (0.8 - 0.9 * sc + lift) * H, DEPTH);
  });
  // Gears tick on the eye's clock (the HUD's second hand) and turn with the scroll
  if (!reduceMotion) scrollSpin += (scroll - lastScroll) * 0.004;
  lastScroll = scroll;
  const master = reduceMotion ? 0 : beatRings[3].angle * 5 + scrollSpin;
  gears.forEach(function (g) { g.g.rotation.z = master * g.ratio + g.phase; });
  pistons.forEach(function (p) { p.rod.position.y = p.y0 - (reduceMotion ? 0 : (Math.sin(master * 2 + p.phase) * 0.5 + 0.5) * p.amp); });

  // Which section is being read: the last one whose top has passed the upper third of the screen
  const secs = caseEl.querySelectorAll('.case-section');
  reading.count = secs.length;
  let idx = 0;
  secs.forEach(function (el, k) { if (el.getBoundingClientRect().top < vh * 0.4) idx = k; });
  reading.idx = idx;
  const h = secs[idx] && secs[idx].querySelector('.case-h');
  reading.name = h ? h.dataset.text : '';
  const title = caseEl.querySelector('.case-head h2');
  reading.project = title ? title.textContent.replace(/ case study$/, '').toUpperCase() : (PROJECTS[0] && PROJECTS[0].title);
  if (t - lastFeed > 1 / 12 || reduceMotion && t - lastFeed > 1) {
    lastFeed = t;
    monitors.forEach(function (m) { feed(m, t); });
  }
}
