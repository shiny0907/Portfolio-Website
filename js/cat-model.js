// Jetpack cat models for the Contact page, built the way the eye is: a core glowing in the cat's colour under
// segmented armour plates (so every seam glows), then bolts, vents, power cells, light lines, an LED face, ears,
// jointed legs on thruster boots, a turbine jetpack and a jointed tail. Each rigid part is merged into one mesh
// per material at the end, so five detailed cats stay cheap to draw. Everything here runs at module load, so the
// additive-glow fix in setupLighting picks up the glow materials.
import { srgb } from './core.js';
import { M } from './eye/materials.js';
import { glowTex } from './eye/textures.js';
import { drawPixelText } from './pixel-font.js';

const TAU = Math.PI * 2;
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const boltGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.014, 8);
const rivetGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.008, 6).rotateX(Math.PI / 2);
const glassMat = new THREE.MeshPhysicalMaterial({
  color: srgb(0x9aa6b2), metalness: 0, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08,
  transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.5
});

export function css(hex) { return '#' + hex.toString(16).padStart(6, '0'); }
function canvasTex(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
function add(parent, geo, mat, x, y, z, rx, ry, rz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
  parent.add(m);
  return m;
}
function boxAt(parent, mat, sx, sy, sz, x, y, z, rx, ry, rz) {
  const m = add(parent, unitBox, mat, x, y, z, rx, ry, rz);
  m.scale.set(sx, sy, sz);
  return m;
}
function group(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; }
// Parts that move on their own (head, ears, legs, tail joints, fans, flames, the face) are kept out of their
// parent's merge and merged separately
function live(o) { o.userData.live = true; return o; }
function shape(points) {
  const s = new THREE.Shape();
  points.forEach(function (p, i) { if (i === 0) s.moveTo(p[0], p[1]); else s.lineTo(p[0], p[1]); });
  return s;
}
function extrude(points, depth, bevel) {
  return new THREE.ExtrudeGeometry(shape(points), bevel ? {
    depth: depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 1
  } : { depth: depth, bevelEnabled: false });
}
// A ring torus whose hole looks along x
function ringX(r, tube, seg) { return new THREE.TorusGeometry(r, tube, 5, seg || 24).rotateY(Math.PI / 2); }
// Orient a mesh so its local z points along a direction
const _zAxis = new THREE.Vector3(0, 0, 1);
function alignZ(m, dir) { m.quaternion.setFromUnitVectors(_zAxis, dir.clone().normalize()); return m; }

// ---------- Merging ----------
const _inv = new THREE.Matrix4();
function bake(root) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const buckets = new Map(), dead = [], lives = [];
  (function visit(o) {
    o.children.forEach(function (ch) {
      if (ch.userData.live) { lives.push(ch); return; }
      if (ch.isMesh) {
        dead.push(ch);
        let list = buckets.get(ch.material);
        if (!list) buckets.set(ch.material, list = []);
        list.push([ch.geometry, new THREE.Matrix4().multiplyMatrices(_inv, ch.matrixWorld)]);
      }
      visit(ch);
    });
  })(root);
  dead.forEach(function (m) { if (m.parent) m.parent.remove(m); });
  buckets.forEach(function (list, mat) {
    let n = 0;
    const parts = list.map(function (e) {
      const g = e[0].index ? e[0].toNonIndexed() : e[0].clone();
      g.applyMatrix4(e[1]);
      if (e[1].determinant() < 0) {   // a mirrored part: flip its triangles back the right way round
        ['position', 'normal', 'uv'].forEach(function (name) {
          const a = g.attributes[name];
          if (!a) return;
          const s = a.itemSize;
          for (let v = 0; v < a.count; v += 3) {
            for (let c = 0; c < s; c++) {
              const t = a.array[(v + 1) * s + c];
              a.array[(v + 1) * s + c] = a.array[(v + 2) * s + c];
              a.array[(v + 2) * s + c] = t;
            }
          }
        });
      }
      n += g.attributes.position.count;
      return g;
    });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    parts.forEach(function (g) {
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += g.attributes.position.count;
      g.dispose();
    });
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    bg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    bg.computeBoundingSphere();
    root.add(new THREE.Mesh(bg, mat));
  });
  lives.forEach(function (g) { if (!g.isMesh) bake(g); });
}

// ---------- Points on an ellipsoid whose long axis is x (theta from the nose, phi round from the top) ----------
function ell(R, th, ph, lift) {
  const d = new THREE.Vector3(Math.cos(th), Math.cos(ph) * Math.sin(th), Math.sin(ph) * Math.sin(th));
  const p = new THREE.Vector3(R.x * d.x, R.y * d.y, R.z * d.z).multiplyScalar(1 + (lift || 0));
  const n = new THREE.Vector3(d.x / R.x, d.y / R.y, d.z / R.z).normalize();
  const t = new THREE.Vector3(0, -R.y * Math.sin(ph), R.z * Math.cos(ph));
  t.addScaledVector(n, -t.dot(n)).normalize();
  const b = new THREE.Vector3().crossVectors(t, n);
  return { p: p, n: n, t: t, b: b };
}
const _mx = new THREE.Matrix4(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
// Sit a mesh on the surface: local x round the body, y out of the surface, z along the body
function onSurf(m, f, out, sx, sy, sz) {
  _mx.makeBasis(f.t, f.n, f.b);
  m.quaternion.setFromRotationMatrix(_mx);
  m.position.copy(f.p).addScaledVector(f.n, out);
  if (sx) m.scale.set(sx, sy, sz);
  return m;
}
// A flat decal facing out of the surface, upright and reading left to right from whichever side it's on
function onSurfDecal(m, f, out) {
  const s = f.n.z >= 0 ? -1 : 1;
  _v1.copy(f.b).multiplyScalar(s); _v2.copy(f.t).multiplyScalar(s);
  _mx.makeBasis(_v1, _v2, f.n);
  m.quaternion.setFromRotationMatrix(_mx);
  m.position.copy(f.p).addScaledVector(f.n, out);
  return m;
}
function ellGeo(R, k, ph0, phL, th0, thL) {
  const ws = Math.max(4, Math.ceil(phL * 7)), hs = Math.max(3, Math.ceil(thL * 7));
  return new THREE.SphereGeometry(1, ws, hs, ph0, phL, th0, thL).rotateZ(-Math.PI / 2).scale(R.x * k, R.y * k, R.z * k);
}
// A thin prism over one triangle (a, b, c), facing n: armour facets
function prism(a, b, c, n, depth) {
  const ab = new THREE.Vector3().subVectors(b, a), ac = new THREE.Vector3().subVectors(c, a);
  if (new THREE.Vector3().crossVectors(ab, ac).dot(n) < 0) { const t = b; b = c; c = t; }
  const d = n.clone().multiplyScalar(-depth);
  const a2 = a.clone().add(d), b2 = b.clone().add(d), c2 = c.clone().add(d);
  const tris = [a, b, c, a2, c2, b2];
  [[a, b, a2, b2], [b, c, b2, c2], [c, a, c2, a2]].forEach(function (e) { tris.push(e[0], e[2], e[3], e[0], e[3], e[1]); });
  const pos = new Float32Array(tris.length * 3);
  tris.forEach(function (v, i) { pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(tris.length * 2), 2));
  g.computeVertexNormals();
  return g;
}

// ---------- Textures ----------
// LED face: a dot-matrix screen (15 x 9 LEDs) in the cat's colour, unlit LEDs faintly visible
const EYES = {
  round: ['.##.', '####', '####', '.##.'],
  goggle: ['.###.', '#...#', '#.#.#', '#...#', '.###.'],   // ring eyes with a pupil
  tall: ['.#.', '###', '###', '###', '.#.'],
  happy: ['.##.', '#..#', '#..#'],
  slant: ['#...', '##..', '###.', '####'],     // angry: the inner corners sit low
  cyclops: ['.###.', '#####', '##.##', '#####', '.###.']
};
const HIT_EYE = ['#..', '.#.', '..#', '.#.', '#..'];   // > <
const MOUTH = ['#.#.#', '.#.#.'], HIT_MOUTH = ['.###.', '#...#'];
const FACE_W = 15, FACE_H = 9, LED = 8;
function faceTexture(p, mode) {
  const on = new Set();
  function stamp(rows, x0, y0, mirror) {
    rows.forEach(function (row, y) {
      for (let x = 0; x < row.length; x++) if (row[mirror ? row.length - 1 - x : x] === '#') on.add((x0 + x) + ',' + (y0 + y));
    });
  }
  const eye = mode === 'hit' ? HIT_EYE : EYES[p.eyes];
  const w = eye[0].length, h = eye.length, ey = Math.max(1, Math.round((6 - h) / 2));
  const single = p.eyes === 'cyclops' && mode !== 'hit';
  if (mode === 'blink') {
    const line = ['#'.repeat(w)], ly = ey + (h >> 1);
    if (single) stamp(line, (FACE_W - w) >> 1, ly);
    else { stamp(line, 2, ly); stamp(line, FACE_W - 2 - w, ly); }
  } else if (single) stamp(eye, (FACE_W - w) >> 1, ey);
  else { stamp(eye, 2, ey); stamp(eye, FACE_W - 2 - w, ey, true); }
  stamp(mode === 'hit' ? HIT_MOUTH : MOUTH, 5, 7);
  const cv = document.createElement('canvas');
  cv.width = FACE_W * LED; cv.height = FACE_H * LED;
  const g = cv.getContext('2d');
  g.fillStyle = '#030507';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = css(p.glow);
  for (let y = 0; y < FACE_H; y++) {
    for (let x = 0; x < FACE_W; x++) {
      // Hit: the screen fills with static around the > < face
      const lit = on.has(x + ',' + y);
      if (lit) { g.globalAlpha = 0.4; g.fillRect(x * LED, y * LED, LED, LED); }   // a little bloom round each lit LED
      g.globalAlpha = lit ? 1 : mode === 'hit' && Math.random() < 0.22 ? 0.45 : 0.08;
      g.fillRect(x * LED + 1, y * LED + 1, LED - 2, LED - 2);
    }
  }
  g.globalAlpha = 0.18;
  g.fillStyle = '#000';
  for (let y = 0; y < cv.height; y += 3) g.fillRect(0, y, cv.width, 1);   // scanlines
  return canvasTex(cv);
}
// ID plate: a dark panel with circuit traces, the cat's ID in pixel type and a barcode
function plateTexture(p) {
  const cv = document.createElement('canvas');
  cv.width = 96; cv.height = 40;
  const g = cv.getContext('2d'), col = css(p.glow);
  g.fillStyle = '#0a0d11';
  g.fillRect(0, 0, 96, 40);
  g.fillStyle = '#262c33';
  g.fillRect(0, 0, 96, 2); g.fillRect(0, 38, 96, 2); g.fillRect(0, 0, 2, 40); g.fillRect(94, 0, 2, 40);
  drawPixelText(g, p.id, 6, 6, 2, function () { return col; }, null, 0);
  g.fillStyle = col;
  g.globalAlpha = 0.85;
  g.fillRect(6, 25, 30, 2); g.fillRect(34, 25, 2, 8); g.fillRect(34, 31, 22, 2); g.fillRect(54, 28, 5, 5);
  g.fillRect(6, 31, 16, 2); g.fillRect(20, 31, 2, 5); g.fillRect(18, 33, 5, 4);
  g.fillRect(62, 8, 2, 14); g.fillRect(62, 20, 10, 2); g.fillRect(70, 17, 5, 5);
  g.globalAlpha = 0.6;
  let x = 66;
  [2, 1, 1, 3, 1, 2, 1, 1, 2].forEach(function (wd, k) { if (k % 2 === 0) g.fillRect(x, 27, wd, 8); x += wd + 1; });
  return canvasTex(cv);
}
// Matrix rain for the little screen on the jetpack: columns of falling pixels, scrolled every frame
function rainTexture(p) {
  const cv = document.createElement('canvas');
  cv.width = 32; cv.height = 64;
  const g = cv.getContext('2d'), col = css(p.glow);
  g.fillStyle = '#020304';
  g.fillRect(0, 0, 32, 64);
  g.fillStyle = col;
  for (let c = 0; c < 8; c++) {
    let y = Math.floor(Math.random() * 64);
    for (let s = 0; s < 3; s++) {
      const len = 6 + Math.floor(Math.random() * 12);
      for (let k = 0; k < len; k++) {
        g.globalAlpha = k === len - 1 ? 1 : 0.15 + 0.6 * k / len;
        if (Math.random() < 0.8) g.fillRect(c * 4 + 1, (y + k) % 64, 2, 1);
      }
      y = (y + len + 4 + Math.floor(Math.random() * 10)) % 64;
    }
  }
  const tex = canvasTex(cv);
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 0.5);
  return tex;
}
// Hazard stripes, for TANK's armour
function hazardTexture(p) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 32;
  const g = cv.getContext('2d');
  g.fillStyle = '#121418';
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = css(p.glow);
  for (let x = -32; x < 64; x += 16) {
    g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 8, 32); g.lineTo(x + 40, 0); g.lineTo(x + 32, 0); g.closePath(); g.fill();
  }
  return canvasTex(cv);
}
// The glowing panel inside each ear: bright at the base, fading up
function earPanelTexture(p) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d'), c = new THREE.Color(p.glow);
  const rgb = Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255);
  const grad = g.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0, 'rgba(' + rgb + ',0.9)');
  grad.addColorStop(1, 'rgba(' + rgb + ',0.12)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

// ---------- Flames ----------
// Two crossed glow planes along -x, so the plume trails out of the nozzle at any angle
const plumeGeo = new THREE.PlaneGeometry(1, 1);
function flamePlume(color, opacity) {
  const mat = new THREE.MeshBasicMaterial({
    map: glowTex, color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false
  });
  const g = live(new THREE.Group());
  g.add(new THREE.Mesh(plumeGeo, mat));
  const cross = new THREE.Mesh(plumeGeo, mat);
  cross.rotation.x = Math.PI / 2;
  g.add(cross);
  return g;
}

// ---------- The cats ----------
export const PRESETS = [
  { name: 'SCOUT', id: 'SC-01', body: 'frame', head: 'round', ears: 'pointy', eyes: 'goggle', pack: 'rotor', tail: 'whip', finish: 'armorLight', glow: 0x29e6ff },
  { name: 'TANK', id: 'TK-02', body: 'box', head: 'box', ears: 'folded', eyes: 'cyclops', pack: 'single', tail: 'antenna', finish: 'armor', glow: 0xffa21f },
  { name: 'RACER', id: 'RC-03', body: 'pod', head: 'round', ears: 'tuft', eyes: 'tall', pack: 'wing', tail: 'long', finish: 'chrome', glow: 0xa96bff },
  { name: 'CHONK', id: 'CH-04', body: 'egg', head: 'round', ears: 'round', eyes: 'happy', pack: 'twin', tail: 'stub', finish: 'lid', glow: 0x86ff4a },
  { name: 'ROGUE', id: 'RG-05', body: 'facet', head: 'facet', ears: 'split', eyes: 'slant', pack: 'single', tail: 'segment', finish: 'armor', glow: 0xff4fb8 }
];
const BODY_R = { frame: { x: 0.44, y: 0.3, z: 0.3 }, round: { x: 0.46, y: 0.34, z: 0.34 }, egg: { x: 0.47, y: 0.4, z: 0.42 }, pod: { x: 0.56, y: 0.22, z: 0.22 }, box: { x: 0.43, y: 0.25, z: 0.25 }, facet: { x: 0.5, y: 0.35, z: 0.35 } };
const BANDS = [
  { t0: 0.3, t1: 0.78, n: 6, off: 0, lift: 0 },
  { t0: 0.81, t1: 1.4, n: 8, off: -Math.PI / 8, lift: 0.014 },
  { t0: 1.43, t1: 2.02, n: 10, off: 0, lift: 0.004 },
  { t0: 2.05, t1: 2.55, n: 8, off: -Math.PI / 8, lift: 0.014 },
  { t0: 2.58, t1: 2.92, n: 6, off: 0, lift: 0 }
];
const HEAD_BANDS = [
  { t0: 1.0, t1: 1.6, n: 6, off: 0, lift: 0.012 },
  { t0: 1.63, t1: 2.25, n: 8, off: -Math.PI / 8, lift: 0 },
  { t0: 2.28, t1: 2.8, n: 6, off: 0, lift: 0.012 }
];

export function buildCat(p, root) {
  const cat = new THREE.Group();
  const body = new THREE.Group();   // everything that banks and bobs
  cat.add(body);
  const glowCol = srgb(p.glow);
  const finish = M[p.finish];
  const m = {
    finish: finish,
    alt: p.finish === 'armorLight' || p.finish === 'chrome' ? M.armor : M.armorLight,
    paint: new THREE.MeshStandardMaterial({ color: new THREE.Color(p.glow).multiplyScalar(0.2).convertSRGBToLinear(), metalness: 0.75, roughness: 0.34, envMapIntensity: 1.1 }),
    core: new THREE.MeshStandardMaterial({ color: srgb(0x050607), emissive: glowCol, emissiveIntensity: 1, metalness: 0.2, roughness: 0.6, toneMapped: false }),
    glow: new THREE.MeshBasicMaterial({ color: glowCol, toneMapped: false }),
    dim: new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(0.4), toneMapped: false }),
    tip: new THREE.MeshBasicMaterial({ color: glowCol.clone(), toneMapped: false }),
    throat: new THREE.MeshBasicMaterial({ color: glowCol.clone(), toneMapped: false, side: THREE.DoubleSide })
  };
  function plateMat(i, k) { const s = (i * 3 + k) % 5; return s === 0 ? m.paint : s === 3 ? m.alt : m.finish; }
  const plateTex = plateTexture(p), rainTex = rainTexture(p);
  const plateDecal = new THREE.MeshBasicMaterial({ map: plateTex, toneMapped: false });
  const rainMat = new THREE.MeshBasicMaterial({ map: rainTex, toneMapped: false });
  const R = BODY_R[p.body];

  // ===== Body =====
  // Small parts shared by the body types: a power cell (ring, glowing core, four shutters) and a bolt
  function powerCell(parent, f, out) {
    const cell = group(parent);
    onSurf(cell, f, out);
    add(cell, new THREE.CylinderGeometry(0.062, 0.07, 0.022, 20), m.alt, 0, 0.004, 0);
    add(cell, new THREE.TorusGeometry(0.054, 0.009, 5, 24).rotateX(Math.PI / 2), M.chrome, 0, 0.016, 0);
    add(cell, new THREE.CircleGeometry(0.046, 20).rotateX(-Math.PI / 2), m.glow, 0, 0.0155, 0);
    for (let k = 0; k < 4; k++) add(cell, new THREE.RingGeometry(0.014, 0.042, 5, 1, k * Math.PI / 2 + 0.16, Math.PI / 2 - 0.32).rotateX(-Math.PI / 2), M.sector, 0, 0.018, 0);
    add(cell, new THREE.CircleGeometry(0.01, 10).rotateX(-Math.PI / 2), M.chrome, 0, 0.019, 0);
    return cell;
  }
  function bolt(parent, f, out) { return onSurf(add(parent, boltGeo, M.chrome), f, out); }

  if (p.body === 'box') {
    // TANK: a core block under a grid of armour panels, framed by heavy edge rails
    const H = R, g = 0.022;
    add(body, new THREE.BoxGeometry(2 * H.x - 0.02, 2 * H.y - 0.02, 2 * H.z - 0.02), m.core);
    const pw = (2 * H.x - 4 * g) / 3, ph = (2 * H.y - 3 * g) / 2, pd = (2 * H.z - 3 * g) / 2;
    const cols = [-(pw + g), 0, pw + g];
    [1, -1].forEach(function (s) {
      cols.forEach(function (x, ci) {
        [ph / 2 + g / 2, -ph / 2 - g / 2].forEach(function (y, ri) {
          boxAt(body, plateMat(ci, ri + (s > 0 ? 0 : 2)), pw, ph, 0.03, x, y, s * (H.z + 0.004));
        });
        // top and bottom panels
        [pd / 2 + g / 2, -pd / 2 - g / 2].forEach(function (z, ri) {
          if (s > 0) boxAt(body, plateMat(ci + 1, ri), pw, 0.03, pd, x, H.y + 0.004, z);
          else boxAt(body, M.dark, pw, 0.03, pd, x, -H.y - 0.004, z);
        });
      });
      // front and back panels
      [pd / 2 + g / 2, -pd / 2 - g / 2].forEach(function (z) {
        [ph / 2 + g / 2, -ph / 2 - g / 2].forEach(function (y, ri) {
          boxAt(body, ri === 0 ? m.finish : m.alt, 0.03, ph, pd, s * (H.x + 0.004), y, z);
        });
      });
    });
    // Edge rails
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) {
      boxAt(body, m.alt, 2 * H.x + 0.03, 0.05, 0.05, 0, c[0] * H.y, c[1] * H.z);
      boxAt(body, m.alt, 0.05, 2 * H.y + 0.03, 0.05, c[0] * H.x, 0, c[1] * H.z);
      boxAt(body, m.alt, 0.05, 0.05, 2 * H.z + 0.03, c[0] * H.x, c[1] * H.y, 0);
      [1, -1].forEach(function (e) { add(body, boltGeo, M.chrome, e * (H.x - 0.05), c[0] * (H.y + 0.026), c[1] * (H.z - 0.01)); });
    });
    // Decor on both flanks: ID plate, hazard stripes, vents, a power cell, status light
    const hazard = new THREE.MeshBasicMaterial({ map: hazardTexture(p), toneMapped: false });
    [1, -1].forEach(function (s) {
      const z = s * (H.z + 0.022), ry = s > 0 ? 0 : Math.PI;
      add(body, new THREE.PlaneGeometry(pw * 0.9, ph * 0.62), plateDecal, 0, -(ph / 2 + g / 2), z, 0, ry, 0);
      add(body, new THREE.PlaneGeometry(pw * 0.8, ph * 0.32), hazard, -s * (pw + g), ph / 2 + g / 2 + ph * 0.2, z, 0, ry, 0);
      for (let k = 0; k < 4; k++) boxAt(body, M.dark, pw * 0.7, 0.012, 0.012, s * (pw + g), ph / 2 + g / 2 + 0.05 - k * 0.032, z);
      const cell = group(body, -s * (pw + g), -(ph / 2 + g / 2), z - s * 0.006);
      cell.rotation.x = s * Math.PI / 2;
      powerCell(cell, { p: new THREE.Vector3(), n: new THREE.Vector3(0, 1, 0), t: new THREE.Vector3(1, 0, 0), b: new THREE.Vector3(0, 0, 1) }, 0);
      boxAt(body, m.glow, 0.05, 0.012, 0.006, 0, ph / 2 + g / 2 + 0.04, z);
    });
    // Front grille
    for (let k = 0; k < 5; k++) boxAt(body, M.dark, 0.012, 0.012, pd * 1.6, H.x + 0.024, 0.06 - k * 0.03, 0);
  } else if (p.body === 'facet') {
    // ROGUE: faceted armour, each facet a thin plate with a glowing seam all round it
    const geo = new THREE.IcosahedronGeometry(1, 1).scale(R.x, R.y, R.z);
    add(body, new THREE.IcosahedronGeometry(1, 1).scale(R.x * 0.95, R.y * 0.95, R.z * 0.95), m.core);
    const pos = geo.attributes.position;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cen = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0, k = 0; i < pos.count; i += 3, k++) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      cen.copy(a).add(b).add(c).divideScalar(3);
      n.crossVectors(_v1.subVectors(b, a), _v2.subVectors(c, a)).normalize();
      if (n.dot(cen) < 0) n.negate();
      const sh = function (v, f) { return v.clone().sub(cen).multiplyScalar(f).add(cen).addScaledVector(n, 0.006); };
      add(body, prism(sh(a, 0.86), sh(b, 0.86), sh(c, 0.86), n, 0.03), plateMat(k % 4, k % 3));
      // Some facets carry a raised inner plate, a light or a bolt
      if (k % 4 === 1) add(body, prism(sh(a, 0.45).addScaledVector(n, 0.012), sh(b, 0.45).addScaledVector(n, 0.012), sh(c, 0.45).addScaledVector(n, 0.012), n, 0.014), m.alt);
      else if (k % 7 === 3) add(body, prism(sh(a, 0.22).addScaledVector(n, 0.01), sh(b, 0.22).addScaledVector(n, 0.01), sh(c, 0.22).addScaledVector(n, 0.01), n, 0.01), m.glow);
      else if (k % 4 === 3) alignZ(add(body, rivetGeo, M.chrome, cen.x + n.x * 0.012, cen.y + n.y * 0.012, cen.z + n.z * 0.012), n);
    }
    // Mounting blocks with the ID plate and a power cell on each flank
    [1, -1].forEach(function (s) {
      boxAt(body, M.dark, 0.3, 0.12, 0.03, -0.06, -0.04, s * (R.z * 0.93));
      add(body, new THREE.PlaneGeometry(0.27, 0.105), plateDecal, -0.06, -0.04, s * (R.z * 0.93 + 0.016), 0, s > 0 ? 0 : Math.PI, 0);
      const cell = group(body, 0.22, 0.02, s * (R.z * 0.82));
      cell.rotation.set(s * Math.PI / 2, 0, 0);
      cell.rotation.y = s * 0.5;
      powerCell(cell, { p: new THREE.Vector3(), n: new THREE.Vector3(0, 1, 0), t: new THREE.Vector3(1, 0, 0), b: new THREE.Vector3(0, 0, 1) }, 0);
    });
  } else if (p.body === 'frame') {
    // SCOUT, the recon cat: a light open frame instead of armour. Chrome ribs and rails round a core you can
    // see glowing inside, a nose cone and a tail cap, and a battery slung underneath.
    const RC = { x: R.x * 0.6, y: R.y * 0.62, z: R.z * 0.62 };
    add(body, ellGeo(RC, 1, 0, TAU, 0, Math.PI), m.core);
    add(body, ellGeo(RC, 1.06, 0, TAU, 0, Math.PI), new THREE.MeshBasicMaterial({ color: srgb(p.glow), wireframe: true, transparent: true, opacity: 0.25, toneMapped: false }));
    const ribX = [-0.3, -0.18, -0.06, 0.06, 0.18, 0.3];
    ribX.forEach(function (x, k) {
      const r = R.y * Math.sqrt(Math.max(0.05, 1 - (x / R.x) * (x / R.x)));
      add(body, new THREE.TorusGeometry(r, 0.02, 6, 36).rotateY(Math.PI / 2), k % 2 ? M.chrome : finish, x, 0, 0);
      add(body, new THREE.TorusGeometry(r - 0.028, 0.005, 4, 36).rotateY(Math.PI / 2), m.glow, x, 0, 0);
    });
    // Rails along the body (a thicker spine on top), bolted where they cross the ribs
    [0, 0.95, -0.95, 2.3, -2.3].forEach(function (ph, k) {
      const pts = [];
      for (let q = 0; q <= 10; q++) {
        const x = -R.x * 0.82 + q / 10 * R.x * 1.64, f = Math.sqrt(Math.max(0.05, 1 - (x / R.x) * (x / R.x)));
        pts.push(new THREE.Vector3(x, Math.cos(ph) * R.y * f, Math.sin(ph) * R.z * f));
      }
      add(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, k === 0 ? 0.024 : 0.015, 6, false), k === 0 ? M.chrome : finish);
      ribX.forEach(function (x) { bolt(body, ell(R, Math.acos(x / R.x), ph, 0), 0.012); });
    });
    // Nose cone and tail cap
    add(body, ellGeo(R, 1.0, 0, TAU, 0, 0.55), finish);
    add(body, ringX(R.y * Math.sin(0.55) + 0.004, 0.008, 32), m.glow, R.x * Math.cos(0.55), 0, 0);
    add(body, ellGeo(R, 1.0, 0, TAU, 2.65, Math.PI - 2.65), m.alt);
    [1, -1].forEach(function (s) {
      // Power cell on the nose, ID plate hung on the side rails
      powerCell(body, ell(R, 0.36, s * Math.PI / 2, 0), 0.004);
      boxAt(body, M.dark, 0.26, 0.11, 0.02, -0.02, -0.02, s * (R.z * 0.97));
      add(body, new THREE.PlaneGeometry(0.235, 0.095), plateDecal, -0.02, -0.02, s * (R.z * 0.97 + 0.011), 0, s > 0 ? 0 : Math.PI, 0);
    });
    // Battery slung underneath, with a strip of light
    boxAt(body, M.armor, 0.3, 0.07, 0.15, -0.02, -R.y * 0.62, 0);
    boxAt(body, m.glow, 0.22, 0.008, 0.004, -0.02, -R.y * 0.62, 0.077);
    boxAt(body, m.glow, 0.22, 0.008, 0.004, -0.02, -R.y * 0.62, -0.077);
  } else {
    // Round, pod and egg: an ellipsoid of armour bands like the eyeball, plates stepped in and out
    add(body, ellGeo(R, 0.975, 0, TAU, 0, Math.PI), m.core);
    add(body, ellGeo(R, 1.0, 0, TAU, 0, 0.27), m.alt);
    add(body, ellGeo(R, 1.0, 0, TAU, 2.95, Math.PI - 2.95), m.alt);
    const gap = 0.055;
    BANDS.forEach(function (bd, i) {
      const step = TAU / bd.n;
      for (let k = 0; k < bd.n; k++) {
        const p0 = bd.off + k * step + gap / 2, p1 = bd.off + (k + 1) * step - gap / 2;
        add(body, ellGeo(R, 1 + bd.lift, p0, p1 - p0, bd.t0, bd.t1 - bd.t0), plateMat(i, k));
        const tb = bd.t0 + 0.05, w = 0.045 / (Math.sin(tb) * R.z);
        bolt(body, ell(R, tb, p0 + w, bd.lift), 0.004);
        bolt(body, ell(R, tb, p1 - w, bd.lift), 0.004);
      }
    });
    const mid = function (bd) { return (bd.t0 + bd.t1) / 2; };
    [Math.PI / 2, 3 * Math.PI / 2].forEach(function (ph) {
      // Power cell up front, ID plate on a raised block mid-flank, vents at the back
      powerCell(body, ell(R, mid(BANDS[1]), ph, BANDS[1].lift), 0.004);
      const f2 = ell(R, mid(BANDS[2]) + 0.04, ph, BANDS[2].lift);
      onSurf(add(body, unitBox, M.dark), f2, 0.012, 0.13, 0.026, 0.3);
      onSurfDecal(add(body, new THREE.PlaneGeometry(0.28, 0.115), plateDecal), f2, 0.026);
      [-1, 1].forEach(function (e) {
        [-1, 1].forEach(function (q) {
          const fb = ell(R, mid(BANDS[2]) + 0.04 + e * 0.12 * 0.46 / R.x, ph + q * 0.055 * 0.34 / R.z, BANDS[2].lift);
          bolt(body, fb, 0.024);
        });
      });
      const f3 = ell(R, mid(BANDS[3]), ph, BANDS[3].lift);
      onSurf(add(body, unitBox, M.dark), f3, 0.002, 0.13, 0.008, 0.2);
      for (let k = 0; k < 4; k++) onSurf(add(body, unitBox, M.sector), ell(R, BANDS[3].t0 + 0.08 + k * 0.11, ph, BANDS[3].lift), 0.01, 0.11, 0.012, 0.018);
      // Raised blocks with a status light, either side of the power cell
      [-Math.PI / 4, Math.PI / 4].forEach(function (d) {
        const fbk = ell(R, mid(BANDS[1]), ph + d, BANDS[1].lift);
        onSurf(add(body, unitBox, m.alt), fbk, 0.008, 0.09, 0.016, 0.1);
        onSurf(add(body, unitBox, m.glow), fbk, 0.017, 0.05, 0.004, 0.012);
      });
    });
    // Dorsal fins behind the jetpack, each with a light along its edge
    [2.32, 2.62].forEach(function (th, k) {
      const f = ell(R, th, 0, BANDS[3].lift);
      const fin = group(body, f.p.x, f.p.y - 0.01, 0);
      fin.rotation.z = Math.atan2(f.n.y, f.n.x) - Math.PI / 2;
      const sz = k === 0 ? 1 : 0.75;
      add(fin, extrude([[0.05 * sz, 0], [-0.07 * sz, 0], [-0.05 * sz, 0.07 * sz]], 0.012, 0.003), m.alt, 0, 0, -0.006);
      add(fin, new THREE.BoxGeometry(0.008, 0.075 * sz, 0.016).rotateZ(-0.95), m.glow, -0.012 * sz, 0.035 * sz, 0);
    });
  }

  // Where things attach, for this body
  const topAt = function (x) { return p.body === 'box' ? R.y + 0.02 : R.y * Math.sqrt(Math.max(0, 1 - (x / R.x) * (x / R.x))); };
  const neck = new THREE.Vector3(R.x * 0.86, R.y * 0.32 + 0.04, 0);

  // ===== Collar: a dark ring of chrome links with a glowing hex tag =====
  add(body, ringX(0.13, 0.034, 28), M.dark, neck.x, neck.y, 0);
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * TAU;
    boxAt(body, M.chrome, 0.05, 0.022, 0.02, neck.x, neck.y + Math.cos(a) * 0.155, Math.sin(a) * 0.155, a, 0, 0);
  }
  add(body, ringX(0.163, 0.004, 32), m.glow, neck.x + 0.03, neck.y, 0);
  const tag = group(body, neck.x + 0.05, neck.y - 0.17, 0.07);
  add(tag, new THREE.CylinderGeometry(0.038, 0.038, 0.012, 6).rotateX(Math.PI / 2), M.chrome);
  add(tag, new THREE.CylinderGeometry(0.025, 0.025, 0.016, 6).rotateX(Math.PI / 2), m.glow);

  // ===== Head =====
  // A big head reads better at this size (and is cuter)
  const head = live(group(body, neck.x + 0.17, neck.y + 0.1, 0));
  head.rotation.y = -0.95;
  head.scale.setScalar(1.3);
  const HR = { x: 0.2, y: 0.18, z: 0.21 };
  if (p.head === 'box') {
    const B = { x: 0.18, y: 0.15, z: 0.16 };
    add(head, new THREE.BoxGeometry(2 * B.x - 0.02, 2 * B.y - 0.02, 2 * B.z - 0.02), m.core);
    [1, -1].forEach(function (s) {
      [[0.08, 0.07], [-0.08, 0.07], [0.08, -0.07], [-0.08, -0.07]].forEach(function (q, k) {
        boxAt(head, plateMat(k, s > 0 ? 1 : 2), 0.14, 0.12, 0.024, q[0] - 0.02, q[1], s * (B.z + 0.004));
      });
      boxAt(head, plateMat(s > 0 ? 0 : 1, 3), 0.15, 0.024, 0.14, s * 0.08 - 0.02, B.y + 0.004, 0);
      boxAt(head, m.alt, 0.024, 0.13, 0.14, -B.x - 0.004, s * 0.07, 0);
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) { boxAt(head, m.alt, 2 * B.x + 0.02, 0.04, 0.04, 0, c[0] * B.y, c[1] * B.z); });
    });
    // Face: a flat screen in a dark bezel with chrome trim, glass over it
    boxAt(head, M.dark, 0.03, 0.24, 0.32, B.x + 0.01, 0.01, 0);
    boxAt(head, M.chrome, 0.012, 0.014, 0.33, B.x + 0.03, 0.135, 0);
    boxAt(head, M.chrome, 0.012, 0.014, 0.33, B.x + 0.03, -0.115, 0);
    for (let k = 0; k < 4; k++) boxAt(head, M.dark, 0.012, 0.01, 0.2, B.x + 0.01, -0.14 - k * 0.022, 0);
  } else if (p.head === 'facet') {
    add(head, new THREE.IcosahedronGeometry(1, 1).scale(HR.x * 0.95, HR.y * 0.95, HR.z * 0.95), m.core);
    const geo = new THREE.IcosahedronGeometry(1, 1).scale(HR.x, HR.y, HR.z);
    const pos = geo.attributes.position;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cen = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0, k = 0; i < pos.count; i += 3, k++) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
      cen.copy(a).add(b).add(c).divideScalar(3);
      if (cen.x > 0.1) continue;   // the face module covers the front
      n.crossVectors(_v1.subVectors(b, a), _v2.subVectors(c, a)).normalize();
      if (n.dot(cen) < 0) n.negate();
      const sh = function (v) { return v.clone().sub(cen).multiplyScalar(0.84).add(cen).addScaledVector(n, 0.005); };
      add(head, prism(sh(a), sh(b), sh(c), n, 0.02), plateMat(k % 3, k % 4));
    }
    add(head, ellGeo(HR, 0.99, 0, TAU, 0, 0.98), M.dark);
  } else {
    add(head, ellGeo(HR, 0.975, 0, TAU, 0, Math.PI), m.core);
    add(head, ellGeo(HR, 0.995, 0, TAU, 0, 0.97), M.dark);
    add(head, ellGeo(HR, 1.0, 0, TAU, 2.83, Math.PI - 2.83), m.alt);
    HEAD_BANDS.forEach(function (bd, i) {
      const step = TAU / bd.n;
      for (let k = 0; k < bd.n; k++) {
        const p0 = bd.off + k * step + 0.05, p1 = bd.off + (k + 1) * step - 0.05;
        add(head, ellGeo(HR, 1 + bd.lift, p0, p1 - p0, bd.t0, bd.t1 - bd.t0), plateMat(i + 1, k));
      }
    });
    // Crest: small ridge plates running back over the top of the head
    [1.75, 2.05, 2.35].forEach(function (th) { onSurf(add(head, unitBox, m.alt), ell(HR, th, 0, 0), 0.01, 0.035, 0.022, 0.07); });
  }
  // The face screen (swapped for blinks and hits) and its frame
  const faces = { open: faceTexture(p, 'open'), blink: faceTexture(p, 'blink'), hit: faceTexture(p, 'hit') };
  const faceMat = new THREE.MeshBasicMaterial({ map: faces.open, toneMapped: false });
  let face;
  if (p.head === 'box') {
    face = live(add(head, new THREE.PlaneGeometry(0.29, 0.19).rotateY(Math.PI / 2), faceMat, 0.207, 0.01, 0));
    add(head, new THREE.PlaneGeometry(0.29, 0.19).rotateY(Math.PI / 2), glassMat, 0.214, 0.01, 0);
  } else {
    const L = 1.7, rv = 0.222;
    face = live(add(head, new THREE.CylinderGeometry(rv, rv, 0.13, 22, 1, true, Math.PI / 2 - L / 2, L), faceMat, 0, 0.02, 0));
    add(head, new THREE.CylinderGeometry(rv + 0.007, rv + 0.007, 0.13, 22, 1, true, Math.PI / 2 - L / 2, L), glassMat, 0, 0.02, 0);
    [-0.047, 0.087].forEach(function (y) {
      add(head, new THREE.TorusGeometry(rv + 0.003, 0.011, 5, 22, L).rotateX(Math.PI / 2).rotateY(L / 2), M.chrome, 0, y, 0);
    });
    // Brow plate with a light line, and end caps where the visor meets the head
    add(head, new THREE.TorusGeometry(rv - 0.012, 0.024, 6, 22, L * 0.86).rotateX(Math.PI / 2).rotateY(L * 0.43), finish, 0, 0.112, 0);
    add(head, new THREE.TorusGeometry(rv + 0.011, 0.004, 4, 22, L * 0.6).rotateX(Math.PI / 2).rotateY(L * 0.3), m.glow, 0, 0.104, 0);
    [-1, 1].forEach(function (s) {
      const a = L / 2;
      const cap = boxAt(head, m.alt, 0.035, 0.16, 0.03, rv * Math.cos(a), 0.02, s * rv * Math.sin(a));
      cap.rotation.y = -s * a;
    });
    // Muzzle under the visor: vents and a small glowing nose
    boxAt(head, M.armor, 0.08, 0.05, 0.13, 0.14, -0.105, 0);
    for (let k = 0; k < 3; k++) boxAt(head, M.dark, 0.008, 0.007, 0.09, 0.182, -0.096 - k * 0.013, 0);
    add(head, new THREE.ConeGeometry(0.018, 0.02, 3).rotateZ(Math.PI), m.glow, 0.2, -0.062, 0);
  }
  // Cheek sensor pods with whiskers of light
  [-1, 1].forEach(function (s) {
    const pz = s * (p.head === 'box' ? 0.17 : HR.z - 0.004);
    const pod = group(head, 0.03, -0.035, pz);
    if (s < 0) pod.rotation.y = Math.PI;
    add(pod, new THREE.CylinderGeometry(0.058, 0.064, 0.05, 20).rotateX(Math.PI / 2), m.alt, 0, 0, 0.01);
    add(pod, new THREE.CylinderGeometry(0.044, 0.044, 0.014, 20).rotateX(Math.PI / 2), M.chrome, 0, 0, 0.04);
    add(pod, new THREE.TorusGeometry(0.05, 0.006, 4, 20), m.glow, 0, 0, 0.037);
    add(pod, new THREE.CircleGeometry(0.016, 12), m.glow, 0, 0, 0.0475);
    for (let k = 0; k < 4; k++) {
      const a = k / 4 * TAU + 0.4;
      add(pod, rivetGeo, M.chrome, Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0.0475);
    }
    for (let k = 0; k < 3; k++) {
      const wk = add(pod, new THREE.CylinderGeometry(0.005, 0.005, 0.17, 4).rotateX(Math.PI / 2).translate(0, 0, 0.085), m.glow, 0.03, -0.01, 0.04);
      wk.rotation.set((k - 1) * 0.28, 0.45, 0);
    }
  });

  // ===== Ears: armour shells on a hinge, with a glowing seam, a lit panel behind glass, light lines and rivets =====
  const EAR = {
    pointy: [[-0.075, 0], [0.085, 0], [0.05, 0.22]],
    folded: [[-0.085, 0], [0.085, 0], [0.07, 0.15]],
    tuft: [[-0.065, 0], [0.075, 0], [0.03, 0.27]],
    round: (function () { const pts = [[-0.08, 0], [0.08, 0]]; for (let k = 1; k < 10; k++) { const a = k / 10 * Math.PI; pts.push([0.08 * Math.cos(a), 0.13 * Math.sin(a)]); } return pts; })(),
    split: [[-0.065, 0], [0.05, 0], [0.0, 0.23]]
  };
  const panelTex = earPanelTexture(p);
  const panelMat = new THREE.MeshBasicMaterial({ map: panelTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ears = [];
  function earLayers(parent, pts, s, extra) {
    // pts in (outward, up); mirrored per side so the outer edge always faces away from the head
    const P = pts.map(function (q) { return [q[0] * s, q[1]]; });
    const cx = P.reduce(function (a, q) { return a + q[0]; }, 0) / P.length, cy = P.reduce(function (a, q) { return a + q[1]; }, 0) / P.length;
    const grow = function (k, dy) { return P.map(function (q) { return [cx + (q[0] - cx) * k, cy + (q[1] - cy) * k + (dy || 0)]; }); };
    add(parent, extrude(P, 0.02, 0.004), M.armor, 0, 0, -0.03);
    add(parent, extrude(grow(1.1), 0.012, 0), m.glow, 0, 0, -0.012);
    add(parent, extrude(P, 0.016, 0.003), finish, 0, 0, 0);
    if (extra) return;
    // Inner frame and its lit panel, set low in the ear
    const fr = new THREE.Shape(); grow(0.62, -0.02).forEach(function (q, i) { if (i === 0) fr.moveTo(q[0], q[1]); else fr.lineTo(q[0], q[1]); });
    const hole = new THREE.Path(); grow(0.44, -0.02).slice().reverse().forEach(function (q, i) { if (i === 0) hole.moveTo(q[0], q[1]); else hole.lineTo(q[0], q[1]); });
    fr.holes.push(hole);
    add(parent, new THREE.ExtrudeGeometry(fr, { depth: 0.008, bevelEnabled: false }), m.alt, 0, 0, 0.016);
    const pg = new THREE.ShapeGeometry(shape(grow(0.46, -0.02)));
    pg.computeBoundingBox();
    const bb = pg.boundingBox, uv = pg.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (pg.attributes.position.getX(k) - bb.min.x) / (bb.max.x - bb.min.x), (pg.attributes.position.getY(k) - bb.min.y) / (bb.max.y - bb.min.y));
    add(parent, pg, panelMat, 0, 0, 0.0165);
    add(parent, pg, glassMat, 0, 0, 0.026);
    grow(0.78, -0.01).slice(0, 3).forEach(function (q) { add(parent, rivetGeo, M.chrome, q[0], q[1], 0.02); });
    // A light line just inside the inner edge
    const a = P[0], t = P[2] || P[P.length - 1];
    const len = Math.hypot(t[0] - a[0], t[1] - a[1]) * 0.7;
    const ln = add(parent, new THREE.BoxGeometry(0.006, len, 0.004), m.glow, a[0] + (t[0] - a[0]) * 0.5 + 0.012 * s, a[1] + (t[1] - a[1]) * 0.5, 0.019);
    ln.rotation.z = Math.atan2(t[1] - a[1], t[0] - a[0]) - Math.PI / 2;
  }
  [-1, 1].forEach(function (s) {
    const base = group(head, -0.02, p.head === 'box' ? 0.15 : HR.y * 0.82, s * (p.head === 'box' ? 0.09 : HR.z * 0.5));
    base.rotation.y = Math.PI / 2;         // ear faces forward: its flat side looks the way the head looks
    // Hinge along the base
    add(base, new THREE.CylinderGeometry(0.02, 0.02, 0.15, 12).rotateZ(Math.PI / 2), M.chrome, 0, 0.008, -0.008);
    [-1, 1].forEach(function (e) { add(base, new THREE.TorusGeometry(0.02, 0.005, 4, 12).rotateY(Math.PI / 2), m.glow, e * 0.07, 0.008, -0.008); });
    const pivot = live(group(base, 0, 0.01, 0));
    // Leaning out a little and tipped forward; the folded ears flop right over
    pivot.userData.rest = new THREE.Euler(p.ears === 'folded' ? 0.75 : 0.1, 0, p.ears === 'folded' ? 0 : s * 0.15);
    pivot.rotation.copy(pivot.userData.rest);
    earLayers(pivot, EAR[p.ears], -s);
    if (p.ears === 'split') {
      const second = group(pivot, -s * 0.07, 0, -0.01);
      earLayers(second, [[-0.03, 0], [0.04, 0], [0.04, 0.15]], -s, true);
    }
    if (p.ears === 'tuft') {
      add(pivot, new THREE.CylinderGeometry(0.004, 0.004, 0.1, 4), M.chrome, 0.03 * -s, 0.31, 0);
      add(pivot, new THREE.SphereGeometry(0.014, 8, 6), m.glow, 0.03 * -s, 0.365, 0);
    }
    if (p.ears === 'pointy') add(pivot, new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), M.chrome, 0.05 * -s, 0.27, -0.01);
    ears.push(pivot);
  });

  // ===== Legs: armoured thigh, knee axle, piston shin and a thruster boot with claws =====
  const legs = [], legFlames = [];
  const hipY = -R.y * (p.body === 'box' ? 0.9 : 0.72), footY = -R.y - 0.15;
  [[0.5, 1], [0.5, -1], [-0.5, 1], [-0.5, -1]].forEach(function (q, li) {
    const hipX = q[0] * R.x * (p.body === 'pod' ? 0.75 : 1), hipZ = q[1] * R.z * (p.body === 'box' ? 0.6 : 0.45);
    const L = hipY - footY;
    const leg = live(group(body, hipX, hipY, hipZ));
    leg.userData.rest = q[0] > 0 ? 0.22 : -0.18;
    add(leg, new THREE.SphereGeometry(0.044, 12, 8), M.chrome);
    add(leg, new THREE.CylinderGeometry(0.04, 0.032, L * 0.42, 12), plateMat(li, 1), 0, -L * 0.22, 0);
    add(leg, new THREE.BoxGeometry(0.008, L * 0.3, 0.006), m.glow, 0, -L * 0.22, q[1] * 0.038);
    add(leg, new THREE.CylinderGeometry(0.03, 0.03, 0.09, 12).rotateX(Math.PI / 2), M.dark, 0, -L * 0.46, 0);
    [-1, 1].forEach(function (e) { add(leg, new THREE.TorusGeometry(0.03, 0.006, 4, 12), m.glow, 0, -L * 0.46, e * 0.046); });
    add(leg, new THREE.CylinderGeometry(0.027, 0.024, L * 0.24, 10), m.alt, 0, -L * 0.6, 0);
    add(leg, new THREE.CylinderGeometry(0.013, 0.013, L * 0.22, 8), M.chrome, 0, -L * 0.8, 0);
    const boot = group(leg, 0, -L, 0);
    add(boot, new THREE.CylinderGeometry(0.05, 0.064, 0.075, 14), M.dark, 0, 0, 0);
    add(boot, new THREE.TorusGeometry(0.062, 0.01, 4, 16).rotateX(Math.PI / 2), M.chrome, 0, -0.03, 0);
    add(boot, new THREE.TorusGeometry(0.05, 0.008, 4, 16).rotateX(Math.PI / 2), m.glow, 0, -0.042, 0);
    add(boot, new THREE.CircleGeometry(0.04, 12).rotateX(Math.PI / 2), m.throat, 0, -0.04, 0);
    add(boot, new THREE.TorusGeometry(0.052, 0.008, 4, 16).rotateX(Math.PI / 2), finish, 0, 0.035, 0);
    [-1, 0, 1].forEach(function (k) { boxAt(boot, M.chrome, 0.04, 0.022, 0.022, 0.055, -0.02, k * 0.026, 0, k * 0.25, -0.3); });
    // Little thruster flame under each boot
    const fl = flamePlume(glowCol.clone(), 0.85);
    fl.position.set(0, -0.05, 0);
    fl.rotation.z = Math.PI / 2;
    boot.add(fl);
    legFlames.push(fl);
    legs.push(leg);
  });

  // ===== Jetpack =====
  const packX = p.body === 'box' ? -0.02 : -0.05;
  const pack = group(body, packX, topAt(packX) - 0.012, 0);
  const nozzles = [], fans = [];
  // Mounting plate on the back, bolted down, with a strip of status LEDs along each edge
  const plate = [[-0.18, -0.13], [0.16, -0.13], [0.18, -0.11], [0.18, 0.11], [0.16, 0.13], [-0.18, 0.13]];
  add(pack, extrude(plate, 0.034, 0.008).rotateX(-Math.PI / 2), M.armor);
  [[-0.15, -0.1], [0.14, -0.1], [-0.15, 0.1], [0.14, 0.1]].forEach(function (q) { add(pack, boltGeo, M.chrome, q[0], 0.04, q[1]); });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const leds = live(new THREE.InstancedMesh(new THREE.BoxGeometry(0.026, 0.012, 0.008), ledMat, 10));
  for (let k = 0; k < 10; k++) {
    const s = k < 5 ? 1 : -1;
    leds.setMatrixAt(k, new THREE.Matrix4().makeTranslation(0.1 - (k % 5) * 0.045, 0.018, s * 0.136));
    leds.setColorAt(k, glowCol);
  }
  pack.add(leds);
  // Harness straps round the body, with buckles
  [-0.11, 0.11].forEach(function (dx) {
    const x = packX + dx, pts = [];
    const ry = p.body === 'box' ? R.y + 0.03 : R.y * Math.sqrt(Math.max(0.05, 1 - (x / R.x) * (x / R.x))) + 0.018;
    const rz = p.body === 'box' ? R.z + 0.03 : R.z * Math.sqrt(Math.max(0.05, 1 - (x / R.x) * (x / R.x))) + 0.018;
    for (let k = 0; k < 28; k++) {
      const a = k / 28 * TAU;
      let y = Math.cos(a), z = Math.sin(a);
      if (p.body === 'box') { const sq = 1 / Math.max(Math.abs(y), Math.abs(z)); y *= sq; z *= sq; }
      pts.push(new THREE.Vector3(x - packX, y * ry - (topAt(packX) - 0.012), z * rz));
    }
    add(pack, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 56, 0.014, 5, true), M.dark);
    [1, -1].forEach(function (s) {
      boxAt(pack, M.chrome, 0.045, 0.05, 0.016, dx, -(topAt(packX) - 0.012), s * (rz + 0.008));
      boxAt(pack, m.glow, 0.008, 0.03, 0.004, dx, -(topAt(packX) - 0.012), s * (rz + 0.017));
    });
  });
  // A turbine: intake lip and spinning fan at the front, banded can, nozzle with petals and a glowing throat
  function turbine(parent, r, len, x, y, z) {
    const tg = group(parent, x, y, z);
    add(tg, ringX(r * 0.9, r * 0.14, 28), M.chrome, len / 2, 0, 0);
    add(tg, new THREE.CylinderGeometry(r, r, len * 0.36, 26).rotateZ(Math.PI / 2), finish, len / 2 - len * 0.18 - r * 0.08, 0, 0);
    add(tg, ringX(r * 1.004, 0.005, 32), m.glow, len / 2 - len * 0.37, 0, 0);
    add(tg, new THREE.CylinderGeometry(r * 0.97, r * 0.97, len * 0.3, 26).rotateZ(Math.PI / 2), m.paint, -len * 0.02, 0, 0);
    [-len * 0.06, len * 0.1].forEach(function (bx) { add(tg, ringX(r * 0.985, 0.01, 32), M.dark, bx, 0, 0); });
    add(tg, new THREE.CylinderGeometry(r * 0.86, r * 0.97, len * 0.22, 26).rotateZ(Math.PI / 2), m.alt, -len * 0.28, 0, 0);
    add(tg, new THREE.CylinderGeometry(r * 0.92, r * 0.8, 0.06, 26, 1, true).rotateZ(Math.PI / 2), M.dark, -len / 2 + 0.03, 0, 0);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * TAU;
      const pet = boxAt(tg, M.sector, 0.06, 0.012, r * 0.34, -len / 2 + 0.005, Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86);
      pet.rotation.set(a + Math.PI / 2, 0, 0);
      pet.rotateZ(-0.3);
    }
    add(tg, new THREE.CircleGeometry(r * 0.72, 22).rotateY(-Math.PI / 2), m.throat, -len / 2 + 0.03, 0, 0);
    add(tg, ringX(r * 0.8, 0.006, 26), m.glow, -len / 2 + 0.008, 0, 0);
    // Intake: a dark well, a light ring and the fan
    add(tg, new THREE.CircleGeometry(r * 0.86, 22).rotateY(Math.PI / 2), M.dark, len / 2 - 0.035, 0, 0);
    add(tg, ringX(r * 0.78, 0.004, 26), m.glow, len / 2 - 0.012, 0, 0);
    const fan = live(group(tg, len / 2 - 0.022, 0, 0));
    add(fan, new THREE.SphereGeometry(r * 0.22, 12, 8), M.chrome);
    for (let k = 0; k < 7; k++) {
      const bl = boxAt(fan, M.sector, 0.008, r * 0.62, r * 0.2, 0, 0, 0);
      bl.rotation.set(k / 7 * TAU, 0.5, 0);
      bl.translateY(r * 0.42);
    }
    fans.push(fan);
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * TAU;
      add(tg, boltGeo, M.chrome, len / 2 - 0.045, Math.cos(a) * (r + 0.002), Math.sin(a) * (r + 0.002), a, 0, 0);
    }
    nozzles.push(new THREE.Vector3(x - len / 2, y, z));
    return tg;
  }
  // A little screen of falling code in a bezel, on the outward side
  function rainScreen(parent, x, y, z, w, h) {
    [1, -1].forEach(function (s) {
      boxAt(parent, M.dark, w + 0.02, h + 0.02, 0.014, x, y, s * z);
      add(parent, new THREE.PlaneGeometry(w, h), rainMat, x, y, s * (z + 0.008), 0, s > 0 ? 0 : Math.PI, 0);
      boxAt(parent, m.glow, w + 0.02, 0.004, 0.004, x, y - h / 2 - 0.012, s * (z + 0.008));
    });
  }
  let antennaY;
  if (p.pack === 'twin') {
    const r = 0.072, y = 0.034 + r;
    turbine(pack, r, 0.4, 0.0, y, 0.1);
    turbine(pack, r, 0.4, 0.0, y, -0.1);
    boxAt(pack, finish, 0.18, 0.05, 0.1, 0.0, y + 0.01, 0);
    for (let k = 0; k < 4; k++) boxAt(pack, M.dark, 0.022, 0.012, 0.08, -0.06 + k * 0.04, y + 0.04, 0);
    rainScreen(pack, -0.02, y, 0.1 + r + 0.006, 0.1, 0.05);
    antennaY = y + r;
  } else if (p.pack === 'rotor') {
    // SCOUT: a hub on the back with four arms out to ducted rotors, and a small thruster for the boost
    const y = 0.034 + 0.03;
    add(pack, new THREE.CylinderGeometry(0.07, 0.08, 0.06, 18), finish, 0, y, 0);
    add(pack, new THREE.TorusGeometry(0.076, 0.006, 4, 24).rotateX(Math.PI / 2), m.glow, 0, y + 0.031, 0);
    add(pack, new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), M.chrome, 0, y + 0.045, 0);
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (q) {
      const ax = q[0] * 0.2, az = q[1] * 0.25, len = Math.hypot(ax, az);
      boxAt(pack, m.alt, len, 0.022, 0.03, ax / 2, y, az / 2, 0, -Math.atan2(az, ax), 0);
      boxAt(pack, m.glow, len * 0.8, 0.004, 0.006, ax / 2, y + 0.013, az / 2, 0, -Math.atan2(az, ax), 0);
      // Tilted outward like a drone's arms, which also turns them toward the viewer so they read as rings
      const duct = group(pack, ax, y + 0.03, az);
      duct.rotation.x = q[1] * 0.55;
      duct.scale.setScalar(1.15);
      add(duct, new THREE.TorusGeometry(0.088, 0.017, 6, 28).rotateX(Math.PI / 2), finish);
      add(duct, new THREE.TorusGeometry(0.07, 0.004, 4, 28).rotateX(Math.PI / 2), m.glow, 0, 0.012, 0);
      add(duct, new THREE.CylinderGeometry(0.022, 0.026, 0.04, 12), M.chrome, 0, -0.005, 0);
      for (let k = 0; k < 3; k++) {   // spokes holding the motor in the duct
        const a = k / 3 * TAU + 0.5;
        boxAt(duct, M.dark, 0.07, 0.006, 0.008, Math.cos(a) * 0.045, -0.012, Math.sin(a) * 0.045, 0, -a, 0);
      }
      const fan = live(group(duct, 0, 0.012, 0));
      fan.userData.axis = 'y';
      for (let k = 0; k < 3; k++) boxAt(fan, M.sector, 0.15, 0.005, 0.028, 0, 0, 0, 0, k / 3 * TAU, 0.12);
      fans.push(fan);
    });
    turbine(pack, 0.045, 0.2, -0.17, y + 0.005, 0);
    rainScreen(pack, 0.0, y - 0.002, 0.082, 0.07, 0.035);
    antennaY = y + 0.06;
  } else if (p.pack === 'single') {
    const r = 0.115, y = 0.034 + r;
    turbine(pack, r, 0.46, 0, y, 0);
    [1, -1].forEach(function (s) {
      const fin = add(pack, extrude([[0.08, 0], [-0.16, 0], [-0.2, 0.09], [-0.06, 0.09]], 0.012, 0.003), m.alt, 0, y - 0.02, s * (r + 0.006) - 0.006);
      fin.rotation.x = s * -0.5;
      fin.position.z += s * 0.01;
    });
    rainScreen(pack, 0.0, y + 0.02, r + 0.012, 0.11, 0.055);
    // Sensor mast with a small dish on top
    boxAt(pack, m.alt, 0.05, 0.05, 0.05, -0.12, y + r + 0.02, 0);
    add(pack, new THREE.SphereGeometry(0.05, 14, 6, 0, TAU, 0, 1.0).rotateZ(Math.PI / 2 + 0.5), M.chrome, -0.11, y + r + 0.08, 0);
    antennaY = y + r + 0.03;
  } else {
    const y = 0.034 + 0.05;
    boxAt(pack, finish, 0.34, 0.09, 0.17, -0.02, y, 0);
    add(pack, new THREE.CylinderGeometry(0.0, 0.07, 0.13, 16).rotateZ(-Math.PI / 2).scale(1, 0.62, 1.15), finish, 0.21, y, 0);
    [1, -1].forEach(function (s) {
      const wing = add(pack, extrude([[0.12, 0], [-0.12, 0], [-0.21, -0.3], [-0.11, -0.3]].map(function (q) { return [q[0], q[1] * s]; }), 0.014, 0.004).rotateX(-Math.PI / 2), m.alt, 0, y, 0);
      wing.position.y -= 0.007;
      // Leading edge light and a blinking navigation light at the tip
      const le = boxAt(pack, m.glow, 0.008, 0.006, Math.hypot(0.23, 0.3), 0.005, y + 0.009, s * 0.15);
      le.rotation.y = -s * Math.atan2(0.23, 0.3);
      add(pack, new THREE.SphereGeometry(0.018, 8, 6), m.tip, -0.16, y, s * 0.305);
      turbine(pack, 0.05, 0.26, -0.03, y - 0.005, s * 0.16);
    });
    rainScreen(pack, -0.04, y, 0.092, 0.11, 0.05);
    antennaY = y + 0.045;
  }
  add(pack, new THREE.CylinderGeometry(0.006, 0.006, 0.22, 4), M.chrome, -0.13, antennaY + 0.11, 0);
  add(pack, new THREE.CylinderGeometry(0.018, 0.018, 0.02, 8), m.alt, -0.13, antennaY + 0.01, 0);
  add(pack, new THREE.SphereGeometry(0.022, 8, 6), m.tip, -0.13, antennaY + 0.22, 0);
  // Cables from the pack to the collar
  [1, -1].forEach(function (s) {
    const a = new THREE.Vector3(0.14, 0.04, s * 0.08), d = new THREE.Vector3(neck.x - packX, neck.y - pack.position.y + 0.02, s * 0.11);
    const curve = new THREE.CatmullRomCurve3([a, new THREE.Vector3(a.x + 0.08, a.y + 0.05, s * 0.12), new THREE.Vector3(d.x - 0.08, d.y + 0.06, s * 0.14), d]);
    add(pack, new THREE.TubeGeometry(curve, 16, 0.012, 6, false), M.dark);
    [0.3, 0.7].forEach(function (k) {
      const cl = add(pack, new THREE.TorusGeometry(0.017, 0.005, 4, 10), M.chrome);
      cl.position.copy(curve.getPoint(k));
      alignZ(cl, curve.getTangent(k));
    });
  });
  // Flames: a coloured glow and a white-hot core per nozzle
  const flames = nozzles.map(function (n) {
    const outer = flamePlume(glowCol.clone(), 0.9), core = flamePlume(new THREE.Color(1, 1, 1), 0.9);
    outer.position.copy(n); core.position.copy(n);
    pack.add(outer, core);
    return { outer: outer, core: core, at: n };
  });

  // ===== Tail: a chain of armoured vertebrae with glowing bands, each joint swinging a little =====
  const TAILS = {
    curl: { n: 7, len: 0.085, r0: 0.04, r1: 0.022, bend: [0.15, 0.3, 0.4, 0.5, 0.55, 0.55, 0.5], tip: 'orb' },
    whip: { n: 9, len: 0.07, r0: 0.022, r1: 0.011, bend: [-0.15, -0.05, 0.08, 0.18, 0.24, 0.26, 0.24, 0.2, 0.15], tip: 'beacon' },
    antenna: { n: 3, len: 0.08, r0: 0.05, r1: 0.04, bend: [0.4, 0.35, 0.3], tip: 'mast' },
    long: { n: 10, len: 0.085, r0: 0.032, r1: 0.016, bend: [0.05, 0.08, 0.08, 0.06, 0.03, 0, -0.04, -0.06, -0.06, -0.04], tip: 'blade' },
    stub: { n: 2, len: 0.07, r0: 0.075, r1: 0.062, bend: [0.3, 0.3], tip: 'cap' },
    segment: { n: 6, len: 0.085, r0: 0.045, r1: 0.025, bend: [0.35, 0.3, 0.25, 0.15, 0.1, 0.05], tip: 'spike' }
  };
  const tl = TAILS[p.tail], joints = [];
  let parent = body;
  for (let k = 0; k < tl.n; k++) {
    const r = tl.r0 + (tl.r1 - tl.r0) * k / Math.max(1, tl.n - 1);
    const j = live(group(parent, k === 0 ? -R.x + 0.03 : -tl.len, k === 0 ? R.y * 0.15 : 0, 0));
    j.userData.rest = -tl.bend[k];
    j.rotation.z = j.userData.rest;
    add(j, new THREE.SphereGeometry(r * 0.88, 10, 8), M.chrome);
    add(j, new THREE.CylinderGeometry(r, r * 0.92, tl.len * 0.62, 12).rotateZ(Math.PI / 2), k % 2 ? m.paint : finish, -tl.len * 0.5, 0, 0);
    add(j, ringX(r * 1.01, 0.005, 16), m.glow, -tl.len * 0.5, 0, 0);
    joints.push(j);
    parent = j;
  }
  const tip = group(parent, -tl.len, 0, 0);
  const tr = tl.r1;
  if (tl.tip === 'orb') {
    add(tip, new THREE.SphereGeometry(0.03, 10, 8), m.glow, -0.03, 0, 0);
    add(tip, new THREE.TorusGeometry(0.038, 0.006, 4, 16), M.chrome, -0.03, 0, 0);
    add(tip, ringX(0.038, 0.006, 16), M.chrome, -0.03, 0, 0);
  } else if (tl.tip === 'beacon') {
    // A blinking beacon in a small chrome cage
    add(tip, new THREE.SphereGeometry(0.026, 10, 8), m.tip, -0.03, 0, 0);
    add(tip, ringX(0.03, 0.005, 14), M.chrome, -0.03, 0, 0);
    add(tip, new THREE.TorusGeometry(0.03, 0.005, 4, 14), M.chrome, -0.03, 0, 0);
  } else if (tl.tip === 'mast') {
    add(tip, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6).rotateZ(-1.2), M.chrome, -0.13, 0.05, 0);
    add(tip, new THREE.SphereGeometry(0.04, 10, 8), m.tip, -0.27, 0.1, 0);
    add(tip, new THREE.TorusGeometry(0.05, 0.006, 4, 16), m.alt, -0.27, 0.1, 0);
  } else if (tl.tip === 'blade') {
    add(tip, extrude([[0, -tr], [0, tr], [-0.14, 0.004]], 0.012, 0.003), M.chrome, 0, 0, -0.006);
    add(tip, new THREE.BoxGeometry(0.11, 0.004, 0.016).rotateZ(-0.12), m.glow, -0.06, tr * 0.45, 0);
  } else if (tl.tip === 'cap') {
    add(tip, new THREE.SphereGeometry(tr * 1.05, 14, 10), finish, 0.01, 0, 0);
    add(tip, ringX(tr * 0.7, 0.008, 18), m.glow, -tr * 0.75, 0, 0);
  } else {
    add(tip, new THREE.ConeGeometry(tr * 1.1, 0.12, 6).rotateZ(Math.PI / 2), m.glow, -0.06, 0, 0);
    add(tip, ringX(tr * 1.3, 0.007, 12), M.chrome, -0.004, 0, 0);
  }

  // Merge every rigid part, then hand back what animates
  bake(body);
  cat.visible = false;
  root.add(cat);
  return {
    group: cat, body: body, head: head, ears: ears, legs: legs, legFlames: legFlames, joints: joints, fans: fans,
    flames: flames, pack: pack, faceMat: faceMat, faces: faces, face: face, plateTex: plateTex, rainTex: rainTex,
    leds: leds, ledCount: 10, tipMat: m.tip, throatMat: m.throat, glowCol: glowCol, preset: p, css: css(p.glow)
  };
}
