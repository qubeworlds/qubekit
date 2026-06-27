// Orchestration. A header dropdown selects the mechanism; each is self-contained
// (its own model + views + controls). The 2D/3D tabs apply within the selected
// mechanism. Per-mechanism control: the train shows a Lock checkbox; the governor,
// arm, and drone each drive a single labelled slider the model describes
// (Speed / Cycle / Throttle) — a generic input → the solver responds.

import { buildTrain } from './gears-model.js';
import { init2D as train2D } from './view-2d.js';
import { init3D as train3D } from './view-3d.js';
import { buildGovernor } from './governor-model.js';
import { init2D as governor2D } from './governor-2d.js';
import { init3D as governor3D } from './governor-3d.js';
import { buildArm } from './arm-model.js';
import { init2D as arm2D } from './arm-2d.js';
import { init3D as arm3D } from './arm-3d.js';
import { buildDrone } from './drone-model.js';
import { init2D as drone2D } from './drone-2d.js';
import { init3D as droneQuine3D } from './quine-3d.js';
import { buildPaper } from './paper-model.js';
import { init2D as paper2D } from './paper-2d.js';
import { init3D as paperQuine3D } from './paper-quine-3d.js';

const MECH = {
  train: {
    label: 'Gear train + steam engine', has3D: true, control: 'lock',
    build: (o) => buildTrain(o), v2: train2D, v3: train3D,
  },
  governor: {
    label: 'Flyball governor', has3D: true, control: 'slider',
    build: () => buildGovernor(), v2: governor2D, v3: governor3D,
  },
  arm: {
    label: 'Robot arm', has3D: true, control: 'slider',
    build: () => buildArm(), v2: arm2D, v3: arm3D,
  },
  // The drone's 3D tab is the real Quine wasm engine (Jolt physics + flight
  // controller); the 2D tab is the solver schematic.
  drone: {
    label: 'Drone', has3D: true, control: 'rpm4',
    build: () => buildDrone(), v2: drone2D, v3: droneQuine3D,
  },
  // Paper / fabric: a real Jolt soft-body sheet in the Quine engine (3D tab);
  // the 2D tab is a side-profile cartoon of the same peel. A material toggle +
  // a Lift slider.
  paper: {
    label: 'Paper / fabric', has3D: true, control: 'cloth',
    build: () => buildPaper(), v2: paper2D, v3: paperQuine3D,
  },
};

const el = (id) => document.getElementById(id);
const canvas2d = el('c2d'), view2d = el('view2d'), view3d = el('view3d'), facts = el('facts');
const lockCtl = el('ctl-lock'), sliderCtl = el('ctl-slider'), rpm4Ctl = el('ctl-rpm4'), clothCtl = el('ctl-cloth'), tab3d = el('tab-3d');

let key = 'train', model, v2, v3, tab = '2d';

const sliderText = (c, v) => `${v}${c.unit ? ' ' + c.unit : ''}`;

// Make a range input reliably draggable by touch. iOS Safari's native range-thumb
// hit-testing is flaky — a touch that starts a hair off the thumb is handed to
// page scroll, so the drag "misses". Instead we drive the value straight from the
// pointer's X and grab the gesture with setPointerCapture, so a touch ANYWHERE on
// the track owns it and the outer page can't scroll mid-drag. Pairs with the CSS
// `touch-action: none`. (Also gives click/tap-to-set on desktop.)
function bindRangeDrag(input) {
  let active = false;
  const setFromX = (clientX) => {
    const r = input.getBoundingClientRect();
    if (r.width <= 0) return;
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const min = Number(input.min), max = Number(input.max), step = Number(input.step) || 1;
    let v = Math.round((min + t * (max - min)) / step) * step;
    v = Math.max(min, Math.min(max, v));
    if (String(v) !== input.value) { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); }
  };
  input.addEventListener('pointerdown', (e) => {
    active = true;
    try { input.setPointerCapture(e.pointerId); } catch (_) {}
    setFromX(e.clientX); e.preventDefault();
  });
  input.addEventListener('pointermove', (e) => { if (active) { setFromX(e.clientX); e.preventDefault(); } });
  const end = (e) => { active = false; try { input.releasePointerCapture(e.pointerId); } catch (_) {} };
  input.addEventListener('pointerup', end);
  input.addEventListener('pointercancel', end);
  input.addEventListener('lostpointercapture', () => { active = false; });
  // Belt-and-braces: while dragging, swallow touchmove so the page never scrolls.
  input.addEventListener('touchmove', (e) => { if (active) e.preventDefault(); }, { passive: false });
}

// Build the drone's four RPM sliders from model.sliders / model.values. Each row
// is coloured by spin direction (blue CCW / red CW) and drives model.setSlider(i).
function buildRpm4() {
  rpm4Ctl.replaceChildren();
  const vals = model.values;
  model.sliders.forEach((s, i) => {
    const cw = model.rotors[i].spin === -1;
    const row = document.createElement('label'); row.className = `r ${cw ? 'cw' : 'ccw'}`;
    const lab = document.createElement('span'); lab.className = 'lab'; lab.textContent = s.label;
    const inp = document.createElement('input');
    inp.type = 'range'; inp.min = s.min; inp.max = s.max; inp.step = s.step; inp.value = vals[i];
    const out = document.createElement('span'); out.className = 'val'; out.textContent = `${vals[i]} ${s.unit}`;
    inp.addEventListener('input', (e) => {
      model.setSlider(i, Number(e.target.value));
      out.textContent = `${model.values[i]} ${s.unit}`;
      facts.innerHTML = model.factsHTML();
    });
    bindRangeDrag(inp);
    row.append(lab, inp, out); rpm4Ctl.appendChild(row);
  });
}

// Build the paper/fabric control: a material toggle (Paper | Fabric) + a Lift
// slider. The toggle switches the cloth's grid + solver stiffness (the 3D view
// polls model.mode and rebuilds the soft body); the slider peels the handle.
function buildCloth() {
  clothCtl.replaceChildren();
  const seg = document.createElement('div'); seg.className = 'seg';
  const btns = {};
  model.modes.forEach((md) => {
    const b = document.createElement('button');
    b.textContent = md === 'paper' ? 'Paper' : 'Fabric';
    b.setAttribute('aria-pressed', String(model.mode === md));
    b.addEventListener('click', () => {
      model.setMode(md);
      for (const k of model.modes) btns[k].setAttribute('aria-pressed', String(model.mode === k));
      facts.innerHTML = model.factsHTML();
    });
    btns[md] = b; seg.appendChild(b);
  });

  const c = model.sliderConfig;
  const lab = document.createElement('label'); lab.className = 'lift';
  const span = document.createElement('span'); span.textContent = c.label;
  const inp = document.createElement('input');
  inp.type = 'range'; inp.min = c.min; inp.max = c.max; inp.step = c.step; inp.value = model.sliderValue;
  const out = document.createElement('span'); out.className = 'liftval'; out.textContent = `${model.sliderValue} ${c.unit}`;
  inp.addEventListener('input', (e) => {
    model.setSlider(Number(e.target.value));
    out.textContent = `${model.sliderValue} ${c.unit}`;
    facts.innerHTML = model.factsHTML();
  });
  bindRangeDrag(inp);
  lab.append(span, inp, out);
  clothCtl.append(seg, lab);
}

function mount(opts = {}) {
  if (v2) v2.dispose();
  if (v3) { v3.dispose(); v3 = null; }
  const m = MECH[key];
  model = m.build(opts);
  facts.innerHTML = typeof model.factsHTML === 'function' ? model.factsHTML() : model.factsHTML;

  // per-mechanism controls
  lockCtl.hidden = m.control !== 'lock';
  sliderCtl.hidden = m.control !== 'slider';
  rpm4Ctl.hidden = m.control !== 'rpm4';
  clothCtl.hidden = m.control !== 'cloth';
  tab3d.hidden = !m.has3D;
  if (m.control === 'rpm4') buildRpm4();
  if (m.control === 'cloth') buildCloth();
  if (m.control === 'slider') {
    const c = model.sliderConfig;
    const q = c.param ? new URLSearchParams(location.search).get(c.param) : null;
    if (q !== null && model.setSlider) model.setSlider(Number(q));
    const sp = el('slider');
    el('slabel').textContent = c.label;
    sp.min = c.min; sp.max = c.max; sp.step = c.step ?? 1; sp.value = model.sliderValue;
    el('sliderval').textContent = sliderText(c, model.sliderValue);
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
// train: lock toggle rebuilds; slider mechanisms update live
el('lock').addEventListener('change', (e) => mount({ lock: e.target.checked }));
el('slider').addEventListener('input', (e) => {
  if (!model.setSlider) return;
  model.setSlider(Number(e.target.value));
  el('sliderval').textContent = sliderText(model.sliderConfig, model.sliderValue);
  facts.innerHTML = model.factsHTML();
});
bindRangeDrag(el('slider')); // touch-reliable drag for the governor/arm speed slider

const params = new URLSearchParams(location.search);
key = MECH[params.get('mech')] ? params.get('mech') : 'train';
el('mech').value = key;
tab = params.get('view') === '3d' ? '3d' : '2d';
if (key === 'train') el('lock').checked = params.get('lock') === '1';
mount(key === 'train' ? { lock: el('lock').checked } : {});
