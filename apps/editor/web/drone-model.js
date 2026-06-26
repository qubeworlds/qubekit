// Drone model — driven FORWARD by four independent rotor RPMs (one slider each).
// @qubekit/solver's quadWrench() turns the four speeds into the body wrench:
// total lift, roll, pitch, and yaw torque. The views integrate that into the
// craft's attitude and height. Set the rotors yourself and watch it react —
// match them to hover, speed the right pair to roll, speed one spin direction to
// yaw. Lengths mm, mass kg, x right / z forward / y up.

import { quadWrench, quadRotors, quadHoverSpeed } from './solver/index.js';

export function buildDrone() {
  // small shrouded "cinewhoop": 110 mm arm, 300 g all-up.
  const params = { armLength: 110, mass: 0.3, thrustCoeff: 1.2e-7, dragCoeff: 2.0e-9 };
  const geo = { bodyW: 90, bodyH: 26, bodyD: 70, ductR: 62, ductH: 16, propR: 52 };
  const rotors = quadRotors(params);
  const hoverSpeed = quadHoverSpeed(params); // rad/s
  const TORPM = 60 / (2 * Math.PI);
  const hoverRpm = hoverSpeed * TORPM;
  const maxRpm = Math.round((hoverRpm * 1.5) / 500) * 500; // headroom above hover
  const labels = ['FR ↻', 'FL ↺', 'RL ↻', 'RR ↺']; // matches quadRotors order + spin

  // four rotor RPMs — start at hover so the craft sits balanced.
  const rpm = rotors.map(() => Math.round(hoverRpm));

  const speeds = () => rpm.map((r) => r / TORPM); // rad/s
  const wrench = () => quadWrench(params, speeds());

  return {
    kind: 'drone',
    params, geo, rotors, hoverSpeed, hoverRpm, maxRpm, labels,
    control: 'rpm4',
    // app.js multi-slider contract
    sliders: rotors.map((r, i) => ({ label: labels[i], min: 0, max: maxRpm, step: 100, unit: 'rpm' })),
    get values() { return rpm.slice(); },
    setSlider(i, v) { rpm[i] = Math.max(0, Math.min(maxRpm, v)); },
    speeds, wrench,
    rpm: (w) => w * TORPM, // rad/s → rpm (views render per-rotor rpm)
    factsHTML() {
      const w = wrench();
      const lift = w.thrust / w.weight;
      const vert = lift > 1.02 ? 'climbing ↑' : lift < 0.98 ? 'descending ↓' : 'hover';
      const turn = Math.abs(w.yaw) < 1e-4 ? 'no yaw' : w.yaw > 0 ? 'yaw ←' : 'yaw →';
      const tilt = Math.abs(w.roll) > 1e-3 || Math.abs(w.pitch) > 1e-3 ? 'tilting' : 'level';
      return `quad · ${params.armLength} mm arms · ${(params.mass * 1000) | 0} g · ` +
        `hover ${Math.round(hoverRpm)} rpm/rotor · ` +
        `lift ${w.thrust.toFixed(2)} N vs ${w.weight.toFixed(2)} N · ` +
        `<b>${vert} · ${tilt} · ${turn}</b>`;
    },
  };
}
