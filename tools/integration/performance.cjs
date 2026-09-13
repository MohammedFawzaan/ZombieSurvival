const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,WebGPU');
app.commandLine.appendSwitch('use-angle', 'default');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.disableDomainBlockingFor3DAPIs();

const logs = [];

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

  win.webContents.on('console-message', (_e, level, message) => {
    logs.push(`[${level === 3 ? 'error' : level === 2 ? 'warn' : 'log'}] ${message}`);
  });

  await win.loadFile(path.join(root, 'dist/index.html'));
  win.show();
  win.moveTop();
  win.focus();

  const script = `
  (async () => {
    const out = { errors: [], scenes: {} };
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
    // An occluded or hidden window stops receiving requestAnimationFrame,
    // which starves the loop and produces meaningless timings. Drive it
    // explicitly so the measurement reflects the engine, not the harness.
    // Drive the loop at display cadence. requestAnimationFrame is the real
    // driver in play, so measuring anything else (a tight message loop, or a
    // fast timer) reports the harness's pacing rather than the game's.
    // A slow interval is kept purely as a safety net if the window is hidden.
    let pumping = true;
    const raf = () => {
      if (!pumping) return;
      requestAnimationFrame(() => { try { g.__pump(); } catch (e) {} raf(); });
    };
    raf();
    const safety = setInterval(() => { if (pumping) { try { g.__pump(); } catch (e) {} } }, 50);
    window.__stopPump = () => { pumping = false; clearInterval(safety); };
    g.startNewRun();
    g.setDebug(true);
    await wait(1500);

    const t = g.__test();
    out.renderer = g.rendererInfo;

    // --- headshot region check: ray straight at the head from close range ---
    const target = t.zombies.zombies.find((z) => z.alive && z.body);
    if (target) {
      t.player.yaw = 0;
      t.player.pitch = 0;
      await wait(200);
      const pp = t.player.position;
      const dist = 5;
      target.body.setPosition(pp.x, t.player.feetY + 1.2, pp.z - dist);
      target.health = 100000;
      await wait(300);

      const feetY = target.body.position.y - target.body.feetOffset;
      const eyeY = t.player.eye.y;
      const results = {};
      const aimAt = async (label, worldY) => {
        t.player.pitch = Math.atan2(worldY - t.player.eye.y, dist);
        await wait(160);
        const before = target.health;
        t.weapons.forceFire(() => {});
        // fire through the real path so combat runs
        const hp0 = target.health;
        void hp0;
        await wait(60);
        results[label] = 'forceFire-noop';
      };
      void aimAt;

      // Directly exercise the combat system for deterministic region checks.
      const probe = g.__probeShot;
      if (typeof probe === 'function') {
        const heights = {
          head: feetY + target.def.height * 0.95,
          torso: feetY + target.def.height * 0.68,
          legs: feetY + target.def.height * 0.25,
        };
        for (const [label, y] of Object.entries(heights)) {
          target.health = 100000;
          const dy = y - eyeY;
          const len = Math.hypot(dy, dist);
          const r = probe(pp.x, eyeY, pp.z, 0, dy / len, -dist / len);
          results[label] = {
            hit: r.hitZombie,
            region: r.impacts.filter((i) => i.onZombie).map((i) => i.region),
            damage: +r.damageDealt.toFixed(1),
          };
        }
      }
      out.regions = results;
      target.health = target.maxHealth;
    }

    // --- perf sampling in a visible, focused window ---
    const sample = async (label, seconds) => {
      const frames = [];
      const unsub = g.subscribeDebug((d) => frames.push({ ...d }));
      await wait(seconds * 1000);
      unsub();
      const use = frames.slice(2);
      if (use.length === 0) { out.scenes[label] = 'no samples'; return; }
      const fps = use.map((d) => d.fps).filter((v) => v > 0);
      const last = use[use.length - 1];
      out.scenes[label] = {
        avgFps: +(fps.reduce((a, b) => a + b, 0) / Math.max(fps.length, 1)).toFixed(1),
        minFps: +Math.min(...fps).toFixed(1),
        frameMs: +last.frameMs.toFixed(2),
        simMs: +last.simMs.toFixed(2),
        physicsMs: +last.physicsMs.toFixed(2),
        aiMs: +last.aiMs.toFixed(2),
        renderMs: +last.renderMs.toFixed(2),
        drawCalls: last.drawCalls,
        triangles: last.triangles,
        zAlive: last.zombieAlive,
        zActive: last.zombieActive,
        memMb: last.memoryMb,
        steps: last.steps,
        playerMs: last.playerMs,
      };
    };

    await sample('idle', 5);
    t.forceIntent({ forward: 1, sprint: true });
    await sample('sprinting', 6);
    t.forceIntent({});

    // Aggro a crowd near the player and measure the worst case.
    const pp2 = t.player.position;
    let placed = 0;
    for (const z of t.zombies.zombies) {
      if (!z.alive || !z.body) continue;
      const a = (placed / 14) * Math.PI * 2;
      const r = 8 + (placed % 3) * 3;
      z.body.setPosition(pp2.x + Math.cos(a) * r, t.player.feetY + 1.2, pp2.z + Math.sin(a) * r);
      z.awareness = 1.6;
      z.hasTarget = true;
      z.lastKnownX = pp2.x;
      z.lastKnownZ = pp2.z;
      placed++;
    }
    out.crowdSize = placed;
    await wait(700);
    // Keep the player alive so the sim keeps running and we measure real load.
    const keepAlive = setInterval(() => { g.state.health = g.state.maxHealth; }, 120);
    await sample('crowd_combat', 7);
    clearInterval(keepAlive);
    out.crowdStates = {};
    for (const z of t.zombies.zombies) {
      if (!z.alive) continue;
      out.crowdStates[z.state] = (out.crowdStates[z.state] || 0) + 1;
    }

    out.finalPhase = g.state.phase;
    out.finalHealth = g.state.health;
    return out;
  })()
  `;

  let result;
  try {
    result = await win.webContents.executeJavaScript(script, true);
  } catch (err) {
    logs.push('[error] executeJavaScript: ' + err.message);
  }

  console.log('\n===== PROBE RESULT =====');
  console.log(JSON.stringify(result ?? null, null, 2));
  console.log('\n===== CONSOLE =====');
  for (const l of logs.slice(-25)) console.log(l);
  const scenes = result?.scenes ?? {};
  const problems = [...(result?.errors ?? [])];
  for (const [name, s] of Object.entries(scenes)) {
    if (typeof s !== 'object' || s === null) { problems.push(name + ': no samples'); continue; }
    // These floors describe the HARNESS, not the shipped game. Several
    // Electron windows run in sequence here and contend for the same Iris Xe
    // GPU, and the measured window may be partly occluded, so absolute FPS is
    // not comparable to real play. What this suite is actually asserting is
    // that per-step simulation cost stays sane; use the in-game F3 overlay or
    // the `pacing` suite for real frame-rate figures.
    if (s.playerMs !== undefined && s.playerMs > 4) {
      problems.push(name + ': player step cost ' + s.playerMs.toFixed(2) + ' ms per step is too high');
    }
    if (s.physicsMs > 20) {
      problems.push(name + ': physics ' + s.physicsMs + ' ms per step is too high');
    }
    if (s.aiMs > 8) {
      problems.push(name + ': AI ' + s.aiMs + ' ms per step is too high');
    }
    if (s.drawCalls > 800) {
      problems.push(name + ': ' + s.drawCalls + ' draw calls exceeds the 800 budget');
    }
  }
  if (problems.length) {
    console.log('\nPERFORMANCE PROBLEMS:');
    for (const p of problems) console.log('  - ' + p);
  }
  console.log('\nVERDICT: ' + (problems.length ? 'FAIL' : 'PASS'));
  setTimeout(() => app.exit(problems.length ? 1 : 0), 300);
});

setTimeout(() => {
  console.log('PROBE TIMEOUT');
  for (const l of logs.slice(-25)) console.log(l);
  app.exit(2);
}, 150000);
