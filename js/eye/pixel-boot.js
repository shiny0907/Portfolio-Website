import { renderer, scene, camera, reduceMotion } from '../core.js';
import { state } from '../state.js';
import { grid } from '../grid/grid.js';

// ---------- Pixel boot: the eye materialises from big pixels that sharpen into full detail ----------
const pixRT = new THREE.WebGLRenderTarget(1, 1, {
  minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat, depthBuffer: true
});
pixRT.texture.encoding = THREE.sRGBEncoding;
pixRT.texture.generateMipmaps = false;
const pixScene = new THREE.Scene();
const pixCam = new THREE.OrthographicCamera(0, 1, 0, -1, -1, 1);
const pixQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
  map: pixRT.texture, transparent: true, toneMapped: false, depthTest: false, depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor
}));
pixScene.add(pixQuad);
const pixBuf = new THREE.Vector2();
let pixActive = false;
// Steps from one grid square per pixel down to full detail
const PIX_STEPS = [1, 0.75, 0.5, 0.36, 0.25, 0.17, 0.11];
const PIX_STEP_TIME = 0.2;
function pixelSizeAt(t) {
  if (reduceMotion) return 0;
  const k = Math.floor(t / PIX_STEP_TIME);
  if (k < PIX_STEPS.length) return Math.max(2, Math.round(grid.cell * PIX_STEPS[k]));
  if (k === PIX_STEPS.length) return 2;
  return 0;
}
export function renderFrame(t) {
  const p = Math.max(pixelSizeAt(t), state.reactPix || 0);
  if (p < 2) {
    if (pixActive) { camera.clearViewOffset(); pixActive = false; }
    renderer.render(scene, camera);
    return;
  }
  pixActive = true;
  renderer.getDrawingBufferSize(pixBuf);
  const W = pixBuf.x, H = pixBuf.y;
  // Line the big pixels up with the background grid squares
  const sx = ((grid.ox % p) + p) % p - p;
  const sy = ((grid.oy % p) + p) % p - p;
  const rtW = Math.ceil((W - sx) / p), rtH = Math.ceil((H - sy) / p);
  if (pixRT.width !== rtW || pixRT.height !== rtH) pixRT.setSize(rtW, rtH);
  camera.setViewOffset(W, H, sx, sy, rtW * p, rtH * p);
  renderer.setRenderTarget(pixRT);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  pixCam.left = 0; pixCam.right = W; pixCam.top = 0; pixCam.bottom = -H;
  pixCam.updateProjectionMatrix();
  pixQuad.scale.set(rtW * p, rtH * p, 1);
  pixQuad.position.set(sx + rtW * p / 2, -(sy + rtH * p / 2), 0);
  renderer.render(pixScene, pixCam);
}
