// The eye itself: hierarchy, armoured eyeball, lens assembly, and lids, plus their per-frame animation
import { scene, reduceMotion, TAU, srgb, clamp, lerp, smoothstep, wallMs, camBase } from '../core.js';
import { state, BLINK, EASE, startBlink } from '../state.js';
import { makeIrisTexture, makeOverlayTexture, glowTex } from './textures.js';
import { M, RED, HOT, toEyeAxis, surfaceMatrix } from './materials.js';

// ---------- Hierarchy ----------
export const rig = new THREE.Group();
scene.add(rig);
const yawGroup = new THREE.Group();
rig.add(yawGroup);
export const pitchGroup = new THREE.Group();
yawGroup.add(pitchGroup);

// ---------- Eyeball: glowing core with armour plates ----------
const core = new THREE.Mesh(toEyeAxis(new THREE.SphereGeometry(0.975, 96, 48, 0, TAU, 0.64, Math.PI - 0.64)), M.core);
pitchGroup.add(core);

const bands = [
  { t0: 0.70, t1: 1.12, n: 8, off: 0.0, r: 1.0 },
  { t0: 1.15, t1: 1.68, n: 12, off: 0.13, r: 1.012 },
  { t0: 1.71, t1: 2.30, n: 10, off: 0.31, r: 1.0 },
  { t0: 2.33, t1: 2.78, n: 6, off: 0.2, r: 1.006 }
];
const plateGap = 0.035;
const boltSpots = [], blockSpots = [], slatSpots = [], ledSpots = [];

bands.forEach(function (b, i) {
  const step = TAU / b.n;
  for (let k = 0; k < b.n; k++) {
    const p0 = b.off + k * step + plateGap / 2;
    const p1 = b.off + (k + 1) * step - plateGap / 2;
    const geo = toEyeAxis(new THREE.SphereGeometry(
      b.r, Math.max(8, Math.ceil((p1 - p0) * 18)), Math.max(6, Math.ceil((b.t1 - b.t0) * 18)),
      p0, p1 - p0, b.t0, b.t1 - b.t0
    ));
    pitchGroup.add(new THREE.Mesh(geo, (k + i) % 3 === 0 ? M.armorLight : M.armor));

    const tc = (b.t0 + b.t1) / 2, pc = (p0 + p1) / 2;
    const arcW = (p1 - p0) * Math.sin(tc) * b.r;
    const arcH = (b.t1 - b.t0) * b.r;
    boltSpots.push([b.r, b.t0 + 0.045, p0 + 0.05 / Math.sin(b.t0 + 0.045)]);
    boltSpots.push([b.r, b.t0 + 0.045, p1 - 0.05 / Math.sin(b.t0 + 0.045)]);

    if (i === 0 && k % 2 === 1) blockSpots.push([b.r, tc, pc, arcW * 0.42, 0.016, arcH * 0.45]);
    if (i === 1 && k % 2 === 0) {
      blockSpots.push([b.r, tc, pc, arcW * 0.5, 0.024, arcH * 0.42]);
      ledSpots.push([b.r + 0.026, tc - arcH * 0.12, pc]);
    }
    if (i === 2 && k % 3 === 1) {
      for (let s = 0; s < 5; s++) {
        const ts = b.t0 + (b.t1 - b.t0) * (0.25 + s * 0.125);
        slatSpots.push([b.r, ts, pc, arcW * 0.55, 0.014, 0.022]);
      }
    }
  }
});
// Rear cap
pitchGroup.add(new THREE.Mesh(toEyeAxis(new THREE.SphereGeometry(1.0, 48, 8, 0, TAU, 2.81, Math.PI - 2.81)), M.armorLight));

(function buildGreebles() {
  const mtx = new THREE.Matrix4();
  const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.017, 0.017, 0.022, 10), M.chrome, boltSpots.length);
  boltSpots.forEach(function (s, i) { bolts.setMatrixAt(i, surfaceMatrix(s[0] + 0.006, s[1], s[2], 1, 1, 1, mtx)); });
  pitchGroup.add(bolts);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const blocks = new THREE.InstancedMesh(boxGeo, M.armorLight, blockSpots.length);
  blockSpots.forEach(function (s, i) { blocks.setMatrixAt(i, surfaceMatrix(s[0] + s[4] / 2, s[1], s[2], s[3], s[4], s[5], mtx)); });
  pitchGroup.add(blocks);

  const slats = new THREE.InstancedMesh(boxGeo, M.dark, slatSpots.length);
  slatSpots.forEach(function (s, i) { slats.setMatrixAt(i, surfaceMatrix(s[0] + s[4] / 2, s[1], s[2], s[3], s[4], s[5], mtx)); });
  pitchGroup.add(slats);

  const leds = new THREE.InstancedMesh(boxGeo, M.led, ledSpots.length);
  ledSpots.forEach(function (s, i) { leds.setMatrixAt(i, surfaceMatrix(s[0], s[1], s[2], 0.05, 0.008, 0.012, mtx)); });
  pitchGroup.add(leds);
})();

// ---------- Lens assembly ----------
const lens = new THREE.Group();
pitchGroup.add(lens);

const barrel = new THREE.Mesh(toEyeAxis(new THREE.CylinderGeometry(0.585, 0.585, 0.24, 72, 1, true)), M.dark);
barrel.position.z = 0.68;
lens.add(barrel);
[0.62, 0.72].forEach(function (z) {
  const groove = new THREE.Mesh(new THREE.TorusGeometry(0.582, 0.006, 6, 72), M.chrome);
  groove.position.z = z;
  lens.add(groove);
});
const floor = new THREE.Mesh(new THREE.CircleGeometry(0.59, 64), M.dark);
floor.position.z = 0.6;
lens.add(floor);

const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.615, 0.035, 16, 96), M.chrome);
bezel.position.z = 0.79;
lens.add(bezel);
const bezelFace = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 96), M.armorLight);
bezelFace.position.z = 0.8;
lens.add(bezelFace);

export const tickGroup = new THREE.Group();
tickGroup.position.z = 0.806;
lens.add(tickGroup);
(function () {
  const n = 60, mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const z = new THREE.Vector3(0, 0, 1);
  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.04, 0.006), M.dark, n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const major = i % 5 === 0;
    pos.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0);
    q.setFromAxisAngle(z, a - Math.PI / 2);
    scl.set(major ? 1.6 : 1, major ? 1.7 : 1, 1);
    ticks.setMatrixAt(i, mtx.compose(pos, q, scl));
  }
  tickGroup.add(ticks);
})();

export const arcGroup = new THREE.Group();
arcGroup.position.z = 0.74;
lens.add(arcGroup);
[[0.1, 1.0], [1.15, 0.55], [1.85, 1.3], [3.3, 0.7], [4.15, 1.2], [5.5, 0.6]].forEach(function (a, i) {
  arcGroup.add(new THREE.Mesh(new THREE.RingGeometry(0.455, 0.49, 24, 1, a[0], a[1]), M.armorLight));
  if (i % 2 === 0) {
    const strip = new THREE.Mesh(new THREE.RingGeometry(0.493, 0.499, 24, 1, a[0] + 0.05, a[1] - 0.1), M.redGlow);
    strip.position.z = 0.001;
    arcGroup.add(strip);
  }
});

const irisMat = new THREE.MeshBasicMaterial({ map: makeIrisTexture(), toneMapped: false });
const iris = new THREE.Mesh(new THREE.CircleGeometry(0.47, 128), irisMat);
iris.position.z = 0.64;
lens.add(iris);

const overlayMat = new THREE.MeshBasicMaterial({
  map: makeOverlayTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
});
export const overlay = new THREE.Mesh(new THREE.CircleGeometry(0.47, 96), overlayMat);
overlay.position.z = 0.645;
lens.add(overlay);

const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.2, 64), M.black);
pupil.position.z = 0.647;
lens.add(pupil);

const pupilCoreMat = new THREE.MeshBasicMaterial({ color: srgb(0xff0a1e), toneMapped: false });
const pupilCore = new THREE.Mesh(new THREE.CircleGeometry(0.028, 32), pupilCoreMat);
pupilCore.position.z = 0.649;
lens.add(pupilCore);
const pupilRing = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.056, 48), M.redGlow);
pupilRing.position.z = 0.649;
lens.add(pupilRing);

// Mechanical aperture: eight shutter sectors that slide in and out
const sectors = [];
(function () {
  const n = 8, gap = 0.02, span = TAU / n;
  for (let i = 0; i < n; i++) {
    const a = i * span;
    const s = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.22, 12, 1, a + gap, span - 2 * gap), M.sector);
    s.position.z = 0.652;
    s.userData.dir = new THREE.Vector2(Math.cos(a + span / 2), Math.sin(a + span / 2));
    lens.add(s);
    sectors.push(s);
  }
})();

const glowMat = new THREE.SpriteMaterial({
  map: glowTex, color: srgb(0xff0818), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
});
const glow = new THREE.Sprite(glowMat);
glow.scale.set(0.95, 0.95, 1);
glow.position.z = 0.7;
lens.add(glow);

const glass = new THREE.Mesh(
  toEyeAxis(new THREE.SphereGeometry(1.1, 64, 24, 0, TAU, 0, 0.599)),
  new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
    transparent: true, opacity: 0.16, envMapIntensity: 1.6, depthWrite: false
  })
);
glass.position.z = -0.118;
lens.add(glass);

// The red light from the iris. It lives in the scene, not the rig, and follows an anchor in the lens: hiding
// the rig (inside a case study) would otherwise take the light with it, change the light count, and make
// every lit material compile a new shader on the spot (a half-second freeze). Hidden, it just goes dark.
const irisLight = new THREE.PointLight(srgb(0xff0a1e), 1.6, 3, 2);
const irisAnchor = new THREE.Object3D();
irisAnchor.position.set(0, 0, 0.95);
pitchGroup.add(irisAnchor);
scene.add(irisLight);

// ---------- Mechanical lids ----------
const LID_R = 1.05;
function makeLid(isTop) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(LID_R, 96, 32, 0, Math.PI, isTop ? 0 : Math.PI / 2, Math.PI / 2);
  g.add(new THREE.Mesh(geo, M.lid));
  g.add(new THREE.Mesh(geo, M.lidInner));

  const rim = new THREE.Mesh(new THREE.TorusGeometry(LID_R + 0.006, 0.014, 10, 96, Math.PI).rotateX(Math.PI / 2), M.chrome);
  g.add(rim);

  const strip = new THREE.Mesh(new THREE.TorusGeometry(LID_R + 0.003, 0.006, 6, 96, Math.PI).rotateX(Math.PI / 2), M.redGlow);
  strip.rotation.x = isTop ? -0.07 : 0.07;
  g.add(strip);

  [-0.8, -0.4, 0, 0.4, 0.8].forEach(function (x) {
    const rr = Math.sqrt((LID_R + 0.004) * (LID_R + 0.004) - x * x);
    const rg = new THREE.TorusGeometry(rr, 0.007, 6, 40, Math.PI / 2).rotateY(-Math.PI / 2);
    if (!isTop) rg.rotateZ(Math.PI);
    const rib = new THREE.Mesh(rg, M.armorLight);
    rib.position.x = x;
    g.add(rib);
  });
  return g;
}
const topLid = makeLid(true);
const bottomLid = makeLid(false);
pitchGroup.add(topLid, bottomLid);
const LID_OPEN = 1.22;
[1, -1].forEach(function (side) {
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 28).rotateZ(Math.PI / 2), M.chrome);
  hinge.position.x = side * 1.05;
  pitchGroup.add(hinge);
});

function updateBlink(t, dt) {
  const b = state.blink;
  if (!b.active) {
    state.blinkClose += (0 - state.blinkClose) * Math.min(1, dt * 18);
    if (state.firing) {
      state.nextBlink = Math.max(state.nextBlink, t + 0.3);
    } else if (t >= state.nextBlink) {
      const r = Math.random();
      startBlink(r < 0.18 ? BLINK.double : r < 0.28 ? BLINK.shutterCheck : BLINK.single, t);
    }
    return;
  }
  let seg = b.seq[b.idx];
  while (seg && t - b.segStart >= seg.dur) {
    b.segStart += seg.dur;
    b.from = seg.to;
    b.idx++;
    seg = b.seq[b.idx];
  }
  if (!seg) {
    b.active = false;
    state.blinkClose = b.from;
    state.nextBlink = t + 2.2 + Math.random() * 4.5;
    state.glitchUntil = t + 0.24;
    state.aperture = 0.0; // snap shut, then refocus
    if (!state.booted) state.booted = true;
    return;
  }
  const p = (t - b.segStart) / seg.dur;
  state.blinkClose = b.from + (seg.to - b.from) * EASE[seg.ease || 'linear'](p);
}

// Pose, lids, glow and aperture for this frame. Returns the glow level (the HUD uses it).
export function updateEyeball(t, dt, tracking, react) {
  const anger = state.anger;
  const yaw = state.yaw + state.jitY;
  const pitch = state.pitch + state.jitP;
  // Poke reactions: recoil back into the screen, an annoyed head shake
  {
    const rh = dt / 2;
    for (let s2 = 0; s2 < 2; s2++) {
      state.vRecoil += (-state.recoil * 220 - state.vRecoil * 16) * rh;
      state.recoil += state.vRecoil * rh;
    }
    // The case study dive rushes it forward until its pupil sits just in front of the camera
    rig.position.z = state.recoil + react.lean + state.dive.z * Math.max(0, camBase.z - 1.25);
    state.annoy = Math.max(0, state.annoy - dt / 1.4);
  }
  const shake = t < state.shakeUntil && !reduceMotion ? Math.sin(t * 34) * 0.14 * Math.min(1, (state.shakeUntil - t) / 0.55) : 0;
  yawGroup.rotation.y = yaw + shake + react.yaw;
  pitchGroup.rotation.x = -(pitch + react.pitch);

  // Blink and squint
  updateBlink(t, dt);
  const glare = t < (state.glareUntil || 0) ? 0.45 : 0;
  const squintTarget = Math.min(0.62, lerp(state.sweep ? 0.2 : tracking ? 0.0 : 0.06, 0.62, Math.max(anger, state.annoy * 0.8, glare)) + state.travel * 0.25);
  state.squint += (squintTarget - state.squint) * Math.min(1, dt * (state.firing ? 16 : 4));

  const close = (state.squint + (1 - state.squint) * state.blinkClose) * (1 - state.dive.wide) - react.wide - state.dive.wide * 0.3;
  const closeBottom = Math.max(close, react.bottom);
  topLid.rotation.x = -LID_OPEN * (1 - close);
  bottomLid.rotation.x = LID_OPEN * (1 - closeBottom);

  // Glow, with a reboot flicker after every blink
  let glowLevel = clamp(1 - state.blinkClose * 0.9, 0, 1) * (0.9 + 0.1 * Math.sin(t * 2.1));
  if (t < state.glitchUntil) {
    if (t > state.glitchNextStep) {
      state.glitchValue = 0.25 + Math.random() * 1.0;
      state.glitchNextStep = t + 0.03;
    }
    glowLevel *= state.glitchValue;
  }
  if (!state.booted) glowLevel *= smoothstep(0.75, 1.3, t);

  irisMat.color.setScalar(0.2 + 0.85 * glowLevel);
  overlayMat.opacity = 0.3 + 0.6 * glowLevel;
  pupilCoreMat.color.copy(RED).multiplyScalar(0.3 + 1.3 * glowLevel).lerp(HOT, state.beam);
  const facing = Math.cos(yaw) * Math.cos(pitch);
  glowMat.opacity = 0.9 * glowLevel * smoothstep(0.35, 1, facing);
  irisLight.intensity = state.dive.hidden ? 0 : 1.6 * glowLevel + 2.6 * state.beam;
  irisAnchor.getWorldPosition(irisLight.position);
  M.core.emissiveIntensity = 0.3 + 0.35 * glowLevel + 0.35 * state.beatPulse * glowLevel + 0.6 * anger;
  const ledOn = (wallMs() % 1000) < 500 ? 1 : 0.15;
  M.led.color.copy(RED).multiplyScalar(0.25 + 1.0 * ledOn * (0.3 + 0.7 * glowLevel));

  // Aperture: dilates when you are close to the eye, tightens when you are far or it is scanning
  if (tracking) {
    state.apertureTarget = lerp(0.075, 0.02, clamp(state.mouse.length(), 0, 1));
  } else if (state.sweep) {
    state.apertureTarget = 0.015;
  } else {
    state.apertureTarget = 0.045 + 0.015 * Math.sin(t * 0.7);
  }
  state.apertureTarget = lerp(state.apertureTarget, 0.0, anger);
  state.apertureTarget = lerp(state.apertureTarget, 0.1, state.dive.wide);   // diving in: the aperture opens right up
  if (react.pin) state.apertureTarget = 0;
  if (react.dilate) state.apertureTarget = 0.09;
  state.aperture += (state.apertureTarget - state.aperture) * Math.min(1, dt * 7);
  for (let i = 0; i < sectors.length; i++) {
    const s = sectors[i];
    s.position.x = s.userData.dir.x * state.aperture;
    s.position.y = s.userData.dir.y * state.aperture;
  }

  // Hover
  // (rigY is the page travel: the eye drops to the bottom edge on the Contact page)
  rig.position.y = state.rigY + (reduceMotion ? 0 : Math.sin(t * 0.9) * 0.035 + react.hop);
  if (!reduceMotion) {
    rig.rotation.z = Math.sin(t * 0.55) * 0.015 + react.tilt;
  }
  return glowLevel;
}
