// Orchestration. A header dropdown selects the mechanism; each is self-contained
// (its own model + views + controls). The 2D/3D tabs apply within the selected
// mechanism; the Lock checkbox (train) and Speed slider (governor) are shown only
// where they apply.

import { buildTrain } from './gears-model.js';
import { init2D as train2D } from './view-2d.js';
import { init3D as train3D } from './view-3d.js';
import { buildGovernor } from './governor-model.js';
import { init2D as governor2D } from './governor-2d.js';
import { init3D as governor3D } from './governor-3d.js';

const MECH = {
  train: {
    label: 'Gear train + steam engine', has3D: true, control: 'lock',
    build: (o) => buildTrain(o), v2: train2D, v3: train3D,
  },
  governor: {
    label: 'Flyball governor', has3D: true, control: 'speed',
    build: () => buildGovernor(), v2: governor2D, v3: governor3D,
  },
};

const el = (id) => document.getElementById(id);
const canvas2d = el('c2d'), view2d = el('view2d'), view3d = el('view3d'), facts = el('facts');
const lockCtl = el('ctl-lock'), speedCtl = el('ctl-speed'), tab3d = el('tab-3d');

let key = 'train', model, v2, v3, tab = '2d';

function mount(opts = {}) {
  if (v2) v2.dispose();
  if (v3) { v3.dispose(); v3 = null; }
  const m = MECH[key];
  model = m.build(opts);
  facts.innerHTML = typeof model.factsHTML === 'function' ? model.factsHTML() : model.factsHTML;

  // per-mechanism controls
  lockCtl.hidden = m.control !== 'lock';
  speedCtl.hidden = m.control !== 'speed';
  tab3d.hidden = !m.has3D;
  if (m.control === 'speed') {
    const q = new URLSearchParams(location.search).get('omega');
    if (q !== null) model.omega = Number(q);
    const sp = el('speed');
    sp.min = model.minOmega; sp.max = model.maxOmega; sp.value = model.omega;
    el('speedval').textContent = `${model.omega} rad/s`;
    facts.innerHTML = model.factsHTML();
  }

  v2 = m.v2(model, canvas2d);
  if (!m.has3D && tab === '3d') tab = '2d';
  activate(tab);
}

function activate(t) {
  const m = MECH[key];
  tab = m.has3D ? t : '2d';
  view2d.hidden = tab !== '2d';
  view3d.hidden = tab !== '3d';
  el('tab-2d').setAttribute('aria-pressed', tab === '2d');
  tab3d.setAttribute('aria-pressed', tab === '3d');
  v2.stop(); if (v3) v3.stop();
  if (tab === '3d') { if (!v3) v3 = m.v3(model, view3d); v3.resize(); v3.start(); }
  else { v2.resize(); v2.start(); }
}

// header dropdown → switch mechanism
el('mech').addEventListener('change', (e) => { key = e.target.value; mount({}); });
// tabs
el('tab-2d').addEventListener('click', () => activate('2d'));
tab3d.addEventListener('click', () => activate('3d'));
// train: lock toggle rebuilds; governor: speed slider updates live
el('lock').addEventListener('change', (e) => mount({ lock: e.target.checked }));
el('speed').addEventListener('input', (e) => {
  model.omega = Number(e.target.value);
  el('speedval').textContent = `${model.omega} rad/s`;
  facts.innerHTML = model.factsHTML();
});

const params = new URLSearchParams(location.search);
key = params.get('mech') === 'governor' ? 'governor' : 'train';
el('mech').value = key;
tab = params.get('view') === '3d' ? '3d' : '2d';
if (key === 'train') el('lock').checked = params.get('lock') === '1';
mount(key === 'train' ? { lock: el('lock').checked } : {});
