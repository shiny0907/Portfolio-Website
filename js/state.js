// Shared behaviour state for the eye, blink sequences, and the clockwork beat
import { reduceMotion, TAU, wallMs } from './core.js';

// ---------- Behaviour state ----------
export const BLINK = {
  single: [
    { to: 1, dur: 0.075, ease: 'in' },
    { to: 1, dur: 0.05 },
    { to: 0, dur: 0.17, ease: 'back' }
  ],
  double: [
    { to: 1, dur: 0.07, ease: 'in' },
    { to: 1, dur: 0.04 },
    { to: 0.1, dur: 0.09, ease: 'out' },
    { to: 1, dur: 0.07, ease: 'in' },
    { to: 1, dur: 0.04 },
    { to: 0, dur: 0.17, ease: 'back' }
  ],
  shutterCheck: [
    { to: 0.55, dur: 0.09, ease: 'in' },
    { to: 0.55, dur: 0.14 },
    { to: 0.75, dur: 0.05, ease: 'in' },
    { to: 0, dur: 0.16, ease: 'back' }
  ],
  boot: [
    { to: 1, dur: 0.7 },
    { to: 0.62, dur: 0.12, ease: 'out' },
    { to: 0.62, dur: 0.22 },
    { to: 0, dur: 0.38, ease: 'back' }
  ]
};
export const EASE = {
  linear: (p) => p,
  in: (p) => p * p,
  out: (p) => 1 - (1 - p) * (1 - p),
  back: (p) => { const c1 = 1.70158, c3 = c1 + 1, q = p - 1; return 1 + c3 * q * q * q + c1 * q * q; }
};

export const state = {
  yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, tYaw: 0, tPitch: 0,
  mouse: new THREE.Vector2(0, 0), hasPointer: false, lastMove: -1e9,
  mode: 'idle', idleNext: 1.6, sweep: null,
  blink: { active: true, seq: BLINK.boot, idx: 0, segStart: 0, from: 1 },
  nextBlink: 4, blinkClose: 1, squint: 0,
  aperture: 0.0, apertureTarget: 0.045,
  glitchUntil: 0, glitchValue: 1, glitchNextStep: 0, booted: false,
  beatPulse: 0, earNext: 5, firing: false, anger: 0, beam: 0,
  prevVyaw: 0, prevVpitch: 0, accYaw: 0, accPitch: 0, pointerDown: false, clientX: 0, inNoFire: false, pointerDownAt: 0, overEye: false, overEar: null, recoil: 0, vRecoil: 0, shakeUntil: 0, annoy: 0, pokes: [], firedThisPress: false, rigX: 0, vRigX: 0, travel: 0, impactX: null, impactY: null, gazeX: -1e5, gazeY: -1e5,
  jitY: 0, jitP: 0, jitTY: 0, jitTP: 0, jitNext: 0
};

// Rings that tick on a clock: inner lens parts every half second, outer HUD every second.
// Steps are locked to real wall-clock seconds.
function ringSpring(obj, step, everySecondOnly) {
  return { obj: obj, step: step, secondOnly: everySecondOnly, angle: 0, vel: 0, target: 0 };
}
export const beatRings = [
  ringSpring(null, -TAU / 60, false),        // lens tick ring
  ringSpring(null, TAU / 24, false),         // lens arc ring (opposite way)
  ringSpring(null, -TAU / 120, false),       // iris overlay
  ringSpring(null, -TAU / 60, true),         // HUD tick ring, like a seconds hand
  ringSpring(null, TAU / 60, true)           // HUD red arcs (opposite way)
];
let lastHalfBeat = Math.floor(wallMs() / 500);

function onHalfBeat(index) {
  const fullSecond = index % 2 === 0;
  for (let i = 0; i < beatRings.length; i++) {
    const r = beatRings[i];
    if (r.secondOnly && !fullSecond) continue;
    r.target += r.step;
  }
  if (fullSecond) state.beatPulse = 1;
}

export function startBlink(seq, t) {
  state.blink = { active: true, seq: seq, idx: 0, segStart: t, from: state.blinkClose };
}

// Clockwork: every ring snaps one notch on the beat, with a small spring bounce
export function updateBeatRings(dt) {
  const hb = Math.floor(wallMs() / 500);
  if (hb !== lastHalfBeat) {
    const from = hb - lastHalfBeat > 4 ? hb - 1 : lastHalfBeat; // skip catch-up after a hidden tab
    for (let i = from + 1; i <= hb; i++) onHalfBeat(i);
    lastHalfBeat = hb;
  }
  const rk = 700, rc = reduceMotion ? 54 : 30, rh = dt / 4;
  for (let i = 0; i < beatRings.length; i++) {
    const r = beatRings[i];
    for (let s = 0; s < 4; s++) {
      r.vel += ((r.target - r.angle) * rk - r.vel * rc) * rh;
      r.angle += r.vel * rh;
    }
    r.obj.rotation.z = r.angle;
  }
  state.beatPulse *= Math.exp(-dt * 5);
}
