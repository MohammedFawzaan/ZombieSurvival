export const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const MAX_FRAME_DT = 0.25;

/**
 * When frames run long, asking for more catch-up steps makes the next frame
 * longer still, which asks for even more steps. Past this frame time the
 * clock stops trying to catch up and lets simulation time slip instead, so
 * the loop recovers rather than spiralling.
 */
const SPIRAL_FRAME_DT = 0.05;

export class Clock {
  private accumulator = 0;
  private last = 0;
  private started = false;

  frameDt = 0;

  alpha = 0;

  elapsed = 0;

  reset(): void {
    this.accumulator = 0;
    this.started = false;
    this.frameDt = 0;
  }

  advance(nowMs: number): number {
    if (!this.started) {
      this.started = true;
      this.last = nowMs;
      return 0;
    }
    let dt = (nowMs - this.last) / 1000;
    this.last = nowMs;
    if (dt < 0) dt = 0;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT;
    this.frameDt = dt;

    this.accumulator += dt;
    let steps = Math.floor(this.accumulator / FIXED_DT);

    // Cap catch-up work on a slow frame. Two steps still absorbs ordinary
    // jitter, but a frame that is already long is never handed five steps'
    // worth of simulation on top of its own cost.
    const budget = dt > SPIRAL_FRAME_DT ? 2 : MAX_STEPS_PER_FRAME;
    if (steps > budget) {
      steps = budget;
      this.accumulator = 0;
    } else {
      this.accumulator -= steps * FIXED_DT;
    }
    this.elapsed += steps * FIXED_DT;
    this.alpha = this.accumulator / FIXED_DT;
    return steps;
  }
}
