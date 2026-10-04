// Inside the eye: the machine room around a case study. Two tall strips of machinery fill the side margins:
// the inside wall of the eye (armour plates with red seams), a truss girder, gear trains that really mesh and
// turn with the scroll, hydraulic pistons, pipes and cable bundles, pressure gauges, and four CRT monitors
// with information worth reading (a section index and this visit's stats). The strips stay put while the
// page scrolls; the gears turn with the scroll.
// Nothing sits behind the text column, and it hides when the margins are too thin (phones).
import { scene, camera, camBase, reduceMotion, srgb, clamp } from './core.js';
import { drawPixelText, pixelTextWidth, LABEL_COLOR } from './pixel-font.js';
import { state, beatRings } from './state.js';
import { M } from './eye/materials.js';
import { bake } from './cat-model.js';

const TAU = Math.PI * 2;
const caseEl = document.getElementById('case');
const RED = srgb(0xff0a1e);
const glow = new THREE.MeshBasicMaterial({ color: RED, toneMapped: false });
const seamGlow = new THREE.MeshBasicMaterial({ color: RED.clone().multiplyScalar(0.55), toneMapped: false });
const wallGlow = new THREE.MeshBasicMaterial({ color: RED.clone().multiplyScalar(0.16), toneMapped: false });
const steel = new THREE.MeshStandardMaterial({ color: srgb(0x2a3038), metalness: 0.85, roughness: 0.42, envMapIntensity: 1 });
const DEPTH = -1.2;           // the plane the machinery sits on (behind the eye's usual spot)
const PANEL_HALF = 470;       // CSS px: half the width kept clear for the text column (.case-inner is 900 wide)
const STRIP_W = 0.9;          // design width of a strip, in half-screen-heights

const root = new THREE.Group();
root.visible = false;
scene.add(root);
// While hidden, skip the per-frame matrix update of every part inside (three.js walks invisible children too)
root.updateMatrixWorld = function (force) { if (this.visible) THREE.Object3D.prototype.updateMatrixWorld.call(this, force); };

function add(parent, geo, mat, x, y, z, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  if (rz) m.rotation.z = rz;
  parent.add(m);
  return m;
}
const unitBox = new THREE.BoxGeometry(1, 1, 1);
function box(parent, mat, sx, sy, sz, x, y, z, rz) { const m = add(parent, unitBox, mat, x, y, z, rz); m.scale.set(sx, sy, sz); return m; }
const boltGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.012, 8).rotateX(Math.PI / 2);
function bolt(parent, x, y, z) { return add(parent, boltGeo, M.chrome, x, y, z); }
function live(o) { o.userData.live = true; return o; }

// ---------- Gears ----------
// Every gear in the machine shares one tooth size (module), so any two of them mesh: the centres sit exactly
// a pitch radius apart each, teeth are centred on their angle, and each gear starts turned so its tooth sits
// in its neighbour's gap. A gear with fewer teeth turns faster, the other way, by the tooth ratio.
const MODULE = 0.034;
const gearGeoCache = new Map();
function gearGeometry(teeth) {
  if (gearGeoCache.has(teeth)) return gearGeoCache.get(teeth);
  const m = MODULE, rp = teeth * m / 2, ro = rp + m, rr = rp - 1.25 * m, step = TAU / teeth;
  const s = new THREE.Shape();
  for (let k = 0; k < teeth; k++) {
    const c = k * step;
    // Root, flank up, flat tip, flank down: about half the pitch is tooth, half is gap
    [[c - step * 0.5, rr], [c - step * 0.29, rr], [c - step * 0.15, ro], [c + step * 0.15, ro], [c + step * 0.29, rr]].forEach(function (q, i) {
      const x = Math.cos(q[0]) * q[1], y = Math.sin(q[0]) * q[1];
      if (k === 0 && i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    });
  }
  // Spoked web: a rim, a hub and windows between the spokes (small gears are solid with an axle hole)
  const rim = rr - 0.03, hub = Math.max(0.05, rp * 0.3);
  if (rim - hub > 0.06) {
    const n = teeth >= 24 ? 6 : teeth >= 16 ? 5 : 4, sw = 0.022;
    for (let k = 0; k < n; k++) {
      const a0 = k / n * TAU, a1 = (k + 1) / n * TAU;
      const p = new THREE.Path();
      p.absarc(0, 0, rim, a0 + sw / rim, a1 - sw / rim, false);
      p.absarc(0, 0, hub + 0.015, a1 - sw / hub, a0 + sw / hub, true);
      s.holes.push(p);
    }
  }
  const ax = new THREE.Path(); ax.absarc(0, 0, Math.min(0.025, hub * 0.4), 0, TAU, true); s.holes.push(ax);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.045, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelOffset: -0.006, bevelSegments: 2, curveSegments: 12 })
    .translate(0, 0, -0.0225);
  gearGeoCache.set(teeth, geo);
  return geo;
}
const gears = [];
function gear(parent, teeth, x, y, mat, ratio, phase) {
  const rp = teeth * MODULE / 2, hub = Math.max(0.05, rp * 0.3);
  const g = live(new THREE.Group());
  g.position.set(x, y, 0);
  add(g, gearGeometry(teeth), mat);
  if (rp > 0.2) add(g, new THREE.TorusGeometry(rp - 1.25 * MODULE - 0.03, 0.008, 6, 48), M.chrome, 0, 0, 0.03);   // rim edge
  // Hub: a boss, a ring of bolts, a small red light in the middle
  add(g, new THREE.CylinderGeometry(hub, hub, 0.075, 24).rotateX(Math.PI / 2), M.armorLight);
  const nb = rp > 0.2 ? 6 : 4;
  for (let k = 0; k < nb; k++) { const a = k / nb * TAU; bolt(g, Math.cos(a) * hub * 0.7, Math.sin(a) * hub * 0.7, 0.042); }
  add(g, new THREE.CylinderGeometry(hub * 0.32, hub * 0.32, 0.09, 14).rotateX(Math.PI / 2), M.chrome);
  add(g, new THREE.CircleGeometry(hub * 0.16, 12), glow, 0, 0, 0.046);
  parent.add(g);
  gears.push({ g: g, ratio: ratio, phase: phase });
  // The axle bracket holding it to the wall
  box(parent, steel, hub * 1.6, hub * 1.6, 0.2, x, y, -0.12);
  return { x: x, y: y, teeth: teeth, rp: rp, ratio: ratio, phase: phase };
}
// A train: each gear meshes with the one before it, at an angle measured outward (0 = away from the text
// column, PI/2 = up), mirrored for the left side so trains always fan toward the screen edge
function train(parent, side, x, y, list, mat0) {
  let prev = null;
  list.forEach(function (it, k) {
    const mat = k === 0 ? mat0 : k % 2 ? M.armorLight : M.lid;
    if (!prev) { prev = gear(parent, it.teeth, x, y, mat, 1, 0); return; }
    const at = side > 0 ? it.at : Math.PI - it.at;
    const rp = it.teeth * MODULE / 2, d = prev.rp + rp + 0.004;
    const gx = prev.x + Math.cos(at) * d, gy = prev.y + Math.sin(at) * d;
    const ratio = -prev.ratio * prev.teeth / it.teeth;
    // Turning the previous gear by (at - its phase) brings one of its teeth round to face this one. This gear
    // turns the other way by the tooth ratio, and at that moment it must show a gap (half a pitch off a tooth)
    // back along the line between the centres.
    const phase = at + Math.PI + Math.PI / it.teeth + (at - prev.phase) * prev.teeth / it.teeth;
    prev = gear(parent, it.teeth, gx, gy, mat, ratio, phase);
  });
}

// ---------- Hydraulic pistons: barrel on a clevis, chrome rod, a hose ----------
const pistons = [];
function piston(parent, x, y, len, phase) {
  box(parent, steel, 0.1, 0.06, 0.12, x, y + 0.03, -0.06);                              // top mount
  add(parent, new THREE.CylinderGeometry(0.018, 0.018, 0.12, 10).rotateX(Math.PI / 2), M.chrome, x, y, -0.02);
  add(parent, new THREE.CylinderGeometry(0.042, 0.042, len, 16), M.armorLight, x, y - len / 2, 0);
  [0.08, len - 0.08].forEach(function (d) { add(parent, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), M.armor, x, y - d, 0); });
  box(parent, seamGlow, 0.006, len * 0.6, 0.006, x + 0.043, y - len / 2, 0.012);
  const rod = live(new THREE.Group());
  rod.position.set(x, y - len, 0);
  add(rod, new THREE.CylinderGeometry(0.018, 0.018, len * 0.75, 12), M.chrome, 0, -len * 0.33, 0);
  box(rod, M.armor, 0.08, 0.05, 0.09, 0, -len * 0.72, 0);
  add(rod, new THREE.CylinderGeometry(0.016, 0.016, 0.1, 10).rotateX(Math.PI / 2), M.chrome, 0, -len * 0.72, 0.01);
  parent.add(rod);
  pistons.push({ rod: rod, y0: y - len, amp: len * 0.22, phase: phase });
  // Hose looping from the barrel to the wall
  const c = new THREE.CatmullRomCurve3([new THREE.Vector3(x + 0.04, y - 0.12, 0.02), new THREE.Vector3(x + 0.14, y - 0.2, 0.0), new THREE.Vector3(x + 0.16, y - len * 0.7, -0.12)]);
  add(parent, new THREE.TubeGeometry(c, 20, 0.012, 6, false), M.dark);
}

// ---------- Pressure gauges: chrome bezel, ticks, a red needle ----------
const gauges = [];
const gaugeFace = new THREE.MeshBasicMaterial({ color: srgb(0x0b0e12), toneMapped: false });
function gauge(parent, x, y, r, phase) {
  add(parent, new THREE.CylinderGeometry(r * 1.1, r * 1.15, 0.06, 28).rotateX(Math.PI / 2), M.armor, x, y, -0.02);
  add(parent, new THREE.TorusGeometry(r, r * 0.12, 8, 32), M.chrome, x, y, 0.02);
  add(parent, new THREE.CircleGeometry(r * 0.94, 28), gaugeFace, x, y, 0.012);
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * 1.25 - k / 10 * Math.PI * 1.5, big = k % 5 === 0;
    box(parent, k >= 8 ? glow : M.chrome, r * 0.04, r * (big ? 0.22 : 0.13), 0.004, x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72, 0.016, a - Math.PI / 2);
  }
  const needle = live(new THREE.Group());
  needle.position.set(x, y, 0.02);
  box(needle, glow, r * 0.05, r * 0.7, 0.004, 0, r * 0.3, 0);
  add(needle, new THREE.CylinderGeometry(r * 0.1, r * 0.1, 0.012, 12).rotateX(Math.PI / 2), M.chrome);
  parent.add(needle);
  add(parent, new THREE.CylinderGeometry(0.018, 0.018, 0.08, 10), M.chrome, x, y - r * 1.15 - 0.03, -0.02);   // pipe stub below
  gauges.push({ needle: needle, phase: phase });
}

// ---------- CRT monitors ----------
const monitors = [];
const glass = new THREE.MeshPhysicalMaterial({ color: srgb(0x9aa6b2), roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 1.5 });
function roundRect(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
function monitor(parent, side, x, y, w, h, kind) {
  const cv = document.createElement('canvas');
  cv.width = 200; cv.height = Math.round(200 * h / w);
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  // Housing with rounded corners, a dark bezel, the screen behind glass
  add(parent, new THREE.ExtrudeGeometry(roundRect(w + 0.14, h + 0.16, 0.05), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 }), M.armor, x, y - 0.012, -0.1);
  const bz = roundRect(w + 0.05, h + 0.05, 0.025);
  bz.holes.push(roundRect(w, h, 0.012));
  add(parent, new THREE.ExtrudeGeometry(bz, { depth: 0.012, bevelEnabled: false }), M.dark, x, y, 0.07);
  add(parent, new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), x, y, 0.074);
  add(parent, new THREE.PlaneGeometry(w, h), glass, x, y, 0.08);
  // Chin: status lights, a row of buttons, corner bolts, vents on top
  const cy = y - h / 2 - 0.05;
  box(parent, glow, 0.026, 0.012, 0.01, x + w / 2 - 0.03, cy, 0.075);
  box(parent, seamGlow, 0.026, 0.012, 0.01, x + w / 2 - 0.07, cy, 0.075);
  for (let k = 0; k < 3; k++) add(parent, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10).rotateX(Math.PI / 2), M.chrome, x - w / 2 + 0.04 + k * 0.045, cy, 0.075);
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (c) { bolt(parent, x + c[0] * (w / 2 + 0.045), y + c[1] * (h / 2 + 0.05) - 0.01, 0.075); });
  for (let k = 0; k < 6; k++) box(parent, M.dark, 0.05, 0.012, 0.1, x - 0.15 + k * 0.06, y + h / 2 + 0.07, -0.02);
  // Arm back to the girder
  box(parent, steel, Math.abs(x - side * 0.08), 0.05, 0.05, (x + side * 0.08) / 2, y, -0.16);
  add(parent, new THREE.SphereGeometry(0.04, 12, 10), M.chrome, x, y, -0.16);
  monitors.push({ cv: cv, g: cv.getContext('2d'), tex: tex, kind: kind });
}

// ---------- One strip, built in half-screen-height units; x measured outward from the text column ----------
const WALL_Y0 = 1.5, WALL_Y1 = -3.4;   // one screen tall at the smallest strip scale: the strips don't move
function strip(side) {
  const s = new THREE.Group();
  const X = function (xo) { return side * xo; };
  // The inside wall of the eye: armour plates over a red glow, so the seams light up, with bolts and vents
  // (the glow only spans the plates, so it never shows beside the text column)
  box(s, wallGlow, 1.56, WALL_Y0 - WALL_Y1, 0.01, X(0.04 + 0.78), (WALL_Y0 + WALL_Y1) / 2, -0.47);
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 3; col++) {
      const pw = 0.52, ph = 0.56, gap = 0.016;
      const x = X(0.02 + col * (pw + gap) + pw / 2), y = WALL_Y0 - row * (ph + gap) - ph / 2;
      const mats = [M.armor, M.sector, steel];
      box(s, mats[(row + col * 2) % 3], pw, ph, 0.05, x, y, -0.44);
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (c) { bolt(s, x + c[0] * (pw / 2 - 0.03), y + c[1] * (ph / 2 - 0.03), -0.41); });
      if ((row * 3 + col) % 5 === 2) for (let v = 0; v < 5; v++) box(s, M.dark, pw * 0.6, 0.014, 0.012, x, y + 0.12 - v * 0.06, -0.41);
    }
  }
  // Truss girder near the text column: two rails, zig-zag struts, rivets at every joint
  [0.03, 0.15].forEach(function (xo) { box(s, M.armorLight, 0.026, WALL_Y0 - WALL_Y1, 0.05, X(xo), (WALL_Y0 + WALL_Y1) / 2, -0.25); });
  for (let k = 0; k < 28; k++) {
    const y0 = WALL_Y0 - k * 0.18, y1 = y0 - 0.18;
    const len = Math.hypot(0.12, 0.18), a = Math.atan2(y1 - y0, (k % 2 ? -1 : 1) * 0.12 * side);
    box(s, steel, len, 0.016, 0.02, X(0.09), (y0 + y1) / 2, -0.26, a);
    bolt(s, X(k % 2 ? 0.15 : 0.03), y0, -0.22);
  }
  // Pipe down the outer side, with flanged couplings and a valve wheel
  add(s, new THREE.CylinderGeometry(0.034, 0.034, WALL_Y0 - WALL_Y1, 14), M.armorLight, X(0.88), (WALL_Y0 + WALL_Y1) / 2, -0.3);
  for (let k = 0; k < 7; k++) {
    add(s, new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16), steel, X(0.88), WALL_Y0 - 0.4 - k * 0.72, -0.3);
    for (let b = 0; b < 4; b++) bolt(s, X(0.88) + Math.cos(b * TAU / 4 + 0.78) * 0.042, WALL_Y0 - 0.4 - k * 0.72, -0.27);
  }
  add(s, new THREE.TorusGeometry(0.07, 0.01, 6, 20), glow, X(0.88), -1.9, -0.25);
  for (let k = 0; k < 4; k++) box(s, M.chrome, 0.012, 0.13, 0.012, X(0.88), -1.9, -0.25, k * Math.PI / 4);
  // Cable bundle with clamps
  [0, 1, 2].forEach(function (k) {
    const pts = [];
    for (let q = 0; q <= 10; q++) pts.push(new THREE.Vector3(X(0.25 + k * 0.02 + Math.sin(q * 0.8) * 0.03), WALL_Y0 - q * 0.5, -0.33 + k * 0.01));
    add(s, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 90, 0.009, 6, false), k === 1 ? seamGlow : M.dark);
  });
  for (let k = 0; k < 10; k++) box(s, steel, 0.11, 0.025, 0.04, X(0.27), WALL_Y0 - 0.25 - k * 0.5, -0.31);

  if (side < 0) {
    monitor(s, side, X(0.48), 0.42, 0.74, 0.66, 'index');
    train(s, side, X(0.62), -0.75, [{ teeth: 28 }, { teeth: 14, at: 1.9 }, { teeth: 10, at: 0.35 }], M.armor);
    gauge(s, X(0.25), -1.35, 0.1, 0);
    piston(s, X(0.6), -1.45, 0.4, 0);
    train(s, side, X(0.45), -2.75, [{ teeth: 20 }, { teeth: 30, at: -0.4 }], M.armorLight);
  } else {
    monitor(s, side, X(0.48), 0.42, 0.74, 0.66, 'session');
    train(s, side, X(0.64), -0.75, [{ teeth: 24 }, { teeth: 12, at: 1.95 }, { teeth: 18, at: 0.9 }], M.armor);
    gauge(s, X(0.26), -1.3, 0.1, 0.9);
    piston(s, X(0.2), -1.75, 0.4, 1.4);
    train(s, side, X(0.62), -2.85, [{ teeth: 24 }, { teeth: 12, at: -0.6 }], M.armorLight);
  }
  bake(s);
  root.add(s);
  return s;
}
const strips = [strip(-1), strip(1)];

// ---------- What the monitors show ----------
const two = function (n) { return (n < 10 ? '0' : '') + n; };
const SUPPORTED = /[A-Z0-9 .:/>+\-@%]/;
function clean(str) { return String(str).toUpperCase().replace(/–|—/g, '-').split('').map(function (c) { return SUPPORTED.test(c) ? c : ' '; }).join(''); }
const sessionStart = performance.now();
const view = { k: 0, idx: 0, sections: [], prog: 0 };
function text(g, str, x, y, col, px) { drawPixelText(g, str, x, y, px || 2, function () { return col; }, null, 0); }
function header(g, W, label) {
  g.fillStyle = '#ff0a1e';
  g.fillRect(8, 9, 8, 8);
  text(g, label, 22, 8, LABEL_COLOR);
  g.fillStyle = '#262c33';
  g.fillRect(8, 28, W - 16, 2);
}
function feed(m, t) {
  const g = m.g, W = m.cv.width, H = m.cv.height;
  g.fillStyle = '#05070a';
  g.fillRect(0, 0, W, H);
  const L = 18;   // line height
  if (m.kind === 'index') {
    header(g, W, 'INDEX');
    view.sections.forEach(function (name, k) {
      const on = k === view.idx;
      text(g, (on ? '>' : ' ') + clean(name).slice(0, 14), 8, 36 + k * 17, on ? '#ff0a1e' : k < view.idx ? LABEL_COLOR : '#6f7b87');
    });
    const by = H - 18, n = 10;
    for (let k = 0; k < n; k++) { g.fillStyle = k < Math.round(view.prog * n) ? '#ff0a1e' : '#262c33'; g.fillRect(8 + k * 10, by, 8, 8); }
    const pc = Math.round(view.prog * 100);
    text(g, (pc < 100 ? '0' : '') + (pc < 10 ? '0' : '') + pc + '%', W - 8 - pixelTextWidth('000%', 2), by - 3, LABEL_COLOR);
  } else {
    header(g, W, 'SESSION');
    const secs = Math.floor((performance.now() - sessionStart) / 1000);
    let breaches = 0;
    try { breaches = +sessionStorage.getItem('breach-count') || 0; } catch (err) { breaches = 0; }
    const rows = [['TIME', two(Math.floor(secs / 60)) + ':' + two(secs % 60)], ['SHOTS', String(state.stats.shots).padStart(4, '0')],
      ['BURNED', String(state.stats.burns).padStart(4, '0')], ['CATS', two(state.stats.cats)], ['BREACH', two(breaches)]];
    rows.forEach(function (r, k) {
      text(g, r[0], 8, 38 + k * L, '#6f7b87');
      text(g, r[1], W - 8 - pixelTextWidth(r[1], 2), 38 + k * L, k === 0 ? '#ffffff' : '#ff0a1e');
    });
  }
  // Scanlines and a soft rolling bar, like an old CRT
  g.globalAlpha = 0.22; g.fillStyle = '#000';
  for (let y = 0; y < H; y += 2) g.fillRect(0, y, W, 1);
  if (!reduceMotion) { g.globalAlpha = 0.05; g.fillStyle = '#ffffff'; g.fillRect(0, (t * 30) % (H + 30) - 30, W, 24); }
  g.globalAlpha = 1;
  m.tex.needsUpdate = true;
}

// ---------- Per frame ----------
let lastFeed = 0, lastScroll = 0, scrollSpin = 0;
export function updateInterior(t) {
  const show = state.dive.open;
  root.visible = show;
  if (!show) return;

  // Fit the strips to the margins either side of the text column, at the machinery's depth
  const vw = window.innerWidth, vh = window.innerHeight;
  const H = (camBase.z - DEPTH) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const margin = (vw / 2 - PANEL_HALF) / (vh / 2);                  // in half-screen-heights
  const ok = margin > 0.32;
  strips.forEach(function (s) { s.visible = ok; });
  if (!ok) return;
  const sc = clamp(margin / (STRIP_W + 0.1), 0.45, 1.3);
  const scroll = caseEl.scrollTop;
  view.prog = caseEl.scrollHeight > caseEl.clientHeight ? scroll / (caseEl.scrollHeight - caseEl.clientHeight) : 1;
  strips.forEach(function (s, k) {
    const side = k === 0 ? -1 : 1;
    s.scale.setScalar(H * sc);
    // Fixed in place (Shining asked): the top of the strip (local y 0.9) sits near the top of the screen
    s.position.set(side * (PANEL_HALF / (vh / 2) + 0.04) * H, (0.86 - 0.9 * sc) * H, DEPTH);
  });
  // Gears (and the pistons they drive) only turn when the page scrolls (Shining asked); still otherwise
  if (!reduceMotion) scrollSpin += (scroll - lastScroll) * 0.004;
  lastScroll = scroll;
  const master = reduceMotion ? 0 : scrollSpin;
  gears.forEach(function (g) { g.g.rotation.z = master * g.ratio + g.phase; });
  pistons.forEach(function (p) { p.rod.position.y = p.y0 - (reduceMotion ? 0 : (Math.sin(master * 2 + p.phase) * 0.5 + 0.5) * p.amp); });

  // What's being read: which project, which section (the last whose top passed 40% of the screen), how far down
  const secs = caseEl.querySelectorAll('.case-section');
  view.sections = Array.prototype.map.call(secs, function (el) { const h = el.querySelector('.case-h'); return h ? h.dataset.text : ''; });
  let idx = 0;
  secs.forEach(function (el, k) { if (el.getBoundingClientRect().top < vh * 0.4) idx = k; });
  view.idx = view.prog > 0.98 ? Math.max(0, secs.length - 1) : idx;   // the bottom of the page is the last section
  view.k = Math.max(0, state.dive.idx);
  // Gauges: one reads how far down the page you are, the others breathe with the clock
  gauges.forEach(function (g, k) {
    const v = k % 2 ? view.prog : 0.5 + 0.35 * Math.sin((reduceMotion ? 0 : beatRings[3].angle * 3) * 0.7 + g.phase);
    g.needle.rotation.z = Math.PI * 0.75 - clamp(v, 0, 1) * Math.PI * 1.5;
  });
  if (t - lastFeed > 1 / 12 || (reduceMotion && t - lastFeed > 1)) {
    lastFeed = t;
    monitors.forEach(function (m) { feed(m, t); });
  }
}
