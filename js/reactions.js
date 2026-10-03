import { reduceMotion } from './core.js';
import { state, BLINK, beatRings, startBlink } from './state.js';
import { glitchRun } from './pixel-font.js';
import { grid } from './grid/grid.js';
import { scrLeft, scrRight, CORNER_LEFT, CLOCK_PLACE } from './grid/corners.js';
import { ears, earTwitch } from './eye/ears.js';
import { glanceAt, cancelGlance } from './gaze.js';
import { sfx } from './sound.js';

// ---------- Click reactions ----------
// Clicking the eye plays one of five reactions (never the same one twice in a row).
// Poke it three times within a couple of seconds and it gets annoyed instead.
const EYE_REACTIONS = ['flinch', 'startle', 'curious', 'glitch', 'happy'];
const EYE_REACT_DUR = { flinch: 0.6, startle: 0.9, curious: 1.3, glitch: 0.55, happy: 1.2 };
const EAR_REACTIONS = ['flick', 'wiggle', 'pin', 'shake'];
let lastEyeReaction = null, r_tiltDir = 1;
function pickFrom(list, last) {
  const opts = list.filter(function (x) { return x !== last; });
  return opts[Math.random() * opts.length | 0];
}
export function eyePoke(t) {
  if (!state.booted) return;
  state.pokes = state.pokes.filter(function (pt) { return t - pt < 2.5; });
  state.pokes.push(t);
  if (state.pokes.length >= 3) {
    // Annoyed: squints, shakes "no", ears pinned back
    state.pokes = [];
    state.annoy = 1;
    state.shakeUntil = t + 0.55;
    state.vRecoil -= 2.5;
    state.react = null;
    sfx('annoyed');
    return;
  }
  const type = pickFrom(EYE_REACTIONS, lastEyeReaction);
  lastEyeReaction = type;
  state.react = { type: type, start: t, dur: EYE_REACT_DUR[type], done: {} };
  sfx(type);
  if (type === 'flinch') {
    // Recoils back into the screen, pupil snaps shut, double blink, ears flatten
    state.vRecoil -= 4.5;
    state.aperture = 0;
    state.glitchUntil = t + 0.22;
    startBlink(BLINK.double, t);
    ears.forEach(function (ear) { earTwitch(ear, 1.1); });
  } else if (type === 'startle') {
    // Lids snap wide, pupil goes pinpoint, ears shoot up, the rings spin up
    state.aperture = 0;
    if (state.blink.active) state.blink.active = false;
    ears.forEach(function (ear) { ear.vfold += 9; });
    beatRings.forEach(function (r) { r.target += Math.sign(r.step) * Math.PI * 0.75; });
    state.vRecoil -= 2;
  } else if (type === 'curious') {
    // Leans in toward you with a cat-like head tilt, pupil opening wide, ears pricked forward
    ears.forEach(function (ear) { ear.vfold += 6; });
    r_tiltDir = Math.random() < 0.5 ? -1 : 1;
  } else if (type === 'glitch') {
    // The eye breaks into pixels for a moment, the glow flickers, the text scrambles
    state.glitchUntil = t + 0.55;
    glitchRun(scrLeft, t, 0, CORNER_LEFT.length);
    glitchRun(scrRight, t, 0, CLOCK_PLACE.length);
    beatRings[4].angle += 0.6;     // kick the ring spring (setting rotation directly gets overwritten every frame)
  } else if (type === 'happy') {
    // Happy squint from below, a little hop, ears wiggle
    ears.forEach(function (ear, i) {
      ear.wiggles = [0, 0.12, 0.24, 0.36].map(function (d, j) { return { at: t + d + i * 0.05, amt: j % 2 ? 4 : -4 }; });
    });
  }
}
// Per-frame offsets from the current eye reaction
const R0 = { yaw: 0, pitch: 0, hop: 0, wide: 0, bottom: 0, pin: false, pix: 0, lean: 0, tilt: 0, dilate: false };
export function eyeReaction(t) {
  const r = state.react;
  if (!r) return R0;
  const u = (t - r.start) / r.dur;
  if (u >= 1) { state.react = null; return R0; }
  const out = { yaw: 0, pitch: 0, hop: 0, wide: 0, bottom: 0, pin: false, pix: 0, lean: 0, tilt: 0, dilate: false };
  if (r.type === 'startle') {
    out.wide = 0.22 * (u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9);
    out.pin = u < 0.65;
  } else if (r.type === 'curious') {
    // Ease in, hold, ease out
    const env = u < 0.25 ? Math.sin((u / 0.25) * Math.PI / 2) : u > 0.75 ? Math.cos(((u - 0.75) / 0.25) * Math.PI / 2) : 1;
    out.lean = 0.35 * env;
    out.tilt = 0.22 * env * r_tiltDir;
    out.dilate = u < 0.85;
    if (u > 0.55 && !r.done.blink) { r.done.blink = true; startBlink(BLINK.single, t); }
  } else if (r.type === 'glitch') {
    if (!reduceMotion) {
      const step = Math.floor((t - r.start) / 0.07);
      const seq = [1, 0, 0.6, 0.34, 0, 0.6, 0];
      out.pix = Math.round(grid.cell * (seq[step % seq.length] || 0));
    }
  } else if (r.type === 'happy') {
    const env = u < 0.2 ? u / 0.2 : u > 0.8 ? (1 - u) / 0.2 : 1;
    out.bottom = 0.55 * env;
    out.hop = 0.14 * Math.sin(Math.min(1, u / 0.35) * Math.PI);
  }
  return out;
}

// Clicking an ear plays one of four ear reactions (per ear, never the same twice in a row)
export function earPoke(ear, t) {
  if (!state.booted) return;
  const type = pickFrom(EAR_REACTIONS, ear.lastReaction);
  ear.lastReaction = type;
  sfx('ear-' + type);
  const other = ears.find(function (e2) { return e2 !== ear; });
  const look = { yaw: ear.side * 0.55, pitch: 0.5 };
  glanceAt(look, 0.7);
  if (type === 'flick') {
    // Hard flick back, the other ear twitches a beat later
    ear.vfold -= 15;
    if (other) other.wiggles = [{ at: t + 0.16, amt: -6 }];
    if (!state.blink.active) startBlink(BLINK.single, t + 0.05);
  } else if (type === 'wiggle') {
    // Twitch-twitch-twitch
    ear.wiggles = [0, 0.09, 0.18, 0.27, 0.36].map(function (d, j) { return { at: t + d, amt: j % 2 ? 6 : -7 }; });
  } else if (type === 'pin') {
    // Annoyed: that ear pins flat while the eye squints and glares at it
    ear.flatUntil = t + 0.9;
    state.glareUntil = t + 0.9;
    glanceAt(look, 0.9);
  } else if (type === 'shake') {
    // Shakes it off like a cat: both ears flutter and the head gives a quick shake
    ears.forEach(function (e2, i) {
      e2.wiggles = [0, 0.06, 0.12, 0.18, 0.24, 0.3].map(function (d, j) { return { at: t + d + i * 0.03, amt: j % 2 ? 7 : -7 }; });
    });
    state.shakeUntil = t + 0.4;
    cancelGlance();
  }
}
