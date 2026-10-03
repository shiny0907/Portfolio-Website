// Where the eye looks: cursor tracking, idle behaviour, the servo spring, and the gaze point on screen
import { camera, reduceMotion, TAU, clamp, lerp, camBase } from './core.js';
import { state } from './state.js';
import { grid } from './grid/grid.js';
import { rig, pitchGroup } from './eye/eyeball.js';
import { earsPerk } from './eye/ears.js';

// ---------- Gaze from cursor ----------
export let LOOK_PLANE_Z = 3.2; // updated every frame from the camera distance
export const raycaster = new THREE.Raycaster();
const lookPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -LOOK_PLANE_Z);
const hit = new THREE.Vector3();
const MAX_YAW = 1.4, MAX_PITCH = 0.8;
const gazeO = new THREE.Vector3(), gazeD = new THREE.Vector3();

function aimAtCursor() {
  raycaster.setFromCamera(state.mouse, camera);
  if (raycaster.ray.intersectPlane(lookPlane, hit)) {
    const dx = hit.x - rig.position.x;
    const dy = hit.y - rig.position.y;
    const dz = hit.z - rig.position.z;
    state.tYaw = clamp(Math.atan2(dx, dz), -MAX_YAW, MAX_YAW);
    state.tPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -MAX_PITCH, MAX_PITCH);
  }
}

function idleBehaviour(t) {
  if (state.sweep) {
    const sw = state.sweep;
    const p = (t - sw.start) / sw.dur;
    if (p >= 1) {
      state.sweep = null;
    } else {
      const e = 0.5 - 0.5 * Math.cos(p * Math.PI);
      state.tYaw = lerp(-0.62, 0.62, e) * sw.dir;
      state.tPitch = 0.06 * Math.sin(p * TAU);
    }
    return;
  }
  if (t < state.idleNext) return;
  const r = Math.random();
  const slow = reduceMotion ? 2 : 1;
  if (r < 0.16 && !reduceMotion) {
    state.sweep = { start: t, dur: 2.4, dir: Math.random() < 0.5 ? 1 : -1 };
    state.idleNext = t + 2.9;
  } else if (r < 0.34) {
    state.tYaw = 0; state.tPitch = 0;
    state.idleNext = t + (1.4 + Math.random() * 1.6) * slow;
  } else {
    state.tYaw = (Math.random() * 2 - 1) * 0.6;
    state.tPitch = (Math.random() * 2 - 1) * 0.38;
    state.idleNext = t + (0.7 + Math.random() * 1.8) * slow;
  }
}

// Aim target, tracking vs idle, then the servo spring. Returns whether the eye is tracking the cursor.
export function updateGaze(t, dt) {
  // Keep the aim plane at a fixed share of the camera distance, so the eye can reach
  // every edge of the screen on wide monitors and tall phones alike
  LOOK_PLANE_Z = camBase.z * 0.29;
  lookPlane.constant = -LOOK_PLANE_Z;
  const tracking = ((state.hasPointer && t - state.lastMove < 4) || state.firing) && state.booted;
  state.anger += ((state.firing ? 1 : 0) - state.anger) * Math.min(1, dt * (state.firing ? 14 : 4));
  if (tracking) {
    if (state.mode !== 'track') { state.mode = 'track'; state.sweep = null; earsPerk(); }
    aimAtCursor();
    if (t < state.glanceUntil) { state.tYaw = state.glanceYaw; state.tPitch = state.glancePitch; }
  } else {
    if (state.mode !== 'idle') { state.mode = 'idle'; state.idleNext = t + 0.5; }
    if (state.booted) idleBehaviour(t);
  }

  // Servo spring, slightly underdamped so it overshoots and settles like a motor
  const k = state.firing ? 150 : tracking ? 95 : state.sweep ? 60 : 170;
  const c = state.firing ? 19 : tracking ? 14 : state.sweep ? 15 : 20;
  const h = dt / 2;
  for (let i = 0; i < 2; i++) {
    state.vyaw += ((state.tYaw - state.yaw) * k - state.vyaw * c) * h;
    state.yaw += state.vyaw * h;
    state.vpitch += ((state.tPitch - state.pitch) * k - state.vpitch * c) * h;
    state.pitch += state.vpitch * h;
  }
  // Angular acceleration of the eye, smoothed, drives the ears' secondary motion
  const rawAccYaw = clamp((state.vyaw - state.prevVyaw) / dt, -80, 80);
  const rawAccPitch = clamp((state.vpitch - state.prevVpitch) / dt, -80, 80);
  state.prevVyaw = state.vyaw;
  state.prevVpitch = state.vpitch;
  const accK = Math.min(1, dt * 30);
  state.accYaw += (rawAccYaw - state.accYaw) * accK;
  state.accPitch += (rawAccPitch - state.accPitch) * accK;

  // Tiny servo hunting while holding position
  if (!reduceMotion) {
    if (t > state.jitNext) {
      state.jitTY = (Math.random() * 2 - 1) * 0.0035;
      state.jitTP = (Math.random() * 2 - 1) * 0.0035;
      state.jitNext = t + 0.08 + Math.random() * 0.22;
    }
    const jk = Math.min(1, dt * 25);
    state.jitY += (state.jitTY - state.jitY) * jk;
    state.jitP += (state.jitTP - state.jitP) * jk;
  }
  return tracking;
}

// Where the eye is looking on screen (drives the scan light on the name)
export function updateGazePoint() {
  rig.updateMatrixWorld(true);
  pitchGroup.localToWorld(gazeO.set(0, 0, 0));
  pitchGroup.localToWorld(gazeD.set(0, 0, 1)).sub(gazeO).normalize();
  gazeO.addScaledVector(gazeD, (LOOK_PLANE_Z - gazeO.z) / Math.max(0.05, gazeD.z)).project(camera);
  state.gazeX = (gazeO.x + 1) / 2 * grid.w;
  state.gazeY = (1 - gazeO.y) / 2 * grid.h;
}
