// Orchestration: build the shared model, mount the active view, switch tabs, and
// rebuild everything when the Lock toggle changes (which adds the bridge gear).

import { buildTrain } from './gears-model.js';
import { init2D } from './view-2d.js';
import { init3D } from './view-3d.js';

const canvas2d = document.getElementById('c2d');
const view2d = document.getElementById('view2d');
const view3d = document.getElementById('view3d');
const facts = document.getElementById('facts');
const lockToggle = document.getElementById('lock');

let model, v2, v3, currentTab = '2d';

function mount(opts) {
  if (v2) v2.dispose();
  if (v3) { v3.dispose(); v3 = null; } // drop the WebGL context; recreated lazily
  model = buildTrain(opts);
  facts.innerHTML = model.factsHTML;
  v2 = init2D(model, canvas2d);
  activate(currentTab);
}

function activate(tab) {
  currentTab = tab;
  view2d.hidden = tab !== '2d';
  view3d.hidden = tab !== '3d';
  document.querySelector('.tabs button[data-tab="2d"]').setAttribute('aria-pressed', tab === '2d');
  document.querySelector('.tabs button[data-tab="3d"]').setAttribute('aria-pressed', tab === '3d');
  v2.stop(); if (v3) v3.stop();
  if (tab === '3d') {
    if (!v3) v3 = init3D(model, view3d);
    v3.resize(); v3.start();
  } else {
    v2.resize(); v2.start();
  }
}

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => activate(b.dataset.tab)));
lockToggle.addEventListener('change', () => mount({ lock: lockToggle.checked }));

const params = new URLSearchParams(location.search);
currentTab = params.get('view') === '3d' ? '3d' : '2d';
lockToggle.checked = params.get('lock') === '1';
mount({ lock: lockToggle.checked });
