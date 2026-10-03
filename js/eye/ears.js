import { reduceMotion, srgb, lerp } from '../core.js';
import { state } from '../state.js';
import { canvas } from './textures.js';
import { M, toEyeAxis } from './materials.js';
import { pitchGroup } from './eyeball.js';

// ---------- Cat ears (on a slim band hugging the top of the eye, so the lids slide underneath) ----------
// Sharp, outward-leaning armour ears: layered blades and knobs along the top edge, parallel bars with
// rivets, a triangular frame holding a glowing panel, smoky glass fins, and a piston behind each ear.
export const ears = [];
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
export function earTwitch(ear, strength) {
  ear.vfold -= 7 * strength;
}
export function earsPerk() {
  ears.forEach(function (ear) { ear.vfold += 4; });
}

export function updateEars(t, dt) {
  const anger = state.anger;
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
}
