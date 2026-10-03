import { srgb } from '../core.js';

export const RED = srgb(0xff0a1e);
export const HOT = srgb(0xffd6da);

// ---------- Materials ----------
export const M = {
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
export function toEyeAxis(geo) { geo.rotateX(Math.PI / 2); return geo; }

// Matrix for an object sitting on the sphere surface: x along the phi tangent, y along the normal.
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3();
const _t = new THREE.Vector3(), _b = new THREE.Vector3();
export function surfaceMatrix(r, theta, phi, sx, sy, sz, out) {
  sph(1, theta, phi, _n);
  _p.copy(_n).multiplyScalar(r);
  _t.set(Math.sin(phi), -Math.cos(phi), 0).normalize();
  _b.crossVectors(_t, _n);
  _m.makeBasis(_t, _n, _b);
  _q.setFromRotationMatrix(_m);
  _s.set(sx, sy, sz);
  return out.compose(_p, _q, _s);
}
