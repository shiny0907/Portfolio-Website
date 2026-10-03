import { scene, camera, stage, reduceMotion, srgb } from '../core.js';
import { state } from '../state.js';
import { grid, igniteTrail } from '../grid/grid.js';
import { LOOK_PLANE_Z } from '../gaze.js';
import { glowTex, dotTex } from './textures.js';
import { RED, HOT } from './materials.js';
import { rig, pitchGroup } from './eyeball.js';

// ---------- Laser ----------
const laser = new THREE.Group();
laser.visible = false;
scene.add(laser);
function additive(color, opacity, extra) {
  return new THREE.MeshBasicMaterial(Object.assign({
    color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false
  }, extra || {}));
}
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0);
const beams = [
  { mesh: new THREE.Mesh(beamGeo, additive(RED.clone(), 0.12)), r: 0.14 },
  { mesh: new THREE.Mesh(beamGeo, additive(RED.clone(), 0.95)), r: 0.085 },
  { mesh: new THREE.Mesh(beamGeo, additive(HOT.clone(), 1)), r: 0.05 }
];
beams.forEach(function (b, i) { b.mesh.renderOrder = 10 + i; laser.add(b.mesh); });
function flare(color, depthTest) {
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: color, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: depthTest, toneMapped: false
  }));
}
const muzzle = flare(srgb(0xff3346), false);
muzzle.renderOrder = 14;
const impactGlow = flare(RED.clone(), false);
const impactCore = flare(HOT.clone(), false);
laser.add(muzzle, impactGlow, impactCore);

const SPARKS = 300;
const sparkPos = new Float32Array(SPARKS * 3);
const sparkCol = new Float32Array(SPARKS * 3);
const sparkVel = new Float32Array(SPARKS * 3);
const sparkLife = new Float32Array(SPARKS);
const sparkMax = new Float32Array(SPARKS);
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
  size: 0.09, map: dotTex, vertexColors: true, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
}));
sparks.frustumCulled = false;
scene.add(sparks);
let sparkCursor = 0, sparkAccum = 0;
const beamStart = new THREE.Vector3(), beamDir = new THREE.Vector3(), beamEnd = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), beamQ = new THREE.Quaternion(), projV = new THREE.Vector3();
// Where the beam is this frame, for things that can be hit (the Contact page's cats). `on` only while it burns.
export const beamInfo = { on: false, start: beamStart, dir: beamDir, end: beamEnd };

function spawnSpark() {
  const i = sparkCursor;
  sparkCursor = (sparkCursor + 1) % SPARKS;
  const i3 = i * 3;
  let rx = Math.random() * 2 - 1, ry = Math.random() * 2 - 1, rz = Math.random() * 2 - 1;
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  const burst = 1.6 + Math.random() * 2.4;
  const back = 0.6 + Math.random() * 1.4;
  sparkPos[i3] = beamEnd.x; sparkPos[i3 + 1] = beamEnd.y; sparkPos[i3 + 2] = beamEnd.z;
  sparkVel[i3] = rx * burst - beamDir.x * back;
  sparkVel[i3 + 1] = ry * burst - beamDir.y * back + 0.6;
  sparkVel[i3 + 2] = rz * burst - beamDir.z * back;
  sparkMax[i] = sparkLife[i] = 0.3 + Math.random() * 0.45;
}

// Laser: fires along the eye's actual gaze, so it lags a touch behind the cursor like a turret
export function updateLaser(t, dt) {
  state.beam += ((state.firing ? 1 : 0) - state.beam) * Math.min(1, dt * (state.firing ? 30 : 16));
  laser.visible = state.beam > 0.01;
  if (!state.firing) { grid.lastX = null; grid.lastY = null; }
  state.impactX = null;
  state.impactY = null;
  beamInfo.on = false;
  if (laser.visible) {
    rig.updateMatrixWorld(true);
    pitchGroup.localToWorld(beamStart.set(0, 0, 0.655));
    pitchGroup.localToWorld(beamDir.set(0, 0, 1.655)).sub(beamStart).normalize();
    const len = Math.max(0.1, (LOOK_PLANE_Z - beamStart.z) / Math.max(0.05, beamDir.z));
    beamEnd.copy(beamStart).addScaledVector(beamDir, len);
    beamQ.setFromUnitVectors(UP, beamDir);
    const flick = 1 + 0.06 * Math.sin(t * 95) + 0.04 * Math.random();
    const w = state.beam * flick;
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i];
      b.mesh.position.copy(beamStart);
      b.mesh.quaternion.copy(beamQ);
      b.mesh.scale.set(b.r * w, len, b.r * w);
    }
    muzzle.position.copy(beamStart);
    muzzle.scale.setScalar(0.5 * w);
    impactGlow.position.copy(beamEnd);
    impactGlow.scale.setScalar(1.2 * w * (0.9 + 0.2 * Math.random()));
    impactCore.position.copy(beamEnd);
    impactCore.scale.setScalar(0.45 * w * (0.85 + 0.3 * Math.random()));
    if (state.firing && state.beam > 0.4) {
      beamInfo.on = true;
      projV.copy(beamEnd).project(camera);
      igniteTrail((projV.x + 1) / 2 * grid.w, (1 - projV.y) / 2 * grid.h, t);
      state.impactX = (projV.x + 1) / 2 * stage.clientWidth;
      state.impactY = (1 - projV.y) / 2 * stage.clientHeight;
    }
    if (state.firing) {
      sparkAccum += dt * 320;
      while (sparkAccum >= 1) { spawnSpark(); sparkAccum -= 1; }
    }
    if (!reduceMotion) {
      camera.position.x += (Math.random() - 0.5) * 0.03 * state.beam;
      camera.position.y += (Math.random() - 0.5) * 0.03 * state.beam;
    }
  }
  for (let i = 0; i < SPARKS; i++) {
    const i3 = i * 3;
    if (sparkLife[i] > 0) {
      sparkLife[i] -= dt;
      const drag = Math.max(0, 1 - 1.5 * dt);
      sparkVel[i3 + 1] -= 5 * dt;
      sparkVel[i3] *= drag; sparkVel[i3 + 1] *= drag; sparkVel[i3 + 2] *= drag;
      sparkPos[i3] += sparkVel[i3] * dt;
      sparkPos[i3 + 1] += sparkVel[i3 + 1] * dt;
      sparkPos[i3 + 2] += sparkVel[i3 + 2] * dt;
      const f = Math.max(0, sparkLife[i] / sparkMax[i]);
      sparkCol[i3] = f;
      sparkCol[i3 + 1] = 0.3 * f * f;
      sparkCol[i3 + 2] = 0.33 * f * f;
    } else {
      sparkCol[i3] = sparkCol[i3 + 1] = sparkCol[i3 + 2] = 0;
    }
  }
  sparkGeo.attributes.position.needsUpdate = true;
  sparkGeo.attributes.color.needsUpdate = true;
}
