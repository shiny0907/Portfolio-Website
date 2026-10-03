import { renderer, TAU } from '../core.js';

// ---------- Canvas textures ----------
export function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

export function makeIrisTexture() {
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

export function makeOverlayTexture() {
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

export const glowTex = makeGlowTexture();
export const dotTex = makeDotTexture();
