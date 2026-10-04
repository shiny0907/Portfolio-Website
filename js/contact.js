// Contact page (above the hero): a status line that opens the channel, the email in big pixel type that copies
// on click, pixel-art social links, and a stream of data packets running from the parked eye up to the page
import { stage, reduceMotion, nowSec, clamp } from './core.js';
import { makeScramble, glitchRun, drawPixelText, pixelTextWidth, LABEL_COLOR } from './pixel-font.js';
import { state } from './state.js';
import { page } from './pages.js';
import { grid } from './grid/grid.js';
import { labelGeo, labelPx } from './grid/labels.js';
import { glanceAt } from './gaze.js';
import { startEyeReaction } from './reactions.js';

export const contactEl = document.getElementById('contact');
const EMAIL = 'shiningyu0907@gmail.com';
const EMAIL_PX = EMAIL.toUpperCase();   // the pixel font is capitals only; copying uses the real address
const inner = contactEl.querySelector('.contact-inner');
const emailBtn = document.getElementById('ctEmail');
const emailCv = document.getElementById('ctEmailCv'), emailCtx = emailCv.getContext('2d');
const statusCv = document.getElementById('ctStatus'), statusCtx = statusCv.getContext('2d');
const note = document.getElementById('ctNote');
const copyBtn = document.getElementById('ctCopy');
const LEVELS = Array.from({ length: 9 }, function (_, k) {
  const f = k / 8, a = [201, 212, 222];
  return 'rgb(' + a.map(function (v) { return Math.round(v + (255 - v) * f); }).join(',') + ')';
});
const STATUS_WAIT = 'ESTABLISHING LINK', STATUS_OPEN = 'CHANNEL OPEN';
const ct = {
  enterAt: -10, lastT: 0, emailPx: 4, emailScr: null, statusText: '', statusScr: null,
  over: false, hover: 0, nextGlitch: 0, copiedAt: -10, noteUntil: 0,
  packets: [], nextPacket: 0, contentBottom: 0
};

// Keep the content clear of the parked eye: its top half, the ring and the BACK label sit along the bottom
export function layoutContact() {
  const d = grid.dpr || 1;
  const reserve = (labelGeo.R + 14 * labelPx) / d + 28;
  contactEl.style.setProperty('--ct-reserve', Math.round(reserve) + 'px');
  // The address is as big as fits, up to 7 px per pixel
  const cs = getComputedStyle(inner);
  const avail = inner.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24;
  const units = pixelTextWidth(EMAIL_PX, 1) + 2;
  ct.emailPx = clamp(Math.floor(avail * d / units), 2, Math.round(7 * d));
}

// The page is opening: decode everything in, and send the first packets up the channel
export function contactEnter(t) {
  ct.enterAt = t;
  ct.emailScr = makeScramble(EMAIL_PX.length, t + 0.55);
  ct.statusText = '';
  ct.packets = [];
  for (let k = 0; k < 4; k++) ct.packets.push({ at: t + 0.7 + k * 0.12, hit: true });
  ct.nextPacket = t + 2.4;
  note.textContent = '';
  ct.noteUntil = 0;
}

// The block of content (status to note) in CSS pixels, so the cats keep out of it
export function contactContentRect() {
  if (page.q < 0.5) return null;
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  Array.prototype.forEach.call(inner.children, function (el) {
    const q = el.getBoundingClientRect();
    if (!q.width || !q.height) return;
    l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
  });
  return l < r ? { left: l, top: t, right: r, bottom: b } : null;
}

// Where the eye should look when it's idle here (CSS pixels): the address
export function contactLookPoint() {
  if (page.q < 0.5) return null;
  const r = emailBtn.getBoundingClientRect();
  return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null;
}

// ---- Copying the address ----
function copied(ok) {
  const t = nowSec();
  note.textContent = ok ? 'COPIED TO CLIPBOARD' : 'COPY BLOCKED. USE EMAIL ME INSTEAD';
  ct.noteUntil = t + 2.6;
  if (!ok) return;
  ct.copiedAt = t;
  // The address re-decodes in a fast wave, a burst of packets runs up, and the eye is pleased
  if (!reduceMotion) ct.emailScr.forEach(function (c, i) { c.start = Math.min(c.start, t); c.end = t + 0.06 + i * 0.012; });
  for (let k = 0; k < 5; k++) ct.packets.push({ at: t + k * 0.08, hit: false });
  startEyeReaction('happy', t);
}
function copyEmail() {
  const fallback = function () {
    try {
      const ta = document.createElement('textarea');
      ta.value = EMAIL;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      copied(ok);
    } catch (err) { copied(false); }
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(EMAIL).then(function () { copied(true); }, fallback);
  else fallback();
}
emailBtn.addEventListener('click', copyEmail);
copyBtn.addEventListener('click', copyEmail);

// ---- Social links: pixel-art icons that brighten with a red glitch shadow on hover ----
const ICONS = {
  linkedin: ['.#########.', '###########', '##.########', '###########', '##.##...###', '##.##.##.##',
    '##.##.##.##', '##.##.##.##', '##.##.##.##', '###########', '.#########.'],
  instagram: ['.#########.', '#.........#', '#.......#.#', '#...###...#', '#..#...#..#', '#..#...#..#',
    '#..#...#..#', '#...###...#', '#.........#', '#.........#', '.#########.'],
  tiktok: ['......#....', '......##...', '......#.##.', '......#..##', '......#....', '......#....',
    '...####....', '..#####....', '..#####....', '...###.....', '...........']
};
const socials = Array.prototype.map.call(document.querySelectorAll('.ct-social'), function (a) {
  const s = { el: a, cv: a.querySelector('canvas'), rows: ICONS[a.dataset.icon], over: false, hover: 0, jit: 0 };
  const on = function () { if (!s.over && page.target === 'contact' && !page.moving) { const r = a.getBoundingClientRect(); glanceAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 0.5); } s.over = true; };
  const off = function () { s.over = false; };
  a.addEventListener('pointerenter', on); a.addEventListener('pointerleave', off);
  a.addEventListener('focus', on); a.addEventListener('blur', off);
  return s;
});
function drawSocial(s, t, dt) {
  const d = grid.dpr || 1, px = Math.max(2, Math.round(3 * d)), n = s.rows.length;
  fitCanvas(s.cv, (n + 2) * px, n * px);
  s.hover += ((s.over ? 1 : 0) - s.hover) * Math.min(1, dt * (s.over ? 12 : 6));
  const g = s.cv.getContext('2d');
  g.clearRect(0, 0, s.cv.width, s.cv.height);
  const paint = function (ox, col) {
    g.fillStyle = col;
    s.rows.forEach(function (row, y) { for (let x = 0; x < row.length; x++) if (row[x] === '#') g.fillRect(ox + x * px, y * px, px, px); });
  };
  // A red copy one pixel to the side, like the labels' glitch shadow, and the odd sideways jump while hovered
  if (s.over && !reduceMotion && Math.random() < 0.06) s.jit = t + 0.06;
  const jump = t < s.jit ? px : 0;
  if (s.hover > 0.05) { g.globalAlpha = 0.85 * s.hover; paint(0, '#ff0a1e'); g.globalAlpha = 1; }
  paint((s.hover > 0.05 ? px : 0) + jump, LEVELS[Math.round(s.hover * 8)]);   // hovered, the icon steps off its shadow
}

// ---- Drawing ----
function fitCanvas(cv, W, H) {
  const d = grid.dpr || 1;
  if (cv.width !== W || cv.height !== H) {
    cv.width = W; cv.height = H;
    cv.style.width = (W / d) + 'px'; cv.style.height = (H / d) + 'px';
  }
}
// Status: a red square that blinks while the link is being made, then holds steady once the channel is open
function drawStatus(t) {
  const px = Math.max(2, Math.round(2 * grid.dpr));
  const text = t - ct.enterAt < 1.7 ? STATUS_WAIT : STATUS_OPEN;
  if (text !== ct.statusText) { ct.statusText = text; ct.statusScr = makeScramble(text.length, Math.max(t, ct.enterAt + 0.35)); }
  const W = 9 * px + pixelTextWidth(STATUS_WAIT, px), H = 7 * px;
  fitCanvas(statusCv, W, H);
  const g = statusCtx;
  g.clearRect(0, 0, W, H);
  const live = text === STATUS_OPEN;
  if (t > ct.enterAt + 0.35 && (live || reduceMotion || Math.floor(t * 4) % 2 === 0)) {
    g.fillStyle = '#ff0a1e';
    g.fillRect(px, px, 5 * px, 5 * px);
  }
  // Centre the shorter text under the same width so the square doesn't jump
  const tx = 9 * px + (pixelTextWidth(STATUS_WAIT, px) - pixelTextWidth(text, px)) / 2;
  drawPixelText(g, text, Math.round(tx), 0, px, function () { return LABEL_COLOR; }, ct.statusScr, t);
}
// The address: hover brightens it, adds the red glitch shadow and the odd scramble; a copy flashes it red
function drawEmail(t) {
  if (!ct.emailScr) return;
  const px = ct.emailPx;
  const W = pixelTextWidth(EMAIL_PX, px) + 2 * px, H = 9 * px;
  fitCanvas(emailCv, W, H);
  const g = emailCtx;
  g.clearRect(0, 0, W, H);
  if (ct.over && !reduceMotion && t > ct.nextGlitch) {
    glitchRun(ct.emailScr, t, 0, EMAIL_PX.length);
    ct.nextGlitch = t + 0.5 + Math.random() * 0.8;
  }
  const hv = ct.hover;
  if (hv > 0.05) {
    const jit = ct.over && !reduceMotion && Math.random() < 0.08 ? (Math.random() < 0.5 ? -px : px) : 0;
    g.globalAlpha = 0.8 * hv;
    drawPixelText(g, EMAIL_PX, px + jit, px, px, function () { return '#ff0a1e'; }, ct.emailScr, t);
    g.globalAlpha = 1;
  }
  const flash = t - ct.copiedAt < 0.18;
  const col = flash ? '#ff0a1e' : LEVELS[Math.round(hv * 8)];
  drawPixelText(g, EMAIL_PX, 0, 0, px, function () { return col; }, ct.emailScr, t);
}

export function updateContact(t) {
  const dt = Math.max(0, Math.min(0.1, t - ct.lastT));
  ct.lastT = t;
  const vis = page.q > 0.001;
  contactEl.style.visibility = vis ? 'visible' : 'hidden';
  if (!vis) { ct.over = false; ct.hover = 0; return; }
  // Rides the tear down from above, the same way About and Portfolio slide in from the sides
  const H = stage.clientHeight || window.innerHeight;
  contactEl.style.transform = 'translateY(' + (page.q * H - H).toFixed(1) + 'px)';
  // Hovering the address: the eye glances up at it as the cursor arrives
  const r = emailBtn.getBoundingClientRect();
  const over = page.target === 'contact' && !page.moving && state.hasPointer && !state.firing &&
    state.clientX >= r.left && state.clientX <= r.right && state.clientY >= r.top && state.clientY <= r.bottom;
  if (over && !ct.over) glanceAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 0.6);
  ct.over = over;
  ct.hover += ((over ? 1 : 0) - ct.hover) * Math.min(1, dt * (over ? 10 : 6));
  if (ct.noteUntil && t > ct.noteUntil) { note.textContent = ''; ct.noteUntil = 0; }
  const last = inner.lastElementChild.getBoundingClientRect();
  ct.contentBottom = last.bottom;
  drawStatus(t);
  drawEmail(t);
  socials.forEach(function (s) { drawSocial(s, t, dt); });
}

// On the grid layer (behind the eye): a channel of squares from the parked eye up to the page, with packets
// of red squares running up it. They come every so often, faster while you hover the address, in a burst on copy.
export function drawContactBeam(ctx, t) {
  if (page.target !== 'contact' || page.q < 0.98 || reduceMotion) return;
  const C = grid.cell, d = grid.dpr;
  const sr = stage.getBoundingClientRect();
  const i = Math.floor((labelGeo.cx - grid.ox) / C);
  const topDev = (ct.contentBottom - sr.top) * d;
  const botDev = labelGeo.cy - labelGeo.R - 14 * labelPx;
  const j0 = Math.ceil((topDev - grid.oy) / C) + 1, j1 = Math.floor((botDev - grid.oy) / C) - 1;
  if (j1 - j0 < 3) return;
  if (t >= ct.nextPacket) { ct.packets.push({ at: t, hit: false }); ct.nextPacket = t + (ct.over ? 0.3 : 1.6); }
  const speed = 26;   // squares per second
  // The channel itself: a faint dotted column
  ctx.fillStyle = '#ff0a1e';
  ctx.globalAlpha = 0.12;
  for (let j = j0; j <= j1; j += 2) ctx.fillRect(grid.ox + i * C, grid.oy + j * C, C, C);
  const keep = [];
  ct.packets.forEach(function (p) {
    if (t < p.at) { keep.push(p); return; }
    const head = Math.round(j1 - (t - p.at) * speed);
    if (head < j0 - 3) {
      // A packet from the link sequence lands: a couple of letters of the address flicker
      if (p.hit && ct.emailScr && !reduceMotion) glitchRun(ct.emailScr, t, 0, EMAIL_PX.length);
      return;
    }
    keep.push(p);
    for (let k = 0; k < 3; k++) {
      const j = head + k;
      if (j < j0 || j > j1) continue;
      ctx.globalAlpha = [0.95, 0.5, 0.22][k];
      ctx.fillStyle = k === 0 ? '#ff8f99' : '#ff0a1e';
      ctx.fillRect(grid.ox + i * C, grid.oy + j * C, C, C);
    }
  });
  ct.packets = keep;
  ctx.globalAlpha = 1;
}
