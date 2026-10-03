// Entry point. Checks for Three.js and WebGL before loading the rest of the site,
// so a browser without them gets a fallback message instead of a broken page.
const stage = document.getElementById('stage');
const hint = document.getElementById('hint');
const noHover = window.matchMedia('(hover: none)').matches;
hint.textContent = noHover ? 'Drag to look around. Hold to fire.' : 'Move your cursor. Hold the mouse button to fire.';

function fail() {
  hint.remove();
  const ld = document.getElementById('loader');
  if (ld) ld.remove();
  stage.innerHTML = '<div class="fallback"><p>This eye needs WebGL to render. Open the page in a recent version of Chrome, Safari, Firefox, or Edge.</p></div>';
}

if (!window.THREE) {
  fail();
} else {
  import('./core.js')
    .then(function (core) {
      if (!core.renderer) { fail(); return null; }
      return import('./app.js');
    })
    .catch(function (err) { console.error(err); fail(); });
}
