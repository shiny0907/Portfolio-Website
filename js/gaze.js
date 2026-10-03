// Where the eye looks: cursor tracking, idle behaviour, the servo spring, and the gaze point on screen
import { stage, camera, reduceMotion, TAU, clamp, lerp, camBase, nowSec } from './core.js';
import { state } from './state.js';
import { page } from './pages.js';
import { grid } from './grid/grid.js';
import { centerCardPoint } from './portfolio.js';
import { rig, pitchGroup } from './eye/eyeball.js';
import { earsPerk } from './eye/ears.js';

// ---------- Gaze from cursor ----------
export let LOOK_PLANE_Z = 3.2; // updated every frame from the camera distance
export const raycaster = new THREE.Raycaster();
const lookPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -LOOK_PLANE_Z);
const hit = new THREE.Vector3();
const MAX_YAW = 1.4, MAX_PITCH = 0.8;
const gazeO = new THREE.Vector3(), gazeD = new THREE.Vector3();

// Aim at a point given in normalised device coordinates (the cursor, or anything else on screen)
function aimAt(ndc) {
  raycaster.setFromCamera(ndc, camera);
  if (raycaster.ray.intersectPlane(lookPlane, hit)) {
    const dx = hit.x - rig.position.x;
    const dy = hit.y - rig.position.y;
    const dz = hit.z - rig.position.z;
    state.tYaw = clamp(Math.atan2(dx, dz), -MAX_YAW, MAX_YAW);
    state.tPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -MAX_PITCH, MAX_PITCH);
  }
}

// ---------- Glances: look at something for a moment, then the servo eases back to the cursor ----------
// target is a screen point in CSS pixels ({ x, y }) or a fixed angle ({ yaw, pitch }).
// Points are re-aimed every frame, so a glance stays on target while the eye travels. Firing always wins.
const glance = { until: 0, point: false, x: 0, y: 0, yaw: 0, pitch: 0 };
const glanceNdc = new THREE.Vector2();
export function glanceAt(target, dur) {
  if (state.firing || !state.booted) return;
  glance.until = nowSec() + dur;
  glance.point = !('yaw' in target);
  if (glance.point) { glance.x = target.x; glance.y = target.y; } else { glance.yaw = target.yaw; glance.pitch = target.pitch; }
}
export function cancelGlance() { glance.until = 0; }
function aimGlance() {
  if (!glance.point) { state.tYaw = glance.yaw; state.tPitch = glance.pitch; return; }
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  glanceNdc.set((glance.x - r.left) / r.width * 2 - 1, -(glance.y - r.top) / r.height * 2 + 1);
  aimAt(glanceNdc);
}

// Idle on the Portfolio page: study the centre card with small saccades instead of wandering
const idleNdc = new THREE.Vector2();
function idlePortfolio(t) {
  if (t < state.idleNext) return;
  const p = centerCardPoint();
  const r = stage.getBoundingClientRect();
  if (!p || !r.width) return;
  const x = p.x + (Math.random() * 2 - 1) * p.w * 0.3, y = p.y + (Math.random() * 2 - 1) * p.h * 0.3;
  idleNdc.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1);
  aimAt(idleNdc);
  state.idleNext = t + (0.6 + Math.random() * 1.4) * (reduceMotion ? 2 : 1);
}

function idleBehaviour(t) {
  if (page.target === 'portfolio' && !page.moving) { state.sweep = null; idlePortfolio(t); return; }
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
    aimAt(state.mouse);
  } else {
    if (state.mode !== 'idle') { state.mode = 'idle'; state.idleNext = t + 0.5; }
    if (state.booted) idleBehaviour(t);
  }
  // A glance overrides the cursor or the idle wandering for a moment
  if (state.firing) glance.until = 0;
  const glancing = t < glance.until;
  if (glancing) { state.sweep = null; aimGlance(); }

  // Servo spring, slightly underdamped so it overshoots and settles like a motor
  const k = state.firing ? 150 : (tracking || glancing) ? 95 : state.sweep ? 60 : 170;
  const c = state.firing ? 19 : (tracking || glancing) ? 14 : state.sweep ? 15 : 20;
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
