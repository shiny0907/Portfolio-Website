// Contact page: sci-fi cats with jetpacks drifting around the open space. Each one is built from its own mix of
// parts (body, head, ears, LED face, jetpack, tail) in the eye's metals plus one glow colour of its own.
// Laser one and its jetpack kicks to full boost and it rockets off the screen, leaving a trail of grid squares
// in its colour; a new one flies in a few seconds later.
import { scene, camera, stage, reduceMotion, clamp, camBase, srgb } from './core.js';
import { page } from './pages.js';
import { grid, projectToGrid } from './grid/grid.js';
import { labelGeo, labelPx } from './grid/labels.js';
import { drawPixelText } from './pixel-font.js';
import { LOOK_PLANE_Z } from './gaze.js';
import { M } from './eye/materials.js';
import { glowTex } from './eye/textures.js';
import { beamInfo } from './eye/laser.js';
import { rig } from './eye/eyeball.js';
import { contactContentRect } from './contact.js';
import { sfx } from './sound.js';

// The five cats. Phones get the first three.
const PRESETS = [
  { name: 'SCOUT', id: 'SC-01', body: 'round', head: 'round', ears: 'pointy', eyes: 'round', pack: 'twin', tail: 'curl', finish: 'armorLight', glow: 0x29e6ff, stripes: true },
  { name: 'TANK', id: 'TK-02', body: 'box', head: 'box', ears: 'folded', eyes: 'cyclops', pack: 'single', tail: 'antenna', finish: 'armor', glow: 0xffa21f, stripes: true },
  { name: 'RACER', id: 'RC-03', body: 'pod', head: 'round', ears: 'tuft', eyes: 'tall', pack: 'wing', tail: 'long', finish: 'chrome', glow: 0xa96bff, stripes: true },
  { name: 'CHONK', id: 'CH-04', body: 'egg', head: 'round', ears: 'round', eyes: 'happy', pack: 'twin', tail: 'stub', finish: 'lid', glow: 0x86ff4a, stripes: false },
  { name: 'ROGUE', id: 'RG-05', body: 'facet', head: 'facet', ears: 'split', eyes: 'slant', pack: 'single', tail: 'segment', finish: 'armor', glow: 0xff4fb8, stripes: true }
];

const root = new THREE.Group();
root.visible = false;
scene.add(root);

function css(hex) { return '#' + hex.toString(16).padStart(6, '0'); }
function glowMat(hex) { return new THREE.MeshBasicMaterial({ color: srgb(hex), toneMapped: false }); }
function canvasTex(cv) {
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
// A flame plume: two crossed glow planes along the nozzle axis, so it trails out behind the jetpack whichever
// way the cat is pointing (a sprite always stays a flat blob facing the camera)
const plumeGeo = new THREE.PlaneGeometry(1, 1);
function flamePlume(color, opacity) {
  const mat = new THREE.MeshBasicMaterial({
    map: glowTex, color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(plumeGeo, mat));
  const cross = new THREE.Mesh(plumeGeo, mat);
  cross.rotation.x = Math.PI / 2;
  g.add(cross);
  return g;
}
function mesh(geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); return m; }

// ---- LED faces: a dot-matrix screen (15 x 9 LEDs) in the cat's colour, unlit LEDs faintly visible ----
const EYES = {
  round: ['.##.', '####', '####', '.##.'],
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
// ---- ID plate on each flank: a dark panel with circuit traces, the cat's ID in pixel type and a barcode ----
function plateTexture(p) {
  const cv = document.createElement('canvas');
  cv.width = 96; cv.height = 40;
  const g = cv.getContext('2d'), col = css(p.glow);
  g.fillStyle = '#0a0d11';
  g.fillRect(0, 0, 96, 40);
  g.fillStyle = '#262c33';
  g.fillRect(0, 0, 96, 2); g.fillRect(0, 38, 96, 2); g.fillRect(0, 0, 2, 40); g.fillRect(94, 0, 2, 40);
  drawPixelText(g, p.id, 6, 6, 2, function () { return col; }, null, 0);
  // Circuit traces running out from under the ID, with square pads at the ends
  g.fillStyle = col;
  g.globalAlpha = 0.85;
  g.fillRect(6, 25, 30, 2); g.fillRect(34, 25, 2, 8); g.fillRect(34, 31, 22, 2); g.fillRect(54, 28, 5, 5);
  g.fillRect(6, 31, 16, 2); g.fillRect(20, 31, 2, 5); g.fillRect(18, 33, 5, 4);
  g.fillRect(62, 8, 2, 14); g.fillRect(62, 20, 10, 2); g.fillRect(70, 17, 5, 5);
  // Barcode
  g.globalAlpha = 0.6;
  let x = 66;
  [2, 1, 1, 3, 1, 2, 1, 1, 2].forEach(function (wd, k) { if (k % 2 === 0) g.fillRect(x, 27, wd, 8); x += wd + 1; });
  return canvasTex(cv);
}

// ---- One cat, facing +x (head forward), back up, seen side-on with its face turned toward the viewer ----
const SIDE_Z = { round: 0.33, box: 0.26, pod: 0.205, egg: 0.41, facet: 0.31 };
function buildCat(p) {
  const cat = new THREE.Group();
  const body = new THREE.Group();   // everything that banks and bobs
  cat.add(body);
  const metal = M[p.finish], dark = M.dark, glow = glowMat(p.glow);
  const glowCol = srgb(p.glow);

  // Body
  if (p.body === 'round') body.add(mesh(new THREE.SphereGeometry(0.34, 24, 16).scale(1.35, 1, 1), metal));
  else if (p.body === 'box') {
    body.add(mesh(new THREE.BoxGeometry(0.86, 0.5, 0.5), metal));
    body.add(mesh(new THREE.BoxGeometry(0.7, 0.08, 0.52), dark, 0, -0.2, 0));   // armoured skirt
  } else if (p.body === 'pod') {
    body.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 20).rotateZ(Math.PI / 2), metal));
    body.add(mesh(new THREE.SphereGeometry(0.2, 18, 12), metal, 0.3, 0, 0));
    body.add(mesh(new THREE.SphereGeometry(0.2, 18, 12), metal, -0.3, 0, 0));
  } else if (p.body === 'egg') body.add(mesh(new THREE.SphereGeometry(0.4, 24, 16).scale(1.15, 1, 1.05), metal));
  else body.add(mesh(new THREE.IcosahedronGeometry(0.36, 0).scale(1.4, 1, 1), metal));
  const bodyLen = p.body === 'pod' ? 0.5 : p.body === 'egg' ? 0.46 : 0.45;
  // Glowing seams wrapping the body, set wide so the ID plate fits between them
  if (p.stripes) {
    [-0.2, 0.2].forEach(function (x) {
      if (p.body === 'box') body.add(mesh(new THREE.BoxGeometry(0.02, 0.505, 0.505), glow, x, 0, 0));
      else {
        const r = p.body === 'pod' ? 0.205 : p.body === 'round' ? 0.34 * Math.sqrt(1 - Math.pow(x / 0.459, 2)) + 0.004 : 0.31;
        body.add(mesh(new THREE.TorusGeometry(r, 0.013, 6, 32).rotateY(Math.PI / 2), glow, x, 0, 0));
      }
    });
  }
  // ID plates on both flanks (thin boxes: plate texture on the outside face, dark edges)
  const plateTex = plateTexture(p);
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTex, toneMapped: false });
  const sz = SIDE_Z[p.body];
  [1, -1].forEach(function (s) {
    const plate = mesh(new THREE.BoxGeometry(0.3, 0.125, 0.02), [dark, dark, dark, dark, plateMat, dark], 0, -0.02, s * sz);
    if (s < 0) plate.rotation.y = Math.PI;
    body.add(plate);
  });

  // Collar with a glowing tag
  body.add(mesh(new THREE.TorusGeometry(0.15, 0.026, 8, 24).rotateY(Math.PI / 2), dark, bodyLen - 0.02, 0.1, 0));
  body.add(mesh(new THREE.OctahedronGeometry(0.035, 0), glow, bodyLen + 0.01, -0.06, 0.05));

  // Head, turned toward the viewer so the face screen reads from the side
  const head = new THREE.Group();
  head.position.set(bodyLen + 0.16, 0.16, 0);
  head.rotation.y = -0.95;
  body.add(head);
  if (p.head === 'box') head.add(mesh(new THREE.BoxGeometry(0.4, 0.34, 0.36), metal));
  else if (p.head === 'facet') head.add(mesh(new THREE.DodecahedronGeometry(0.22, 0), metal));
  else head.add(mesh(new THREE.SphereGeometry(0.22, 22, 16), metal));
  // Face: an LED screen across the front, flat on a box head, a curved visor on the others
  const faces = { open: faceTexture(p, 'open'), blink: faceTexture(p, 'blink'), hit: faceTexture(p, 'hit') };
  const faceMat = new THREE.MeshBasicMaterial({ map: faces.open, toneMapped: false });
  let face;
  if (p.head === 'box') {
    head.add(mesh(new THREE.BoxGeometry(0.03, 0.22, 0.32), dark, 0.2, 0, 0));
    face = mesh(new THREE.PlaneGeometry(0.29, 0.18).rotateY(Math.PI / 2), faceMat, 0.217, 0, 0);
  } else {
    const L = 1.75;
    face = mesh(new THREE.CylinderGeometry(0.226, 0.226, 0.17, 20, 1, true, Math.PI / 2 - L / 2, L), faceMat, 0, 0.0, 0);
    // Chrome rims along the top and bottom of the visor
    [-0.088, 0.088].forEach(function (y) {
      head.add(mesh(new THREE.TorusGeometry(0.228, 0.01, 4, 20, L).rotateX(Math.PI / 2).rotateY(L / 2), M.chrome, 0, y, 0));
    });
  }
  head.add(face);
  // Whiskers: three thin light lines fanning out from each cheek
  [-1, 1].forEach(function (s) {
    for (let k = 0; k < 3; k++) {
      const wk = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 4).rotateX(Math.PI / 2).translate(0, 0, s * 0.085), glow, 0.12, -0.06, s * 0.16);
      wk.rotation.set((k - 1) * 0.28 * s, -s * 0.35, 0);
      head.add(wk);
    }
  });
  // Ears (left and right of the head top), each with a lit inner panel
  [-1, 1].forEach(function (s) {
    const ear = new THREE.Group();
    ear.position.set(-0.02, 0.17, s * 0.11);
    head.add(ear);
    if (p.ears === 'pointy') {
      ear.add(mesh(new THREE.ConeGeometry(0.08, 0.2, 4), metal, 0, 0.09, 0));
      ear.add(mesh(new THREE.ConeGeometry(0.035, 0.1, 4), glow, 0.03, 0.08, 0));
      ear.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), M.chrome, -0.02, 0.22, 0));   // antenna tip
      ear.rotation.x = s * 0.25;
    } else if (p.ears === 'folded') {
      ear.add(mesh(new THREE.ConeGeometry(0.09, 0.16, 4), metal, 0, 0.06, 0));
      ear.add(mesh(new THREE.BoxGeometry(0.1, 0.015, 0.02), glow, 0.02, 0.03, 0));
      ear.rotation.z = -0.9;
    } else if (p.ears === 'tuft') {
      ear.add(mesh(new THREE.ConeGeometry(0.06, 0.28, 8), metal, 0, 0.13, 0));
      ear.add(mesh(new THREE.ConeGeometry(0.025, 0.14, 6), glow, 0.03, 0.1, 0));
      ear.add(mesh(new THREE.ConeGeometry(0.02, 0.1, 6), glow, 0, 0.3, 0));
      ear.rotation.x = s * 0.15;
    } else if (p.ears === 'round') {
      ear.add(mesh(new THREE.SphereGeometry(0.075, 12, 10).scale(1, 1, 0.5), metal, 0, 0.04, 0));
      ear.add(mesh(new THREE.TorusGeometry(0.05, 0.008, 4, 16).rotateY(Math.PI / 2), glow, 0.03, 0.04, 0));
    } else {
      ear.add(mesh(new THREE.ConeGeometry(0.05, 0.2, 4), metal, -0.03, 0.09, 0));
      ear.add(mesh(new THREE.ConeGeometry(0.04, 0.15, 4), metal, 0.05, 0.06, 0));
      ear.add(mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), glow, 0.01, 0.05, 0));
      ear.rotation.x = s * 0.3;
    }
  });

  // Legs ending in little thruster boots with glowing rings
  const paws = [];
  [[0.24, 0.13], [0.24, -0.13], [-0.22, 0.13], [-0.22, -0.13]].forEach(function (q) {
    body.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 6), M.chrome, q[0], -0.2, q[1]));
    const paw = new THREE.Group();
    paw.position.set(q[0], -0.3, q[1]);
    paw.add(mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.08, 10), dark));
    paw.add(mesh(new THREE.TorusGeometry(0.068, 0.011, 4, 14).rotateX(Math.PI / 2), glow, 0, -0.04, 0));
    body.add(paw);
    paws.push(paw);
  });

  // Jetpack on the back, nozzles pointing backward (-x), flames trailing
  const pack = new THREE.Group();
  pack.position.set(-0.06, 0.33, 0);
  body.add(pack);
  const nozzles = [];
  let ledZ = 0.18, ledY = 0, topY = 0.08;
  if (p.pack === 'twin') {
    [-0.1, 0.1].forEach(function (z) {
      pack.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 14).rotateZ(Math.PI / 2), M.chrome, 0, 0, z));
      pack.add(mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.1, 14).rotateZ(Math.PI / 2), dark, -0.25, 0, z));
      nozzles.push(new THREE.Vector3(-0.31, 0, z));
    });
    pack.add(mesh(new THREE.BoxGeometry(0.06, 0.04, 0.24), glow, 0.1, 0.06, 0));
  } else if (p.pack === 'single') {
    pack.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.46, 18).rotateZ(Math.PI / 2), M.armorLight, 0, 0.02, 0));
    pack.add(mesh(new THREE.CylinderGeometry(0.08, 0.13, 0.14, 18).rotateZ(Math.PI / 2), dark, -0.29, 0.02, 0));
    pack.add(mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 24).rotateY(Math.PI / 2), glow, 0.05, 0.02, 0));
    nozzles.push(new THREE.Vector3(-0.37, 0.02, 0));
    ledZ = 0.125; ledY = 0.02; topY = 0.14;
  } else {
    pack.add(mesh(new THREE.BoxGeometry(0.42, 0.12, 0.26), M.armorLight));
    [-1, 1].forEach(function (s) {
      const fin = mesh(new THREE.BoxGeometry(0.3, 0.02, 0.22), metal, -0.05, 0.02, s * 0.22);
      fin.rotation.x = s * 0.35;
      pack.add(fin);
      pack.add(mesh(new THREE.BoxGeometry(0.2, 0.012, 0.03), glow, -0.05, 0.035, s * 0.3));
      pack.add(mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.1, 12).rotateZ(Math.PI / 2), dark, -0.24, 0, s * 0.07));
      nozzles.push(new THREE.Vector3(-0.295, 0, s * 0.07));
    });
    ledZ = 0.135; ledY = -0.02; topY = 0.06;
  }
  // Vent slats on top, an antenna with a blinking tip, and a row of status LEDs that chase along the side
  for (let k = 0; k < 3; k++) pack.add(mesh(new THREE.BoxGeometry(0.025, 0.02, 0.14), dark, -0.1 + k * 0.05, topY, 0));
  pack.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 4), M.chrome, 0.12, topY + 0.1, 0));
  const tip = mesh(new THREE.SphereGeometry(0.022, 8, 6), glow, 0.12, topY + 0.21, 0);
  pack.add(tip);
  const ledOff = new THREE.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(0.12), toneMapped: false });
  const leds = [];
  [1, -1].forEach(function (s) {
    for (let k = 0; k < 4; k++) {
      const led = mesh(new THREE.BoxGeometry(0.03, 0.02, 0.01), ledOff, 0.09 - k * 0.05, ledY, s * ledZ);
      pack.add(led);
      leds.push(led);
    }
  });
  // Nozzle throats glow and heat up to white on boost, ringed by a thin light
  const throatMat = new THREE.MeshBasicMaterial({ color: glowCol.clone(), toneMapped: false, side: THREE.DoubleSide });
  nozzles.forEach(function (n) {
    pack.add(mesh(new THREE.CircleGeometry(0.045, 14).rotateY(-Math.PI / 2), throatMat, n.x - 0.005, n.y, n.z));
    pack.add(mesh(new THREE.TorusGeometry(0.06, 0.008, 4, 16).rotateY(Math.PI / 2), glow, n.x + 0.01, n.y, n.z));
  });
  // Two layers of flame per nozzle: a coloured glow and a white-hot core
  const flames = nozzles.map(function (n) {
    const outer = flamePlume(glowCol.clone(), 0.9), core = flamePlume(new THREE.Color(1, 1, 1), 0.9);
    outer.position.copy(n); core.position.copy(n);
    pack.add(outer, core);
    return { outer: outer, core: core, at: n };
  });

  // Tail
  const tail = new THREE.Group();
  tail.position.set(-bodyLen - 0.02, 0.06, 0);
  body.add(tail);
  if (p.tail === 'curl') {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.2, 0.08, 0), new THREE.Vector3(-0.3, 0.28, 0), new THREE.Vector3(-0.18, 0.4, 0), new THREE.Vector3(-0.08, 0.32, 0)]);
    tail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.035, 8, false), metal));
    tail.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), glow, -0.08, 0.32, 0));
  } else if (p.tail === 'antenna') {
    tail.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.42, 6).rotateZ(-0.7), M.chrome, -0.14, 0.15, 0));
    tail.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), glow, -0.28, 0.31, 0));
  } else if (p.tail === 'long') {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.3, 0.02, 0), new THREE.Vector3(-0.6, 0.1, 0), new THREE.Vector3(-0.78, 0.05, 0)]);
    tail.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.025, 8, false), metal));
    // Light rings along the tail
    [0.25, 0.5].forEach(function (k) {
      const q = curve.getPoint(k);
      tail.add(mesh(new THREE.TorusGeometry(0.03, 0.007, 4, 12).rotateY(Math.PI / 2), glow, q.x, q.y, q.z));
    });
    tail.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), glow, -0.79, 0.05, 0));
  } else if (p.tail === 'stub') {
    tail.add(mesh(new THREE.SphereGeometry(0.08, 12, 10), metal, -0.04, 0.03, 0));
    tail.add(mesh(new THREE.TorusGeometry(0.06, 0.009, 4, 16).rotateY(Math.PI / 2), glow, -0.02, 0.03, 0));
  } else {
    for (let k = 0; k < 5; k++) tail.add(mesh(new THREE.SphereGeometry(0.05 - k * 0.006, 10, 8), k === 4 ? glow : metal, -0.08 - k * 0.09, 0.03 + k * 0.05, 0));
  }

  cat.visible = false;
  root.add(cat);
  return {
    group: cat, body: body, tail: tail, paws: paws, flames: flames, preset: p, pack: pack,
    faceMat: faceMat, faces: faces, face: face, plateTex: plateTex, leds: leds, ledOn: glow, ledOff: ledOff,
    tip: tip, throatMat: throatMat, glowCol: glowCol, css: css(p.glow)
  };
}
const cats = PRESETS.map(function (p, i) {
  const c = buildCat(p);
  c.index = i;
  c.state = 'off';            // off | enter | fly | flee | leave
  c.pos = new THREE.Vector3();
  c.vel = new THREE.Vector3();
  c.wp = new THREE.Vector3();
  c.facing = 1;
  c.boost = 0;
  c.respawnAt = 0;
  c.phase = Math.random() * 10;
  c.blinkAt = Math.random() * 4;
  c.trailI = null;
  const hot = new THREE.Color(p.glow).lerp(new THREE.Color(1, 1, 1), 0.55);
  c.hotCss = '#' + hot.getHexString();
  return c;
});

// ---- The flight space: the plane the laser lands on, so aiming at a cat with the cursor hits it ----
const bounds = { z: 3, halfW: 4, halfH: 2.5, scale: 1, pxPerUnit: 100 };
function measure() {
  const w = stage.clientWidth || window.innerWidth, h = stage.clientHeight || window.innerHeight;
  bounds.z = LOOK_PLANE_Z;
  bounds.halfH = (camBase.z - bounds.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  bounds.halfW = bounds.halfH * camera.aspect;
  bounds.pxPerUnit = (h / 2) / bounds.halfH;
  // About 12.5% of the shorter screen side from nose to tail
  bounds.scale = clamp(Math.min(w, h) * 0.125, 60, 135) / bounds.pxPerUnit / 1.2;
}
function activeCount() { return (stage.clientWidth || window.innerWidth) < 700 ? 3 : 5; }

// Screen (CSS px) <-> flight plane
function toWorld(x, y, out) {
  const w = stage.clientWidth || window.innerWidth, h = stage.clientHeight || window.innerHeight;
  return out.set((x / w * 2 - 1) * bounds.halfW, -(y / h * 2 - 1) * bounds.halfH, bounds.z);
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
// Does the straight line a to b pass through the box? (slab test)
function segHitsBox(ax, ay, bx, by, box) {
  let t0 = 0, t1 = 1;
  const d = [bx - ax, by - ay], o = [ax, ay], lo = [box.x0, box.y0], hi = [box.x1, box.y1];
  for (let k = 0; k < 2; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return false; continue; }
    let ta = (lo[k] - o[k]) / d[k], tb = (hi[k] - o[k]) / d[k];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
function inBox(x, y, box) { return x > box.x0 && x < box.x1 && y > box.y0 && y < box.y1; }
// The places cats keep out of, on the flight plane: the content (padded by half a cat, so none sits on the
// edge of the text), the packet channel below it, and BACK with the parked eye's rings
function noFlyBoxes() {
  const boxes = [], r = contactContentRect(), padX = 0.75 * bounds.scale, padY = 0.55 * bounds.scale;
  const d = grid.dpr || 1, ringHalf = (labelGeo.R / d + 40) / bounds.pxPerUnit;
  toWorld(0, (labelGeo.cy - labelGeo.R - 14 * labelPx) / d, _a);
  const eyeTop = _a.y + padY, floor = -bounds.halfH * 2;
  boxes.push({ x0: -ringHalf, x1: ringHalf, y0: floor, y1: eyeTop });
  if (r) {
    toWorld(r.left, r.top, _a); toWorld(r.right, r.bottom, _b);
    boxes.push({ x0: _a.x - padX, x1: _b.x + padX, y0: _b.y - padY, y1: _a.y + padY });
    boxes.push({ x0: -padX, x1: padX, y0: floor, y1: _b.y });
  }
  return boxes;
}
// A waypoint in open space that the cat can reach in a straight line without crossing anything above
function pickWaypoint(c) {
  const boxes = noFlyBoxes();
  for (let k = 0; k < 40; k++) {
    const x = (Math.random() * 2 - 1) * bounds.halfW * 0.86, y = (Math.random() * 2 - 1) * bounds.halfH * 0.8;
    const blocked = boxes.some(function (b) { return inBox(x, y, b) || (segHitsBox(c.pos.x, c.pos.y, x, y, b) && !inBox(c.pos.x, c.pos.y, b)); });
    // ...not where another cat is already heading, so they spread out instead of bunching up,
    // and mostly on the same side, so they only cross the middle now and then
    const crowded = k < 28 && cats.some(function (o) {
      return o !== c && o.state !== 'off' && Math.hypot(o.wp.x - x, o.wp.y - y) < 2.4 * bounds.scale;
    });
    const crossing = k < 16 && x * c.pos.x < 0 && Math.random() < 0.75;
    if (!blocked && !crowded && !crossing) { c.wp.set(x, y, bounds.z); return; }
  }
  // Boxed in (a cat that got nudged into a corner): just drift to the top of its own side
  c.wp.set((c.pos.x < 0 ? -1 : 1) * bounds.halfW * 0.7, bounds.halfH * 0.6, bounds.z);
}
// Fly in from a random edge, at a height where the way in is clear
function spawn(c, t) {
  measure();
  const side = Math.random() < 0.5 ? -1 : 1;
  c.pos.set(side * (bounds.halfW + 1.5 * bounds.scale), 0, bounds.z);
  const boxes = noFlyBoxes();
  for (let k = 0; k < 12; k++) {
    c.pos.y = (Math.random() * 1.6 - 0.8) * bounds.halfH;
    if (!boxes.some(function (b) { return segHitsBox(c.pos.x, c.pos.y, side * bounds.halfW * 0.6, c.pos.y, b); })) break;
  }
  c.vel.set(-side * 1.2, 0, 0);
  c.facing = -side;
  c.state = 'enter';
  c.boost = 0;
  c.group.visible = true;
  c.group.scale.setScalar(bounds.scale);
  pickWaypoint(c);
  if (reduceMotion) { c.pos.copy(c.wp); c.state = 'fly'; }
  c.nextWp = t + 3 + Math.random() * 3;
}
function offscreen(c) {
  const m = 1.4 * bounds.scale;
  return Math.abs(c.pos.x) > bounds.halfW + m || Math.abs(c.pos.y) > bounds.halfH + m;
}

// ---- Laser hits ----
// The cat is hit if the beam passes through its body, or if the burning point swept across it since last frame
// (the laser swings like a turret and the cats keep moving, so a strict point test felt unfair)
const _seg = new THREE.Vector3(), _rel = new THREE.Vector3();
const prevEnd = new THREE.Vector3();
let prevOn = false;
function distToSegment(p, a, b) {
  _seg.copy(b).sub(a);
  const len2 = _seg.lengthSq();
  _rel.copy(p).sub(a);
  const k = len2 > 1e-9 ? clamp(_rel.dot(_seg) / len2, 0, 1) : 0;
  return _rel.copy(a).addScaledVector(_seg, k).sub(p).length();
}
function beamHits(c) {
  if (!beamInfo.on) return false;
  const r = 0.75 * bounds.scale;
  if (distToSegment(c.pos, beamInfo.start, beamInfo.end) < r) return true;
  return prevOn && distToSegment(c.pos, prevEnd, beamInfo.end) < r;
}
function flee(c, t) {
  c.state = 'flee';
  c.fleeAt = t;
  // Away from the eye, and a bit upward
  _a.copy(c.pos).sub(rig.position); _a.z = 0;
  if (_a.lengthSq() < 1e-4) _a.set(0, 1, 0);
  _a.normalize();
  c.fleeDir = new THREE.Vector3(_a.x, _a.y + 0.35, 0).normalize();
  c.respawnAt = t + 4 + Math.random() * 4;
  sfx('boost');
}

// Where a cat is on screen, for the cursor's target lock (grid-canvas device pixels)
const _p = new THREE.Vector3();
export function catAt(clientX, clientY) {
  if (!root.visible) return null;
  const sr = stage.getBoundingClientRect(), d = grid.dpr;
  for (let k = 0; k < cats.length; k++) {
    const c = cats[k];
    if (!c.group.visible || c.state === 'flee' || c.state === 'off') continue;
    _p.copy(c.pos).project(camera);
    const x = (_p.x + 1) / 2 * sr.width, y = (1 - _p.y) / 2 * sr.height;
    const r = 0.55 * bounds.scale * bounds.pxPerUnit;
    if (Math.hypot(clientX - sr.left - x, clientY - sr.top - y) < r) {
      return { key: 'cat' + k, rect: { x: (x - r) * d, y: (y - r * 0.8) * d, w: 2 * r * d, h: 1.6 * r * d }, label: c.preset.name };
    }
  }
  return null;
}

// ---- Per frame ----
let lastT = 0;
export function updateCats(t) {
  const dt = Math.min(0.05, Math.max(0, t - lastT));
  lastT = t;
  const onPage = page.target === 'contact' && page.q > 0.6;
  const any = cats.some(function (c) { return c.state !== 'off'; });
  if (!onPage && !any) { root.visible = false; prevOn = false; return; }
  root.visible = true;
  measure();
  const n = activeCount();
  cats.forEach(function (c) {
    if (c.index >= n) { c.state = 'off'; c.group.visible = false; return; }
    // Arriving on the page: everyone flies in, a little staggered. Leaving: everyone heads for the nearest side.
    if (c.state === 'off') {
      if (onPage && t >= c.respawnAt) { if (!c.queued) { c.queued = true; c.respawnAt = Math.max(c.respawnAt, t + 0.2 + c.index * 0.35); } else { c.queued = false; spawn(c, t); } }
      return;
    }
    if (!onPage && c.state !== 'leave' && c.state !== 'flee') { c.state = 'leave'; c.leaveDir = c.pos.x < 0 ? -1 : 1; }
    if (reduceMotion && (c.state === 'flee' || c.state === 'leave')) { c.state = 'off'; c.group.visible = false; return; }

    // Steering
    const speed = bounds.halfH * 0.32;
    if (c.state === 'enter' || c.state === 'fly') {
      if (c.state === 'enter' && Math.abs(c.pos.x) < bounds.halfW * 0.9) c.state = 'fly';
      if (t > c.nextWp || c.pos.distanceTo(c.wp) < bounds.halfH * 0.12) { pickWaypoint(c); c.nextWp = t + 3 + Math.random() * 3; }
      _a.copy(c.wp).sub(c.pos);
      const dist = _a.length();
      _a.multiplyScalar(dist > 1e-4 ? Math.min(1, dist / (bounds.halfH * 0.3)) * speed / dist : 0);
      // Keep a little personal space: cats that get close drift apart
      cats.forEach(function (o) {
        if (o === c || o.state === 'off' || o.state === 'flee') return;
        const dx = c.pos.x - o.pos.x, dy = c.pos.y - o.pos.y, d = Math.hypot(dx, dy), near = 1.6 * bounds.scale;
        if (d < near && d > 1e-4) { const k = (1 - d / near) * speed * 2 / d; _a.x += dx * k; _a.y += dy * k; }
      });
      if (!reduceMotion) c.vel.lerp(_a, Math.min(1, dt * 1.4));
      else c.vel.set(0, 0, 0);
      if (beamHits(c)) flee(c, t);
    } else if (c.state === 'flee') {
      // Hit: it stops dead and shakes while the jetpack flares to full (0.3 s), then rockets away from the eye
      c.boost = Math.min(1, c.boost + dt * 4);
      if (t - c.fleeAt < 0.3) c.vel.multiplyScalar(Math.max(0, 1 - dt * 12));
      else c.vel.addScaledVector(c.fleeDir, dt * bounds.halfH * 6);
    } else if (c.state === 'leave') {
      c.vel.x += c.leaveDir * dt * 14 * bounds.scale;
      c.vel.y += dt * 2 * bounds.scale;
      c.boost = Math.min(0.6, c.boost + dt * 3);
    }
    c.pos.addScaledVector(c.vel, dt);
    c.pos.z = bounds.z;
    if ((c.state === 'flee' || c.state === 'leave') && offscreen(c)) {
      // A lasered cat comes back after its delay (set in flee); one that left with the page comes straight back next time
      if (c.state === 'leave') c.respawnAt = 0;
      c.state = 'off';
      c.group.visible = false;
      return;
    }

    // Pose: face the way it's flying, nose up when climbing, a gentle bob, paws and tail swinging, flames
    // flickering (huge on full boost). Turning round swings it to face the viewer halfway, then mirrors it,
    // so its face stays toward the screen on either heading.
    const g = c.group;
    g.position.copy(c.pos);
    g.scale.setScalar(bounds.scale);
    if (Math.abs(c.vel.x) > speed * 0.15) c.facing += (Math.sign(c.vel.x) - c.facing) * Math.min(1, dt * 5);
    const side = c.facing < 0 ? -1 : 1;
    g.scale.x = bounds.scale * side;
    g.rotation.y = -side * (1 - Math.min(1, Math.abs(c.facing))) * Math.PI / 2;
    const pitch = clamp(Math.atan2(c.vel.y, Math.abs(c.vel.x) + 0.3), -0.6, c.state === 'flee' ? 1.25 : 0.8);
    const ph = t * 2.2 + c.phase;
    // (inside the mirrored group, a positive tilt is nose-up whichever way it faces)
    const shake = c.state === 'flee' && t - c.fleeAt < 0.3 ? Math.sin(t * 70) * 0.25 : c.state === 'flee' ? Math.sin(t * 30) * 0.1 : 0;
    c.body.rotation.z = (c.state === 'flee' ? pitch : pitch * 0.7) + shake;
    c.body.position.y = reduceMotion ? 0 : Math.sin(ph) * 0.06;
    c.body.rotation.x = reduceMotion ? 0 : Math.sin(ph * 0.7) * 0.08;
    c.tail.rotation.z = reduceMotion ? 0 : Math.sin(ph * 1.6) * 0.25;
    c.paws.forEach(function (paw, k) { paw.position.y = -0.3 + (reduceMotion ? 0 : Math.sin(ph * 1.3 + k) * 0.025); });
    // Flames: a steady cruise flame, long and bright on full boost
    const thrust = 1 + c.boost * 3.2;
    c.flames.forEach(function (f) {
      const flick = reduceMotion ? 1 : 0.85 + Math.random() * 0.3;
      const wo = 0.32 * (1 + c.boost * 0.8) * flick, wc = 0.14 * (1 + c.boost * 0.6);
      f.outer.scale.set(0.5 * thrust * flick, wo, wo);
      f.outer.position.set(f.at.x - 0.2 * thrust, f.at.y, f.at.z);
      f.core.scale.set(0.24 * thrust * flick, wc, wc);
      f.core.position.set(f.at.x - 0.08 * thrust, f.at.y, f.at.z);
    });
    c.throatMat.color.copy(c.glowCol).lerp(WHITE, c.boost * 0.85);

    // Face: blinks now and then; hit, it shows > < in static, flickering while it shakes
    if (t > c.blinkAt + 0.13) c.blinkAt = t + 2 + Math.random() * 4;
    const hit = c.state === 'flee';
    c.faceMat.map = hit ? c.faces.hit : t >= c.blinkAt && !reduceMotion ? c.faces.blink : c.faces.open;
    c.face.visible = !(hit && t - c.fleeAt < 0.3 && Math.random() < 0.3);
    // The ID plates read the right way round whichever way the cat faces
    c.plateTex.repeat.x = side;
    c.plateTex.offset.x = side < 0 ? 1 : 0;
    // Status LEDs chase along the pack (all flashing when hit); the antenna tip blinks
    const step = Math.floor(t * (hit ? 14 : 5) + c.phase * 3);
    c.leds.forEach(function (led, k) { led.material = (hit ? step % 2 === 0 : step % 4 === k % 4) ? c.ledOn : c.ledOff; });
    c.tip.visible = reduceMotion || ((t * 0.8 + c.phase) % 1) < 0.18 || hit;

    // Fleeing at full boost: lay a trail of squares in the cat's colour behind the jetpack
    if (hit && !reduceMotion && t - c.fleeAt > 0.22) layTrail(c, t);
    else c.trailI = null;
  });
  prevOn = beamInfo.on;
  if (prevOn) prevEnd.copy(beamInfo.end);
}

// ---- The boost trail, on the grid layer behind the 3D ----
const WHITE = new THREE.Color(1, 1, 1);
const trail = [];
const TRAIL_LIFE = 1.5;
const _n = new THREE.Vector3();
function addTrailCell(c, i, j, t, s) {
  if (trail.length > 900) return;
  trail.push({ i: i, j: j, at: t, s: s, col: c.css, hot: c.hotCss });
}
function layTrail(c, t) {
  // The point between the nozzles, on screen, in grid squares
  c.group.updateMatrixWorld(true);
  _n.set(0, 0, 0);
  c.flames.forEach(function (f) { _n.add(f.at); });
  _n.multiplyScalar(1 / c.flames.length);
  _n.x -= 0.1;
  c.pack.localToWorld(_n);
  const pt = projectToGrid(_n.x, _n.y, _n.z), C = grid.cell;
  const fi = (pt[0] - grid.ox) / C, fj = (pt[1] - grid.oy) / C;
  if (c.trailI === null || c.trailI === undefined) { c.trailI = fi; c.trailJ = fj; }
  // Step along the path since last frame so a fast cat still leaves an unbroken line
  const d = Math.hypot(fi - c.trailI, fj - c.trailJ), steps = Math.min(40, Math.max(1, Math.ceil(d * 2)));
  for (let s = 1; s <= steps; s++) {
    const i = Math.floor(c.trailI + (fi - c.trailI) * s / steps), j = Math.floor(c.trailJ + (fj - c.trailJ) * s / steps);
    if (i === c.lastCellI && j === c.lastCellJ) continue;
    c.lastCellI = i; c.lastCellJ = j;
    addTrailCell(c, i, j, t, 1);
    // A few stray squares beside the line, glitch style
    if (Math.random() < 0.3) {
      const a = Math.random() < 0.5 ? 1 : -1;
      if (Math.random() < 0.5) addTrailCell(c, i + a, j, t, 0.5); else addTrailCell(c, i, j + a, t, 0.5);
    }
  }
  c.trailI = fi; c.trailJ = fj;
}
// Each square flashes hot, holds, then fades with a flicker, like the laser burns
export function drawCatTrails(ctx, t) {
  if (!trail.length) return;
  const C = grid.cell;
  let keep = 0;
  for (let k = 0; k < trail.length; k++) {
    const q = trail[k], age = t - q.at;
    if (age > TRAIL_LIFE || age < -1) continue;
    trail[keep++] = q;
    let a = (age < 0.5 ? 1 : 1 - (age - 0.5) / (TRAIL_LIFE - 0.5)) * q.s;
    if (age > 0.5 && Math.random() < 0.12) a *= 0.25;
    ctx.globalAlpha = a;
    ctx.fillStyle = age < 0.12 ? q.hot : q.col;
    ctx.fillRect(grid.ox + q.i * C, grid.oy + q.j * C, C, C);
  }
  trail.length = keep;
  ctx.globalAlpha = 1;
}
