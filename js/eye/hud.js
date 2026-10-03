import { scene, TAU, srgb, hdr, smoothstep } from '../core.js';
import { state } from '../state.js';
import { glowTex } from './textures.js';

// ---------- HUD rings behind the eye ----------
export const hud = new THREE.Group();
hud.position.z = -1.2;
scene.add(hud);
const hudMats = [];
function hudMat(hex, k, opacity) {
  const m = new THREE.MeshBasicMaterial({
    color: hdr(hex, k), transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false
  });
  m.userData.base = opacity;
  hudMats.push(m);
  return m;
}
hud.add(new THREE.Mesh(new THREE.RingGeometry(1.78, 1.795, 180), hudMat(0xc9d4de, 1, 0.28)));

export const hudArcs = new THREE.Group();
hud.add(hudArcs);
const arcMat = hudMat(0xff1028, 1, 0.6);
[[0.3, 1.2], [2.4, 0.5], [3.6, 1.6]].forEach(function (a) {
  hudArcs.add(new THREE.Mesh(new THREE.RingGeometry(1.9, 1.93, 64, 1, a[0], a[1]), arcMat));
});

export const hudTicks = new THREE.Group();
hud.add(hudTicks);
// Ticks are thin quads, not GL lines: lines are always 1 device pixel wide and render
// much fainter on some screens and GPUs, while quads scale with the eye everywhere.
(function () {
  const pts = [], idx = [], hw = 0.006;
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * TAU, c = Math.cos(a), s = Math.sin(a);
    const r0 = 2.02, r1 = i % 10 === 0 ? 2.12 : 2.06;
    pts.push(c * r0 - s * hw, s * r0 + c * hw, 0, c * r0 + s * hw, s * r0 - c * hw, 0,
             c * r1 + s * hw, s * r1 - c * hw, 0, c * r1 - s * hw, s * r1 + c * hw, 0);
    const v = i * 4;
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  geo.setIndex(idx);
  hudTicks.add(new THREE.Mesh(geo, hudMat(0xc9d4de, 1, 0.15)));
})();

const hudBrackets = new THREE.Group();
hud.add(hudBrackets);
const bracketMat = hudMat(0xc9d4de, 1, 0.32);
hudBrackets.add(new THREE.Mesh(new THREE.RingGeometry(2.26, 2.272, 32, 1, -0.32, 0.64), bracketMat));
hudBrackets.add(new THREE.Mesh(new THREE.RingGeometry(2.26, 2.272, 32, 1, Math.PI - 0.32, 0.64), bracketMat));

export const aura = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, color: srgb(0xff0a1e).multiplyScalar(0.55), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
}));
aura.scale.set(7.5, 7.5, 1);
aura.position.z = -2.2;
scene.add(aura);

export function updateHud(t, dt, glowLevel) {
  const anger = state.anger;
  const hudIn = smoothstep(0.6, 1.9, t);
  for (let i = 0; i < hudMats.length; i++) hudMats[i].opacity = hudMats[i].userData.base * hudIn;
  arcMat.opacity *= 1 + 0.7 * anger;
  aura.material.opacity = 0.35 * hudIn * (0.6 + 0.4 * glowLevel);
  // Outer brackets swing to face wherever the eye is looking (the cursor, or its idle gaze)
  if (Math.hypot(state.yaw, state.pitch) > 0.04) {
    // The two brackets are mirror images, so aim whichever one is closer (never spin more than 90 degrees)
    let diff = Math.atan2(state.pitch, state.yaw) - state.bracketRot;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (diff > Math.PI / 2) diff -= Math.PI;
    if (diff < -Math.PI / 2) diff += Math.PI;
    const bh = dt / 2;
    for (let s = 0; s < 2; s++) {
      state.bracketVel += (diff * 45 - state.bracketVel * 10) * bh;
      state.bracketRot += state.bracketVel * bh;
      diff -= state.bracketVel * bh;
    }
  } else {
    state.bracketVel *= Math.exp(-dt * 8);
    state.bracketRot += state.bracketVel * dt;
  }
  hudBrackets.rotation.z = state.bracketRot;
}
