// Shared foundations: DOM refs, the renderer, scene and camera, math helpers, and the clock
export const stage = document.getElementById('stage');
export const hint = document.getElementById('hint');
export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Renderer, scene, camera ----------
// null when WebGL isn't available; main.js shows the fallback and stops loading the rest
export const renderer = (function () {
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    return r.getContext() ? r : null;
  } catch (e) { return null; }
})();

if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(renderer.domElement);
}

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
// The camera's resting position, set on resize
export const camBase = new THREE.Vector3();

export const TAU = Math.PI * 2;
export const srgb = (hex) => new THREE.Color(hex).convertSRGBToLinear();
export const hdr = (hex, k) => srgb(hex).multiplyScalar(k);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

// ---------- Clock ----------
// Scene time in seconds, restarted when the scene starts after the loading screen
let clockStart = performance.now();
export const nowSec = () => (performance.now() - clockStart) / 1000;
export function resetClock() { clockStart = performance.now(); }
// Real wall-clock milliseconds, for anything locked to actual seconds
export const wallMs = () => performance.timeOrigin + performance.now();
