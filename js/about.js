// About page: layout, pixel headings that decode, and the photo the laser can knock squares out of
import { stage, reduceMotion, camBase } from './core.js';
import { drawPixelText, pixelTextWidth, LABEL_COLOR } from './pixel-font.js';
import { page } from './pages.js';
import { grid } from './grid/grid.js';
import { labelGeo, LABEL_Z } from './grid/labels.js';
import { EYE_PARK_X } from './layout.js';
import { state } from './state.js';
import { glanceAt } from './gaze.js';

export const aboutEl = document.getElementById('about');

// About text fills the space left of the parked eye and its labels; on narrow screens it takes the full width
export function layoutAbout() {
  const w = stage.clientWidth || window.innerWidth;
  const ppuCss = labelGeo.ppu / grid.dpr;
  const right = labelGeo.cx0 / grid.dpr + (EYE_PARK_X * (camBase.z - LABEL_Z) / camBase.z - 2.75) * ppuCss;
  const narrow = right < w * 0.58;
  const aw = narrow ? w : Math.max(320, right);
  aboutEl.classList.toggle('is-narrow', narrow);
  aboutEl.classList.toggle('is-wide', !narrow && aw >= 1200);
  aboutEl.style.setProperty('--about-w', aw + 'px');
}

// ---------- About page: pixel headings that decode, and a photo that materialises from pixels ----------
const pxHeadings = Array.prototype.map.call(document.querySelectorAll('.px-heading'), function (cv) {
  return { cv: cv, ctx: cv.getContext('2d'), text: cv.dataset.text, px: +cv.dataset.px || 2, red: !!cv.dataset.red, scr: null, drawn: false };
});
function drawHeadings(t) {
  const dpr = grid.dpr;
  pxHeadings.forEach(function (h) {
    const pxD = Math.max(1, Math.round(h.px * dpr));
    const W = pixelTextWidth(h.text, pxD), H = 7 * pxD;
    if (h.cv.width !== W || h.cv.height !== H) {
      h.cv.width = W; h.cv.height = H;
      h.cv.style.width = (W / dpr) + 'px'; h.cv.style.height = (H / dpr) + 'px';
      h.drawn = false;
    }
    const busy = h.scr && h.scr.some(function (c) { return t < c.end; });
    if (h.drawn && !busy) return;
    h.ctx.clearRect(0, 0, W, H);
    drawPixelText(h.ctx, h.text, 0, 0, pxD, function () { return h.red ? '#ff0a1e' : LABEL_COLOR; }, h.scr, t);
    h.drawn = !busy;
  });
}
const photoCanvas = document.getElementById('aboutPhoto');
const photoCtx = photoCanvas.getContext('2d');
const photoSmall = document.createElement('canvas');
const photoImg = new Image();
let photoReady = false, photoStart = -1;
photoImg.onload = function () { photoReady = true; };
photoImg.src = 'assets/images/shining-yu.jpg';
const PHOTO_STEPS = [30, 20, 13, 8, 5, 3];
// The photo is drawn on the background grid layer (behind the eye and the laser), split into
// squares the size of a grid square. A direct laser hit knocks a square out for good, like the name.
const photo = { x: 0, y: 0, w: 0, h: 0, cols: 0, rows: 0, C: 0, tiles: null, visible: false };
function photoTilesFor(cols, rows, C) {
  if (photo.tiles && photo.cols === cols && photo.rows === rows && photo.C === C) return;
  photo.cols = cols; photo.rows = rows; photo.C = C;
  photo.tiles = [];
  for (let k = 0; k < cols * rows; k++) photo.tiles.push({ state: 0, dieAt: 0 });
}
export function photoHit(px, py, t) {
  if (!photo.visible || photoStart < 0 || !photo.tiles) return;
  const C = photo.C;
  const fx = (px - photo.x) / C, fy = (py - photo.y) / C;
  const ci = Math.floor(fx), cj = Math.floor(fy);
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= photo.cols || j >= photo.rows) continue;
      if (Math.hypot(i + 0.5 - fx, j + 0.5 - fy) >= 0.95) continue;
      const tile = photo.tiles[j * photo.cols + i];
      if (tile.state === 0) { tile.state = 1; tile.dieAt = t; }
    }
  }
}
export function drawPhotoOnGrid(ctx, t) {
  photo.visible = page.p > 0.001 && photoReady;
  if (!photo.visible) return;
  const dpr = grid.dpr, C = grid.cell;
  const sr = stage.getBoundingClientRect(), r = photoCanvas.getBoundingClientRect();
  // Snap the photo onto the background grid and to a whole number of squares,
  // so every piece is a full square and knocking them out never leaves slivers
  const rawX = (r.left - sr.left) * dpr, rawY = (r.top - sr.top) * dpr;
  const cols = Math.max(1, Math.floor(r.width * dpr / C)), rows = Math.max(1, Math.floor(r.height * dpr / C));
  photo.x = grid.ox + Math.round((rawX - grid.ox) / C) * C;
  photo.y = grid.oy + Math.round((rawY - grid.oy) / C) * C;
  photo.w = cols * C;
  photo.h = rows * C;
  photoTilesFor(cols, rows, C);
  if (photoStart < 0) return;    // not revealed yet

  ctx.save();
  // Revealed by the page sweep like the rest of the About page
  ctx.beginPath();
  ctx.rect(0, 0, page.p * grid.w, grid.h);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(photo.x, photo.y, photo.w, photo.h);
  ctx.clip();

  // Source crop that covers the snapped rectangle without stretching
  const ia = photoImg.width / photoImg.height, ra = photo.w / photo.h;
  let sx = 0, sy = 0, sw = photoImg.width, sh = photoImg.height;
  if (ra > ia) { sh = sw / ra; sy = (photoImg.height - sh) / 2; } else { sw = sh * ra; sx = (photoImg.width - sw) / 2; }

  ctx.drawImage(photoImg, sx, sy, sw, sh, photo.x, photo.y, photo.w, photo.h);

  // Knocked-out squares: flash white-hot, burn red, flicker out, then gone
  for (let k = 0; k < photo.tiles.length; k++) {
    const tile = photo.tiles[k];
    if (tile.state === 0) continue;
    const x = photo.x + (k % photo.cols) * C, y = photo.y + Math.floor(k / photo.cols) * C;
    ctx.clearRect(x, y, C, C);
    if (tile.state === 2) continue;
    const e = t - tile.dieAt;
    let a = 1, col = '#ff0a1e';
    if (e < 0.08) col = '#ff8f99';
    else if (e >= 0.33 && e < 0.63) { a = 1 - (e - 0.33) / 0.3; if (!reduceMotion && Math.random() < 0.25) a *= 0.2; }
    else if (e >= 0.63) { tile.state = 2; continue; }
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, C, C);
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // Red pixel brackets on the corners (inside the sweep clip only)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, page.p * grid.w, grid.h);
  ctx.clip();
  const b = Math.max(2, Math.round(3 * dpr)), L = b * 6, X = photo.x, Y = photo.y, W = photo.w, H = photo.h;
  ctx.fillStyle = '#ff0a1e';
  ctx.fillRect(X, Y, L, b); ctx.fillRect(X, Y, b, L);
  ctx.fillRect(X + W - L, Y, L, b); ctx.fillRect(X + W - b, Y, b, L);
  ctx.fillRect(X, Y + H - b, L, b); ctx.fillRect(X, Y + H - L, b, L);
  ctx.fillRect(X + W - L, Y + H - b, L, b); ctx.fillRect(X + W - b, Y + H - L, b, L);
  ctx.restore();
}

export function updateAbout(t) {
  const vis = page.p > 0.001;
  aboutEl.style.visibility = vis ? 'visible' : 'hidden';
  if (!vis) return;
  // The page rides the tear: it slides in behind the sweep and slides back out ahead of it,
  // always keeping the same gap to the eye, so the eye never passes behind the text
  const W = stage.clientWidth || window.innerWidth;
  aboutEl.style.transform = 'translateX(' + (page.p * W - W).toFixed(1) + 'px)';
  drawHeadings(t);
  photoGlance(t);
}

// Hovering the photo makes the eye glance at it: once per visit to the photo, with a cooldown so it never stares
const photoLook = { over: false, next: 0 };
function photoGlance(t) {
  let over = false;
  if (page.target === 'about' && !page.moving && state.hasPointer && photo.visible && photo.w) {
    const sr = stage.getBoundingClientRect(), dpr = grid.dpr;
    const x0 = sr.left + photo.x / dpr, y0 = sr.top + photo.y / dpr;
    over = state.clientX >= x0 && state.clientX <= x0 + photo.w / dpr && state.clientY >= y0 && state.clientY <= y0 + photo.h / dpr;
    if (over && !photoLook.over && t >= photoLook.next) {
      glanceAt({ x: x0 + photo.w / dpr / 2, y: y0 + photo.h / dpr / 2 }, 1.0);
      photoLook.next = t + 2;
    }
  }
  photoLook.over = over;
}

// The About page is opening: start the photo reveal and scroll back to the top
export function aboutEnter(t) {
  photoStart = t;
  aboutEl.scrollTop = 0;
}
