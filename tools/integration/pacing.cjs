const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,WebGPU');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    show: true,
    backgroundColor: '#0a0d0a',
    webPreferences: {
      preload: path.join(root, 'dist-electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  await win.loadFile(path.join(root, 'dist/index.html'));
  win.focus();

  const script = `
  (async () => {
    const out = { errors: [] };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitFor = async (fn, label, timeout = 40000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try { if (fn()) return true; } catch (e) {}
        await wait(120);
      }
      out.errors.push('timeout: ' + label);
      return false;
    };

    if (!(await waitFor(() => window.game && window.game.state.phase === 'menu', 'menu'))) return out;
    const g = window.game;
    g.headless = true;
    g.startNewRun();
    await wait(1200);

    const t = g.__test();

    // Walk forward continuously and sample the camera position every frame.
    // Smoothness is about whether the camera ADVANCES every frame, not about
    // average FPS: a repeated position is a dropped-looking frame even at
    // 120 FPS. This is the exact symptom being fixed.
    const measure = async (label, intent, frames) => {
      t.forceIntent(intent);
      await wait(400); // let speed settle so we measure steady state

      const samples = [];
      let last = null;
      for (let i = 0; i < frames; i++) {
        await new Promise((r) => requestAnimationFrame(r));
        const e = g.__eye ? g.__eye() : null;
        const now = performance.now();
        if (e) samples.push({ t: now, x: e.x, y: e.y, z: e.z });
      }

      let stalled = 0;
      const deltas = [];
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1], b = samples[i];
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        deltas.push(d);
        if (d < 1e-9) stalled++;
      }
      const mean = deltas.reduce((s, v) => s + v, 0) / Math.max(deltas.length, 1);
      // Coefficient of variation of per-frame travel: low = even motion.
      const varsum = deltas.reduce((s, v) => s + (v - mean) * (v - mean), 0);
      const sd = Math.sqrt(varsum / Math.max(deltas.length, 1));
      return {
        label,
        frames: deltas.length,
        stalledFrames: stalled,
        stalledPct: +(100 * stalled / Math.max(deltas.length, 1)).toFixed(1),
        meanStep: +mean.toFixed(5),
        cv: +(sd / Math.max(mean, 1e-9)).toFixed(3),
      };
    };

    // --- mouse look smoothness ---
    // Dispatch real pointermove events through the actual input path
    // (pointer lock -> coalesced deltas -> sensitivity -> player.look) so the
    // engine's own handling is what gets measured, not a direct call.
    const measureLook = async (label, perEventDelta, frames) => {
      t.forceIntent({});
      // Pointer lock needs a real gesture, so force the flag to drive the
      // genuine handler chain rather than bypassing it.
      g.input.__forceLocked(true);
      await wait(200);
      const yaws = [];
      for (let i = 0; i < frames; i++) {
        window.dispatchEvent(new PointerEvent('pointermove', {
          movementX: perEventDelta,
          movementY: 0,
          bubbles: true,
        }));
        await new Promise((r) => requestAnimationFrame(r));
        yaws.push(g.__look().yaw);
      }
      const steps = [];
      for (let i = 1; i < yaws.length; i++) {
        let d = yaws[i] - yaws[i - 1];
        if (d > Math.PI) d -= Math.PI * 2;
        else if (d < -Math.PI) d += Math.PI * 2;
        steps.push(Math.abs(d));
      }
      const moved = steps.filter((v) => v > 1e-12);
      const mean = steps.reduce((s, v) => s + v, 0) / Math.max(steps.length, 1);
      const varsum = steps.reduce((s, v) => s + (v - mean) * (v - mean), 0);
      const sd = Math.sqrt(varsum / Math.max(steps.length, 1));
      return {
        label,
        frames: steps.length,
        movedFrames: moved.length,
        stalledFrames: steps.length - moved.length,
        meanYawStep: +mean.toFixed(6),
        cv: +(sd / Math.max(mean, 1e-9)).toFixed(4),
      };
    };
    out.lookSlow = await measureLook('look-slow', 2, 180);
    out.lookFast = await measureLook('look-fast', 25, 180);

    out.walk = await measure('walk', { forward: 1 }, 240);
    out.sprint = await measure('sprint', { forward: 1, sprint: true }, 240);
    t.forceIntent({});
    await wait(300);

    // Frame-time distribution while moving: smoothness is about the spread
    // and the worst case, not the average. A 1% low far below the mean is
    // what a player perceives as stutter.
    t.forceIntent({ forward: 1, sprint: true });
    await wait(500);
    const times = [];
    let prev = performance.now();
    for (let i = 0; i < 400; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now();
      times.push(now - prev);
      prev = now;
    }
    t.forceIntent({});
    times.sort((a, b) => a - b);
    const pick = (q) => +times[Math.min(times.length - 1, Math.floor(q * times.length))].toFixed(2);
    const avg = times.reduce((s, v) => s + v, 0) / times.length;
    out.frameTimes = {
      avgMs: +avg.toFixed(2),
      medianMs: pick(0.5),
      p95Ms: pick(0.95),
      p99Ms: pick(0.99),
      worstMs: +times[times.length - 1].toFixed(2),
      spikesOver33ms: times.filter((v) => v > 33).length,
    };

    // Vegetation coherence: while walking, the number of instances drawn must
    // not swing wildly frame to frame. Large swings mean layers are being
    // rebuilt against different camera positions, which is seen as the whole
    // scene flickering.
    t.forceIntent({ forward: 1, sprint: true });
    await wait(500);
    const counts = [];
    for (let i = 0; i < 240; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      counts.push(g.__vegetationCounts());
    }
    t.forceIntent({});
    let maxJump = 0;
    let jumpFrames = 0;
    for (let i = 1; i < counts.length; i++) {
      let frameJump = 0;
      for (let k = 0; k < counts[i].length; k++) {
        frameJump += Math.abs(counts[i][k] - counts[i - 1][k]);
      }
      if (frameJump > maxJump) maxJump = frameJump;
      if (frameJump > 0) jumpFrames++;
    }
    out.vegetation = {
      layers: counts[0] ? counts[0].length : 0,
      framesWithChange: jumpFrames,
      maxInstanceJump: maxJump,
      changeRate: +(100 * jumpFrames / counts.length).toFixed(1),
    };

    out.renderer = g.rendererInfo;
    return out;
  })()
  `;

  let result;
  try {
    result = await win.webContents.executeJavaScript(script, true);
  } catch (err) {
    result = { errors: ['exec failed: ' + String(err && err.message) ] };
  }

  console.log('PACING_RESULT ' + JSON.stringify(result));
  const bad = (result.errors || []).length > 0;
  app.exit(bad ? 1 : 0);
});
