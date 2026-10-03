// Sizing on resize: renderer, grid, camera distance, and where the eye parks on the side pages
import { stage, renderer, camera, camBase } from './core.js';
import { resizeGrid } from './grid/grid.js';
import { layoutLabels } from './grid/labels.js';
import { layoutAbout } from './about.js';
import { layoutPortfolio } from './portfolio.js';
import { layoutContact } from './contact.js';

// How far the eye travels to park at the screen edge with half of it showing (set on resize):
// sideways for About/Portfolio, down for Contact
export let EYE_PARK_X = 3;
export let EYE_PARK_Y = 2;

export function resize() {
  const w = stage.clientWidth || window.innerWidth;
  const h = stage.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  resizeGrid(w, h);
  camera.aspect = w / h;
  const subject = 3.0;  // eye plus ears, in world units
  const fill = 0.5;     // share of the shorter screen side the eye should take
  const visibleH = subject / (fill * Math.min(1, camera.aspect));
  camera.position.set(0, 0, visibleH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
  camBase.copy(camera.position);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  // On the About page the eye parks on the right edge with exactly half of it showing
  EYE_PARK_X = camBase.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  EYE_PARK_Y = camBase.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  layoutLabels();
  layoutAbout();
  layoutPortfolio();
  layoutContact();
}
window.addEventListener('resize', resize);
