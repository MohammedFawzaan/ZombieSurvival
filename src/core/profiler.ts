export class Profiler {
  private samples = new Map<string, { total: number; count: number; value: number }>();
  private marks = new Map<string, number>();

  private fpsAccum = 0;
  private fpsFrames = 0;
  fps = 0;
  frameMs = 0;

  begin(label: string): void {
    this.marks.set(label, performance.now());
  }

  end(label: string): void {
    const start = this.marks.get(label);
    if (start === undefined) return;
    const ms = performance.now() - start;
    let s = this.samples.get(label);
    if (!s) {
      s = { total: 0, count: 0, value: 0 };
      this.samples.set(label, s);
    }
    s.total += ms;
    s.count++;
  }

  get(label: string): number {
    return this.samples.get(label)?.value ?? 0;
  }

  frame(dt: number): void {
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.25) {
      this.fps = this.fpsFrames / this.fpsAccum;
      this.frameMs = (this.fpsAccum * 1000) / this.fpsFrames;
      for (const s of this.samples.values()) {
        s.value = s.count > 0 ? s.total / s.count : 0;
        s.total = 0;
        s.count = 0;
      }
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }
}
