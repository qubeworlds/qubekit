import { describe, expect, it } from 'vitest';
import { sliderCrank } from '../src/index';

describe('slider-crank (rotary ↔ reciprocating)', () => {
  const P = { center: [0, 0] as [number, number], crankRadius: 10, rodLength: 30 };

  it('keeps the piston on the cylinder axis and gives stroke = 2·r', () => {
    for (const theta of [0, 0.7, 1.9, 3.3, 5.1]) {
      const s = sliderCrank(P, theta);
      expect(s.piston[0]).toBeCloseTo(0, 9); // on the axis (x = center.x)
      expect(s.stroke).toBeCloseTo(20, 9);
      // rod length is preserved exactly
      const dx = s.crankPin[0] - s.piston[0], dy = s.crankPin[1] - s.piston[1];
      expect(Math.hypot(dx, dy)).toBeCloseTo(30, 6);
    }
  });

  it('reaches top dead centre and bottom dead centre at θ = ±90°', () => {
    const top = sliderCrank(P, Math.PI / 2); // pin at +r
    const bot = sliderCrank(P, -Math.PI / 2); // pin at −r
    expect(top.piston[1]).toBeCloseTo(10 + 30, 9); // r + L
    expect(bot.piston[1]).toBeCloseTo(-10 + 30, 9); // −r + L
    expect(top.piston[1] - bot.piston[1]).toBeCloseTo(20, 9); // full travel = 2r
  });

  it('honours a désaxé cylinder offset', () => {
    const s = sliderCrank({ ...P, offset: 4 }, 1.0);
    expect(s.piston[0]).toBeCloseTo(4, 9);
  });
});
