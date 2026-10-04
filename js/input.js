// Pointer input: aiming, firing, and routing clicks to labels, ears, the eye, and portfolio controls
import { stage, hint, renderer, camera, nowSec } from './core.js';
import { state } from './state.js';
import { page, labelClicked } from './pages.js';
import { hoveredLabel } from './grid/labels.js';
import { eyePoke, earPoke } from './reactions.js';
import { pfClick } from './portfolio.js';
import { rig } from './eye/eyeball.js';
import { ears } from './eye/ears.js';
import { caseActive } from './case.js';
import { raycaster } from './gaze.js';

let pressedLabel = null;
let hintDismissed = false;
function dismissHint() {
  if (hintDismissed) return;
  hintDismissed = true;
  hint.classList.add('is-hidden');
}

function setPointer(e) {
  state.clientX = e.clientX;
  state.clientY = e.clientY;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  state.mouse.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  state.hasPointer = true;
  state.lastMove = nowSec();
}
function startFiring() {
  if (!state.booted || state.firing) return;
  state.firing = true;
  state.firedThisPress = true;
  state.stats.shots++;
  if (state.blink.active) state.blink.active = false; // abort any blink, squint takes over
}
function stopFiring() {
  if (!state.firing) return;
  state.firing = false;
  state.nextBlink = nowSec() + 0.35; // cool-down blink after firing
}
let hintTimer = null;
window.addEventListener('pointermove', function (e) {
  setPointer(e);
  if (!hintTimer && !hintDismissed) hintTimer = setTimeout(dismissHint, 12000);
}, { passive: true });
// Browsers only report the mouse position through events. When the page loads (or the loading screen opens)
// under a resting mouse, the first one is pointerover, so the cursor shows up without having to move
window.addEventListener('pointerover', setPointer, { passive: true });
// ...and pick up anything that happened before this module loaded (recorded by the inline script in index.html)
if (window.__ptr && window.__ptr.pointerType !== 'touch') setPointer(window.__ptr);
window.addEventListener('pointerdown', function (e) {
  setPointer(e);
  if (e.button !== 0) return;
  if (e.target && e.target.closest && e.target.closest('[data-nofire]')) return;   // UI buttons never fire
  if (e.target === renderer.domElement) {
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
  }
  if (hoveredLabel) {           // pressing a label is a click, not a shot
    pressedLabel = hoveredLabel;
    return;
  }
  const clickable = e.target && e.target.closest ? e.target.closest('[data-click]') : null;
  if (clickable && page.target === 'portfolio') { pressedEl = clickable; return; }
  if (state.overEar) { pressedEar = state.overEar; return; }   // clicking an ear never fires
  pressedEye = state.overEye;
  state.firedThisPress = false;
  state.pointerDown = true;   // the frame loop decides whether the laser can actually fire
  state.pointerDownAt = nowSec();
  if (state.booted) dismissHint();
});
export const POKE_MAX = 0.4;   // seconds: longer presses on the eye aren't pokes
let pressedEl = null;
let pressedEar = null, pressedEye = false;
function releasePointer(e) {
  if (pressedLabel && pressedLabel === hoveredLabel) labelClicked(pressedLabel);
  pressedLabel = null;
  if (pressedEar && e && state.overEar === pressedEar) earPoke(pressedEar, nowSec());
  pressedEar = null;
  // A click on the eye is a poke; a long hold there is a blocked shot (the cursor shows NO FIRE), not a poke
  if (pressedEye && e && state.overEye && !state.firedThisPress && nowSec() - state.pointerDownAt < POKE_MAX) eyePoke(nowSec());
  pressedEye = false;
  if (pressedEl) {
    const over = e && e.target && e.target.closest ? e.target.closest('[data-click]') : null;
    if (over === pressedEl) pfClick(pressedEl);
    pressedEl = null;
  }
  state.pointerDown = false;
  stopFiring();
}
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);
renderer.domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });
document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) state.hasPointer = false; });
window.addEventListener('blur', function () { state.hasPointer = false; releasePointer(); });

const EYE_NO_FIRE_R = 1.2;   // world units: the eyeball and its lids, plus a little margin
const eyeC = new THREE.Vector3(), eyeE = new THREE.Vector3();

// No firing at the eye itself: holding the button over the eyeball does nothing,
// dragging out past its edge starts the laser, dragging back in powers it down
export function updateFireZone() {
  eyeC.copy(rig.position).project(camera);
  eyeE.set(rig.position.x + EYE_NO_FIRE_R, rig.position.y, rig.position.z).project(camera);
  const sw = stage.clientWidth / 2, sh = stage.clientHeight / 2;
  const rpx = (eyeE.x - eyeC.x) * sw;
  const inside = Math.hypot((state.mouse.x - eyeC.x) * sw, (state.mouse.y - eyeC.y) * sh) < rpx;
  // Is the cursor on an ear or on the eyeball? (both can be clicked)
  state.overEar = null;
  if (state.hasPointer && state.booted && !state.firing) {
    raycaster.setFromCamera(state.mouse, camera);
    for (let i = 0; i < ears.length; i++) {
      if (raycaster.intersectObject(ears[i].pivot, true).length) { state.overEar = ears[i]; break; }
    }
  }
  state.inNoFire = inside;
  state.overEye = state.hasPointer && state.booted && inside && !state.overEar && !state.firing;
  const wantFire = state.pointerDown && state.booted && !inside && !caseActive();   // never from the eye itself, never inside a case study
  if (wantFire && !state.firing) startFiring();
  else if (!wantFire && state.firing) stopFiring();
}
