(function () {
  'use strict';

  const stage = document.getElementById('stage');
  const hint = document.getElementById('hint');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  hint.textContent = noHover ? 'Drag to look around. Hold to fire.' : 'Move your cursor. Hold the mouse button to fire.';

  function fail() {
    hint.remove();
    const ld = document.getElementById('loader');
    if (ld) ld.remove();
    stage.innerHTML = '<div class="fallback"><p>This eye needs WebGL to render. Open the page in a recent version of Chrome, Safari, Firefox, or Edge.</p></div>';
  }
  if (!window.THREE) { fail(); return; }

  // ---------- Renderer, scene, camera ----------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { fail(); return; }
  if (!renderer.getContext()) { fail(); return; }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  const TAU = Math.PI * 2;
  const srgb = (hex) => new THREE.Color(hex).convertSRGBToLinear();
  const hdr = (hex, k) => srgb(hex).multiplyScalar(k);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

  // ---------- The grid universe behind everything ----------
  // An invisible lattice of perfect squares. Where the laser hits, squares burn solid red,
  // the breach spreads a little, holds briefly, then heals square by square.
  const gridCanvas = document.createElement('canvas');
  gridCanvas.className = 'grid';
  gridCanvas.setAttribute('aria-hidden', 'true');
  stage.insertBefore(gridCanvas, renderer.domElement);
  gridCanvas.style.zIndex = '0';
  renderer.domElement.style.zIndex = '2';
  const gctx = gridCanvas.getContext('2d');
  const grid = { dpr: 1, w: 0, h: 0, cell: 24, ox: 0, oy: 0, cells: new Map(), dirty: true, lastX: null, lastY: null, nameShift: 0 };
  const GRID_MAX = 40000;
  const GRID_HOLD = 1.5, GRID_FADE = 1.0;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const KEY = (i, j) => (i + 5000) * 10000 + (j + 5000);

  // Pixel typeface: every pixel of a letter is one square of the grid
  const FONT = {
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
    N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
    G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    // Digits are all five wide, so the clock never shifts as the time changes
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    ':': ['.', '.', '#', '.', '#', '.', '.'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
    '>': ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
    '.': ['.', '.', '.', '.', '.', '.', '#'],
    '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....']
  };

  // ---- Text scramble for the pixel font ----
  // Glitch glyphs are grouped by width so a scrambling letter never changes the text's width.
  const GLITCH_EXTRA = [
    ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
    ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
    ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
    ['...#.', '..#..', '.#...', '#....', '.#...', '..#..', '...#.'],
    ['.#...', '..#..', '...#.', '....#', '...#.', '..#..', '.#...'],
    ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
    ['.#.', '.#.', '.#.', '.#.', '.#.', '...', '.#.'],
    ['...', '.#.', '.#.', '###', '.#.', '.#.', '...'],
    ['...', '...', '###', '...', '###', '...', '...'],
    ['#.#', '.#.', '#.#', '.#.', '#.#', '.#.', '#.#']
  ];
  const GLITCH_POOL = {};
  Object.keys(FONT).concat(GLITCH_EXTRA.map(function (_, i) { return '~' + i; })).forEach(function (key) {
    const rows = key[0] === '~' && key.length > 1 ? GLITCH_EXTRA[+key.slice(1)] : FONT[key];
    const wdt = rows[0].length;
    if (wdt < 3) return;
    (GLITCH_POOL[wdt] = GLITCH_POOL[wdt] || []).push(rows);
  });
  // Per-character scramble state: hidden before `start`, glitching until `end`, then final
  function makeScramble(len, appear) {
    const out = [];
    for (let i = 0; i < len; i++) {
      const start = reduceMotion ? 0 : appear + Math.random() * 0.35;
      out.push({ start: start, end: reduceMotion ? 0 : start + 0.2 + Math.random() * 0.5, glyph: null, next: 0 });
    }
    return out;
  }
  // Returns 'hidden', a glitch glyph, or null (show the real character)
  function scrambleState(c, t, wdt) {
    if (t < c.start) return 'hidden';
    if (t >= c.end) return null;
    const pool = GLITCH_POOL[wdt];
    if (!pool) return null;
    if (!c.glyph || t >= c.next || c.glyph[0].length !== wdt) {
      c.glyph = pool[Math.random() * pool.length | 0];
      c.next = t + 0.04 + Math.random() * 0.05;
    }
    return c.glyph;
  }
  // Re-scramble a short run of characters starting now
  function glitchRun(arr, t, from, to) {
    const len = 2 + (Math.random() * 4 | 0);
    const first = from + (Math.random() * Math.max(1, to - from - len + 1) | 0);
    for (let i = first; i < Math.min(to, first + len); i++) {
      arr[i].start = Math.min(arr[i].start, t + (i - first) * 0.03);
      arr[i].end = t + 0.25 + Math.random() * 0.35;
    }
  }

  // Draw a string in the pixel font. colorAt(index) picks each character's colour; scr is optional scramble state.
  function drawPixelText(ctx, str, x, y, px, colorAt, scr, t) {
    let cx = x;
    for (let k = 0; k < str.length; k++) {
      const rows = FONT[str[k]];
      if (!rows) { cx += 3 * px; continue; }
      const wdt = rows[0].length;
      let draw = rows, col = colorAt(k);
      if (scr) {
        const st = scrambleState(scr[k], t, wdt);
        if (st === 'hidden') { cx += (wdt + 1) * px; continue; }
        if (st) { draw = st; col = '#ff0a1e'; }
      }
      ctx.fillStyle = col;
      for (let ry = 0; ry < draw.length; ry++) {
        for (let rx = 0; rx < draw[ry].length; rx++) {
          if (draw[ry][rx] === '#') ctx.fillRect(cx + rx * px, y + ry * px, px, px);
        }
      }
      cx += (wdt + 1) * px;
    }
  }
  function pixelTextWidth(str, px) {
    let wdt = 0;
    for (let k = 0; k < str.length; k++) {
      const rows = FONT[str[k]];
      wdt += rows ? (rows[0].length + 1) * px : 3 * px;
    }
    return wdt - px;
  }
  const CLOCK_APPEAR = reduceMotion ? 0 : 1.1;
  const CORNER_LEFT = 'UI/UX DESIGNER';
  const CLOCK_PLACE = 'WASHINGTON DC';
  const scrLeft = makeScramble(CORNER_LEFT.length, CLOCK_APPEAR);
  const scrRight = makeScramble(CLOCK_PLACE.length + 2 + 8, CLOCK_APPEAR);
  let textGlitchNext = 4;
  // Washington DC time (Eastern), whatever the visitor's own time zone is
  let dcClock = null;
  try {
    dcClock = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
  } catch (err) { dcClock = null; }
  function dcTime() {
    const pad = (n) => (n < 10 ? '0' : '') + n;
    if (dcClock) {
      const parts = {};
      dcClock.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      const hh = parts.hour === '24' ? '00' : parts.hour;
      return hh + ':' + parts.minute + ':' + parts.second;
    }
    const now = new Date();
    return pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  }

  // Side labels: stacked pixel letters that ride along the outer gray curves as they turn. They can't be destroyed.
  const SIDE_LABELS = [
    { text: 'ABOUT ME', side: -1, h: 0, hovered: false },
    { text: 'PORTFOLIO', side: 1, h: 0, hovered: false }
  ];
  const LABEL_COLOR = '#c9d4de';
  const LABEL_LEVELS = Array.from({ length: 9 }, function (_, k) {
    const f = k / 8, a = [201, 212, 222];
    return 'rgb(' + a.map(function (v) { return Math.round(v + (255 - v) * f); }).join(',') + ')';
  });
  let hoveredLabel = null, pressedLabel = null;
  const LABEL_RADIUS = 2.27;   // world units, the gray bracket arcs
  const LABEL_Z = -1.2;        // same depth as the rings
  const labelGlyphs = [];      // { rows, x, y } in device pixels, plus appear timing
  let labelPx = 3;
  const labelGeo = { cx: 0, cy: 0, cx0: 0, cy0: 0, ppu: 1, R: 0, k: 0, angQ: null, dirty: true };
  function pushLabelGlyphs(lab, startAt, spread) {
    for (let k = 0; k < lab.text.length; k++) {
      const ch = lab.text[k];
      const sc = makeScramble(1, 0)[0];
      sc.start = reduceMotion ? 0 : startAt + (spread ? k * 0.035 : Math.random() * 0.6);
      sc.end = reduceMotion ? 0 : sc.start + 0.2 + Math.random() * 0.3;
      labelGlyphs.push({
        label: lab, index: k, ch: ch, rows: ch === ' ' ? null : FONT[ch],
        x: 0, y: 0, along: 0, w: 0, a: 0, dirX: 1, dirY: 0, appearAt: 0, scr: sc
      });
    }
  }
  SIDE_LABELS.forEach(function (lab) { pushLabelGlyphs(lab, 0.7, false); });
  // Swap a label's word (ABOUT ME <-> BACK), decoding the new word in
  function setLabelText(lab, text, startAt) {
    for (let k = labelGlyphs.length - 1; k >= 0; k--) if (labelGlyphs[k].label === lab) labelGlyphs.splice(k, 1);
    lab.text = text;
    pushLabelGlyphs(lab, startAt, true);
    layoutLabels();
  }
  const NAME_TEXT = 'SHINING YU';
  const NAME_ROWS = 7, LETTER_GAP = 1, WORD_GAP = 3;
  // The name is dim, like it's set into the grid; squares near where the eye is looking light up
  const NAME_DIM = [201, 212, 222], NAME_LIT = [255, 255, 255];   // resting colour matches the corner text (#c9d4de)
  const NAME_LEVELS = Array.from({ length: 9 }, function (_, k) {
    const f = k / 8;
    return 'rgb(' + NAME_DIM.map(function (v, i) { return Math.round(v + (NAME_LIT[i] - v) * f); }).join(',') + ')';
  });
  // Lay the glyphs out once, in name-local square coordinates
  const nameBlocks = [];
  const NAME_COLS = (function () {
    let x = 0;
    for (let c = 0; c < NAME_TEXT.length; c++) {
      const ch = NAME_TEXT[c];
      if (ch === ' ') { x += WORD_GAP; continue; }
      const rows = FONT[ch];
      const wdt = rows[0].length;
      for (let gy = 0; gy < NAME_ROWS; gy++) {
        for (let gx = 0; gx < wdt; gx++) {
          if (rows[gy][gx] !== '#') continue;
          nameBlocks.push({
            gx: x + gx, gy: gy, i: 0, j: 0,
            state: 0,                 // 0 alive, 1 being destroyed, 2 gone
            appearAt: reduceMotion ? 0 : 0.35 + Math.random() * 1.1,   // assembles as the eye boots
            dieAt: 0, glitchUntil: 0
          });
        }
      }
      x += wdt;
      if (c < NAME_TEXT.length - 1 && NAME_TEXT[c + 1] !== ' ') x += LETTER_GAP;
    }
    return x;
  })();
  const nameMap = new Map();
  let nameGlitchNext = 6;

  function resizeGrid(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    grid.dpr = dpr;
    grid.w = Math.round(w * dpr);
    grid.h = Math.round(h * dpr);
    gridCanvas.width = grid.w;
    gridCanvas.height = grid.h;
    // Square size is set by the name: 60% of the width on desktop, most of it on phones
    const share = w < 700 ? 0.9 : 0.6;
    grid.cell = Math.max(4, Math.floor(grid.w * share / NAME_COLS));
    const C = grid.cell;
    // Square (0, 0) sits exactly on the centre of the screen. Indices are relative to it,
    // so burned squares keep their place when the window is resized.
    grid.ox = Math.round(grid.w / 2 - C / 2);
    grid.oy = Math.round(grid.h / 2 - C / 2);
    grid.dirty = true;
  }

  const _lp = new THREE.Vector3();
  function projectToGrid(x, y, z) {
    _lp.set(x, y, z).project(camera);
    return [(_lp.x + 1) / 2 * grid.w, (1 - _lp.y) / 2 * grid.h];
  }
  // Name sits low, with its top tucked under the lower edge of the clock rings
  function placeName() {
    const C = grid.cell;
    const ringBottom = projectToGrid(0, -2.12, LABEL_Z)[1];
    const fromRing = Math.floor((ringBottom - grid.oy) / C) - 2;
    const lastAllowed = Math.floor((grid.h - 44 * grid.dpr - grid.oy) / C) - 1;
    const topRow = Math.min(fromRing, lastAllowed - (NAME_ROWS - 1));
    const firstCol = -Math.floor(NAME_COLS / 2);
    nameMap.clear();
    nameBlocks.forEach(function (b) {
      b.i = firstCol + b.gx;
      b.j = topRow + b.gy;
      nameMap.set(KEY(b.i, b.j), b);
    });
    hint.style.bottom = '14px';
  }

  function layoutLabels() {
    camera.updateMatrixWorld();
    placeName();
    const c = projectToGrid(0, 0, LABEL_Z);
    const e = projectToGrid(LABEL_RADIUS, 0, LABEL_Z);
    labelGeo.cx0 = c[0];
    labelGeo.cy0 = c[1];
    labelGeo.R = Math.abs(e[0] - c[0]);
    labelGeo.ppu = labelGeo.R / LABEL_RADIUS;   // device pixels per world unit at the rings' depth
    labelGeo.cx = labelGeo.cx0;   // placeLabels() follows the eye from here
    labelGeo.cy = labelGeo.cy0;
    labelPx = Math.max(2, Math.round(labelGeo.R / 100));
    const glyphH = 7 * labelPx;
    const step = glyphH + labelPx * 2;   // spacing between stacked letters, measured along the curve
    SIDE_LABELS.forEach(function (lab) {
      const items = labelGlyphs.filter(function (g) { return g.label === lab; });
      const lens = items.map(function (g) { return g.rows ? step : step * 0.5; }); // spaces take half a step
      const total = lens.reduce(function (a, b) { return a + b; }, 0) - step;
      let along = -total / 2;
      items.forEach(function (g, k) {
        if (k > 0) along += (lens[k - 1] + lens[k]) / 2;
        g.along = along;
        g.w = (g.rows ? g.rows[0].length : 3) * labelPx;
      });
    });
    labelGeo.dirty = true;
  }

  // Position every label letter on its curve for the current bracket angle
  function placeLabels(t) {
    // The labels' ring travels with the eye
    const ncx = labelGeo.cx0 + state.rigX * labelGeo.ppu * (camBase.z - LABEL_Z) / camBase.z;
    if (Math.abs(ncx - labelGeo.cx) > 0.25) { labelGeo.cx = ncx; labelGeo.dirty = true; }
    // PORTFOLIO takes whichever bracket is on the right half, ABOUT ME the left.
    // A little hysteresis stops them flipping back and forth when the arcs point straight up or down.
    let ang = state.bracketRot + labelGeo.k * Math.PI;
    const norm = Math.atan2(Math.sin(ang), Math.cos(ang));
    if (Math.abs(norm) > Math.PI / 2 + 0.15) {
      labelGeo.k += 1;
      ang += Math.PI;
      labelGeo.angQ = null;
      // Swapping arcs: both words scramble back in
      labelGlyphs.forEach(function (g) { g.scr.start = Math.min(g.scr.start, t); g.scr.end = t + 0.15 + Math.random() * 0.3; });
    }
    // Move only in whole steps of about 0.7 degrees, all letters together. Rounding each letter to
    // whole pixels every frame made them twitch against each other; stepping keeps the word rigid.
    const STEP = 0.012;
    if (labelGeo.angQ === null || Math.abs(ang - labelGeo.angQ) > STEP * 0.75) {
      labelGeo.angQ = Math.round(ang / STEP) * STEP;
      labelGeo.dirty = true;
    }
    if (!labelGeo.dirty) return;
    labelGeo.dirty = false;
    ang = labelGeo.angQ;
    const R = labelGeo.R, lp = labelPx, glyphH = 7 * lp;
    for (let k = 0; k < labelGlyphs.length; k++) {
      const g = labelGlyphs[k];
      // Right side reads top to bottom with the angle decreasing; the left side mirrors it
      const a = g.label.side > 0 ? ang - g.along / R : ang + Math.PI + g.along / R;
      // Just outside the curve: clear the letter's box in whatever direction the curve faces
      const r = R + lp * 3 + 0.5 * (Math.abs(Math.cos(a)) * g.w + Math.abs(Math.sin(a)) * glyphH);
      g.x = Math.round(labelGeo.cx + r * Math.cos(a) - g.w / 2);
      g.y = Math.round(labelGeo.cy - r * Math.sin(a) - glyphH / 2);
      g.a = a;
      g.dirX = Math.cos(a);
      g.dirY = -Math.sin(a);
    }
  }

  function igniteCell(i, j, t, gen) {
    const key = KEY(i, j);
    // A direct laser hit destroys a square of the name for good; spreading cracks can't touch it
    const nb = nameMap.get(KEY(i - grid.nameShift, j));
    if (nb && nb.state !== 2) {
      if (gen === 0 && nb.state === 0 && t >= nb.appearAt) { nb.state = 1; nb.dieAt = t; }
      return;
    }
    const c = grid.cells.get(key);
    if (c) {
      if (gen === 0) { c.gen = 0; c.lastHit = t; c.heat = 1; }
      return;
    }
    if (grid.cells.size >= GRID_MAX) return;
    grid.cells.set(key, { i: i, j: j, born: t, gen: gen, lastHit: t, heat: 1, delay: Math.random() * 0.8 });
    grid.dirty = true;
  }

  function igniteAt(px, py, t) {
    photoHit(px, py, t);
    const fx = (px - grid.ox) / grid.cell, fy = (py - grid.oy) / grid.cell;
    const ci = Math.floor(fx), cj = Math.floor(fy);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (Math.hypot(ci + di + 0.5 - fx, cj + dj + 0.5 - fy) < 0.95) igniteCell(ci + di, cj + dj, t, 0);
      }
    }
  }

  // Burn along the path between frames so fast sweeps leave a continuous trail
  function igniteTrail(px, py, t) {
    if (grid.lastX === null) {
      igniteAt(px, py, t);
    } else {
      const d = Math.hypot(px - grid.lastX, py - grid.lastY);
      const steps = Math.min(60, Math.max(1, Math.ceil(d / (grid.cell * 0.5))));
      for (let s = 1; s <= steps; s++) {
        igniteAt(lerp(grid.lastX, px, s / steps), lerp(grid.lastY, py, s / steps), t);
      }
    }
    grid.lastX = px;
    grid.lastY = py;
    if (!reduceMotion && Math.random() < 0.12) {
      const a = Math.random() * TAU, r = (1.2 + Math.random() * 1.2) * grid.cell;
      igniteCell(Math.floor((px + Math.cos(a) * r - grid.ox) / grid.cell), Math.floor((py + Math.sin(a) * r - grid.oy) / grid.cell), t, 1);
    }
  }


  function updateGrid(t, dt) {
    const ctx = gctx, C = grid.cell;

    // Spread for a moment after burning, then hold, then fade out
    const spawn = [];
    grid.cells.forEach(function (c, key) {
      if (!reduceMotion && c.gen < 3 && t - c.born < 0.6 && Math.random() < dt * 1.6) {
        const d = DIRS[Math.random() * 4 | 0];
        spawn.push(c.i + d[0], c.j + d[1], c.gen + 1);
      }
      if (t - c.lastHit > GRID_HOLD + c.delay) {
        c.heat -= dt / GRID_FADE;
        if (c.heat <= 0) grid.cells.delete(key);
      }
    });
    for (let k = 0; k < spawn.length; k += 3) igniteCell(spawn[k], spawn[k + 1], t, spawn[k + 2]);

    // Rare glitch: one square of the name flickers red
    if (state.booted && !reduceMotion && t > nameGlitchNext) {
      const alive = nameBlocks.filter(function (b) { return b.state === 0; });
      if (alive.length) alive[Math.random() * alive.length | 0].glitchUntil = t + 0.15;
      nameGlitchNext = t + 5 + Math.random() * 4;
    }

    ctx.clearRect(0, 0, grid.w, grid.h);

    // The name (slides off to the right in whole squares when the About page opens)
    const scanR = C * 7;
    grid.nameShift = Math.round(page.p * (grid.w / C + NAME_COLS / 2 + 2));
    const ns = grid.nameShift;
    for (let k = 0; k < nameBlocks.length; k++) {
      const b = nameBlocks[k];
      if (b.state === 2 || t < b.appearAt) continue;
      if (grid.ox + (b.i + ns) * C > grid.w || grid.ox + (b.i + ns + 1) * C < 0) continue;
      let a = 1, col, lit = 0;
      {
        const dx = grid.ox + (b.i + ns + 0.5) * C - state.gazeX, dy = grid.oy + (b.j + 0.5) * C - state.gazeY;
        const f = Math.max(0, 1 - Math.hypot(dx, dy) / scanR);
        lit = Math.round(Math.pow(f, 1.2) * 8);
        col = NAME_LEVELS[lit];
      }
      if (b.state === 1) {
        const e = t - b.dieAt;
        if (e < 0.08) col = '#ff8f99';
        else if (e < 0.33) col = '#ff0a1e';
        else if (e < 0.63) {
          col = '#ff0a1e';
          a = 1 - (e - 0.33) / 0.3;
          if (!reduceMotion && Math.random() < 0.25) a *= 0.2;
        } else { b.state = 2; continue; }
      } else if (t - b.appearAt < 0.12 || t < b.glitchUntil) {
        col = '#ff0a1e';
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = col;
      // The brightest squares get a soft white glow
      if (lit >= 5 && b.state === 0) {
        ctx.shadowColor = 'rgba(255,255,255,' + ((lit - 4) * 0.15).toFixed(2) + ')';
        ctx.shadowBlur = C * 0.9;
      }
      ctx.fillRect(grid.ox + (b.i + ns) * C, grid.oy + b.j * C, C, C);
      ctx.shadowBlur = 0;
    }

    // Your photo (About page), on the grid layer so the laser can knock squares out of it
    drawPhotoOnGrid(ctx, t);

    // Page transition: a jagged wall of squares sweeps across like a tear in the grid,
    // with a hot leading edge and a short tail that fades out behind it. No scattered burns.
    // After the move ends the tear keeps sliding off the edge while it breaks apart, instead of vanishing
    const tearFade = page.moving ? 0 : (page.endAt ? (t - page.endAt) / 0.45 : 1);
    if (page.moving || tearFade < 1) {
      const dir = page.to > page.from ? 1 : -1;
      const pfSide = page.to === -1 || page.from === -1;
      const ci = Math.floor(((pfSide ? 1 + page.p : page.p) * grid.w - grid.ox) / C);
      const rows0 = Math.floor(-grid.oy / C), rows1 = Math.ceil((grid.h - grid.oy) / C);
      const TAIL = [1, 0.55, 0.3, 0.15, 0.06];
      const exit = Math.round(tearFade * 7);          // squares travelled past the edge
      for (let j = rows0; j <= rows1; j++) {
        const lead = ci + dir * (page.jag[(j % 64 + 64) % 64] + exit);
        for (let k = TAIL.length - 1; k >= 0; k--) {
          if (tearFade > 0 && !reduceMotion && Math.random() < tearFade * 0.85) continue;   // dissolving
          ctx.globalAlpha = TAIL[k] * (1 - tearFade);
          ctx.fillStyle = k === 0 ? '#ff8f99' : '#ff0a1e';
          ctx.fillRect(grid.ox + (lead - dir * k) * C, grid.oy + j * C, C, C);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Burning squares
    grid.cells.forEach(function (c) {
      let a = Math.min(1, c.heat);
      if (a < 1 && !reduceMotion && Math.random() < 0.1) a *= 0.25; // glitch flicker while healing
      ctx.globalAlpha = a;
      ctx.fillStyle = t - c.born < 0.12 ? '#ff8f99' : '#ff0a1e';
      ctx.fillRect(grid.ox + c.i * C, grid.oy + c.j * C, C, C);
    });
    ctx.globalAlpha = 1;

    // Side labels, in front of the burns
    placeLabels(t);
    ctx.globalAlpha = 1;
    const lp = labelPx;

    // Hover: which label (if any) is under the cursor
    const mx = (state.mouse.x + 1) / 2 * grid.w, my = (1 - state.mouse.y) / 2 * grid.h;
    hoveredLabel = null;
    SIDE_LABELS.forEach(function (lab) {
      let over = false;
      if (state.hasPointer && state.booted && !state.firing) {
        const pad = lp * 3;
        for (let k = 0; k < labelGlyphs.length && !over; k++) {
          const g = labelGlyphs[k];
          if (g.label !== lab || !g.rows) continue;
          if (mx > g.x - pad && mx < g.x + g.w + pad && my > g.y - pad && my < g.y + 7 * lp + pad) over = true;
        }
      }
      if (over && !lab.hovered && !reduceMotion) {
        // Hover in: the word re-decodes in a quick wave from first letter to last
        labelGlyphs.forEach(function (g) {
          if (g.label !== lab) return;
          g.scr.start = Math.min(g.scr.start, t + g.index * 0.03);
          g.scr.end = t + g.index * 0.03 + 0.12;
        });
      }
      lab.hovered = over;
      if (over) hoveredLabel = lab;
      lab.h += ((over ? 1 : 0) - lab.h) * Math.min(1, dt * (over ? 10 : 6));
      if (lab.h < 0.002) lab.h = 0;
    });
    renderer.domElement.style.cursor = (hoveredLabel || state.overEar || state.overEye) ? 'pointer' : '';

    // Selection rail: a dotted red arc that draws itself along the hovered word
    SIDE_LABELS.forEach(function (lab) {
      if (lab.h <= 0.01) return;
      const gs = labelGlyphs.filter(function (g) { return g.label === lab && g.rows; });
      const a0 = gs[0].a, a1 = gs[gs.length - 1].a;
      const rr = labelGeo.R + lp * 1.5;
      const n = Math.max(2, Math.floor(Math.abs(a1 - a0) * rr / (lp * 3)));
      const shown = Math.floor((n + 1) * Math.min(1, lab.h * 1.3));
      ctx.globalAlpha = Math.min(1, lab.h * 1.5);
      ctx.fillStyle = '#ff0a1e';
      for (let i = 0; i < shown; i++) {
        const a = lerp(a0, a1, i / n);
        ctx.fillRect(Math.round(labelGeo.cx + rr * Math.cos(a) - lp / 2), Math.round(labelGeo.cy - rr * Math.sin(a) - lp / 2), lp, lp);
      }
      ctx.globalAlpha = 1;
    });

    for (let k = 0; k < labelGlyphs.length; k++) {
      const g = labelGlyphs[k];
      if (!g.rows) continue;
      const st = scrambleState(g.scr, t, g.rows[0].length);
      if (st === 'hidden') continue;
      const draw = st || g.rows;
      // Hover pushes letters outward in a staggered wave, brightens them, and adds a red glitch shadow
      const lab = g.label;
      const local = clamp(lab.h * 1.6 - (g.index / lab.text.length) * 0.6, 0, 1);
      const e = local * local * (3 - 2 * local);
      const off = e * lp * 2.5;
      const gx = g.x + Math.round(g.dirX * off), gy = g.y + Math.round(g.dirY * off);
      if (e > 0.05) {
        const jit = lab.hovered && !reduceMotion && Math.random() < 0.08 ? (Math.random() < 0.5 ? -lp : lp) : 0;
        const sx = gx + Math.round(g.dirX * lp) + jit, sy = gy + Math.round(g.dirY * lp);
        ctx.globalAlpha = 0.8 * e;
        ctx.fillStyle = '#ff0a1e';
        for (let ry = 0; ry < draw.length; ry++) {
          const row = draw[ry];
          for (let rx = 0; rx < row.length; rx++) {
            if (row[rx] === '#') ctx.fillRect(sx + rx * lp, sy + ry * lp, lp, lp);
          }
        }
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = st ? '#ff0a1e' : LABEL_LEVELS[Math.round(e * 8)];
      for (let ry = 0; ry < draw.length; ry++) {
        const row = draw[ry];
        for (let rx = 0; rx < row.length; rx++) {
          if (row[rx] === '#') ctx.fillRect(gx + rx * lp, gy + ry * lp, lp, lp);
        }
      }
    }

    // Every few seconds, whatever you're doing, a bit of text scrambles. The corner texts come up most often.
    if (!reduceMotion && state.booted && t > textGlitchNext) {
      const r = Math.random();
      if (r < 0.35) glitchRun(scrLeft, t, 0, CORNER_LEFT.length);
      else if (r < 0.7) glitchRun(scrRight, t, 0, CLOCK_PLACE.length);
      else {
        const lab = SIDE_LABELS[r < 0.85 ? 0 : 1];
        const items = labelGlyphs.filter(function (g) { return g.label === lab && g.rows; });
        glitchRun(items.map(function (g) { return g.scr; }), t, 0, items.length);
      }
      textGlitchNext = t + 2 + Math.random() * 3;
    }

    // Corners: role on the left, Washington DC 24-hour clock on the right. Seconds tick with the rings.
    {
      const cpx = labelPx;
      const margin = Math.round(clamp(grid.w / grid.dpr * 0.03, 16, 48) * grid.dpr);
      drawPixelText(ctx, CORNER_LEFT, margin, margin, cpx, function () { return LABEL_COLOR; }, scrLeft, t);
      let str = CLOCK_PLACE + '  ' + dcTime();
      let scr = scrRight;
      const leftW = pixelTextWidth(CORNER_LEFT, cpx), gap = 6 * cpx;
      let y = margin;
      // Narrow screens: shorten to "DC 12:34:56", and drop to a second line if it still doesn't fit
      if (margin + leftW + gap + pixelTextWidth(str, cpx) > grid.w - margin) {
        str = 'DC  ' + dcTime();
        scr = scrRight.slice(CLOCK_PLACE.length - 2);
        if (margin + leftW + gap + pixelTextWidth(str, cpx) > grid.w - margin) y = margin + 11 * cpx;
      }
      const x = grid.w - margin - pixelTextWidth(str, cpx);
      drawPixelText(ctx, str, x, y, cpx, function (k) {
        return k >= str.length - 2 ? '#ff0a1e' : LABEL_COLOR;
      }, scr, t);
    }
  }

  // ---------- Procedural studio environment for metal reflections ----------
  (function buildEnvironment() {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(
      new THREE.BoxGeometry(20, 20, 20),
      new THREE.MeshBasicMaterial({ color: srgb(0x0c0f13), side: THREE.BackSide })
    ));
    function panel(w, h, hex, k, x, y, z) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: hdr(hex, k), side: THREE.DoubleSide })
      );
      m.position.set(x, y, z);
      m.lookAt(0, 0, 0);
      env.add(m);
    }
    panel(9, 2.2, 0xffffff, 3.2, 0, 8, 2);      // overhead softbox
    panel(1.6, 7, 0xcfe0ff, 2.2, -8, 1, 3);     // cool strip, left
    panel(1.6, 6, 0xffffff, 1.4, 8, 0, -2);     // strip, right rear
    panel(6, 1, 0xffffff, 1.0, 0, 2.5, 9);      // front fill
    panel(3, 3, 0xff1020, 2.2, 0, -7, 4);       // red bounce from below
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
  })();

  // ---------- Canvas textures ----------
  function canvas(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return [c, c.getContext('2d')];
  }

  function makeIrisTexture() {
    const S = 1024, cx = S / 2;
    const [c, g] = canvas(S);
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);

    const base = g.createRadialGradient(cx, cx, S * 0.1, cx, cx, S * 0.5);
    base.addColorStop(0.0, '#ff4a52');
    base.addColorStop(0.22, '#ff1428');
    base.addColorStop(0.55, '#a8061a');
    base.addColorStop(0.88, '#2e010a');
    base.addColorStop(1.0, '#000000');
    g.fillStyle = base;
    g.beginPath(); g.arc(cx, cx, S * 0.5, 0, TAU); g.fill();

    // Bright fibres
    for (let i = 0; i < 1100; i++) {
      const a = Math.random() * TAU;
      const r0 = S * (0.14 + Math.random() * 0.08);
      const r1 = r0 + S * (0.06 + Math.random() * 0.26);
      const fb = 30 + Math.random() * 70 | 0;
      g.strokeStyle = 'rgba(255,' + fb + ',' + (fb + 10) + ',' + (0.06 + Math.random() * 0.32).toFixed(3) + ')';
      g.lineWidth = 0.6 + Math.random() * 1.8;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
      g.stroke();
    }
    // Dark fibres for depth
    for (let i = 0; i < 420; i++) {
      const a = Math.random() * TAU;
      const r0 = S * (0.18 + Math.random() * 0.1);
      const r1 = r0 + S * (0.05 + Math.random() * 0.2);
      g.strokeStyle = 'rgba(0,0,0,' + (0.15 + Math.random() * 0.3).toFixed(3) + ')';
      g.lineWidth = 0.8 + Math.random() * 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1);
      g.stroke();
    }

    // Concentric machined rings
    const rings = [
      { r: 0.215, w: 2.5, a: 0.7, dash: null },
      { r: 0.27, w: 1.5, a: 0.45, dash: [6, 8] },
      { r: 0.33, w: 2, a: 0.55, dash: null },
      { r: 0.385, w: 1.2, a: 0.35, dash: [30, 12, 4, 12] },
      { r: 0.47, w: 3, a: 0.6, dash: null }
    ];
    rings.forEach(function (ring) {
      g.setLineDash(ring.dash || []);
      g.strokeStyle = 'rgba(255,95,105,' + ring.a + ')';
      g.lineWidth = ring.w;
      g.beginPath(); g.arc(cx, cx, S * ring.r, 0, TAU); g.stroke();
    });
    g.setLineDash([]);

    // Segmented data band
    const segs = 72;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU + 0.01;
      const a1 = ((i + 1) / segs) * TAU - 0.01;
      const lit = Math.random();
      g.strokeStyle = lit > 0.85 ? 'rgba(255,130,140,0.9)' : 'rgba(255,40,55,' + (0.25 + lit * 0.25).toFixed(3) + ')';
      g.lineWidth = S * 0.018;
      g.beginPath(); g.arc(cx, cx, S * 0.425, a0, a1); g.stroke();
    }

    // Glow collar around the pupil
    const collar = g.createRadialGradient(cx, cx, S * 0.12, cx, cx, S * 0.2);
    collar.addColorStop(0, 'rgba(255,120,130,0.95)');
    collar.addColorStop(1, 'rgba(255,20,40,0)');
    g.fillStyle = collar;
    g.beginPath(); g.arc(cx, cx, S * 0.2, 0, TAU); g.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  function makeOverlayTexture() {
    const S = 1024, cx = S / 2;
    const [c, g] = canvas(S);
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(255,110,120,0.6)';
    g.lineWidth = 3;
    g.setLineDash([22, 14]);
    g.beginPath(); g.arc(cx, cx, S * 0.3, 0, TAU); g.stroke();
    g.setLineDash([]);

    g.fillStyle = 'rgba(255,150,160,0.8)';
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU;
      g.beginPath(); g.arc(cx + Math.cos(a) * S * 0.355, cx + Math.sin(a) * S * 0.355, 3, 0, TAU); g.fill();
    }

    g.lineWidth = 6;
    g.strokeStyle = 'rgba(255,60,75,0.75)';
    [[0.2, 0.9], [1.9, 2.4], [3.3, 4.6], [5.2, 5.7]].forEach(function (arc) {
      g.beginPath(); g.arc(cx, cx, S * 0.44, arc[0], arc[1]); g.stroke();
    });

    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function makeGlowTexture() {
    const S = 256, cx = S / 2;
    const [c, g] = canvas(S);
    const grad = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(255,255,255,0.6)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.15)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  }

  function makeDotTexture() {
    const S = 64, cx = S / 2;
    const [c, g] = canvas(S);
    const grad = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  }

  const glowTex = makeGlowTexture();
  const dotTex = makeDotTexture();
  const RED = srgb(0xff0a1e);

  // ---------- Materials ----------
  const M = {
    armor: new THREE.MeshStandardMaterial({ color: srgb(0x3a414a), metalness: 0.85, roughness: 0.38, envMapIntensity: 1.1 }),
    armorLight: new THREE.MeshStandardMaterial({ color: srgb(0x8a939d), metalness: 0.9, roughness: 0.3, envMapIntensity: 1.2 }),
    armorDouble: new THREE.MeshStandardMaterial({ color: srgb(0x3a414a), metalness: 0.85, roughness: 0.4, side: THREE.DoubleSide }),
    lid: new THREE.MeshStandardMaterial({ color: srgb(0x4a525c), metalness: 0.88, roughness: 0.32, envMapIntensity: 1.2 }),
    lidInner: new THREE.MeshStandardMaterial({ color: srgb(0x15181c), metalness: 0.6, roughness: 0.55, side: THREE.BackSide }),
    dark: new THREE.MeshStandardMaterial({ color: srgb(0x15181c), metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: srgb(0xc4ccd5), metalness: 1.0, roughness: 0.16, envMapIntensity: 1.4 }),
    sector: new THREE.MeshStandardMaterial({ color: srgb(0x23272d), metalness: 0.92, roughness: 0.26, side: THREE.DoubleSide }),
    core: new THREE.MeshStandardMaterial({ color: srgb(0x060607), emissive: srgb(0xff0a1e), emissiveIntensity: 0.7, metalness: 0.2, roughness: 0.6 }),
    redGlow: new THREE.MeshBasicMaterial({ color: srgb(0xff0a1e), toneMapped: false }),
    led: new THREE.MeshBasicMaterial({ color: srgb(0xff0a1e), toneMapped: false }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000 })
  };

  // Spherical coordinates around the eye axis (+Z). theta is measured from the pupil.
  function sph(r, theta, phi, out) {
    return (out || new THREE.Vector3()).set(
      -r * Math.cos(phi) * Math.sin(theta),
      -r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(theta)
    );
  }
  function toEyeAxis(geo) { geo.rotateX(Math.PI / 2); return geo; }

  // Matrix for an object sitting on the sphere surface: x along the phi tangent, y along the normal.
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3();
  const _t = new THREE.Vector3(), _b = new THREE.Vector3();
  function surfaceMatrix(r, theta, phi, sx, sy, sz, out) {
    sph(1, theta, phi, _n);
    _p.copy(_n).multiplyScalar(r);
    _t.set(Math.sin(phi), -Math.cos(phi), 0).normalize();
    _b.crossVectors(_t, _n);
    _m.makeBasis(_t, _n, _b);
    _q.setFromRotationMatrix(_m);
    _s.set(sx, sy, sz);
    return out.compose(_p, _q, _s);
  }

  // ---------- Hierarchy ----------
  const rig = new THREE.Group();
  scene.add(rig);
  const yawGroup = new THREE.Group();
  rig.add(yawGroup);
  const pitchGroup = new THREE.Group();
  yawGroup.add(pitchGroup);

  // ---------- Eyeball: glowing core with armour plates ----------
  const core = new THREE.Mesh(toEyeAxis(new THREE.SphereGeometry(0.975, 96, 48, 0, TAU, 0.64, Math.PI - 0.64)), M.core);
  pitchGroup.add(core);

  const bands = [
    { t0: 0.70, t1: 1.12, n: 8, off: 0.0, r: 1.0 },
    { t0: 1.15, t1: 1.68, n: 12, off: 0.13, r: 1.012 },
    { t0: 1.71, t1: 2.30, n: 10, off: 0.31, r: 1.0 },
    { t0: 2.33, t1: 2.78, n: 6, off: 0.2, r: 1.006 }
  ];
  const plateGap = 0.035;
  const boltSpots = [], blockSpots = [], slatSpots = [], ledSpots = [];

  bands.forEach(function (b, i) {
    const step = TAU / b.n;
    for (let k = 0; k < b.n; k++) {
      const p0 = b.off + k * step + plateGap / 2;
      const p1 = b.off + (k + 1) * step - plateGap / 2;
      const geo = toEyeAxis(new THREE.SphereGeometry(
        b.r, Math.max(8, Math.ceil((p1 - p0) * 18)), Math.max(6, Math.ceil((b.t1 - b.t0) * 18)),
        p0, p1 - p0, b.t0, b.t1 - b.t0
      ));
      pitchGroup.add(new THREE.Mesh(geo, (k + i) % 3 === 0 ? M.armorLight : M.armor));

      const tc = (b.t0 + b.t1) / 2, pc = (p0 + p1) / 2;
      const arcW = (p1 - p0) * Math.sin(tc) * b.r;
      const arcH = (b.t1 - b.t0) * b.r;
      boltSpots.push([b.r, b.t0 + 0.045, p0 + 0.05 / Math.sin(b.t0 + 0.045)]);
      boltSpots.push([b.r, b.t0 + 0.045, p1 - 0.05 / Math.sin(b.t0 + 0.045)]);

      if (i === 0 && k % 2 === 1) blockSpots.push([b.r, tc, pc, arcW * 0.42, 0.016, arcH * 0.45]);
      if (i === 1 && k % 2 === 0) {
        blockSpots.push([b.r, tc, pc, arcW * 0.5, 0.024, arcH * 0.42]);
        ledSpots.push([b.r + 0.026, tc - arcH * 0.12, pc]);
      }
      if (i === 2 && k % 3 === 1) {
        for (let s = 0; s < 5; s++) {
          const ts = b.t0 + (b.t1 - b.t0) * (0.25 + s * 0.125);
          slatSpots.push([b.r, ts, pc, arcW * 0.55, 0.014, 0.022]);
        }
      }
    }
  });
  // Rear cap
  pitchGroup.add(new THREE.Mesh(toEyeAxis(new THREE.SphereGeometry(1.0, 48, 8, 0, TAU, 2.81, Math.PI - 2.81)), M.armorLight));

  (function buildGreebles() {
    const mtx = new THREE.Matrix4();
    const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.017, 0.017, 0.022, 10), M.chrome, boltSpots.length);
    boltSpots.forEach(function (s, i) { bolts.setMatrixAt(i, surfaceMatrix(s[0] + 0.006, s[1], s[2], 1, 1, 1, mtx)); });
    pitchGroup.add(bolts);

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const blocks = new THREE.InstancedMesh(boxGeo, M.armorLight, blockSpots.length);
    blockSpots.forEach(function (s, i) { blocks.setMatrixAt(i, surfaceMatrix(s[0] + s[4] / 2, s[1], s[2], s[3], s[4], s[5], mtx)); });
    pitchGroup.add(blocks);

    const slats = new THREE.InstancedMesh(boxGeo, M.dark, slatSpots.length);
    slatSpots.forEach(function (s, i) { slats.setMatrixAt(i, surfaceMatrix(s[0] + s[4] / 2, s[1], s[2], s[3], s[4], s[5], mtx)); });
    pitchGroup.add(slats);

    const leds = new THREE.InstancedMesh(boxGeo, M.led, ledSpots.length);
    ledSpots.forEach(function (s, i) { leds.setMatrixAt(i, surfaceMatrix(s[0], s[1], s[2], 0.05, 0.008, 0.012, mtx)); });
    pitchGroup.add(leds);
  })();

  // ---------- Lens assembly ----------
  const lens = new THREE.Group();
  pitchGroup.add(lens);

  const barrel = new THREE.Mesh(toEyeAxis(new THREE.CylinderGeometry(0.585, 0.585, 0.24, 72, 1, true)), M.dark);
  barrel.position.z = 0.68;
  lens.add(barrel);
  [0.62, 0.72].forEach(function (z) {
    const groove = new THREE.Mesh(new THREE.TorusGeometry(0.582, 0.006, 6, 72), M.chrome);
    groove.position.z = z;
    lens.add(groove);
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.59, 64), M.dark);
  floor.position.z = 0.6;
  lens.add(floor);

  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.615, 0.035, 16, 96), M.chrome);
  bezel.position.z = 0.79;
  lens.add(bezel);
  const bezelFace = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 96), M.armorLight);
  bezelFace.position.z = 0.8;
  lens.add(bezelFace);

  const tickGroup = new THREE.Group();
  tickGroup.position.z = 0.806;
  lens.add(tickGroup);
  (function () {
    const n = 60, mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const z = new THREE.Vector3(0, 0, 1);
    const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 0.04, 0.006), M.dark, n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const major = i % 5 === 0;
      pos.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0);
      q.setFromAxisAngle(z, a - Math.PI / 2);
      scl.set(major ? 1.6 : 1, major ? 1.7 : 1, 1);
      ticks.setMatrixAt(i, mtx.compose(pos, q, scl));
    }
    tickGroup.add(ticks);
  })();

  const arcGroup = new THREE.Group();
  arcGroup.position.z = 0.74;
  lens.add(arcGroup);
  [[0.1, 1.0], [1.15, 0.55], [1.85, 1.3], [3.3, 0.7], [4.15, 1.2], [5.5, 0.6]].forEach(function (a, i) {
    arcGroup.add(new THREE.Mesh(new THREE.RingGeometry(0.455, 0.49, 24, 1, a[0], a[1]), M.armorLight));
    if (i % 2 === 0) {
      const strip = new THREE.Mesh(new THREE.RingGeometry(0.493, 0.499, 24, 1, a[0] + 0.05, a[1] - 0.1), M.redGlow);
      strip.position.z = 0.001;
      arcGroup.add(strip);
    }
  });

  const irisMat = new THREE.MeshBasicMaterial({ map: makeIrisTexture(), toneMapped: false });
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.47, 128), irisMat);
  iris.position.z = 0.64;
  lens.add(iris);

  const overlayMat = new THREE.MeshBasicMaterial({
    map: makeOverlayTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  const overlay = new THREE.Mesh(new THREE.CircleGeometry(0.47, 96), overlayMat);
  overlay.position.z = 0.645;
  lens.add(overlay);

  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.2, 64), M.black);
  pupil.position.z = 0.647;
  lens.add(pupil);

  const pupilCoreMat = new THREE.MeshBasicMaterial({ color: srgb(0xff0a1e), toneMapped: false });
  const pupilCore = new THREE.Mesh(new THREE.CircleGeometry(0.028, 32), pupilCoreMat);
  pupilCore.position.z = 0.649;
  lens.add(pupilCore);
  const pupilRing = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.056, 48), M.redGlow);
  pupilRing.position.z = 0.649;
  lens.add(pupilRing);

  // Mechanical aperture: eight shutter sectors that slide in and out
  const sectors = [];
  (function () {
    const n = 8, gap = 0.02, span = TAU / n;
    for (let i = 0; i < n; i++) {
      const a = i * span;
      const s = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.22, 12, 1, a + gap, span - 2 * gap), M.sector);
      s.position.z = 0.652;
      s.userData.dir = new THREE.Vector2(Math.cos(a + span / 2), Math.sin(a + span / 2));
      lens.add(s);
      sectors.push(s);
    }
  })();

  const glowMat = new THREE.SpriteMaterial({
    map: glowTex, color: srgb(0xff0818), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(0.95, 0.95, 1);
  glow.position.z = 0.7;
  lens.add(glow);

  const glass = new THREE.Mesh(
    toEyeAxis(new THREE.SphereGeometry(1.1, 64, 24, 0, TAU, 0, 0.599)),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
      transparent: true, opacity: 0.16, envMapIntensity: 1.6, depthWrite: false
    })
  );
  glass.position.z = -0.118;
  lens.add(glass);

  const irisLight = new THREE.PointLight(srgb(0xff0a1e), 1.6, 3, 2);
  irisLight.position.set(0, 0, 0.95);
  pitchGroup.add(irisLight);

  // ---------- Mechanical lids ----------
  const LID_R = 1.05;
  function makeLid(isTop) {
    const g = new THREE.Group();
    const geo = new THREE.SphereGeometry(LID_R, 96, 32, 0, Math.PI, isTop ? 0 : Math.PI / 2, Math.PI / 2);
    g.add(new THREE.Mesh(geo, M.lid));
    g.add(new THREE.Mesh(geo, M.lidInner));

    const rim = new THREE.Mesh(new THREE.TorusGeometry(LID_R + 0.006, 0.014, 10, 96, Math.PI).rotateX(Math.PI / 2), M.chrome);
    g.add(rim);

    const strip = new THREE.Mesh(new THREE.TorusGeometry(LID_R + 0.003, 0.006, 6, 96, Math.PI).rotateX(Math.PI / 2), M.redGlow);
    strip.rotation.x = isTop ? -0.07 : 0.07;
    g.add(strip);

    [-0.8, -0.4, 0, 0.4, 0.8].forEach(function (x) {
      const rr = Math.sqrt((LID_R + 0.004) * (LID_R + 0.004) - x * x);
      const rg = new THREE.TorusGeometry(rr, 0.007, 6, 40, Math.PI / 2).rotateY(-Math.PI / 2);
      if (!isTop) rg.rotateZ(Math.PI);
      const rib = new THREE.Mesh(rg, M.armorLight);
      rib.position.x = x;
      g.add(rib);
    });
    return g;
  }
  const topLid = makeLid(true);
  const bottomLid = makeLid(false);
  pitchGroup.add(topLid, bottomLid);
  const LID_OPEN = 1.22;
  [1, -1].forEach(function (side) {
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 28).rotateZ(Math.PI / 2), M.chrome);
    hinge.position.x = side * 1.05;
    pitchGroup.add(hinge);
  });

  // ---------- Cat ears (on a slim band hugging the top of the eye, so the lids slide underneath) ----------
  // Sharp, outward-leaning armour ears: layered blades and knobs along the top edge, parallel bars with
  // rivets, a triangular frame holding a glowing panel, smoky glass fins, and a piston behind each ear.
  const ears = [];
  let updatePistons = function () {};
  (function buildEars() {
    const R = 1.1, PIVOT_Y = 0.11;
    // Ear outline in (outward, up) coordinates; each ear mirrors x so the tips lean away from the centre
    const BI = new THREE.Vector2(-0.30, 0), BO = new THREE.Vector2(0.40, 0), TIP = new THREE.Vector2(0.34, 0.92);
    const CEN = new THREE.Vector2().add(BI).add(BO).add(TIP).divideScalar(3);
    const grow = (p, d) => new THREE.Vector2().subVectors(p, CEN).multiplyScalar(1 + d).add(CEN);
    const inner = new THREE.Vector2().subVectors(TIP, BI).normalize();      // along the long top edge
    const inN = new THREE.Vector2(inner.y, -inner.x);                         // from that edge into the ear
    const outer = new THREE.Vector2().subVectors(TIP, BO).normalize();
    const outN = new THREE.Vector2(-outer.y, outer.x);                        // from the outer edge into the ear

    function shapeOf(points, sx) {
      const sh = new THREE.Shape();
      points.forEach(function (p, i) { if (i === 0) sh.moveTo(p.x * sx, p.y); else sh.lineTo(p.x * sx, p.y); });
      return sh;
    }
    // Is a point inside the ear, at least `m` from every edge and above the base band?
    function insideEar(p, m, minY) {
      if (p.y < minY) return false;
      const dIn = (p.x - BI.x) * inN.x + (p.y - BI.y) * inN.y;
      const dOut = (p.x - BO.x) * outN.x + (p.y - BO.y) * outN.y;
      return dIn >= m && dOut >= m;
    }
    // A bar running parallel to the top edge, between two offsets, clipped to the ear
    function barPolygon(o1, o2, m, minY) {
      function span(o) {
        let a = null, b = null;
        for (let i = 0; i <= 400; i++) {
          const sv = -0.2 + 1.6 * i / 400;
          const pnt = new THREE.Vector2(BI.x + inN.x * o + inner.x * sv, BI.y + inN.y * o + inner.y * sv);
          if (insideEar(pnt, m, minY)) { if (a === null) a = pnt; b = pnt; }
        }
        return [a, b];
      }
      const s1 = span(o1), s2 = span(o2);
      if (!s1[0] || !s2[0]) return null;
      return [s1[0], s1[1], s2[1], s2[0]];
    }
    function extrude(points, sx, depth, bevel) {
      return new THREE.ExtrudeGeometry(shapeOf(points, sx), bevel ? {
        depth: depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 2
      } : { depth: depth, bevelEnabled: false });
    }
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const rivetGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.01, 10).rotateX(Math.PI / 2);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: srgb(0x9aa6b2), metalness: 0, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.1,
      transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.4
    });
    const panelGlowTex = (function () {
      const [c, g] = canvas(128);
      const grad = g.createLinearGradient(0, 128, 0, 0);
      grad.addColorStop(0, 'rgba(255,20,40,0.85)');
      grad.addColorStop(1, 'rgba(255,10,30,0.15)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();

    // Piston parts
    const pistonOuterGeo = new THREE.CylinderGeometry(0.022, 0.022, 1, 14).translate(0, 0.5, 0);
    const pistonRodGeo = new THREE.CylinderGeometry(0.011, 0.011, 1, 10).translate(0, 0.5, 0);
    const clevisGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.06, 14).rotateZ(Math.PI / 2);
    const PISTON_A = new THREE.Vector3(0, 0.03, -0.2);   // on a bracket behind the band (mount space)

    // Head band: attached at the lid hinge points, arcs over the top just outside the lids
    const band = new THREE.Group();
    pitchGroup.add(band);
    band.add(new THREE.Mesh(toEyeAxis(new THREE.CylinderGeometry(R, R, 0.12, 128, 1, true, Math.PI / 2, Math.PI)), M.armorDouble));
    [0.06, -0.06].forEach(function (z) {
      const edge = new THREE.Mesh(new THREE.TorusGeometry(R, 0.011, 8, 128, Math.PI), M.chrome);
      edge.position.z = z;
      band.add(edge);
    });
    band.add(new THREE.Mesh(new THREE.TorusGeometry(R + 0.004, 0.005, 6, 128, Math.PI), M.redGlow));
    [1, -1].forEach(function (side) {
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.07, 28).rotateZ(Math.PI / 2), M.armorLight);
      hub.position.x = side * 1.1;
      band.add(hub);
      const hubRing = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.006, 6, 32).rotateY(Math.PI / 2), M.redGlow);
      hubRing.position.x = side * 1.137;
      band.add(hubRing);
    });

    // Ear hinges sit on the band
    const hingeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 28).rotateZ(Math.PI / 2);
    const hingeRingGeo = new THREE.TorusGeometry(0.052, 0.006, 6, 32).rotateY(Math.PI / 2);
    const footGeo = new THREE.BoxGeometry(0.4, 0.07, 0.12);

    [{ a: THREE.MathUtils.degToRad(62), side: 1 }, { a: THREE.MathUtils.degToRad(118), side: -1 }].forEach(function (cfg) {
      const sx = cfg.side;
      const mount = new THREE.Group();
      mount.position.set(Math.cos(cfg.a) * R, Math.sin(cfg.a) * R, 0);
      mount.rotation.z = cfg.a - Math.PI / 2;
      pitchGroup.add(mount);

      const foot = new THREE.Mesh(footGeo, M.armor);
      foot.position.set(0.05 * sx, 0.04, 0);
      mount.add(foot);
      const hinge = new THREE.Mesh(hingeGeo, M.chrome);
      hinge.position.set(0.05 * sx, PIVOT_Y, 0);
      mount.add(hinge);
      [-1, 1].forEach(function (hx) {
        const ring = new THREE.Mesh(hingeRingGeo, M.redGlow);
        ring.position.set(0.05 * sx + hx * 0.252, PIVOT_Y, 0);
        mount.add(ring);
      });
      const bracket = new THREE.Mesh(unitBox, M.armor);
      bracket.scale.set(0.06, 0.04, 0.15);
      bracket.position.set(0.05 * sx, 0.03, -0.13);
      mount.add(bracket);
      const pistonA = PISTON_A.clone().setX(0.05 * sx);
      const clevisA = new THREE.Mesh(clevisGeo, M.chrome);
      clevisA.position.copy(pistonA);
      mount.add(clevisA);
      const pistonOuter = new THREE.Mesh(pistonOuterGeo, M.armorLight);
      const pistonRod = new THREE.Mesh(pistonRodGeo, M.chrome);
      mount.add(pistonOuter, pistonRod);

      const pivot = new THREE.Group();
      pivot.position.y = PIVOT_Y;
      mount.add(pivot);

      const outline = [BI, BO, TIP];
      // Layered blades stepping out past the top edge, behind the ear
      [[0.03, 0.09, 0.1, 0.95, -0.085], [0.07, 0.12, 0.25, 0.88, -0.1]].forEach(function (bd) {
        const o1 = -bd[1], o2 = -bd[0];
        const pts = [bd[2], bd[3], bd[3] - 0.08, bd[2] + 0.05].map(function (sv, i) {
          const o = i < 2 ? o1 : o2;
          return new THREE.Vector2(BI.x + inN.x * o + inner.x * sv, BI.y + inN.y * o + inner.y * sv);
        });
        const blade = new THREE.Mesh(extrude(pts, sx, 0.018, 0.004), M.armor);
        blade.position.z = bd[4];
        pivot.add(blade);
      });
      // Back plate, glowing seam, front shell
      const back = new THREE.Mesh(extrude(outline, sx, 0.03, 0.008), M.armor);
      back.position.z = -0.066;
      pivot.add(back);
      const core = new THREE.Mesh(extrude([grow(BI, 0.035), grow(BO, 0.035), grow(TIP, 0.035)], sx, 0.02, 0), M.redGlow);
      core.position.z = -0.03;
      pivot.add(core);
      const shell = new THREE.Mesh(extrude(outline, sx, 0.026, 0.006), M.lid);
      shell.position.z = -0.006;
      pivot.add(shell);

      // Three parallel bars with rivets and a red light along each inner edge
      [[0.06, 0.1], [0.13, 0.17], [0.2, 0.24]].forEach(function (b, i) {
        const poly = barPolygon(b[0], b[1], 0.035, 0.1 + i * 0.02);
        if (!poly) return;
        const bar = new THREE.Mesh(extrude(poly, sx, 0.01, 0.003), M.armorLight);
        bar.position.z = 0.026;
        pivot.add(bar);
        const lightPoly = barPolygon(b[1], b[1] + 0.007, 0.035, 0.1 + i * 0.02);
        if (lightPoly) {
          const light = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(lightPoly, sx)), M.redGlow);
          light.position.z = 0.03;
          pivot.add(light);
        }
        // Rivets spaced along the bar
        const a = poly[0], c = poly[1];
        const n = Math.max(2, Math.round(a.distanceTo(c) / 0.13));
        const rivets = new THREE.InstancedMesh(rivetGeo, M.chrome, n);
        const rm = new THREE.Matrix4();
        for (let k = 0; k < n; k++) {
          const f = (k + 0.5) / n;
          const px = lerp(a.x, c.x, f) + inN.x * (b[1] - b[0]) / 2, py = lerp(a.y, c.y, f) + inN.y * (b[1] - b[0]) / 2;
          rivets.setMatrixAt(k, rm.makeTranslation(px * sx, py, 0.042));
        }
        pivot.add(rivets);
      });

      // Triangular frame low on the outer side, holding a glowing panel
      const fA = new THREE.Vector2(0.13, 0.1), fB = new THREE.Vector2(0.36, 0.1), fC = new THREE.Vector2(0.33, 0.33);
      const fCen = new THREE.Vector2().add(fA).add(fB).add(fC).divideScalar(3);
      const shrink = (p, k) => new THREE.Vector2().subVectors(p, fCen).multiplyScalar(k).add(fCen);
      const frameShape = shapeOf([fA, fB, fC], sx);
      frameShape.holes.push(shapeOf([shrink(fA, 0.68), shrink(fC, 0.68), shrink(fB, 0.68)], sx));
      const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, {
        depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelOffset: -0.003, bevelSegments: 1
      }), M.armorLight);
      frame.position.z = 0.026;
      pivot.add(frame);
      const panelGeo = new THREE.ShapeGeometry(shapeOf([shrink(fA, 0.7), shrink(fB, 0.7), shrink(fC, 0.7)], sx));
      panelGeo.computeBoundingBox();
      const bb = panelGeo.boundingBox;
      const uv = panelGeo.attributes.uv;
      for (let k = 0; k < uv.count; k++) {
        const vx = panelGeo.attributes.position.getX(k), vy = panelGeo.attributes.position.getY(k);
        uv.setXY(k, (vx - bb.min.x) / (bb.max.x - bb.min.x), (vy - bb.min.y) / (bb.max.y - bb.min.y));
      }
      const panel = new THREE.Mesh(panelGeo, new THREE.MeshBasicMaterial({
        map: panelGlowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      }));
      panel.position.z = 0.0215;
      pivot.add(panel);
      const panelGlass = new THREE.Mesh(panelGeo, glassMat);
      panelGlass.position.z = 0.032;
      pivot.add(panelGlass);
      const frameRivets = new THREE.InstancedMesh(rivetGeo, M.chrome, 3);
      const fm = new THREE.Matrix4();
      [fA, fB, fC].forEach(function (p, k) {
        const q = shrink(p, 0.84);
        frameRivets.setMatrixAt(k, fm.makeTranslation(q.x * sx, q.y, 0.042));
      });
      pivot.add(frameRivets);

      // Knobs along the top edge
      [0.36, 0.52, 0.68, 0.84].forEach(function (sv) {
        const knob = new THREE.Mesh(unitBox, M.armor);
        knob.scale.set(0.05, 0.034, 0.05);
        const px = BI.x + inner.x * sv - inN.x * 0.02, py = BI.y + inner.y * sv - inN.y * 0.02;
        knob.position.set(px * sx, py, -0.035);
        knob.rotation.z = Math.atan2(inner.y, inner.x * sx);
        pivot.add(knob);
      });

      // Smoky glass fins peeking out behind the outer edge and the lower inner corner
      const finOuter = [
        new THREE.Vector2(BO.x - outN.x * 0.06 + outer.x * 0.12, BO.y - outN.y * 0.06 + outer.y * 0.12),
        new THREE.Vector2(BO.x - outN.x * 0.06 + outer.x * 0.62, BO.y - outN.y * 0.06 + outer.y * 0.62),
        new THREE.Vector2(BO.x + outN.x * 0.05 + outer.x * 0.7, BO.y + outN.y * 0.05 + outer.y * 0.7),
        new THREE.Vector2(BO.x + outN.x * 0.05 + outer.x * 0.08, BO.y + outN.y * 0.05 + outer.y * 0.08)
      ];
      const finInner = [
        new THREE.Vector2(BI.x - inN.x * 0.05 + inner.x * 0.06, BI.y - inN.y * 0.05 + inner.y * 0.06),
        new THREE.Vector2(BI.x - inN.x * 0.05 + inner.x * 0.32, BI.y - inN.y * 0.05 + inner.y * 0.32),
        new THREE.Vector2(BI.x + inN.x * 0.06 + inner.x * 0.36, BI.y + inN.y * 0.06 + inner.y * 0.36),
        new THREE.Vector2(BI.x + inN.x * 0.06 + inner.x * 0.1, BI.y + inN.y * 0.06 + inner.y * 0.1)
      ];
      [finOuter, finInner].forEach(function (pts) {
        const fin = new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(pts, sx)), glassMat);
        fin.position.z = -0.075;
        pivot.add(fin);
      });

      // Back: spine, vents, rivets, and the piston's upper mount
      const spine = new THREE.Mesh(unitBox, M.armorLight);
      spine.scale.set(0.06, 0.5, 0.024);
      spine.position.set(0.08 * sx, 0.33, -0.093);
      pivot.add(spine);
      [0.16, 0.23, 0.3].forEach(function (y, i) {
        const vent = new THREE.Mesh(unitBox, M.dark);
        vent.scale.set(0.26 - i * 0.04, 0.018, 0.012);
        vent.position.set(0.06 * sx, y, -0.086);
        pivot.add(vent);
      });
      const pistonB = new THREE.Vector3(0.08 * sx, 0.3, -0.108);
      const clevisB = new THREE.Mesh(clevisGeo, M.chrome);
      clevisB.position.copy(pistonB);
      pivot.add(clevisB);

      ears.push({
        pivot: pivot, side: sx, fold: 0, vfold: 0,
        pistonOuter: pistonOuter, pistonRod: pistonRod, pistonA: pistonA, pistonB: pistonB
      });
    });

    // Keep each piston connected between its bracket and the ear as the ear folds
    const _pb = new THREE.Vector3(), _pd = new THREE.Vector3(), _pq = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);
    updatePistons = function () {
      for (let i = 0; i < ears.length; i++) {
        const ear = ears[i];
        const th = ear.pivot.rotation.x;
        const c = Math.cos(th), sn = Math.sin(th), B = ear.pistonB;
        _pb.set(B.x, PIVOT_Y + B.y * c - B.z * sn, B.y * sn + B.z * c);
        _pd.copy(_pb).sub(ear.pistonA);
        const len = _pd.length();
        _pd.divideScalar(len);
        _pq.setFromUnitVectors(_up, _pd);
        ear.pistonOuter.position.copy(ear.pistonA);
        ear.pistonOuter.quaternion.copy(_pq);
        ear.pistonOuter.scale.set(1, Math.min(0.12, len * 0.55), 1);
        ear.pistonRod.position.copy(_pb);
        ear.pistonRod.quaternion.setFromUnitVectors(_up, _pd.negate());
        ear.pistonRod.scale.set(1, Math.max(0.02, len - 0.02), 1);
      }
    };
  })();
  const EAR_TILT = -0.25;
  function earTwitch(ear, strength) {
    ear.vfold -= 7 * strength;
  }
  function earsPerk() {
    ears.forEach(function (ear) { ear.vfold += 4; });
  }

  // ---------- Laser ----------
  const laser = new THREE.Group();
  laser.visible = false;
  scene.add(laser);
  const HOT = srgb(0xffd6da);
  function additive(color, opacity, extra) {
    return new THREE.MeshBasicMaterial(Object.assign({
      color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false
    }, extra || {}));
  }
  const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0);
  const beams = [
    { mesh: new THREE.Mesh(beamGeo, additive(RED.clone(), 0.12)), r: 0.14 },
    { mesh: new THREE.Mesh(beamGeo, additive(RED.clone(), 0.95)), r: 0.085 },
    { mesh: new THREE.Mesh(beamGeo, additive(HOT.clone(), 1)), r: 0.05 }
  ];
  beams.forEach(function (b, i) { b.mesh.renderOrder = 10 + i; laser.add(b.mesh); });
  function flare(color, depthTest) {
    return new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: color, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: depthTest, toneMapped: false
    }));
  }
  const muzzle = flare(srgb(0xff3346), false);
  muzzle.renderOrder = 14;
  const impactGlow = flare(RED.clone(), false);
  const impactCore = flare(HOT.clone(), false);
  laser.add(muzzle, impactGlow, impactCore);

  const SPARKS = 300;
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkCol = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  const sparkMax = new Float32Array(SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    size: 0.09, map: dotTex, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkCursor = 0, sparkAccum = 0;
  const beamStart = new THREE.Vector3(), beamDir = new THREE.Vector3(), beamEnd = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), beamQ = new THREE.Quaternion(), projV = new THREE.Vector3();
  const gazeO = new THREE.Vector3(), gazeD = new THREE.Vector3();

  function spawnSpark() {
    const i = sparkCursor;
    sparkCursor = (sparkCursor + 1) % SPARKS;
    const i3 = i * 3;
    let rx = Math.random() * 2 - 1, ry = Math.random() * 2 - 1, rz = Math.random() * 2 - 1;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    const burst = 1.6 + Math.random() * 2.4;
    const back = 0.6 + Math.random() * 1.4;
    sparkPos[i3] = beamEnd.x; sparkPos[i3 + 1] = beamEnd.y; sparkPos[i3 + 2] = beamEnd.z;
    sparkVel[i3] = rx * burst - beamDir.x * back;
    sparkVel[i3 + 1] = ry * burst - beamDir.y * back + 0.6;
    sparkVel[i3 + 2] = rz * burst - beamDir.z * back;
    sparkMax[i] = sparkLife[i] = 0.3 + Math.random() * 0.45;
  }

  // ---------- HUD rings behind the eye ----------
  const hud = new THREE.Group();
  hud.position.z = -1.2;
  scene.add(hud);
  const hudMats = [];
  function hudMat(hex, k, opacity) {
    const m = new THREE.MeshBasicMaterial({
      color: hdr(hex, k), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false
    });
    m.userData.base = opacity;
    hudMats.push(m);
    return m;
  }
  hud.add(new THREE.Mesh(new THREE.RingGeometry(1.78, 1.786, 180), hudMat(0xc9d4de, 1, 0.12)));

  const hudArcs = new THREE.Group();
  hud.add(hudArcs);
  const arcMat = hudMat(0xff1028, 1, 0.6);
  [[0.3, 1.2], [2.4, 0.5], [3.6, 1.6]].forEach(function (a) {
    hudArcs.add(new THREE.Mesh(new THREE.RingGeometry(1.9, 1.93, 64, 1, a[0], a[1]), arcMat));
  });

  const hudTicks = new THREE.Group();
  hud.add(hudTicks);
  (function () {
    const pts = [];
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * TAU;
      const r1 = i % 10 === 0 ? 2.12 : 2.06;
      pts.push(Math.cos(a) * 2.02, Math.sin(a) * 2.02, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lm = new THREE.LineBasicMaterial({ color: srgb(0xc9d4de), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    lm.userData.base = 0.2;
    hudMats.push(lm);
    hudTicks.add(new THREE.LineSegments(geo, lm));
  })();

  const hudBrackets = new THREE.Group();
  hud.add(hudBrackets);
  const bracketMat = hudMat(0xc9d4de, 1, 0.32);
  hudBrackets.add(new THREE.Mesh(new THREE.RingGeometry(2.26, 2.272, 32, 1, -0.32, 0.64), bracketMat));
  hudBrackets.add(new THREE.Mesh(new THREE.RingGeometry(2.26, 2.272, 32, 1, Math.PI - 0.32, 0.64), bracketMat));

  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: srgb(0xff0a1e).multiplyScalar(0.55), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
  }));
  aura.scale.set(7.5, 7.5, 1);
  aura.position.z = -2.2;
  scene.add(aura);



  // ---------- Lights ----------
  scene.add(new THREE.HemisphereLight(srgb(0x9fb4c8), srgb(0x120a08), 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rimCool = new THREE.DirectionalLight(srgb(0x9cc7ff), 2.2);
  rimCool.position.set(-6, 2, -4);
  scene.add(rimCool);
  const rimRed = new THREE.DirectionalLight(srgb(0xff1a2a), 1.1);
  rimRed.position.set(5, -3, -5);
  scene.add(rimRed);

  // Additive materials add light only. Leaving alpha untouched stops fading sparks and glows
  // from leaving dark specks where the transparent canvas sits over the page background.
  scene.traverse(function (o) {
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
      if (m.blending !== THREE.AdditiveBlending) return;
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.SrcAlphaFactor;
      m.blendDst = THREE.OneFactor;
      m.blendEquationAlpha = THREE.AddEquation;
      m.blendSrcAlpha = THREE.ZeroFactor;
      m.blendDstAlpha = THREE.OneFactor;
    });
  });

  // ---------- Layout ----------
  const camBase = new THREE.Vector3();
  let EYE_PARK_X = 3;
  const aboutEl = document.getElementById('about');
  const pfEl = document.getElementById('pf');
  let layoutPortfolio = function () {};
  // About text fills the space left of the parked eye and its labels; on narrow screens it takes the full width
  function layoutAbout() {
    const w = stage.clientWidth || window.innerWidth;
    const ppuCss = labelGeo.ppu / grid.dpr;
    const right = labelGeo.cx0 / grid.dpr + (EYE_PARK_X * (camBase.z - LABEL_Z) / camBase.z - 2.75) * ppuCss;
    const narrow = right < w * 0.58;
    const aw = narrow ? w : Math.max(320, right);
    aboutEl.classList.toggle('is-narrow', narrow);
    aboutEl.classList.toggle('is-wide', !narrow && aw >= 1200);
    aboutEl.style.setProperty('--about-w', aw + 'px');
    if (typeof drawAboutPhoto === 'function') drawAboutPhoto(true);
  }
  function resize() {
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
    layoutLabels();
    layoutAbout();
    layoutPortfolio();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Behaviour state ----------
  const BLINK = {
    single: [
      { to: 1, dur: 0.075, ease: 'in' },
      { to: 1, dur: 0.05 },
      { to: 0, dur: 0.17, ease: 'back' }
    ],
    double: [
      { to: 1, dur: 0.07, ease: 'in' },
      { to: 1, dur: 0.04 },
      { to: 0.1, dur: 0.09, ease: 'out' },
      { to: 1, dur: 0.07, ease: 'in' },
      { to: 1, dur: 0.04 },
      { to: 0, dur: 0.17, ease: 'back' }
    ],
    shutterCheck: [
      { to: 0.55, dur: 0.09, ease: 'in' },
      { to: 0.55, dur: 0.14 },
      { to: 0.75, dur: 0.05, ease: 'in' },
      { to: 0, dur: 0.16, ease: 'back' }
    ],
    boot: [
      { to: 1, dur: 0.7 },
      { to: 0.62, dur: 0.12, ease: 'out' },
      { to: 0.62, dur: 0.22 },
      { to: 0, dur: 0.38, ease: 'back' }
    ]
  };
  const EASE = {
    linear: (p) => p,
    in: (p) => p * p,
    out: (p) => 1 - (1 - p) * (1 - p),
    back: (p) => { const c1 = 1.70158, c3 = c1 + 1, q = p - 1; return 1 + c3 * q * q * q + c1 * q * q; }
  };

  const state = {
    yaw: 0, pitch: 0, vyaw: 0, vpitch: 0, tYaw: 0, tPitch: 0,
    mouse: new THREE.Vector2(0, 0), hasPointer: false, lastMove: -1e9,
    mode: 'idle', idleNext: 1.6, sweep: null,
    blink: { active: true, seq: BLINK.boot, idx: 0, segStart: 0, from: 1 },
    nextBlink: 4, blinkClose: 1, squint: 0,
    aperture: 0.0, apertureTarget: 0.045,
    glitchUntil: 0, glitchValue: 1, glitchNextStep: 0, booted: false,
    beatPulse: 0, earNext: 5, firing: false, anger: 0, beam: 0,
    prevVyaw: 0, prevVpitch: 0, accYaw: 0, accPitch: 0, pointerDown: false, overEye: false, overEar: null, recoil: 0, vRecoil: 0, shakeUntil: 0, annoy: 0, pokes: [], glanceUntil: 0, glanceYaw: 0, glancePitch: 0, firedThisPress: false, rigX: 0, vRigX: 0, travel: 0, impactX: null, impactY: null, gazeX: -1e5, gazeY: -1e5,
    jitY: 0, jitP: 0, jitTY: 0, jitTP: 0, jitNext: 0,
    bracketRot: 0, bracketVel: 0
  };

  // Rings that tick on a clock: inner lens parts every half second, outer HUD every second.
  // Steps are locked to real wall-clock seconds.
  function ringSpring(obj, step, everySecondOnly) {
    return { obj: obj, step: step, secondOnly: everySecondOnly, angle: 0, vel: 0, target: 0 };
  }
  const beatRings = [
    ringSpring(null, -TAU / 60, false),        // lens tick ring
    ringSpring(null, TAU / 24, false),         // lens arc ring (opposite way)
    ringSpring(null, -TAU / 120, false),       // iris overlay
    ringSpring(null, -TAU / 60, true),         // HUD tick ring, like a seconds hand
    ringSpring(null, TAU / 60, true)           // HUD red arcs (opposite way)
  ];
  const wallMs = () => performance.timeOrigin + performance.now();
  let lastHalfBeat = Math.floor(wallMs() / 500);

  function onHalfBeat(index) {
    const fullSecond = index % 2 === 0;
    for (let i = 0; i < beatRings.length; i++) {
      const r = beatRings[i];
      if (r.secondOnly && !fullSecond) continue;
      r.target += r.step;
    }
    if (fullSecond) state.beatPulse = 1;
  }

  function startBlink(seq, t) {
    state.blink = { active: true, seq: seq, idx: 0, segStart: t, from: state.blinkClose };
  }

  beatRings[0].obj = tickGroup;
  beatRings[1].obj = arcGroup;
  beatRings[2].obj = overlay;
  beatRings[3].obj = hudTicks;
  beatRings[4].obj = hudArcs;

  let hintDismissed = false;
  function dismissHint() {
    if (hintDismissed) return;
    hintDismissed = true;
    hint.classList.add('is-hidden');
  }

  let clockStart = performance.now();
  const nowSec = () => (performance.now() - clockStart) / 1000;

  function setPointer(e) {
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
  window.addEventListener('pointerdown', function (e) {
    setPointer(e);
    if (e.button !== 0) return;
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
    if (state.booted) dismissHint();
  });
  let pressedEl = null;
  let pressedEar = null, pressedEye = false;
  function releasePointer(e) {
    if (pressedLabel && pressedLabel === hoveredLabel) labelClicked(pressedLabel);
    pressedLabel = null;
    if (pressedEar && e && state.overEar === pressedEar) earPoke(pressedEar, nowSec());
    pressedEar = null;
    if (pressedEye && e && state.overEye && !state.firedThisPress) eyePoke(nowSec());
    pressedEye = false;
    if (pressedEl) {
      const over = e && e.target && e.target.closest ? e.target.closest('[data-click]') : null;
      if (over === pressedEl) pfClick(pressedEl);
      pressedEl = null;
    }
    state.pointerDown = false;
    stopFiring();
  }
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
  function eyePoke(t) {
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
      return;
    }
    const type = pickFrom(EYE_REACTIONS, lastEyeReaction);
    lastEyeReaction = type;
    state.react = { type: type, start: t, dur: EYE_REACT_DUR[type], done: {} };
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
      hudArcs.rotation.z += 0.6;
    } else if (type === 'happy') {
      // Happy squint from below, a little hop, ears wiggle
      ears.forEach(function (ear, i) {
        ear.wiggles = [0, 0.12, 0.24, 0.36].map(function (d, j) { return { at: t + d + i * 0.05, amt: j % 2 ? 4 : -4 }; });
      });
    }
  }
  // Per-frame offsets from the current eye reaction
  const R0 = { yaw: 0, pitch: 0, hop: 0, wide: 0, bottom: 0, pin: false, pix: 0, lean: 0, tilt: 0, dilate: false };
  function eyeReaction(t) {
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
  function earPoke(ear, t) {
    if (!state.booted) return;
    const type = pickFrom(EAR_REACTIONS, ear.lastReaction);
    ear.lastReaction = type;
    const other = ears.find(function (e2) { return e2 !== ear; });
    state.glanceUntil = t + 0.7;
    state.glanceYaw = ear.side * 0.55;
    state.glancePitch = 0.5;
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
      state.glanceUntil = t + 0.9;
    } else if (type === 'shake') {
      // Shakes it off like a cat: both ears flutter and the head gives a quick shake
      ears.forEach(function (e2, i) {
        e2.wiggles = [0, 0.06, 0.12, 0.18, 0.24, 0.3].map(function (d, j) { return { at: t + d + i * 0.03, amt: j % 2 ? 7 : -7 }; });
      });
      state.shakeUntil = t + 0.4;
      state.glanceUntil = 0;
    }
  }

  // ABOUT ME opens the About page and becomes BACK; BACK returns to the hero.
  // PORTFOLIO still just announces the click ('hero:navigate') until that page exists.
  function labelClicked(lab) {
    const t = nowSec();
    if (lab === SIDE_LABELS[0]) {
      if (page.target === 'hero') openAbout(); else closeAbout();
      return;
    }
    if (page.target === 'hero') openPortfolio(); else closeAbout();
  }

  // ---------- Pages: About sits to the left of the hero ----------
  const page = { target: 'hero', p: 0, from: 0, to: 0, start: -10, moving: false, pushed: false, decoded: false, jag: new Array(64).fill(0) };
  const PAGE_DUR = 1.15;
  function goPage(name) {
    if (!state.booted || page.target === name) return;
    const t = nowSec();
    page.target = name;
    page.from = page.p;
    page.to = name === 'about' ? 1 : name === 'portfolio' ? -1 : 0;
    page.start = t;
    page.moving = true;
    // A fresh tear pattern each time: each row's edge sits 0 to 2 squares ahead, varying smoothly
    let v = Math.random() * 3;
    for (let j = 0; j < 64; j++) { v = clamp(v + (Math.random() - 0.5) * 1.6, 0, 2.99); page.jag[j] = Math.floor(v); }
    if (name !== 'about') page.decoded = false;
    // The word on the visible arc decodes into its new meaning mid-flight
    if (name === 'about') setLabelText(SIDE_LABELS[0], 'BACK', t + 0.3);
    else if (name === 'portfolio') setLabelText(SIDE_LABELS[1], 'BACK', t + 0.3);
    else {
      if (SIDE_LABELS[0].text !== 'ABOUT ME') setLabelText(SIDE_LABELS[0], 'ABOUT ME', t + 0.3);
      if (SIDE_LABELS[1].text !== 'PORTFOLIO') setLabelText(SIDE_LABELS[1], 'PORTFOLIO', t + 0.3);
    }
    // Spin the clock rings up like gears while the eye travels
    const spin = page.to > page.from ? 1 : -1;
    beatRings.forEach(function (r) { r.target += spin * Math.sign(r.step) * Math.PI / 2; });
    aboutEl.setAttribute('aria-hidden', name === 'about' ? 'false' : 'true');
    pfEl.setAttribute('aria-hidden', name === 'portfolio' ? 'false' : 'true');
    if (name === 'about') photoStart = t;
    if (name === 'about') aboutEl.scrollTop = 0;
  }
  function openAbout() {
    goPage('about');
    try { history.pushState({ page: 'about' }, '', '#about'); page.pushed = true; } catch (err) { page.pushed = false; }
  }
  function openPortfolio() {
    goPage('portfolio');
    try { history.pushState({ page: 'portfolio' }, '', '#portfolio'); page.pushed = true; } catch (err) { page.pushed = false; }
  }
  function closeAbout() {
    if (page.pushed) { page.pushed = false; try { history.back(); return; } catch (err) { /* fall through */ } }
    try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (err) { /* optional */ }
    goPage('hero');
  }
  window.addEventListener('popstate', function () {
    if (location.hash === '#about') goPage('about');
    else if (location.hash === '#portfolio') goPage('portfolio');
    else { page.pushed = false; goPage('hero'); }
  });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && page.target !== 'hero') closeAbout();
  });

  // ---------- Portfolio page: a looping vertical carousel, details that decode, and a position track ----------
  // Newest work first. Covers are the top of each design at full width.
  const PROJECTS = [
    { title: "JOE MCDAVID", role: "Landing page design", year: "", desc: "A portfolio for a landscape and travel photographer. Oversized editorial type, a strict black and white grid, and plenty of room for the photos to breathe.", tags: ["Figma", "Editorial", "Photography"], cover: 'assets/images/project-joe-mcdavid.jpg' },
    { title: "MAPALO", role: "Landing page design", year: "", desc: "An AI memory product with a hand-drawn identity. Chalky scribble illustrations and a serif wordmark make a technical product feel calm and human.", tags: ["Figma", "Illustration", "AI Product"], cover: 'assets/images/project-mapalo.jpg' },
    { title: "LUMNOS", role: "Landing page design", year: "", desc: "A design studio site built on heavy condensed type and a single gold accent, with a scattered gallery of recent work that rewards scrolling.", tags: ["Figma", "Studio", "Typography"], cover: 'assets/images/project-lumnos.jpg' },
    { title: "GENRETRADE", role: "Landing page design", year: "", desc: "A waitlist page for a platform that turns music genres into tradable assets. Vinyl photography, a lime accent, and an expandable feature list.", tags: ["Figma", "Fintech", "Waitlist"], cover: 'assets/images/project-genretrade.jpg' },
    { title: "INDESIGN", role: "Landing page design", year: "", desc: "A bridal fashion storefront with elegant serif headlines, arched photo crops, and small image pills set right into the copy.", tags: ["Figma", "E-commerce", "Fashion"], cover: 'assets/images/project-indesign.jpg' },
    { title: "ACURA", role: "Landing page design", year: "", desc: "A Dutch real estate site with a search bar over the hero, handpicked listings, a category grid, and an FAQ.", tags: ["Figma", "Real Estate", "Search"], cover: 'assets/images/project-acura.jpg' },
    { title: "JOSHUA EDWARDS", role: "Client website", year: "", desc: "A personal site for a math tutor: his name set huge, one strong photo, reviews from students, and oversized contact links that are impossible to miss.", tags: ["Figma", "Client", "Personal Brand"], cover: 'assets/images/project-joshua-edwards.jpg' },
    { title: "COLLISEAM", role: "Lead Designer and Project Manager", year: "2024\u20132025", desc: "A community platform for junior developers and designers. I led a team of 7 and built the full design system in Figma, from the landing page to the app.", tags: ["Figma", "Design System", "Team of 7"], cover: 'assets/images/project-colliseam.jpg' }
  ];
  const PN = PROJECTS.length;
  const pfCarousel = document.getElementById('pfCarousel');
  const pfInner = pfEl.querySelector('.pf-inner');
  const pfTitle = document.getElementById('pfTitle'), pfTitleCtx = pfTitle.getContext('2d');
  const pfTrack = document.getElementById('pfTrack'), pfTrackCv = document.getElementById('pfTrackCv'), pfTrackCtx = pfTrackCv.getContext('2d');
  const car = { pos: 0, vel: 0, target: 0, cur: -1, acc: 0, last: 0, h0: 200, w0: 320, titleScr: null, titleText: '' };
  const pfCards = PROJECTS.map(function (pr, k) {
    const el = document.createElement('div');
    el.className = 'pf-card';
    el.dataset.click = 'card';
    el.dataset.k = k;
    el.setAttribute('aria-hidden', 'true');
    const cv = document.createElement('canvas');
    el.appendChild(cv);
    pfCarousel.appendChild(el);
    return { el: el, cv: cv };
  });
  // Card art: the project's cover image cropped to fill the card, with red corner brackets
  PROJECTS.forEach(function (pr, k) {
    pr.img = new Image();
    pr.img.onload = function () { if (car.w0) drawCardArt(k); };
    pr.img.src = pr.cover;
  });
  function drawCardArt(k) {
    const c = pfCards[k], dpr = grid.dpr, pr = PROJECTS[k];
    const W = Math.round(car.w0 * dpr), H = Math.round(car.h0 * dpr);
    c.art = c.art || document.createElement('canvas');
    c.art.width = W; c.art.height = H;
    c.shown = -1;   // force the visible canvas to refresh
    const g = c.art.getContext('2d');
    g.fillStyle = '#0d1115'; g.fillRect(0, 0, W, H);
    if (pr.img && pr.img.complete && pr.img.naturalWidth) {
      // Always show the design's full width (like a browser window), trimming only below the fold
      const ia = pr.img.naturalWidth / pr.img.naturalHeight, ra = W / H;
      let sx = 0, sy = 0, sw = pr.img.naturalWidth, sh = pr.img.naturalHeight;
      if (ra >= ia) { sh = sw / ra; } else { sw = sh * ra; sx = (pr.img.naturalWidth - sw) / 2; }
      g.imageSmoothingQuality = 'high';
      g.drawImage(pr.img, sx, sy, sw, sh, 0, 0, W, H);
    }
    const b = Math.max(2, Math.round(2.5 * dpr)), L = b * 6;
    g.fillStyle = '#ff0a1e';
    g.fillRect(0, 0, L, b); g.fillRect(0, 0, b, L);
    g.fillRect(W - L, 0, L, b); g.fillRect(W - b, 0, b, L);
    g.fillRect(0, H - b, L, b); g.fillRect(0, H - L, b, L);
    g.fillRect(W - L, H - b, L, b); g.fillRect(W - b, H - L, b, L);
  }
  // Copy a card's art to its visible canvas at a given pixel size (1 = full detail)
  const CARD_PIX = [26, 18, 12, 8, 5, 3];
  function showCard(c, px) {
    if (c.shown === px || !c.art) return;
    c.shown = px;
    const W = c.art.width, H = c.art.height;
    const w = Math.max(1, Math.ceil(W / px)), h = Math.max(1, Math.ceil(H / px));
    c.cv.width = w; c.cv.height = h;
    c.cv.style.imageRendering = px > 1 ? 'pixelated' : 'auto';
    const g = c.cv.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.drawImage(c.art, 0, 0, w, h);
  }
  layoutPortfolio = function () {
    const w = stage.clientWidth || window.innerWidth;
    const ppuCss = labelGeo.ppu / grid.dpr;
    const left = labelGeo.cx0 / grid.dpr + (-EYE_PARK_X * (camBase.z - LABEL_Z) / camBase.z + 2.75) * ppuCss;
    const narrow = w - left < w * 0.58;
    pfEl.classList.toggle('is-narrow', narrow);
    pfEl.style.setProperty('--pf-left', Math.max(0, left) + 'px');
    // Card size: the centre card takes about a quarter of the carousel's height
    const cw = pfCarousel.clientWidth || 400, ch = pfCarousel.clientHeight || 600;
    // Wider cards on wide carousels, and the centre card grows with the screen
    const ar = cw / ch > 1.15 ? 1.78 : 1.6;
    car.h0 = Math.max(110, Math.min(ch * 0.46, cw * 0.94 / ar));
    car.w0 = car.h0 * ar;
    pfCards.forEach(function (c, k) {
      c.el.style.width = car.w0 + 'px';
      c.el.style.height = car.h0 + 'px';
      drawCardArt(k);
    });
    car.titleText = '';   // force the title to redraw at the new size
  };
  const interpAt = function (a, arr) {
    const i = Math.min(arr.length - 2, Math.floor(a));
    return lerp(arr[i], arr[Math.min(arr.length - 1, i + 1)], Math.min(1, a - i));
  };
  function pfEnter(t) {
    positionCards();
    pfCards.forEach(function (c) { showCard(c, 1); });
    const cur = ((Math.round(car.pos) % PN) + PN) % PN;
    car.enterAt = 0;
    car.cur = cur;
    pfSetDetails(cur, t);
    car.titleScr = null;
    drawTrack(t);
    drawPfTitle(t);
  }
  function pfSetDetails(k, t) {
    const pr = PROJECTS[k];
    const n = (k + 1 < 10 ? '0' : '') + (k + 1), tot = (PN < 10 ? '0' : '') + PN;
    document.getElementById('pfCount').innerHTML = '<b>' + n + '</b> / ' + tot;
    document.getElementById('pfTitleText').textContent = pr.title;
    document.getElementById('pfMeta').textContent = pr.year ? pr.role + ', ' + pr.year : pr.role;
    document.getElementById('pfDesc').textContent = pr.desc;
    document.getElementById('pfTags').innerHTML = pr.tags.map(function (tg) { return '<span>' + tg + '</span>'; }).join('');
    document.getElementById('pfNote').textContent = '';
    car.titleScr = makeScramble(pr.title.length, Math.max(t, car.enterAt || 0));
    car.titleText = pr.title;
    pfCards.forEach(function (c, i) { c.el.classList.toggle('is-current', i === k); });
  }
  function drawPfTitle(t) {
    if (!car.titleText) return;
    const vw = stage.clientWidth || window.innerWidth;
    const dpr = grid.dpr, pxD = Math.max(2, Math.round((vw >= 1700 ? 6 : vw >= 1300 ? 5 : 4) * dpr));
    const W = pixelTextWidth(car.titleText, pxD), H = 7 * pxD;
    if (pfTitle.width !== W || pfTitle.height !== H) {
      pfTitle.width = W; pfTitle.height = H;
      pfTitle.style.width = (W / dpr) + 'px'; pfTitle.style.height = (H / dpr) + 'px';
    }
    pfTitleCtx.clearRect(0, 0, W, H);
    drawPixelText(pfTitleCtx, car.titleText, 0, 0, pxD, function () { return LABEL_COLOR; }, car.titleScr, t);
  }
  function pfStep(dir) {
    if (page.target !== 'portfolio') return;
    car.target += dir;
  }
  function pfClick(el) {
    if (el.dataset.click === 'track') {
      const k = trackIndexAt(state.clientY);
      let o = k - car.target;
      o = ((o % PN) + PN) % PN; if (o > PN / 2) o -= PN;
      car.target += o;
      return;
    }
    if (el.dataset.click === 'card') {
      const k = +el.dataset.k;
      let o = k - car.target;
      o = ((o % PN) + PN) % PN; if (o > PN / 2) o -= PN;
      if (o !== 0) { car.target += o; return; }
    }
    // Centre card or the button: case studies come later
    const t = nowSec();
    car.titleScr = makeScramble(car.titleText.length, t);
    document.getElementById('pfNote').textContent = 'CASE STUDY COMING SOON';
  }
  // Scroll wheel / trackpad moves one project per notch, with a short cooldown so trackpads don't race
  window.addEventListener('wheel', function (e) {
    if (page.target !== 'portfolio') return;
    e.preventDefault();
    car.acc += e.deltaY;
    const now = performance.now();
    if (Math.abs(car.acc) > 40 && now - car.last > 220) {
      pfStep(Math.sign(car.acc));
      car.acc = 0;
      car.last = now;
    }
  }, { passive: false });
  window.addEventListener('keydown', function (e) {
    if (page.target !== 'portfolio') return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') { pfStep(1); e.preventDefault(); }
    if (e.key === 'ArrowUp' || e.key === 'PageUp') { pfStep(-1); e.preventDefault(); }
  });
  function updatePortfolio(t, dt) {
    const vis = page.p < -0.001;
    pfEl.style.visibility = vis ? 'visible' : 'hidden';
    if (!vis) return;
    // Rides the tear the same way, mirrored
    pfEl.style.transform = 'translateX(' + ((1 + page.p) * (stage.clientWidth || window.innerWidth)).toFixed(1) + 'px)';
    // Carousel spring
    const h = dt / 2;
    for (let s2 = 0; s2 < 2; s2++) {
      car.vel += ((car.target - car.pos) * 140 - car.vel * 22) * h;
      car.pos += car.vel * h;
    }
    positionCards();
    pfCards.forEach(function (c) { showCard(c, 1); });
    const cur = ((Math.round(car.pos) % PN) + PN) % PN;
    if (cur !== car.cur) { car.cur = cur; pfSetDetails(cur, t); }
    drawTrack(t);
    drawPfTitle(t);
  }

  // ---- Position track: a HUD-style gauge (numbered ticks, a scanning highlight, and a red pointer) ----
  const trackState = { lastFrac: null, glitchUntil: 0 };
  function trackY(k, top, span) { return top + (k + 0.5) / PN * span; }
  function drawTrack(t) {
    const dpr = grid.dpr;
    const W = Math.round(pfTrackCv.clientWidth * dpr), H = Math.round(pfTrackCv.clientHeight * dpr);
    if (!W || !H) return;
    if (pfTrackCv.width !== W) pfTrackCv.width = W;
    if (pfTrackCv.height !== H) pfTrackCv.height = H;
    const g = pfTrackCtx;
    g.clearRect(0, 0, W, H);
    const u = Math.max(1, Math.round(dpr));            // one hairline
    const px = Math.max(1, Math.round(2 * dpr));       // pixel-font size
    const top = 4 * px, span = H - 8 * px;
    const railX = Math.round(W * 0.5);
    const frac = ((car.pos % PN) + PN) % PN;
    // When the loop wraps the pointer jumps; make the jump a glitch instead of a slide
    if (trackState.lastFrac !== null && Math.abs(frac - trackState.lastFrac) > PN / 2) trackState.glitchUntil = t + 0.2;
    trackState.lastFrac = frac;
    const my = top + ((frac + 0.5) % PN) / PN * span;
    const reach = span / PN * 0.9;
    // Rail
    g.fillStyle = 'rgba(201,212,222,0.16)';
    g.fillRect(railX, top - 2 * px, u, span + 4 * px);
    // Ticks: a major tick at each project, three minor ticks between, brightening near the pointer
    for (let i = -2; i < PN * 4 + 2; i++) {
      const y = top + (i / 4 + 0.5) / PN * span;
      if (y < top - px || y > top + span + px) continue;
      const major = ((i % 4) + 4) % 4 === 0;
      const b = clamp(1 - Math.abs(y - my) / reach, 0, 1);
      g.fillStyle = 'rgba(201,212,222,' + ((major ? 0.35 : 0.14) + (major ? 0.65 : 0.5) * b).toFixed(3) + ')';
      const len = (major ? 5 : 2.5) * px + Math.round(b * 2 * px);
      g.fillRect(railX - len, Math.round(y), len, u);
    }
    // Project numbers on the right of the rail
    for (let k = 0; k < PN; k++) {
      const y = Math.round(trackY(k, top, span));
      const b = clamp(1 - Math.abs(y - my) / reach, 0, 1);
      const label = (k + 1 < 10 ? '0' : '') + (k + 1);
      g.globalAlpha = k === car.cur ? 1 : 0.3 + 0.7 * b;
      drawPixelText(g, label, railX + 3 * px, y - Math.round(3.5 * px), px, function () {
        return k === car.cur ? '#ff0a1e' : LABEL_COLOR;
      });
    }
    g.globalAlpha = 1;
    // Pointer: a red pixel arrow on the left, and a hairline across the rail
    const glitch = t < trackState.glitchUntil && !reduceMotion;
    const jy = Math.round(my + (glitch ? (Math.random() - 0.5) * 6 * px : 0));
    if (!glitch || Math.random() > 0.3) {
      g.fillStyle = '#ff0a1e';
      const ax = railX - 9 * px;
      for (let r = 0; r < 4; r++) g.fillRect(ax + r * px, jy - (3 - r) * px, px, (3 - r) * 2 * px + px);
      g.fillRect(ax + 4 * px, jy, railX - ax - 4 * px + 2 * px, u);
    }
  }
  function trackIndexAt(clientY) {
    const r = pfTrackCv.getBoundingClientRect();
    const px = Math.max(1, Math.round(2 * grid.dpr)) / grid.dpr;
    const top = 4 * px, span = r.height - 8 * px;
    return clamp(Math.floor(((clientY - r.top - top) / span) * PN), 0, PN - 1);
  }
  function positionCards() {
    for (let k = 0; k < PN; k++) {
      let o = k - car.pos;
      o = ((o % PN) + PN) % PN; if (o > PN / 2) o -= PN;
      const a = Math.abs(o);
      const sc = interpAt(a, [1, 0.76, 0.58, 0.44]);
      const gy = interpAt(a, [0, 0.93, 1.62, 2.15]) * car.h0 * Math.sign(o);
      const op = interpAt(a, [1, 0.55, 0.28, 0]);
      const el = pfCards[k].el;
      el.style.transform = 'translate(-50%, -50%) translateY(' + gy.toFixed(1) + 'px) scale(' + sc.toFixed(3) + ')';
      el.style.opacity = op.toFixed(3);
      el.style.zIndex = String(10 - Math.round(a * 2));
      el.style.pointerEvents = op < 0.1 ? 'none' : '';
    }
  }
  layoutPortfolio();

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
  // Kept for the layout hook; the photo now renders on the grid canvas
  var drawAboutPhoto = function () {};
  function photoTilesFor(cols, rows, C) {
    if (photo.tiles && photo.cols === cols && photo.rows === rows && photo.C === C) return;
    photo.cols = cols; photo.rows = rows; photo.C = C;
    photo.tiles = [];
    for (let k = 0; k < cols * rows; k++) photo.tiles.push({ state: 0, dieAt: 0 });
  }
  function photoHit(px, py, t) {
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
  function drawPhotoOnGrid(ctx, t) {
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
  const aboutInner = aboutEl.querySelector('.about-inner');

  function updateAbout(t) {
    const vis = page.p > 0.001;
    aboutEl.style.visibility = vis ? 'visible' : 'hidden';
    if (!vis) return;
    // The page rides the tear: it slides in behind the sweep and slides back out ahead of it,
    // always keeping the same gap to the eye, so the eye never passes behind the text
    const W = stage.clientWidth || window.innerWidth;
    aboutEl.style.transform = 'translateX(' + (page.p * W - W).toFixed(1) + 'px)';
    drawHeadings(t);
  }
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);
  renderer.domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) state.hasPointer = false; });
  window.addEventListener('blur', function () { state.hasPointer = false; releasePointer(); });

  // ---------- Gaze from cursor ----------
  let LOOK_PLANE_Z = 3.2; // updated every frame from the camera distance
  const raycaster = new THREE.Raycaster();
  const lookPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -LOOK_PLANE_Z);
  const hit = new THREE.Vector3();
  const MAX_YAW = 1.4, MAX_PITCH = 0.8;
  const EYE_NO_FIRE_R = 1.2;   // world units: the eyeball and its lids, plus a little margin
  const eyeC = new THREE.Vector3(), eyeE = new THREE.Vector3();

  function aimAtCursor() {
    raycaster.setFromCamera(state.mouse, camera);
    if (raycaster.ray.intersectPlane(lookPlane, hit)) {
      const dx = hit.x - rig.position.x;
      const dy = hit.y - rig.position.y;
      const dz = hit.z - rig.position.z;
      state.tYaw = clamp(Math.atan2(dx, dz), -MAX_YAW, MAX_YAW);
      state.tPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -MAX_PITCH, MAX_PITCH);
    }
  }

  function idleBehaviour(t) {
    if (state.sweep) {
      const sw = state.sweep;
      const p = (t - sw.start) / sw.dur;
      if (p >= 1) {
        state.sweep = null;
      } else {
        const e = 0.5 - 0.5 * Math.cos(p * Math.PI);
        state.tYaw = lerp(-0.62, 0.62, e) * sw.dir;
        state.tPitch = 0.06 * Math.sin(p * TAU);
      }
      return;
    }
    if (t < state.idleNext) return;
    const r = Math.random();
    const slow = reduceMotion ? 2 : 1;
    if (r < 0.16 && !reduceMotion) {
      state.sweep = { start: t, dur: 2.4, dir: Math.random() < 0.5 ? 1 : -1 };
      state.idleNext = t + 2.9;
    } else if (r < 0.34) {
      state.tYaw = 0; state.tPitch = 0;
      state.idleNext = t + (1.4 + Math.random() * 1.6) * slow;
    } else {
      state.tYaw = (Math.random() * 2 - 1) * 0.6;
      state.tPitch = (Math.random() * 2 - 1) * 0.38;
      state.idleNext = t + (0.7 + Math.random() * 1.8) * slow;
    }
  }

  function updateBlink(t, dt) {
    const b = state.blink;
    if (!b.active) {
      state.blinkClose += (0 - state.blinkClose) * Math.min(1, dt * 18);
      if (state.firing) {
        state.nextBlink = Math.max(state.nextBlink, t + 0.3);
      } else if (t >= state.nextBlink) {
        const r = Math.random();
        startBlink(r < 0.18 ? BLINK.double : r < 0.28 ? BLINK.shutterCheck : BLINK.single, t);
      }
      return;
    }
    let seg = b.seq[b.idx];
    while (seg && t - b.segStart >= seg.dur) {
      b.segStart += seg.dur;
      b.from = seg.to;
      b.idx++;
      seg = b.seq[b.idx];
    }
    if (!seg) {
      b.active = false;
      state.blinkClose = b.from;
      state.nextBlink = t + 2.2 + Math.random() * 4.5;
      state.glitchUntil = t + 0.24;
      state.aperture = 0.0; // snap shut, then refocus
      if (!state.booted) state.booted = true;
      return;
    }
    const p = (t - b.segStart) / seg.dur;
    state.blinkClose = b.from + (seg.to - b.from) * EASE[seg.ease || 'linear'](p);
  }

  // ---------- Frame loop ----------
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
  function renderFrame(t) {
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

  let last = 0;
  function frame() {
    requestAnimationFrame(frame);
    const t = nowSec();
    const dt = Math.min(1 / 30, Math.max(0.0001, t - last));
    last = t;

    // Mode
    camera.position.copy(camBase);
    camera.updateMatrixWorld();

    // Page transition progress, and the eye travelling to (or from) its parking spot
    if (page.moving) {
      const k01 = clamp((t - page.start) / PAGE_DUR, 0, 1);
      const e01 = k01 < 0.5 ? 4 * k01 * k01 * k01 : 1 - Math.pow(-2 * k01 + 2, 3) / 2;
      page.p = page.from + (page.to - page.from) * e01;
      if (k01 >= 1) { page.moving = false; page.endAt = t; }
    }
    {
      // The eye travels in step with the page (right edge for About, left edge for Portfolio),
      // so it stays the same distance from the sliding content the whole way
      const target = page.p * EYE_PARK_X;
      const rh = dt / 2;
      for (let s2 = 0; s2 < 2; s2++) {
        state.vRigX += ((target - state.rigX) * 170 - state.vRigX * 22) * rh;
        state.rigX += state.vRigX * rh;
      }
      rig.position.x = state.rigX;
      // The rings sit deeper than the eye, so perspective would slide them toward the centre when the eye
      // moves sideways. Scale their offset by depth so they stay perfectly centred on the eye on screen.
      const dz = camBase.z;
      hud.position.x = state.rigX * (dz - hud.position.z) / dz;
      aura.position.x = state.rigX * (dz - aura.position.z) / dz;
      // While it travels the eye braces: ears fold back, lids narrow
      state.travel += (clamp(Math.abs(state.vRigX) / 3, 0, 1) - state.travel) * Math.min(1, dt * 10);
    }
    // Keep the aim plane at a fixed share of the camera distance, so the eye can reach
    // every edge of the screen on wide monitors and tall phones alike
    LOOK_PLANE_Z = camBase.z * 0.29;
    lookPlane.constant = -LOOK_PLANE_Z;

    // No firing at the eye itself: holding the button over the eyeball does nothing,
    // dragging out past its edge starts the laser, dragging back in powers it down
    {
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
      state.overEye = state.hasPointer && state.booted && inside && !state.overEar && !state.firing;
      const wantFire = state.pointerDown && state.booted && !inside;
      if (wantFire && !state.firing) startFiring();
      else if (!wantFire && state.firing) stopFiring();
    }
    const tracking = ((state.hasPointer && t - state.lastMove < 4) || state.firing) && state.booted;
    state.anger += ((state.firing ? 1 : 0) - state.anger) * Math.min(1, dt * (state.firing ? 14 : 4));
    const anger = state.anger;
    if (tracking) {
      if (state.mode !== 'track') { state.mode = 'track'; state.sweep = null; earsPerk(); }
      aimAtCursor();
      if (t < state.glanceUntil) { state.tYaw = state.glanceYaw; state.tPitch = state.glancePitch; }
    } else {
      if (state.mode !== 'idle') { state.mode = 'idle'; state.idleNext = t + 0.5; }
      if (state.booted) idleBehaviour(t);
    }

    // Servo spring, slightly underdamped so it overshoots and settles like a motor
    const k = state.firing ? 150 : tracking ? 95 : state.sweep ? 60 : 170;
    const c = state.firing ? 19 : tracking ? 14 : state.sweep ? 15 : 20;
    const h = dt / 2;
    for (let i = 0; i < 2; i++) {
      state.vyaw += ((state.tYaw - state.yaw) * k - state.vyaw * c) * h;
      state.yaw += state.vyaw * h;
      state.vpitch += ((state.tPitch - state.pitch) * k - state.vpitch * c) * h;
      state.pitch += state.vpitch * h;
    }
    // Angular acceleration of the eye, smoothed, drives the ears' secondary motion
    const rawAccYaw = clamp((state.vyaw - state.prevVyaw) / dt, -80, 80);
    const rawAccPitch = clamp((state.vpitch - state.prevVpitch) / dt, -80, 80);
    state.prevVyaw = state.vyaw;
    state.prevVpitch = state.vpitch;
    const accK = Math.min(1, dt * 30);
    state.accYaw += (rawAccYaw - state.accYaw) * accK;
    state.accPitch += (rawAccPitch - state.accPitch) * accK;

    // Tiny servo hunting while holding position
    if (!reduceMotion) {
      if (t > state.jitNext) {
        state.jitTY = (Math.random() * 2 - 1) * 0.0035;
        state.jitTP = (Math.random() * 2 - 1) * 0.0035;
        state.jitNext = t + 0.08 + Math.random() * 0.22;
      }
      const jk = Math.min(1, dt * 25);
      state.jitY += (state.jitTY - state.jitY) * jk;
      state.jitP += (state.jitTP - state.jitP) * jk;
    }

    const yaw = state.yaw + state.jitY;
    const pitch = state.pitch + state.jitP;
    const react = eyeReaction(t);
    state.reactPix = react.pix;
    // Poke reactions: recoil back into the screen, an annoyed head shake
    {
      const rh = dt / 2;
      for (let s2 = 0; s2 < 2; s2++) {
        state.vRecoil += (-state.recoil * 220 - state.vRecoil * 16) * rh;
        state.recoil += state.vRecoil * rh;
      }
      rig.position.z = state.recoil + react.lean;
      state.annoy = Math.max(0, state.annoy - dt / 1.4);
    }
    const shake = t < state.shakeUntil && !reduceMotion ? Math.sin(t * 34) * 0.14 * Math.min(1, (state.shakeUntil - t) / 0.55) : 0;
    yawGroup.rotation.y = yaw + shake + react.yaw;
    pitchGroup.rotation.x = -(pitch + react.pitch);

    // Blink and squint
    updateBlink(t, dt);
    const glare = t < (state.glareUntil || 0) ? 0.45 : 0;
    const squintTarget = Math.min(0.62, lerp(state.sweep ? 0.2 : tracking ? 0.0 : 0.06, 0.62, Math.max(anger, state.annoy * 0.8, glare)) + state.travel * 0.25);
    state.squint += (squintTarget - state.squint) * Math.min(1, dt * (state.firing ? 16 : 4));

    const close = state.squint + (1 - state.squint) * state.blinkClose - react.wide;
    const closeBottom = Math.max(close, react.bottom);
    topLid.rotation.x = -LID_OPEN * (1 - close);
    bottomLid.rotation.x = LID_OPEN * (1 - closeBottom);

    // Glow, with a reboot flicker after every blink
    let glowLevel = clamp(1 - state.blinkClose * 0.9, 0, 1) * (0.9 + 0.1 * Math.sin(t * 2.1));
    if (t < state.glitchUntil) {
      if (t > state.glitchNextStep) {
        state.glitchValue = 0.25 + Math.random() * 1.0;
        state.glitchNextStep = t + 0.03;
      }
      glowLevel *= state.glitchValue;
    }
    if (!state.booted) glowLevel *= smoothstep(0.75, 1.3, t);

    irisMat.color.setScalar(0.2 + 0.85 * glowLevel);
    overlayMat.opacity = 0.3 + 0.6 * glowLevel;
    pupilCoreMat.color.copy(RED).multiplyScalar(0.3 + 1.3 * glowLevel).lerp(HOT, state.beam);
    const facing = Math.cos(yaw) * Math.cos(pitch);
    glowMat.opacity = 0.9 * glowLevel * smoothstep(0.35, 1, facing);
    irisLight.intensity = 1.6 * glowLevel + 2.6 * state.beam;
    M.core.emissiveIntensity = 0.3 + 0.35 * glowLevel + 0.35 * state.beatPulse * glowLevel + 0.6 * anger;
    const ledOn = (wallMs() % 1000) < 500 ? 1 : 0.15;
    M.led.color.copy(RED).multiplyScalar(0.25 + 1.0 * ledOn * (0.3 + 0.7 * glowLevel));

    // Aperture: dilates when you are close to the eye, tightens when you are far or it is scanning
    if (tracking) {
      state.apertureTarget = lerp(0.075, 0.02, clamp(state.mouse.length(), 0, 1));
    } else if (state.sweep) {
      state.apertureTarget = 0.015;
    } else {
      state.apertureTarget = 0.045 + 0.015 * Math.sin(t * 0.7);
    }
    state.apertureTarget = lerp(state.apertureTarget, 0.0, anger);
    if (react.pin) state.apertureTarget = 0;
    if (react.dilate) state.apertureTarget = 0.09;
    state.aperture += (state.apertureTarget - state.aperture) * Math.min(1, dt * 7);
    for (let i = 0; i < sectors.length; i++) {
      const s = sectors[i];
      s.position.x = s.userData.dir.x * state.aperture;
      s.position.y = s.userData.dir.y * state.aperture;
    }

    // Clockwork: every ring snaps one notch on the beat, with a small spring bounce
    const hb = Math.floor(wallMs() / 500);
    if (hb !== lastHalfBeat) {
      const from = hb - lastHalfBeat > 4 ? hb - 1 : lastHalfBeat; // skip catch-up after a hidden tab
      for (let i = from + 1; i <= hb; i++) onHalfBeat(i);
      lastHalfBeat = hb;
    }
    const rk = 700, rc = reduceMotion ? 54 : 30, rh = dt / 4;
    for (let i = 0; i < beatRings.length; i++) {
      const r = beatRings[i];
      for (let s = 0; s < 4; s++) {
        r.vel += ((r.target - r.angle) * rk - r.vel * rc) * rh;
        r.angle += r.vel * rh;
      }
      r.obj.rotation.z = r.angle;
    }
    state.beatPulse *= Math.exp(-dt * 5);

    // Ears: random idle twitches (a quick flick back on the hinge)
    if (state.booted && !reduceMotion && t > state.earNext && anger < 0.1) {
      if (Math.random() < 0.25) ears.forEach(function (ear) { earTwitch(ear, 0.8); });
      else earTwitch(ears[Math.random() < 0.5 ? 0 : 1], 1);
      state.earNext = t + 3 + Math.random() * 6;
    }
    // Ear physics: each ear is a damped spring on its hinge, so it can only swing forward and back.
    // Looking up or down rocks both ears together. Turning left or right moves one ear forward
    // and the other back (they sit on opposite sides of the turning axis), so they rock in opposite directions.
    const ek = 260, ec = 8, eh = dt / 2;
    const inertia = reduceMotion ? 0.25 : 0.8;
    // Travel limits keep the ears clear of the lids (tighter while folded back)
    const foldMin = lerp(-0.45, -0.2, anger), foldMax = lerp(0.35, 0.2, anger);
    for (let i = 0; i < ears.length; i++) {
      const ear = ears[i];
      if (ear.wiggles && ear.wiggles.length) {
        ear.wiggles = ear.wiggles.filter(function (w) { if (t >= w.at) { ear.vfold += w.amt; return false; } return true; });
      }
      ear.flat = (ear.flat || 0) + (((t < (ear.flatUntil || 0)) ? 1 : 0) - (ear.flat || 0)) * Math.min(1, dt * 12);
      for (let s = 0; s < 2; s++) {
        const push = (state.accPitch + ear.side * state.accYaw * 0.8) * inertia;
        ear.vfold += (-ear.fold * ek - ear.vfold * ec + push) * eh;
        ear.fold += ear.vfold * eh;
      }
      if (ear.fold < foldMin) { ear.fold = foldMin; if (ear.vfold < 0) ear.vfold *= -0.3; }
      if (ear.fold > foldMax) { ear.fold = foldMax; if (ear.vfold > 0) ear.vfold *= -0.3; }

      // Airplane ears: fold straight back and tremble while firing
      const tremble = reduceMotion ? 0 : Math.sin(t * 42 + ear.side) * 0.02 * anger;
      ear.pivot.rotation.x = EAR_TILT + ear.fold - 0.9 * Math.max(anger, state.travel, state.annoy, ear.flat) + tremble;
    }
    updatePistons();

    // HUD
    const hudIn = smoothstep(0.6, 1.9, t);
    for (let i = 0; i < hudMats.length; i++) hudMats[i].opacity = hudMats[i].userData.base * hudIn;
    arcMat.opacity *= 1 + 0.7 * anger;
    aura.material.opacity = 0.35 * hudIn * (0.6 + 0.4 * glowLevel);
    // Outer brackets swing to face wherever the eye is looking (the cursor, or its idle gaze)
    if (Math.hypot(state.yaw, state.pitch) > 0.04) {
      // The two brackets are mirror images, so aim whichever one is closer (never spin more than 90 degrees)
      let diff = Math.atan2(state.pitch, state.yaw) - state.bracketRot;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (diff > Math.PI / 2) diff -= Math.PI;
      if (diff < -Math.PI / 2) diff += Math.PI;
      const bh = dt / 2;
      for (let s = 0; s < 2; s++) {
        state.bracketVel += (diff * 45 - state.bracketVel * 10) * bh;
        state.bracketRot += state.bracketVel * bh;
        diff -= state.bracketVel * bh;
      }
    } else {
      state.bracketVel *= Math.exp(-dt * 8);
      state.bracketRot += state.bracketVel * dt;
    }
    hudBrackets.rotation.z = state.bracketRot;

    // Hover
    if (!reduceMotion) {
      rig.position.y = Math.sin(t * 0.9) * 0.035 + react.hop;
      rig.rotation.z = Math.sin(t * 0.55) * 0.015 + react.tilt;
    }

    // Where the eye is looking on screen (drives the scan light on the name)
    rig.updateMatrixWorld(true);
    pitchGroup.localToWorld(gazeO.set(0, 0, 0));
    pitchGroup.localToWorld(gazeD.set(0, 0, 1)).sub(gazeO).normalize();
    gazeO.addScaledVector(gazeD, (LOOK_PLANE_Z - gazeO.z) / Math.max(0.05, gazeD.z)).project(camera);
    state.gazeX = (gazeO.x + 1) / 2 * grid.w;
    state.gazeY = (1 - gazeO.y) / 2 * grid.h;

    // Laser: fires along the eye's actual gaze, so it lags a touch behind the cursor like a turret
    state.beam += ((state.firing ? 1 : 0) - state.beam) * Math.min(1, dt * (state.firing ? 30 : 16));
    laser.visible = state.beam > 0.01;
    if (!state.firing) { grid.lastX = null; grid.lastY = null; }
    state.impactX = null;
    state.impactY = null;
    if (laser.visible) {
      rig.updateMatrixWorld(true);
      pitchGroup.localToWorld(beamStart.set(0, 0, 0.655));
      pitchGroup.localToWorld(beamDir.set(0, 0, 1.655)).sub(beamStart).normalize();
      const len = Math.max(0.1, (LOOK_PLANE_Z - beamStart.z) / Math.max(0.05, beamDir.z));
      beamEnd.copy(beamStart).addScaledVector(beamDir, len);
      beamQ.setFromUnitVectors(UP, beamDir);
      const flick = 1 + 0.06 * Math.sin(t * 95) + 0.04 * Math.random();
      const w = state.beam * flick;
      for (let i = 0; i < beams.length; i++) {
        const b = beams[i];
        b.mesh.position.copy(beamStart);
        b.mesh.quaternion.copy(beamQ);
        b.mesh.scale.set(b.r * w, len, b.r * w);
      }
      muzzle.position.copy(beamStart);
      muzzle.scale.setScalar(0.5 * w);
      impactGlow.position.copy(beamEnd);
      impactGlow.scale.setScalar(1.2 * w * (0.9 + 0.2 * Math.random()));
      impactCore.position.copy(beamEnd);
      impactCore.scale.setScalar(0.45 * w * (0.85 + 0.3 * Math.random()));
      if (state.firing && state.beam > 0.4) {
        projV.copy(beamEnd).project(camera);
        igniteTrail((projV.x + 1) / 2 * grid.w, (1 - projV.y) / 2 * grid.h, t);
        state.impactX = (projV.x + 1) / 2 * stage.clientWidth;
        state.impactY = (1 - projV.y) / 2 * stage.clientHeight;
      }
      if (state.firing) {
        sparkAccum += dt * 320;
        while (sparkAccum >= 1) { spawnSpark(); sparkAccum -= 1; }
      }
      if (!reduceMotion) {
        camera.position.x += (Math.random() - 0.5) * 0.03 * state.beam;
        camera.position.y += (Math.random() - 0.5) * 0.03 * state.beam;
      }
    }
    for (let i = 0; i < SPARKS; i++) {
      const i3 = i * 3;
      if (sparkLife[i] > 0) {
        sparkLife[i] -= dt;
        const drag = Math.max(0, 1 - 1.5 * dt);
        sparkVel[i3 + 1] -= 5 * dt;
        sparkVel[i3] *= drag; sparkVel[i3 + 1] *= drag; sparkVel[i3 + 2] *= drag;
        sparkPos[i3] += sparkVel[i3] * dt;
        sparkPos[i3 + 1] += sparkVel[i3 + 1] * dt;
        sparkPos[i3 + 2] += sparkVel[i3 + 2] * dt;
        const f = Math.max(0, sparkLife[i] / sparkMax[i]);
        sparkCol[i3] = f;
        sparkCol[i3 + 1] = 0.3 * f * f;
        sparkCol[i3 + 2] = 0.33 * f * f;
      } else {
        sparkCol[i3] = sparkCol[i3 + 1] = sparkCol[i3 + 2] = 0;
      }
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;

    updateGrid(t, dt);
    updateAbout(t);
    hint.style.visibility = Math.abs(page.p) > 0.01 ? 'hidden' : '';
    updatePortfolio(t, dt);

    renderFrame(t);
  }

  function startScene() {
    clockStart = performance.now();
    last = 0;
    requestAnimationFrame(frame);
  }

  // ---------- Loading screen ----------
  // A dark boot screen on the grid: data squares flicker, a scan line sweeps down, a big pixel counter
  // runs 000 to 100 while a boot log types out in the corner. Then a red tear rips across the middle and
  // the screen splits open top and bottom like an eyelid, right as the eye's own lids open behind it.
  (function runLoader() {
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
  })();
})();
