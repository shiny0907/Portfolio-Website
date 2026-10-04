// Contact page: sci-fi cats with jetpacks drifting around the open space. Each one is built from its own mix of
// parts (body, head, ears, LED face, jetpack, tail) in the eye's metals plus one glow colour of its own.
// Laser one and its jetpack kicks to full boost and it rockets off the screen, leaving a trail of grid squares
// in its colour; a new one flies in a few seconds later.
import { scene, camera, stage, reduceMotion, clamp, camBase } from './core.js';
import { page } from './pages.js';
import { state } from './state.js';
import { grid, projectToGrid } from './grid/grid.js';
import { labelGeo, labelPx } from './grid/labels.js';
import { LOOK_PLANE_Z } from './gaze.js';
import { beamInfo } from './eye/laser.js';
import { rig } from './eye/eyeball.js';
import { contactContentRect } from './contact.js';
import { PRESETS, buildCat } from './cat-model.js';

// The cats are built in cat-model.js; this module flies them. Phones get the first three.
const root = new THREE.Group();
root.visible = false;
scene.add(root);

const cats = PRESETS.map(function (p, i) {
  const c = buildCat(p, root);
  c.index = i;
  c.state = 'off';            // off | enter | fly | flee | leave
  c.pos = new THREE.Vector3();
  c.vel = new THREE.Vector3();
  c.wp = new THREE.Vector3();
  c.facing = 1;
  c.boost = 0;
  c.respawnAt = 0;
  c.phase = Math.random() * 10;
  c.blinkAt = Math.random() * 4;
  c.trailI = null;
  c.earAt = Math.random() * 3; c.earSide = 0; c.headLook = 0;
  c.ledDim = c.glowCol.clone().multiplyScalar(0.12);
  const hot = new THREE.Color(p.glow).lerp(new THREE.Color(1, 1, 1), 0.55);
  c.hotCss = '#' + hot.getHexString();
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
  // About 10% of the shorter screen side from nose to tail
  bounds.scale = clamp(Math.min(w, h) * 0.1, 48, 110) / bounds.pxPerUnit / 1.2;
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
  const boxes = [], r = contactContentRect(), padX = 0.95 * bounds.scale, padY = 0.65 * bounds.scale;
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
    // (clear of the corner texts and the cursor readout)
    const x = (Math.random() * 2 - 1) * bounds.halfW * 0.86, y = (Math.random() * 1.35 - 0.65) * bounds.halfH;
    const blocked = boxes.some(function (b) { return inBox(x, y, b) || (segHitsBox(c.pos.x, c.pos.y, x, y, b) && !inBox(c.pos.x, c.pos.y, b)); });
    // ...not where another cat is already heading, so they spread out instead of bunching up,
    // and mostly on the same side, so they only cross the middle now and then
    const crowded = k < 28 && cats.some(function (o) {
      return o !== c && o.state !== 'off' && Math.hypot(o.wp.x - x, o.wp.y - y) < 3 * bounds.scale;
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
  // From the side with fewer cats on it, so they spread across both sides of the page
  let bal = 0;
  cats.forEach(function (o) { if (o !== c && o.state !== 'off') bal += o.pos.x < 0 ? -1 : 1; });
  const side = bal > 0 ? -1 : bal < 0 ? 1 : Math.random() < 0.5 ? -1 : 1;
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
const pointerWorld = new THREE.Vector3(0, 2, 0);
export function updateCats(t) {
  const dt = Math.min(0.05, Math.max(0, t - lastT));
  lastT = t;
  const onPage = page.target === 'contact' && page.q > 0.6;
  const any = cats.some(function (c) { return c.state !== 'off'; });
  if (!onPage && !any) { root.visible = false; prevOn = false; return; }
  root.visible = true;
  measure();
  const sr = stage.getBoundingClientRect();
  if (state.hasPointer) toWorld(state.clientX - sr.left, state.clientY - sr.top, pointerWorld);
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
        const dx = c.pos.x - o.pos.x, dy = c.pos.y - o.pos.y, d = Math.hypot(dx, dy), near = 2 * bounds.scale;
        if (d < near && d > 1e-4) { const k = (1 - d / near) * speed * 3 / d; _a.x += dx * k; _a.y += dy * k; }
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
    c.throatMat.color.copy(c.glowCol).lerp(WHITE, c.boost * 0.85);

    // Face: blinks now and then; hit, it shows > < in static, flickering while it shakes
    if (t > c.blinkAt + 0.13) c.blinkAt = t + 2 + Math.random() * 4;
    const hit = c.state === 'flee';
    c.faceMat.map = hit ? c.faces.hit : t >= c.blinkAt && !reduceMotion ? c.faces.blink : c.faces.open;
    c.face.visible = !(hit && t - c.fleeAt < 0.3 && Math.random() < 0.3);
    // The ID plates read the right way round whichever way the cat faces
    c.plateTex.repeat.x = side;
    c.plateTex.offset.x = side < 0 ? 1 : 0;
    // Status LEDs chase along the pack (all flashing when hit); antenna and wingtip lights blink
    const step = Math.floor(t * (hit ? 14 : 5) + c.phase * 3);
    for (let k = 0; k < c.ledCount; k++) c.leds.setColorAt(k, (hit ? step % 2 === 0 : step % 5 === k % 5) ? c.glowCol : c.ledDim);
    c.leds.instanceColor.needsUpdate = true;
    c.tipMat.color.copy(c.glowCol).multiplyScalar(reduceMotion || hit || ((t * 0.8 + c.phase) % 1) < 0.18 ? 1 : 0.12);
    // Falling code on the pack screens
    c.rainTex.offset.y = (t * 0.45 + c.phase) % 1;
    if (!reduceMotion) {
      // Turbine fans spin up with the boost
      c.fans.forEach(function (f) { f.rotation.x += dt * (9 + c.boost * 45); });
      // Legs dangle (and trail back when it bolts), the tail sways joint by joint
      c.legs.forEach(function (leg, k) { leg.rotation.z = leg.userData.rest + (hit ? -0.45 : 0) + Math.sin(ph * 1.3 + k * 1.7) * 0.1; });
      c.joints.forEach(function (j, k) { j.rotation.z = j.userData.rest + Math.sin(t * 2.4 - k * 0.55 + c.phase) * (hit ? 0.2 : 0.09); });
      // Ears: a quick flick now and then, pinned flat back when hit
      if (t > c.earAt + 0.3) { c.earAt = t + 1.5 + Math.random() * 4; c.earSide = Math.random() < 0.5 ? 0 : 1; }
      c.ears.forEach(function (e, k) {
        const flick = t >= c.earAt && k === c.earSide ? Math.sin((t - c.earAt) / 0.3 * Math.PI) * 0.5 : 0;
        e.rotation.x = e.userData.rest.x + (hit ? -0.8 : -flick);
        e.rotation.z = e.userData.rest.z;
      });
      // The head follows the cursor a little (and the laser, when it's on)
      const lx = beamInfo.on ? beamInfo.end.x : pointerWorld.x, ly = beamInfo.on ? beamInfo.end.y : pointerWorld.y;
      const hx = (lx - c.pos.x) * side, hy = ly - c.pos.y;
      const look = hit ? 0.5 : clamp(Math.atan2(hy, Math.abs(hx) + 0.6) * 0.6, -0.3, 0.35);
      c.headLook += (look - c.headLook) * Math.min(1, dt * 4);
      c.head.rotation.z = c.headLook;
    }
    // Boot thrusters: a small flame each, flaring with the boost
    c.legFlames.forEach(function (f) {
      const len = (0.1 + c.boost * 0.35) * (reduceMotion ? 1 : 0.85 + Math.random() * 0.3);
      f.scale.set(len, 0.07 + c.boost * 0.05, 0.07 + c.boost * 0.05);
      f.position.y = -0.05 - len * 0.4;
    });

    // Fleeing at full boost: lay a trail of squares in the cat's colour behind the jetpack
    if (hit && !reduceMotion && t - c.fleeAt > 0.22) layTrail(c, t);
    else c.trailI = null;
  });
  prevOn = beamInfo.on;
  if (prevOn) prevEnd.copy(beamInfo.end);
}

// ---- The boost trail, on the grid layer behind the 3D ----
const WHITE = new THREE.Color(1, 1, 1);
const trail = [];
const TRAIL_LIFE = 1.5;
const _n = new THREE.Vector3();
function addTrailCell(c, i, j, t, s) {
  if (trail.length > 900) return;
  trail.push({ i: i, j: j, at: t, s: s, col: c.css, hot: c.hotCss });
}
function layTrail(c, t) {
  // The point between the nozzles, on screen, in grid squares
  c.group.updateMatrixWorld(true);
  _n.set(0, 0, 0);
  c.flames.forEach(function (f) { _n.add(f.at); });
  _n.multiplyScalar(1 / c.flames.length);
  _n.x -= 0.1;
  c.pack.localToWorld(_n);
  const pt = projectToGrid(_n.x, _n.y, _n.z), C = grid.cell;
  const fi = (pt[0] - grid.ox) / C, fj = (pt[1] - grid.oy) / C;
  if (c.trailI === null || c.trailI === undefined) { c.trailI = fi; c.trailJ = fj; }
  // Step along the path since last frame so a fast cat still leaves an unbroken line
  const d = Math.hypot(fi - c.trailI, fj - c.trailJ), steps = Math.min(40, Math.max(1, Math.ceil(d * 2)));
  for (let s = 1; s <= steps; s++) {
    const i = Math.floor(c.trailI + (fi - c.trailI) * s / steps), j = Math.floor(c.trailJ + (fj - c.trailJ) * s / steps);
    if (i === c.lastCellI && j === c.lastCellJ) continue;
    c.lastCellI = i; c.lastCellJ = j;
    addTrailCell(c, i, j, t, 1);
    // A few stray squares beside the line, glitch style
    if (Math.random() < 0.3) {
      const a = Math.random() < 0.5 ? 1 : -1;
      if (Math.random() < 0.5) addTrailCell(c, i + a, j, t, 0.5); else addTrailCell(c, i, j + a, t, 0.5);
    }
  }
  c.trailI = fi; c.trailJ = fj;
}
// Each square flashes hot, holds, then fades with a flicker, like the laser burns
export function drawCatTrails(ctx, t) {
  if (!trail.length) return;
  const C = grid.cell;
  let keep = 0;
  for (let k = 0; k < trail.length; k++) {
    const q = trail[k], age = t - q.at;
    if (age > TRAIL_LIFE || age < -1) continue;
    trail[keep++] = q;
    let a = (age < 0.5 ? 1 : 1 - (age - 0.5) / (TRAIL_LIFE - 0.5)) * q.s;
    if (age > 0.5 && Math.random() < 0.12) a *= 0.25;
    ctx.globalAlpha = a;
    ctx.fillStyle = age < 0.12 ? q.hot : q.col;
    ctx.fillRect(grid.ox + q.i * C, grid.oy + q.j * C, C, C);
  }
  trail.length = keep;
  ctx.globalAlpha = 1;
}
