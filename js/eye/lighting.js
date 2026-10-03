import { renderer, scene, srgb, hdr } from '../core.js';

// Reflections, lights, and the additive-glow fix. Runs once, after everything in the scene is built,
// because the glow fix walks the whole scene.
export function setupLighting() {
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

  // Additive materials add light. The shader premultiplies the colour and writes alpha as the
  // brightest channel, so glows over the transparent canvas are valid premultiplied pixels.
  // (Colour with zero alpha only shows up in some browsers, and alpha that doesn't follow the
  // colour leaves dark specks where faded sparks sit over the page background.)
  function glowShader(shader) {
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>',
      '#include <fog_fragment>\n' +
      'gl_FragColor.rgb *= gl_FragColor.a;\n' +
      'gl_FragColor.a = max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b));');
  }
  scene.traverse(function (o) {
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) {
      if (m.blending !== THREE.AdditiveBlending) return;
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.OneFactor;
      m.blendDst = THREE.OneFactor;
      m.blendEquationAlpha = THREE.AddEquation;
      m.blendSrcAlpha = THREE.OneFactor;
      m.blendDstAlpha = THREE.OneFactor;
      m.onBeforeCompile = glowShader;
    });
  });
}
