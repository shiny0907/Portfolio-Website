// Wires the modules together, runs the frame loop, and starts the loading screen
import { camera, hint, camBase, nowSec, resetClock } from './core.js';
import { state, beatRings, updateBeatRings } from './state.js';
import { tickGroup, arcGroup, overlay, updateEyeball } from './eye/eyeball.js';
import { updateEars } from './eye/ears.js';
import { updateLaser } from './eye/laser.js';
import { hudTicks, hudArcs, updateHud } from './eye/hud.js';
import { setupLighting } from './eye/lighting.js';
import { renderFrame } from './eye/pixel-boot.js';
import { updateGrid } from './grid/grid.js';
import { page, updatePage, updateTravel } from './pages.js';
import { resize } from './layout.js';
import { updateFireZone } from './input.js';
import { eyeReaction } from './reactions.js';
import { updateGaze, updateGazePoint } from './gaze.js';
import { updateAbout } from './about.js';
import { updatePortfolio } from './portfolio.js';
import { runLoader } from './loader.js';

// The rings that step on the beat
beatRings[0].obj = tickGroup;
beatRings[1].obj = arcGroup;
beatRings[2].obj = overlay;
beatRings[3].obj = hudTicks;
beatRings[4].obj = hudArcs;

setupLighting();
resize();

// ---------- Frame loop ----------
let last = 0;
function frame() {
  requestAnimationFrame(frame);
  const t = nowSec();
  const dt = Math.min(1 / 30, Math.max(0.0001, t - last));
  last = t;

  camera.position.copy(camBase);
  camera.updateMatrixWorld();

  updatePage(t);
  updateTravel(dt);
  updateFireZone();
  const tracking = updateGaze(t, dt);
  const react = eyeReaction(t);
  state.reactPix = react.pix;
  const glowLevel = updateEyeball(t, dt, tracking, react);
  updateBeatRings(dt);
  updateEars(t, dt);
  updateHud(t, dt, glowLevel);
  updateGazePoint();
  updateLaser(t, dt);

  updateGrid(t, dt);
  updateAbout(t);
  hint.style.visibility = Math.abs(page.p) > 0.01 ? 'hidden' : '';
  updatePortfolio(t, dt);

  renderFrame(t);
}

function startScene() {
  resetClock();
  last = 0;
  requestAnimationFrame(frame);
}

runLoader(startScene);
