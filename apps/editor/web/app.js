// Orchestration: build the shared model once, mount the 2D view, lazy-mount the
// 3D view on first switch, and run only the active tab's animation loop.

import { buildTrain } from './gears-model.js';
import { init2D } from './view-2d.js';
import { init3D } from './view-3d.js';

const model = buildTrain();
document.getElementById('facts').innerHTML = model.factsHTML;

const views = {
  '2d': { el: document.getElementById('view2d'), api: init2D(model, document.getElementById('c2d')) },
  '3d': { el: document.getElementById('view3d'), api: null },
};

function activate(tab) {
  for (const [k, v] of Object.entries(views)) {
    const on = k === tab;
    v.el.hidden = !on;
    document.querySelector(`.tabs button[data-tab="${k}"]`).setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!on && v.api) v.api.stop();
  }
  if (tab === '3d' && !views['3d'].api) views['3d'].api = init3D(model, views['3d'].el);
  const api = views[tab].api;
  api.resize();
  api.start();
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => activate(b.dataset.tab)));

const initial = new URLSearchParams(location.search).get('view') === '3d' ? '3d' : '2d';
activate(initial);
