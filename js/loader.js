import { renderer, scene, camera, reduceMotion, clamp, nowSec } from './core.js';
import { makeScramble, drawPixelText, pixelTextWidth } from './pixel-font.js';
import { grid } from './grid/grid.js';
import { drawCursor } from './cursor.js';

// ---------- Loading screen ----------
// A dark boot screen on the grid: data squares flicker, a scan line sweeps down, a big pixel counter
// runs 000 to 100 while a boot log types out in the corner. Then a red tear rips across the middle and
// the screen splits open top and bottom like an eyelid, right as the eye's own lids open behind it.
export function runLoader(startScene) {
  const loader = document.getElementById('loader');
  const cv = document.getElementById('loaderBg');
  const g = cv.getContext('2d');
  let quick = false;
  try {
    quick = sessionStorage.getItem('breach-seen') === '1';
    sessionStorage.setItem('breach-seen', '1');
  } catch (err) { /* storage is optional */ }

  const dpr = grid.dpr;
  const W = Math.round(window.innerWidth * dpr), H = Math.round(window.innerHeight * dpr);
  cv.width = W; cv.height = H;
  const C = Math.max(6, grid.cell);
  const ox = ((grid.ox % C) + C) % C - C, oy = ((grid.oy % C) + C) % C - C;
  const cols = Math.ceil((W - ox) / C) + 1, rows = Math.ceil((H - oy) / C) + 1;
  const midY = oy + Math.round((H / 2 - oy) / C) * C;

  // Page background, painted once
  const bgCv = document.createElement('canvas');
  bgCv.width = W; bgCv.height = H;
  {
    const bg = bgCv.getContext('2d');
    const cs = getComputedStyle(document.documentElement);
    const gr = bg.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W / 2, H / 2));
    gr.addColorStop(0, cs.getPropertyValue('--bg-core').trim() || '#1f262e');
    gr.addColorStop(0.42, cs.getPropertyValue('--bg-mid').trim() || '#12161b');
    gr.addColorStop(1, cs.getPropertyValue('--bg-edge').trim() || '#090c0f');
    bg.fillStyle = gr;
    bg.fillRect(0, 0, W, H);
  }
  const frame = document.createElement('canvas');
  frame.width = W; frame.height = H;
  const f = frame.getContext('2d');

  const T = reduceMotion ? { count: 0.4, tear: 0.4, split: 0.4, end: 0.75 }
    : quick ? { count: 0.55, tear: 0.62, split: 0.8, end: 1.4 }
    : { count: 2.0, tear: 2.12, split: 2.38, end: 3.05 };
  const PHRASES = quick ? [[0, 'OPENING BREACH']] : [[0.15, 'INITIALIZING GRID'], [0.8, 'CALIBRATING OPTICS'], [1.45, 'OPENING BREACH']];
  const LOGS = quick ? [[0.05, '> BREACH READY']] : [
    [0.2, '> GRID ONLINE'], [0.55, '> OPTIC UNIT 01 FOUND'], [0.9, '> MOUNTING EARS'],
    [1.25, '> SYNCING DC CLOCK'], [1.6, '> LOADING PORTFOLIO'], [1.9, '> BREACH READY']
  ];
  let status = null, statusScr = null;
  const logScr = LOGS.map(function (l) { return makeScramble(l[1].length, l[0]); });
  // Ragged edge for the tear: each column's cut sits 0 to 2 squares off the centre line
  const jag = [];
  { let v = 1.5; for (let c = 0; c < cols; c++) { v = clamp(v + (Math.random() - 0.5) * 1.4, -1.99, 1.99); jag.push(Math.round(v)); } }
  // Flickering data squares
  let noise = [], noiseNext = 0;

  const pxBig = Math.max(4, Math.round(C * 0.62));
  const pxSmall = Math.max(1, Math.round(2 * dpr));
  const margin = Math.round(clamp(window.innerWidth * 0.03, 16, 48) * dpr);
  const easeIO = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

  function drawBoot(lt) {
    f.drawImage(bgCv, 0, 0);
    // Data squares flickering on the grid
    if (!reduceMotion && lt > noiseNext) {
      noiseNext = lt + 0.08;
      noise = [];
      for (let i = 0; i < 26; i++) {
        noise.push({ c: Math.random() * cols | 0, r: Math.random() * rows | 0, a: 0.03 + Math.random() * 0.09, red: Math.random() < 0.12 });
      }
    }
    noise.forEach(function (n) {
      f.globalAlpha = n.red ? n.a * 2.5 : n.a;
      f.fillStyle = n.red ? '#ff0a1e' : '#c9d4de';
      f.fillRect(ox + n.c * C, oy + n.r * C, C, C);
    });
    // Scan line sweeping down the grid at the start
    if (!reduceMotion && !quick && lt > 0.05 && lt < 0.8) {
      const row = Math.floor(((lt - 0.05) / 0.75) * rows);
      for (let k = 0; k < 4; k++) {
        f.globalAlpha = 0.09 * (1 - k / 4);
        f.fillStyle = '#c9d4de';
        f.fillRect(0, oy + (row - k) * C, W, C);
      }
    }
    f.globalAlpha = 1;

    // Big counter
    const prog = easeIO(clamp(lt / T.count, 0, 1));
    const value = Math.round(prog * 100);
    let str = (value < 10 ? '00' : value < 100 ? '0' : '') + value;
    const done = lt >= T.count;
    const glitchIdx = !done && !reduceMotion && Math.random() < 0.08 ? (Math.random() * 3 | 0) : -1;
    if (glitchIdx >= 0) str = str.slice(0, glitchIdx) + (Math.random() * 10 | 0) + str.slice(glitchIdx + 1);
    const cw = pixelTextWidth('000', pxBig);
    const cx = Math.round((W - cw) / 2), cy = Math.round(midY - 7 * pxBig - 3 * C);   // sits clear above the tear line
    const flashRed = done && Math.floor(lt / 0.06) % 2 === 0;
    drawPixelText(f, str, cx, cy, pxBig, function (k) { return flashRed || k === glitchIdx ? '#ff0a1e' : '#dfe6ec'; });

    // Status line under the counter, scrambling between phrases
    let phrase = null;
    for (let i = 0; i < PHRASES.length; i++) if (lt >= PHRASES[i][0]) phrase = PHRASES[i][1];
    if (phrase && phrase !== status) { status = phrase; statusScr = makeScramble(phrase.length, lt); }
    if (status) {
      const sw = pixelTextWidth(status, pxSmall);
      drawPixelText(f, status, Math.round((W - sw) / 2), midY + 3 * C, pxSmall, function () { return '#6f7b87'; }, statusScr, lt);
    }

    // Boot log in the top left
    LOGS.forEach(function (l, i) {
      if (lt < l[0]) return;
      drawPixelText(f, l[1], margin, margin + i * 11 * pxSmall, pxSmall, function (k) {
        return i === LOGS.length - 1 ? '#ff0a1e' : '#6f7b87';
      }, logScr[i], lt);
    });

    // The tear: a red ragged line ripping out from the centre to both edges
    if (lt >= T.tear) {
      const fr = clamp((lt - T.tear) / (T.split - T.tear), 0, 1);
      const reach = fr * (W / 2 + C);
      for (let c = 0; c < cols; c++) {
        const x = ox + c * C;
        if (Math.abs(x + C / 2 - W / 2) > reach) continue;
        const y = midY + jag[c] * C;
        f.fillStyle = Math.abs(Math.abs(x + C / 2 - W / 2) - reach) < C * 1.5 ? '#ff8f99' : '#ff0a1e';
        f.fillRect(x, y - C / 2, C, C);
      }
    }
  }

  function drawSplit(lt) {
    const s = clamp((lt - T.split) / (T.end - T.split), 0, 1);
    const e = s * s * (3 - 2 * s);
    const off = Math.round(e * (H / 2 + 4 * C));
    g.clearRect(0, 0, W, H);
    const TAIL = [1, 0.5, 0.22, 0.08];
    for (let c = 0; c < cols; c++) {
      const x = ox + c * C;
      const cut = midY + jag[c] * C;
      // Top half slides up, bottom half slides down
      if (cut > 0) g.drawImage(frame, x, 0, C, cut, x, -off, C, cut);
      if (cut < H) g.drawImage(frame, x, cut, C, H - cut, x, cut + off, C, H - cut);
      // Hot red edges on both lips of the tear, fading back into the halves
      for (let k = 0; k < TAIL.length; k++) {
        g.globalAlpha = TAIL[k] * (1 - e * 0.6);
        g.fillStyle = k === 0 ? '#ff8f99' : '#ff0a1e';
        g.fillRect(x, cut - off - (k + 1) * C, C, C);
        g.fillRect(x, cut + off + k * C, C, C);
      }
      g.globalAlpha = 1;
    }
  }

  let started = false, t0 = 0;
  function step(now) {
    if (!t0) t0 = now;
    const lt = (now - t0) / 1000;
    if (lt < T.split) {
      drawBoot(lt);
      g.drawImage(frame, 0, 0);
      drawCursor(nowSec());   // the custom cursor is there from the start (the scene's frame loop takes over below)
    } else {
      if (!started) { started = true; startScene(); }
      if (reduceMotion) {
        loader.classList.add('is-fading');
        setTimeout(function () { loader.remove(); }, 320);
        return;
      }
      drawSplit(lt);
    }
    if (lt < T.end) requestAnimationFrame(step);
    else loader.remove();
  }
  // Warm up the shaders first so the reveal doesn't stutter
  setTimeout(function () {
    try { renderer.compile(scene, camera); } catch (err) { /* only a warm-up */ }
    requestAnimationFrame(step);
  }, 30);
}
