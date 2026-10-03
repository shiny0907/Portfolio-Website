// Optional sound: off by default, toggled by the pixel speaker in the bottom-left corner.
// Everything is synthesised with the Web Audio API (filtered noise and simple oscillators, short envelopes).
// Nothing is created until the visitor turns sound on, and with it off every call returns straight away.
import { clamp } from './core.js';
import { state } from './state.js';

const MASTER = 0.08;
const MAX_VOICES = 4;
const snd = { on: false, ctx: null, master: null, noise: null, voices: 0, last: {}, hum: null, prevSpeed: 0 };
try { snd.on = localStorage.getItem('sound') === 'on'; } catch (err) { snd.on = false; }

// ---- The toggle: a pixel speaker with waves (on) or an X (off) ----
const btn = document.getElementById('soundToggle');
const icon = btn ? btn.querySelector('canvas') : null;
const ICON_ON = ['...#......', '..##..#...', '####...#..', '####.#.#..', '####...#..', '..##..#...', '...#......'];
const ICON_OFF = ['...#......', '..##......', '####.#...#', '####..#.#.', '####...#..', '..##..#.#.', '...#.#...#'];
function drawIcon() {
  if (!icon) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const px = Math.max(2, Math.round(2 * dpr));
  const rows = snd.on ? ICON_ON : ICON_OFF;
  icon.width = rows[0].length * px; icon.height = rows.length * px;
  icon.style.width = (icon.width / dpr) + 'px'; icon.style.height = (icon.height / dpr) + 'px';
  const g = icon.getContext('2d');
  g.clearRect(0, 0, icon.width, icon.height);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y][x] !== '#') continue;
      g.fillStyle = !snd.on ? '#6f7b87' : x >= 5 ? '#ff0a1e' : '#c9d4de';
      g.fillRect(x * px, y * px, px, px);
    }
  }
  btn.setAttribute('aria-pressed', snd.on ? 'true' : 'false');
  btn.dataset.cursor = snd.on ? 'SOUND ON' : 'SOUND OFF';
}
if (btn) {
  drawIcon();
  btn.addEventListener('click', function () {
    snd.on = !snd.on;
    try { localStorage.setItem('sound', snd.on ? 'on' : 'off'); } catch (err) { /* choice just won't be remembered */ }
    if (snd.on) { wake(); sfx('blip'); } else { stopHum(true); if (snd.ctx) snd.ctx.suspend(); }
    drawIcon();
  });
}

// Browsers only allow audio after a gesture, so a remembered "on" starts on the first click or key
function wake() {
  if (!snd.on) return;
  if (!snd.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { snd.on = false; drawIcon(); return; }
    const ctx = new AC();
    snd.ctx = ctx;
    snd.master = ctx.createGain();
    snd.master.gain.value = MASTER;
    const comp = ctx.createDynamicsCompressor();   // so stacked sounds never pile up into noise
    comp.threshold.value = -24; comp.ratio.value = 6;
    snd.master.connect(comp);
    comp.connect(ctx.destination);
    const len = ctx.sampleRate;   // one second of white noise, reused by every noise sound
    snd.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = snd.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (snd.ctx.state === 'suspended' && document.visibilityState === 'visible') snd.ctx.resume();
}
window.addEventListener('pointerdown', wake, true);
window.addEventListener('keydown', wake, true);
document.addEventListener('visibilitychange', function () {
  if (!snd.ctx) return;
  if (document.visibilityState === 'hidden') snd.ctx.suspend();
  else if (snd.on) snd.ctx.resume();
});

// ---- Building blocks ----
function ready() { return snd.on && snd.ctx && snd.ctx.state === 'running'; }
// Rate limit per sound, plus a global cap on how many play at once
function claim(name, gap) {
  if (!ready()) return false;
  const t = snd.ctx.currentTime;
  if (t - (snd.last[name] || -1) < gap || snd.voices >= MAX_VOICES) return false;
  snd.last[name] = t;
  return true;
}
function voice(node, end) {
  snd.voices++;
  node.onended = function () { snd.voices = Math.max(0, snd.voices - 1); };
  node.stop(end);
}
function env(g, t, peak, attack, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
// Filtered noise with a sweeping filter
function noise(at, dur, f0, f1, q, peak, type) {
  const c = snd.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = snd.noise;
  src.loop = true;
  f.type = type || 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(f0, at);
  f.frequency.exponentialRampToValueAtTime(f1, at + dur);
  env(g, at, peak, Math.min(0.02, dur / 3), dur);
  src.connect(f); f.connect(g); g.connect(snd.master);
  src.start(at, Math.random() * 0.5);
  voice(src, at + dur + 0.02);
}
// A short tone with a pitch slide, softened by a low-pass
function tone(at, dur, f0, f1, peak, type) {
  const c = snd.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, at);
  o.frequency.exponentialRampToValueAtTime(f1, at + dur);
  f.type = 'lowpass'; f.frequency.value = 1800;
  env(g, at, peak, 0.006, dur);
  o.connect(f); f.connect(g); g.connect(snd.master);
  o.start(at);
  voice(o, at + dur + 0.02);
}

// ---- The sounds ----
const SOUNDS = {
  blip: function (t) { tone(t, 0.03, 760, 700, 0.12, 'square'); if (Math.random() < 0.5) tone(t + 0.045, 0.025, 980, 900, 0.08, 'square'); },
  servo: function (t, amt) { noise(t, 0.12, 900, 1400, 6, 0.35 * amt); tone(t, 0.1, 140, 190, 0.12 * amt, 'sawtooth'); },
  whoosh: function (t) { noise(t, 1.0, 260, 1500, 0.9, 0.7); },
  breach: function (t) { noise(t, 0.4, 600, 1200, 3, 0.45); tone(t + 0.05, 0.7, 220, 55, 0.5, 'triangle'); tone(t + 0.1, 0.03, 900, 850, 0.1, 'square'); },
  // Eye reactions
  flinch: function (t) { tone(t, 0.09, 900, 480, 0.4); },
  startle: function (t) { tone(t, 0.12, 480, 1300, 0.35); },
  curious: function (t) { tone(t, 0.09, 600, 880, 0.3); tone(t + 0.12, 0.12, 760, 680, 0.25); },
  glitch: function (t) { tone(t, 0.03, 700, 650, 0.12, 'square'); tone(t + 0.06, 0.03, 940, 900, 0.1, 'square'); tone(t + 0.12, 0.03, 620, 600, 0.1, 'square'); },
  happy: function (t) { tone(t, 0.07, 700, 1000, 0.3); tone(t + 0.1, 0.08, 900, 1300, 0.28); },
  annoyed: function (t) { tone(t, 0.16, 300, 200, 0.3, 'square'); },
  // Ear reactions
  'ear-flick': function (t) { tone(t, 0.04, 1200, 1500, 0.2); },
  'ear-wiggle': function (t) { for (let i = 0; i < 3; i++) tone(t + i * 0.09, 0.03, 1100, 1250, 0.14); },
  'ear-pin': function (t) { tone(t, 0.12, 420, 300, 0.25); },
  'ear-shake': function (t) { noise(t, 0.3, 700, 1100, 4, 0.3); }
};
const GAPS = { blip: 0.25, servo: 0.35, whoosh: 0.6, breach: 2 };
export function sfx(name, amt) {
  if (!snd.on || !snd.ctx) return;   // off: no audio work at all
  if (!claim(name, GAPS[name] || 0.12)) return;
  SOUNDS[name](snd.ctx.currentTime + 0.005, amt || 1);
}

// ---- Laser hum: two detuned low saws through a low-pass, fading in and out with firing ----
function startHum() {
  const c = snd.ctx, t = c.currentTime;
  const g = c.createGain(), f = c.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
  const o1 = c.createOscillator(), o2 = c.createOscillator();
  o1.type = o2.type = 'sawtooth';
  o1.frequency.value = 55; o2.frequency.value = 55.8;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(snd.master);
  o1.start(t); o2.start(t);
  snd.hum = { g: g, f: f, oscs: [o1, o2] };
}
function stopHum(now) {
  if (!snd.hum || !snd.ctx) { snd.hum = null; return; }
  const t = snd.ctx.currentTime, h = snd.hum;
  h.g.gain.cancelScheduledValues(t);
  h.g.gain.setValueAtTime(Math.max(0.0001, h.g.gain.value), t);
  h.g.gain.exponentialRampToValueAtTime(0.0001, t + (now ? 0.05 : 0.25));
  h.oscs.forEach(function (o) { o.stop(t + 0.3); });
  snd.hum = null;
}

// Per frame: laser hum and servo whirs on big eye moves. Returns immediately while sound is off.
export function updateSound() {
  if (!snd.on || !snd.ctx) return;
  if (!ready()) { if (snd.hum) stopHum(true); return; }
  if (state.firing && !snd.hum) startHum();
  else if (!state.firing && snd.hum) stopHum(false);
  if (snd.hum) snd.hum.f.frequency.setTargetAtTime(340 + 120 * state.anger, snd.ctx.currentTime, 0.1);
  // Servo: only on the rising edge of a fast move, never a constant buzz
  const speed = Math.hypot(state.vyaw, state.vpitch);
  if (speed > 3.5 && snd.prevSpeed <= 3.5 && !state.firing) sfx('servo', clamp(speed / 8, 0.4, 1));
  snd.prevSpeed = speed;
}
