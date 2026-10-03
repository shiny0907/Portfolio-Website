// Contact page: sci-fi cats with jetpacks drifting around the open space. Each one is built from its own mix of
// parts (body, head, ears, face, jetpack, tail) in the eye's metals plus one glow colour of its own.
// Laser one and its jetpack kicks to full boost and it rockets off the screen; a new one flies in a few seconds later.
import { scene, camera, stage, reduceMotion, clamp, camBase, srgb } from './core.js';
import { page } from './pages.js';
import { grid } from './grid/grid.js';
import { labelGeo, labelPx } from './grid/labels.js';
import { LOOK_PLANE_Z } from './gaze.js';
import { M } from './eye/materials.js';
import { glowTex } from './eye/textures.js';
import { beamInfo } from './eye/laser.js';
import { rig } from './eye/eyeball.js';
import { contactContentRect } from './contact.js';
import { sfx } from './sound.js';

// The five cats. Phones get the first three.
const PRESETS = [
  { name: 'SCOUT', body: 'round', head: 'round', ears: 'pointy', face: 'visor', pack: 'twin', tail: 'curl', finish: 'armorLight', glow: 0x29e6ff, stripes: true },
  { name: 'TANK', body: 'box', head: 'box', ears: 'folded', face: 'cyclops', pack: 'single', tail: 'antenna', finish: 'armor', glow: 0xffa21f, stripes: false },
  { name: 'RACER', body: 'pod', head: 'round', ears: 'tuft', face: 'dots', pack: 'wing', tail: 'long', finish: 'chrome', glow: 0xa96bff, stripes: true },
  { name: 'CHONK', body: 'egg', head: 'round', ears: 'round', face: 'visor', pack: 'twin', tail: 'stub', finish: 'lid', glow: 0x86ff4a, stripes: false },
  { name: 'ROGUE', body: 'facet', head: 'facet', ears: 'split', face: 'cyclops', pack: 'single', tail: 'segment', finish: 'armor', glow: 0xff4fb8, stripes: true }
];

const root = new THREE.Group();
root.visible = false;
scene.add(root);

function glowMat(hex) { return new THREE.MeshBasicMaterial({ color: srgb(hex), toneMapped: false }); }
// A flame plume: two crossed glow planes along the nozzle axis, so it trails out behind the jetpack whichever
// way the cat is pointing (a sprite always stays a flat blob facing the camera)
const plumeGeo = new THREE.PlaneGeometry(1, 1);
function flamePlume(color, opacity) {
  const mat = new THREE.MeshBasicMaterial({
    map: glowTex, color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(plumeGeo, mat));
  const cross = new THREE.Mesh(plumeGeo, mat);
  cross.rotation.x = Math.PI / 2;
  g.add(cross);
  return g;
}
function mesh(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); return m; }

// ---- One cat, facing +x (head forward), back up, seen side-on with its face turned toward the viewer ----
function buildCat(p) {
  const cat = new THREE.Group();
  const body = new THREE.Group();   // everything that banks and bobs
  cat.add(body);
  const metal = M[p.finish], dark = M.dark, glow = glowMat(p.glow);
  const glowCol = srgb(p.glow);

  // Body
  if (p.body === 'round') body.add(mesh(new THREE.SphereGeometry(0.34, 24, 16).scale(1.35, 1, 1), metal));
  else if (p.body === 'box') body.add(mesh(new THREE.BoxGeometry(0.86, 0.5, 0.5), metal));
  else if (p.body === 'pod') {
    body.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 20).rotateZ(Math.PI / 2), metal));
    body.add(mesh(new THREE.SphereGeometry(0.2, 18, 12), metal, 0.3, 0, 0));
    body.add(mesh(new THREE.SphereGeometry(0.2, 18, 12), metal, -0.3, 0, 0));
  } else if (p.body === 'egg') body.add(mesh(new THREE.SphereGeometry(0.4, 24, 16).scale(1.15, 1, 1.05), metal));
  else body.add(mesh(new THREE.IcosahedronGeometry(0.36, 0).scale(1.4, 1, 1), metal));
  const bodyLen = p.body === 'pod' ? 0.5 : p.body === 'egg' ? 0.46 : 0.45;
  if (p.stripes) {
    [-0.12, 0.12].forEach(function (x) {
      body.add(mesh(new THREE.TorusGeometry(p.body === 'pod' ? 0.205 : 0.33, 0.014, 6, 32).rotateY(Math.PI / 2), glow, x, 0, 0));
    });
  }

  // Head, turned toward the viewer so the face reads from the side
  const head = new THREE.Group();
  head.position.set(bodyLen + 0.16, 0.16, 0);
  head.rotation.y = -0.65;
  body.add(head);
  if (p.head === 'box') head.add(mesh(new THREE.BoxGeometry(0.4, 0.34, 0.36), metal));
  else if (p.head === 'facet') head.add(mesh(new THREE.DodecahedronGeometry(0.22, 0), metal));
  else head.add(mesh(new THREE.SphereGeometry(0.22, 22, 16), metal));
  // Face (on the head's +x side)
  if (p.face === 'visor') {
    head.add(mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 24, Math.PI * 0.7).rotateY(Math.PI / 2).rotateX(Math.PI * 0.15), glow, 0.06, 0.02, 0));
  } else if (p.face === 'cyclops') {
    head.add(mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.08, 20).rotateZ(Math.PI / 2), dark, 0.2, 0.02, 0));
    head.add(mesh(new THREE.CircleGeometry(0.065, 20).rotateY(Math.PI / 2), glow, 0.245, 0.02, 0));
  } else {
    [-0.08, 0.08].forEach(function (z) { head.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), glow, 0.19, 0.04, z)); });
  }
  // Ears (left and right of the head top)
  [-1, 1].forEach(function (s) {
    const ear = new THREE.Group();
    ear.position.set(-0.02, 0.17, s * 0.11);
    head.add(ear);
    if (p.ears === 'pointy') {
      ear.add(mesh(new THREE.ConeGeometry(0.08, 0.2, 4), metal, 0, 0.09, 0));
      ear.add(mesh(new THREE.ConeGeometry(0.035, 0.1, 4), glow, 0.03, 0.08, 0));
      ear.rotation.x = s * 0.25;
    } else if (p.ears === 'folded') {
      ear.add(mesh(new THREE.ConeGeometry(0.09, 0.16, 4), metal, 0, 0.06, 0));
      ear.rotation.z = -0.9;
    } else if (p.ears === 'tuft') {
      ear.add(mesh(new THREE.ConeGeometry(0.06, 0.28, 8), metal, 0, 0.13, 0));
      ear.add(mesh(new THREE.ConeGeometry(0.02, 0.1, 6), glow, 0, 0.3, 0));
      ear.rotation.x = s * 0.15;
    } else if (p.ears === 'round') {
      ear.add(mesh(new THREE.SphereGeometry(0.075, 12, 10).scale(1, 1, 0.5), metal, 0, 0.04, 0));
    } else {
      ear.add(mesh(new THREE.ConeGeometry(0.05, 0.2, 4), metal, -0.03, 0.09, 0));
      ear.add(mesh(new THREE.ConeGeometry(0.04, 0.15, 4), metal, 0.05, 0.06, 0));
      ear.add(mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), glow, 0.01, 0.02, 0));
      ear.rotation.x = s * 0.3;
    }
  });

  // Paws, dangling
  const paws = [];
  [[0.24, 0.13], [0.24, -0.13], [-0.22, 0.13], [-0.22, -0.13]].forEach(function (q) {
    const paw = mesh(new THREE.SphereGeometry(0.07, 10, 8), metal, q[0], -0.3, q[1]);
    body.add(paw);
    paws.push(paw);
  });

  // Jetpack on the back, nozzles pointing backward (-x), flames trailing
  const pack = new THREE.Group();
  pack.position.set(-0.06, 0.33, 0);
  body.add(pack);
  const nozzles = [];
  if (p.pack === 'twin') {
    [-0.1, 0.1].forEach(function (z) {
      pack.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 14).rotateZ(Math.PI / 2), M.chrome, 0, 0, z));
      pack.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.1, 14).rotateZ(Math.PI / 2), dark, -0.25, 0, z));
      nozzles.push(new THREE.Vector3(-0.32, 0, z));
    });
    pack.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.24), glow, 0.1, 0.06, 0));
  } else if (p.pack === 'single') {
    pack.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.46, 18).rotateZ(Math.PI / 2), M.armorLight, 0, 0.02, 0));
    pack.add(mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.14, 18).rotateZ(Math.PI / 2), dark, -0.29, 0.02, 0));
    pack.add(mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 24).rotateY(Math.PI / 2), glow, 0.05, 0.02, 0));
    nozzles.push(new THREE.Vector3(-0.38, 0.02, 0));
  } else {
    pack.add(mesh(new THREE.BoxGeometry(0.42, 0.12, 0.26), M.armorLight));
    [-1, 1].forEach(function (s) {
      const fin = mesh(new THREE.BoxGeometry(0.3, 0.02, 0.22), metal, -0.05, 0.02, s * 0.22);
      fin.rotation.x = s * 0.35;
      pack.add(fin);
      pack.add(mesh(new THREE.BoxGeometry(0.2, 0.012, 0.03), glow, -0.05, 0.035, s * 0.3));
      pack.add(mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.1, 12).rotateZ(Math.PI / 2), dark, -0.24, 0, s * 0.07));
      nozzles.push(new THREE.Vector3(-0.3, 0, s * 0.07));
    });
  }
  // Two layers of flame per nozzle: a coloured glow and a white-hot core
  const flames = nozzles.map(function (n) {
    const outer = flamePlume(glowCol.clone(), 0.9), core = flamePlume(new THREE.Color(1, 1, 1), 0.9);
    outer.position.copy(n); core.position.copy(n);
    pack.add(outer, core);
    return { outer: outer, core: core, at: n };
  });

  // Tail
  const tail = new THREE.Group();
  tail.position.set(-bodyLen - 0.02, 0.06, 0);
  body.add(tail);
  if (p.tail === 'curl') {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.2, 0.08, 0), new THREE.Vector3(-0.3, 0.28, 0), new THREE.Vector3(-0.18, 0.4, 0), new THREE.Vector3(-0.08, 0.32, 0)]);
    tail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.035, 8, false), metal));
  } else if (p.tail === 'antenna') {
    tail.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 6).rotateZ(-0.7), M.chrome, -0.14, 0.15, 0));
    tail.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), glow, -0.28, 0.31, 0));
  } else if (p.tail === 'long') {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.3, 0.02, 0), new THREE.Vector3(-0.6, 0.1, 0), new THREE.Vector3(-0.78, 0.05, 0)]);
    tail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.025, 8, false), metal));
    tail.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), glow, -0.79, 0.05, 0));
  } else if (p.tail === 'stub') {
    tail.add(mesh(new THREE.SphereGeometry(0.08, 12, 10), metal, -0.04, 0.03, 0));
  } else {
    for (let k = 0; k < 5; k++) tail.add(mesh(new THREE.SphereGeometry(0.05 - k * 0.006, 10, 8), k === 4 ? glow : metal, -0.08 - k * 0.09, 0.03 + k * 0.05, 0));
  }

  cat.visible = false;
  root.add(cat);
  return { group: cat, body: body, tail: tail, paws: paws, flames: flames, preset: p };
}
const cats = PRESETS.map(function (p, i) {
  const c = buildCat(p);
  c.index = i;
  c.state = 'off';            // off | enter | fly | flee | leave
  c.pos = new THREE.Vector3();
  c.vel = new THREE.Vector3();
  c.wp = new THREE.Vector3();
  c.facing = 1;
  c.boost = 0;
  c.respawnAt = 0;
  c.phase = Math.random() * 10;
  return c;
});

// ---- The flight space: the plane the laser lands on, so aiming at a cat with the cursor hits it ----
const bounds = { z: 3, halfW: 4, halfH: 2.5, scale: 1, pxPerUnit: 100 };
function measure() {
  const w = stage.clientWidth || window.innerWidth, h = stage.clientHeight || window.innerHeight;
  bounds.z = LOOK_PLANE_Z;
  bounds.halfH = (camBase.z - bounds.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  bounds.halfW = bounds.halfH * camera.aspect;
  bounds.pxPerUnit = (h / 2) / bounds.halfH;
  // About 11% of the shorter screen side from nose to tail
  bounds.scale = clamp(Math.min(w, h) * 0.11, 55, 120) / bounds.pxPerUnit / 1.2;
}
function activeCount() { return (stage.clientWidth || window.innerWidth) < 700 ? 3 : 5; }

// Screen (CSS px) <-> flight plane
function toWorld(x, y, out) {
  const w = stage.clientWidth || window.innerWidth, h = stage.clientHeight || window.innerHeight;
  return out.set((x / w * 2 - 1) * bounds.halfW, -(y / h * 2 - 1) * bounds.halfH, bounds.z);
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
// Does the straight line a to b pass through the box? (slab test)
function segHitsBox(ax, ay, bx, by, box) {
  let t0 = 0, t1 = 1;
  const d = [bx - ax, by - ay], o = [ax, ay], lo = [box.x0, box.y0], hi = [box.x1, box.y1];
  for (let k = 0; k < 2; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return false; continue; }
    let ta = (lo[k] - o[k]) / d[k], tb = (hi[k] - o[k]) / d[k];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
function inBox(x, y, box) { return x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1; }
// The places cats keep out of, on the flight plane: the content (padded by half a cat, so none sits on the
// edge of the text), the packet channel below it, and BACK with the parked eye's rings
function noFlyBoxes() {
  const boxes = [], r = contactContentRect(), padX = 0.75 * bounds.scale, padY = 0.55 * bounds.scale;
  const d = grid.dpr || 1, ringHalf = (labelGeo.R / d + 40) / bounds.pxPerUnit;
  toWorld(0, (labelGeo.cy - labelGeo.R - 14 * labelPx) / d, _a);
  const eyeTop = _a.y + padY, floor = -bounds.halfH * 2;
  boxes.push({ x0: -ringHalf, x1: ringHalf, y0: floor, y1: eyeTop });
  if (r) {
    toWorld(r.left, r.top, _a); toWorld(r.right, r.bottom, _b);
    boxes.push({ x0: _a.x - padX, x1: _b.x + padX, y0: _b.y - padY, y1: _a.y + padY });
    boxes.push({ x0: -padX, x1: padX, y0: floor, y1: _b.y });
  }
  return boxes;
}
// A waypoint in open space that the cat can reach in a straight line without crossing anything above
function pickWaypoint(c) {
  const boxes = noFlyBoxes();
  for (let k = 0; k < 40; k++) {
    const x = (Math.random() * 2 - 1) * bounds.halfW * 0.86, y = (Math.random() * 2 - 1) * bounds.halfH * 0.8;
    const blocked = boxes.some(function (b) { return inBox(x, y, b) || (segHitsBox(c.pos.x, c.pos.y, x, y, b) && !inBox(c.pos.x, c.pos.y, b)); });
    // ...not where another cat is already heading, so they spread out instead of bunching up,
    // and mostly on the same side, so they only cross the middle now and then
    const crowded = k < 28 && cats.some(function (o) {
      return o !== c && o.state !== 'off' && Math.hypot(o.wp.x - x, o.wp.y - y) < 2.4 * bounds.scale;
    });
    const crossing = k < 16 && x * c.pos.x < 0 && Math.random() < 0.75;
    if (!blocked && !crowded && !crossing) { c.wp.set(x, y, bounds.z); return; }
  }
  // Boxed in (a cat that got nudged into a corner): just drift to the top of its own side
  c.wp.set((c.pos.x < 0 ? -1 : 1) * bounds.halfW * 0.7, bounds.halfH * 0.6, bounds.z);
}
// Fly in from a random edge, at a height where the way in is clear
function spawn(c, t) {
  measure();
  const side = Math.random() < 0.5 ? -1 : 1;
  c.pos.set(side * (bounds.halfW + 1.5 * bounds.scale), 0, bounds.z);
  const boxes = noFlyBoxes();
  for (let k = 0; k < 12; k++) {
    c.pos.y = (Math.random() * 1.6 - 0.8) * bounds.halfH;
    if (!boxes.some(function (b) { return segHitsBox(c.pos.x, c.pos.y, side * bounds.halfW * 0.6, c.pos.y, b); })) break;
  }
  c.vel.set(-side * 1.2, 0, 0);
  c.facing = -side;
  c.state = 'enter';
  c.boost = 0;
  c.group.visible = true;
  c.group.scale.setScalar(bounds.scale);
  pickWaypoint(c);
  if (reduceMotion) { c.pos.copy(c.wp); c.state = 'fly'; }
  c.nextWp = t + 3 + Math.random() * 3;
}
function offscreen(c) {
  const m = 1.4 * bounds.scale;
  return Math.abs(c.pos.x) > bounds.halfW + m || Math.abs(c.pos.y) > bounds.halfH + m;
}

// ---- Laser hits ----
// The cat is hit if the beam passes through its body, or if the burning point swept across it since last frame
// (the laser swings like a turret and the cats keep moving, so a strict point test felt unfair)
const _seg = new THREE.Vector3(), _rel = new THREE.Vector3();
const prevEnd = new THREE.Vector3();
let prevOn = false;
function distToSegment(p, a, b) {
  _seg.copy(b).sub(a);
  const len2 = _seg.lengthSq();
  _rel.copy(p).sub(a);
  const k = len2 > 1e-9 ? clamp(_rel.dot(_seg) / len2, 0, 1) : 0;
  return _rel.copy(a).addScaledVector(_seg, k).sub(p).length();
}
function beamHits(c) {
  if (!beamInfo.on) return false;
  const r = 0.75 * bounds.scale;
  if (distToSegment(c.pos, beamInfo.start, beamInfo.end) < r) return true;
  return prevOn && distToSegment(c.pos, prevEnd, beamInfo.end) < r;
}
function flee(c, t) {
  c.state = 'flee';
  c.fleeAt = t;
  // Away from the eye, and a bit upward
  _a.copy(c.pos).sub(rig.position); _a.z = 0;
  if (_a.lengthSq() < 1e-4) _a.set(0, 1, 0);
  _a.normalize();
  c.fleeDir = new THREE.Vector3(_a.x, _a.y + 0.35, 0).normalize();
  c.respawnAt = t + 4 + Math.random() * 4;
  sfx('boost');
}

// Where a cat is on screen, for the cursor's target lock (grid-canvas device pixels)
const _p = new THREE.Vector3();
export function catAt(clientX, clientY) {
  if (!root.visible) return null;
  const sr = stage.getBoundingClientRect(), d = grid.dpr;
  for (let k = 0; k < cats.length; k++) {
    const c = cats[k];
    if (!c.group.visible || c.state === 'flee' || c.state === 'off') continue;
    _p.copy(c.pos).project(camera);
    const x = (_p.x + 1) / 2 * sr.width, y = (1 - _p.y) / 2 * sr.height;
    const r = 0.55 * bounds.scale * bounds.pxPerUnit;
    if (Math.hypot(clientX - sr.left - x, clientY - sr.top - y) < r) {
      return { key: 'cat' + k, rect: { x: (x - r) * d, y: (y - r * 0.8) * d, w: 2 * r * d, h: 1.6 * r * d }, label: c.preset.name };
    }
  }
  return null;
}

// ---- Per frame ----
let lastT = 0;
export function updateCats(t) {
  const dt = Math.min(0.05, Math.max(0, t - lastT));
  lastT = t;
  const onPage = page.target === 'contact' && page.q > 0.6;
  const any = cats.some(function (c) { return c.state !== 'off'; });
  if (!onPage && !any) { root.visible = false; prevOn = false; return; }
  root.visible = true;
  measure();
  const n = activeCount();
  cats.forEach(function (c) {
    if (c.index >= n) { c.state = 'off'; c.group.visible = false; return; }
    // Arriving on the page: everyone flies in, a little staggered. Leaving: everyone heads for the nearest side.
    if (c.state === 'off') {
      if (onPage && t >= c.respawnAt) { if (!c.queued) { c.queued = true; c.respawnAt = Math.max(c.respawnAt, t + 0.2 + c.index * 0.35); } else { c.queued = false; spawn(c, t); } }
      return;
    }
    if (!onPage && c.state !== 'leave' && c.state !== 'flee') { c.state = 'leave'; c.leaveDir = c.pos.x < 0 ? -1 : 1; }
    if (reduceMotion && (c.state === 'flee' || c.state === 'leave')) { c.state = 'off'; c.group.visible = false; return; }

    // Steering
    const speed = bounds.halfH * 0.32;
    if (c.state === 'enter' || c.state === 'fly') {
      if (c.state === 'enter' && Math.abs(c.pos.x) < bounds.halfW * 0.9) c.state = 'fly';
      if (t > c.nextWp || c.pos.distanceTo(c.wp) < bounds.halfH * 0.12) { pickWaypoint(c); c.nextWp = t + 3 + Math.random() * 3; }
      _a.copy(c.wp).sub(c.pos);
      const dist = _a.length();
      _a.multiplyScalar(dist > 1e-4 ? Math.min(1, dist / (bounds.halfH * 0.3)) * speed / dist : 0);
      // Keep a little personal space: cats that get close drift apart
      cats.forEach(function (o) {
        if (o === c || o.state === 'off' || o.state === 'flee') return;
        const dx = c.pos.x - o.pos.x, dy = c.pos.y - o.pos.y, d = Math.hypot(dx, dy), near = 1.6 * bounds.scale;
        if (d < near && d > 1e-4) { const k = (1 - d / near) * speed * 2 / d; _a.x += dx * k; _a.y += dy * k; }
      });
      if (!reduceMotion) c.vel.lerp(_a, Math.min(1, dt * 1.4));
      else c.vel.set(0, 0, 0);
      if (beamHits(c)) flee(c, t);
    } else if (c.state === 'flee') {
      // Hit: it stops dead and shakes while the jetpack flares to full (0.3 s), then rockets away from the eye
      c.boost = Math.min(1, c.boost + dt * 4);
      if (t - c.fleeAt < 0.3) c.vel.multiplyScalar(Math.max(0, 1 - dt * 12));
      else c.vel.addScaledVector(c.fleeDir, dt * bounds.halfH * 6);
    } else if (c.state === 'leave') {
      c.vel.x += c.leaveDir * dt * 14 * bounds.scale;
      c.vel.y += dt * 2 * bounds.scale;
      c.boost = Math.min(0.6, c.boost + dt * 3);
    }
    c.pos.addScaledVector(c.vel, dt);
    c.pos.z = bounds.z;
    if ((c.state === 'flee' || c.state === 'leave') && offscreen(c)) {
      // A lasered cat comes back after its delay (set in flee); one that left with the page comes straight back next time
      if (c.state === 'leave') c.respawnAt = 0;
      c.state = 'off';
      c.group.visible = false;
      return;
    }

    // Pose: face the way it's flying, nose up when climbing, a gentle bob, paws and tail swinging, flames
    // flickering (huge on full boost). Turning round swings it to face the viewer halfway, then mirrors it,
    // so its face stays toward the screen on either heading.
    const g = c.group;
    g.position.copy(c.pos);
    g.scale.setScalar(bounds.scale);
    if (Math.abs(c.vel.x) > speed * 0.15) c.facing += (Math.sign(c.vel.x) - c.facing) * Math.min(1, dt * 5);
    const side = c.facing < 0 ? -1 : 1;
    g.scale.x = bounds.scale * side;
    g.rotation.y = -side * (1 - Math.min(1, Math.abs(c.facing))) * Math.PI / 2;
    const pitch = clamp(Math.atan2(c.vel.y, Math.abs(c.vel.x) + 0.3), -0.6, c.state === 'flee' ? 1.25 : 0.8);
    const ph = t * 2.2 + c.phase;
    // (inside the mirrored group, a positive tilt is nose-up whichever way it faces)
    const shake = c.state === 'flee' && t - c.fleeAt < 0.3 ? Math.sin(t * 70) * 0.25 : c.state === 'flee' ? Math.sin(t * 30) * 0.1 : 0;
    c.body.rotation.z = (c.state === 'flee' ? pitch : pitch * 0.7) + shake;
    c.body.position.y = reduceMotion ? 0 : Math.sin(ph) * 0.06;
    c.body.rotation.x = reduceMotion ? 0 : Math.sin(ph * 0.7) * 0.08;
    c.tail.rotation.z = reduceMotion ? 0 : Math.sin(ph * 1.6) * 0.25;
    c.paws.forEach(function (paw, k) { paw.position.y = -0.3 + (reduceMotion ? 0 : Math.sin(ph * 1.3 + k) * 0.025); });
    // Flames: a steady cruise flame, long and bright on full boost
    const thrust = 1 + c.boost * 3.2;
    c.flames.forEach(function (f) {
      const flick = reduceMotion ? 1 : 0.85 + Math.random() * 0.3;
      const wo = 0.32 * (1 + c.boost * 0.8) * flick, wc = 0.14 * (1 + c.boost * 0.6);
      f.outer.scale.set(0.5 * thrust * flick, wo, wo);
      f.outer.position.set(f.at.x - 0.2 * thrust, f.at.y, f.at.z);
      f.core.scale.set(0.24 * thrust * flick, wc, wc);
      f.core.position.set(f.at.x - 0.08 * thrust, f.at.y, f.at.z);
    });
  });
  prevOn = beamInfo.on;
  if (prevOn) prevEnd.copy(beamInfo.end);
}
