import { describe, it, expect } from 'vitest';
import { Clock, FIXED_DT } from './clock';

describe('Clock alpha', () => {
  it('reports a fractional alpha when a frame lands between fixed steps', () => {
    const c = new Clock();
    c.advance(0);
    // Half a fixed step of real time: no step is due, and the camera should
    // be rendered halfway between the last two physics positions.
    c.advance((FIXED_DT * 1000) / 2);
    expect(c.alpha).toBeGreaterThan(0.45);
    expect(c.alpha).toBeLessThan(0.55);
  });

  it('keeps alpha in [0,1) across a run of uneven frames', () => {
    const c = new Clock();
    let t = 0;
    c.advance(t);
    const deltas = [8.3, 16.7, 9.1, 4.2, 33.4, 11.9, 6.5, 21.0];
    for (let i = 0; i < 200; i++) {
      t += deltas[i % deltas.length];
      c.advance(t);
      expect(c.alpha).toBeGreaterThanOrEqual(0);
      expect(c.alpha).toBeLessThan(1);
    }
  });

  it('accumulates steps so simulation time tracks real time', () => {
    const c = new Clock();
    let t = 0;
    c.advance(t);
    // 120 Hz display, 60 Hz simulation: 2 seconds of frames must produce
    // close to 2 seconds of simulated time.
    for (let i = 0; i < 240; i++) {
      t += 1000 / 120;
      c.advance(t);
    }
    expect(c.elapsed).toBeGreaterThan(1.9);
    expect(c.elapsed).toBeLessThan(2.1);
  });
});
