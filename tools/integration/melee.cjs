const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 720, show: true,
    webPreferences: { preload: path.join(root,'dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  await win.loadFile(path.join(root, 'dist/index.html'), { query: { map: 'forest' } });
  win.focus();
  const r = await win.webContents.executeJavaScript(`(async () => {
    const out = { errors: [] };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();
    while (!(window.game && window.game.state.phase === 'menu')) { if (Date.now()-t0>40000) return 'timeout'; await wait(120); }
    const g = window.game; g.headless = true; g.startNewRun();
    await wait(1500);
    const t = g.__test();

    // One zombie, standing player, long observation.
    const all = t.zombies.zombies.filter(z=>z.alive&&z.body);
    const z = all[0];
    for (const q of all.slice(1)) { q.body.setPosition(Math.random()*300-150, 60, Math.random()*300-150); q.awareness=0; q.hasTarget=false; q.state='idle'; }
    const pp = t.player.position;
    z.body.setPosition(pp.x + 12, t.player.feetY + 1.2, pp.z);
    z.awareness = 1.6; z.hasTarget = true;

    const keepAlive = setInterval(()=>{ g.state.health = g.state.maxHealth; }, 100);
    let minD = Infinity; const trail = []; let damageEvents = 0; let lastHp = g.state.health;
    const hpWatch = setInterval(()=>{ if (g.state.health < lastHp) damageEvents++; lastHp = g.state.health; }, 40);

    for (let i = 0; i < 300; i++) {
      z.awareness = 1.6; z.hasTarget = true;
      z.lastKnownX = t.player.position.x; z.lastKnownZ = t.player.position.z;
      await wait(50);
      const a = t.player.position, b = z.body.position;
      const d = Math.hypot(a.x-b.x, a.z-b.z);
      if (d < minD) minD = d;
      if (i % 50 === 0) trail.push({ t: (i*0.05).toFixed(1), d: +d.toFixed(2), state: z.state });
    }
    clearInterval(keepAlive); clearInterval(hpWatch);
    const a = t.player.position, b = z.body.position;
    out.singleZombie = {
      attackRange: z.def.attackRange,
      minDistance: +minD.toFixed(3),
      finalDistance: +Math.hypot(a.x-b.x, a.z-b.z).toFixed(3),
      finalState: z.state,
      damageEvents,
      trail,
    };
    if (minD > z.def.attackRange + 0.6) out.errors.push('zombie never got within attack range: min ' + minD.toFixed(2) + ' vs range ' + z.def.attackRange);
    if (damageEvents === 0) out.errors.push('zombie never landed a hit in 15 s of chasing');
    if (minD < 0.35) out.errors.push('zombie got inside the player capsule: ' + minD.toFixed(2));
    return out;
  })()`, true);
  console.log(JSON.stringify(r, null, 2));
  console.log('VERDICT: ' + ((r?.errors?.length ?? 1) === 0 ? 'PASS' : 'FAIL'));
  const bad = (r?.errors?.length ?? 1) !== 0;
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
setTimeout(()=>{ console.log('TIMEOUT'); app.exit(2); }, 180000);
