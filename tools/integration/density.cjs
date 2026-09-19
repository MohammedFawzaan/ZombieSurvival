const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();
const TARGET_ROUND = Number(process.env.ZS_ROUND || 15);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 720, show: true,
    webPreferences: { preload: path.join(root,'dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  await win.loadFile(path.join(root, 'dist/index.html'), { query: { map: 'city' } });
  win.focus();
  const r = await win.webContents.executeJavaScript(`(async () => {
    const TARGET_ROUND = ${TARGET_ROUND};
    const out = { errors: [], checks: {} };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();
    while (!(window.game && window.game.state.phase === 'menu')) { if (Date.now()-t0>40000) return 'timeout'; await wait(120); }
    const g = window.game;
    g.headless = true;
    let pumping = true;
    const raf = () => { if (!pumping) return; requestAnimationFrame(() => { try { g.__pump(); } catch (e) {} raf(); }); };
    raf();
    g.startNewRun();
    await wait(1500);
    const t = g.__test();
    const R = g.__round();
    if (!R.mode) { out.errors.push('no RoundMode'); return out; }

    const keepAlive = setInterval(() => { g.state.health = g.state.maxHealth; }, 80);
    R.openAllBarriers();
    await wait(600);

    const rounds = R.mode.rounds;
    while (rounds.round < TARGET_ROUND) rounds.startNextRoundNow();
    await wait(400);
    out.checks.plan = {
      round: rounds.round,
      totalZombies: rounds.plan.totalZombies,
      maxAlive: rounds.plan.maxAlive,
      spawnInterval: rounds.plan.spawnInterval,
    };

    let peakAlive = 0;
    const alivePoll = setInterval(() => {
      if (t.zombies.aliveCount > peakAlive) peakAlive = t.zombies.aliveCount;
    }, 40);

    const s0 = Date.now();
    while (Date.now() - s0 < 45000 && t.zombies.aliveCount < rounds.plan.maxAlive) await wait(150);
    out.checks.fillSeconds = +((Date.now() - s0) / 1000).toFixed(1);

    g.setDebug(true);
    await wait(800);
    const frames = [];
    const unsub = g.subscribeDebug((d) => frames.push({ ...d }));
    const rafTimes = [];
    let lastT = performance.now();
    let perfRunning = true;
    const rafProbe = () => { if (!perfRunning) return; requestAnimationFrame((now) => { rafTimes.push(now - lastT); lastT = now; rafProbe(); }); };
    rafProbe();

    const patrol = [Math.PI, Math.PI * 0.5, 0, -Math.PI * 0.5];
    for (let s = 0; s < 4; s++) {
      t.player.yaw = patrol[s];
      for (let i = 0; i < 180; i++) {
        t.forceIntent({ forward: 1, sprint: i % 3 === 0 });
        t.forceLook(0.004, 0);
        await wait(16);
      }
    }
    t.forceIntent({});
    perfRunning = false; unsub();
    clearInterval(alivePoll); clearInterval(keepAlive);

    const use = frames.slice(3);
    const fpsVals = use.map((d) => d.fps).filter((v) => v > 0);
    const dcVals = use.map((d) => d.drawCalls).filter((v) => v > 0);
    const triVals = use.map((d) => d.triangles).filter((v) => v > 0);
    const aliveVals = use.map((d) => d.zombieAlive).filter((v) => v > 0);
    const med = (a) => { const s = [...a].sort((x,y)=>x-y); return s.length ? s[Math.floor(s.length/2)] : 0; };
    const pct = (a,p) => { const s=[...a].sort((x,y)=>x-y); return s.length ? s[Math.min(s.length-1, Math.floor(s.length*p))] : 0; };
    const ft = rafTimes.slice(5).filter((v) => v > 0 && v < 500);

    out.performance = {
      samples: use.length,
      avgFps: fpsVals.length ? +(fpsVals.reduce((a,b)=>a+b,0)/fpsVals.length).toFixed(1) : null,
      minFps: fpsVals.length ? +Math.min(...fpsVals).toFixed(1) : null,
      medianFrameMs: +med(ft).toFixed(2),
      p99FrameMs: +pct(ft,0.99).toFixed(2),
      worstFrameMs: ft.length ? +Math.max(...ft).toFixed(2) : null,
      spikesOver33ms: ft.filter((v)=>v>33).length,
      frameSamples: ft.length,
      drawCallsMedian: med(dcVals),
      drawCallsMax: dcVals.length ? Math.max(...dcVals) : null,
      trianglesMedian: med(triVals),
      peakZombiesAlive: peakAlive,
      medianZombiesAlive: med(aliveVals),
      buckets: use.length ? {
        simMs: +med(use.map((d)=>d.simMs)).toFixed(2),
        physicsMs: +med(use.map((d)=>d.physicsMs)).toFixed(2),
        aiMs: +med(use.map((d)=>d.aiMs)).toFixed(2),
        renderMs: +med(use.map((d)=>d.renderMs)).toFixed(2),
        playerMs: +med(use.map((d)=>d.playerMs)).toFixed(2),
      } : null,
      memoryMb: use.length ? use[use.length-1].memoryMb : null,
    };

    if (peakAlive < rounds.plan.maxAlive * 0.85) {
      out.errors.push('population never approached the round cap: peak ' + peakAlive + ' vs maxAlive ' + rounds.plan.maxAlive);
    }
    if (out.performance.avgFps !== null && out.performance.avgFps < 50) {
      out.errors.push('density average FPS below 50: ' + out.performance.avgFps);
    }
    pumping = false;
    return out;
  })()`, true);
  console.log(JSON.stringify(r, null, 2));
  const bad = (r?.errors?.length ?? 1) !== 0;
  console.log('VERDICT: ' + (bad ? 'FAIL' : 'PASS'));
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
setTimeout(()=>{ console.log('TIMEOUT'); app.exit(2); }, 420000);
