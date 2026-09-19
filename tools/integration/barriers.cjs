const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 720, show: true,
    webPreferences: { preload: path.join(root,'dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  await win.loadFile(path.join(root, 'dist/index.html'), { query: { map: 'city' } });
  win.focus();
  const r = await win.webContents.executeJavaScript(`(async () => {
    const out = { errors: [], barriers: [] };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();
    while (!(window.game && window.game.state.phase === 'menu')) { if (Date.now()-t0>40000) return 'timeout'; await wait(120); }
    const g = window.game;
    if (g.mapId !== 'city') { out.errors.push('not the city map'); return out; }

    g.headless = true;
    let pumping = true;
    const raf = () => { if (!pumping) return; requestAnimationFrame(() => { try { g.__pump(); } catch (e) {} raf(); }); };
    raf();
    const safety = setInterval(() => { if (pumping) { try { g.__pump(); } catch (e) {} } }, 50);

    g.startNewRun();
    await wait(1500);
    const t = g.__test();
    const R = g.__round();
    if (!R.mode) { out.errors.push('no RoundMode'); return out; }

    const keepAlive = setInterval(() => { g.state.health = g.state.maxHealth; }, 100);

    const defs = R.barrierDefs();
    if (!defs || defs.length === 0) { out.errors.push('no barrier definitions exposed'); return out; }

    const walkAcross = async (bar) => {
      const nx = -Math.sin(bar.yaw);
      const nz = -Math.cos(bar.yaw);
      const back = 6;
      const sx = bar.x - nx * back;
      const sz = bar.z - nz * back;
      t.player.respawn(sx, t.terrain.heightAt(sx, sz) + 0.4, sz);
      t.player.yaw = Math.atan2(-nx, -nz);
      await wait(350);
      const a = { x: t.player.position.x, z: t.player.position.z };
      for (let i = 0; i < 170; i++) { t.forceIntent({ forward: 1, sprint: true }); await wait(16); }
      t.forceIntent({});
      await wait(200);
      const b = t.player.position;
      const crossedBy = (b.x - bar.x) * nx + (b.z - bar.z) * nz;
      return { start: a, end: { x: +b.x.toFixed(2), z: +b.z.toFixed(2) }, crossedBy: +crossedBy.toFixed(2) };
    };

    for (const bar of defs) {
      const locked = await walkAcross(bar);
      R.setPoints(bar.cost + 200);
      const opened = R.forceOpen(bar.id);
      await wait(250);
      const unlocked = await walkAcross(bar);
      out.barriers.push({
        id: bar.id,
        cost: bar.cost,
        yaw: +bar.yaw.toFixed(3),
        lockedCrossedBy: locked.crossedBy,
        unlockedCrossedBy: unlocked.crossedBy,
        opened,
      });
      if (!opened) out.errors.push(bar.id + ': forceOpen failed');
      if (locked.crossedBy > 1.0) out.errors.push(bar.id + ': player walked THROUGH the locked barrier (crossed ' + locked.crossedBy.toFixed(2) + 'm past it)');
      if (unlocked.crossedBy < 2.0) out.errors.push(bar.id + ': opened barrier still blocks (only reached ' + unlocked.crossedBy.toFixed(2) + 'm)');
    }

    clearInterval(keepAlive);
    pumping = false;
    clearInterval(safety);
    return out;
  })()`, true);

  console.log('BARRIERS_RESULT ' + JSON.stringify(r, null, 2));
  const bad = r === 'timeout' || !r || (r.errors || []).length > 0;
  console.log('VERDICT: ' + (bad ? 'FAIL' : 'PASS'));
  app.exit(bad ? 1 : 0);
});
