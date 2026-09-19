const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..', '..');
const outDir = process.env.SHOT_DIR || path.join(root, 'screenshots');

app.commandLine.appendSwitch('use-angle', 'default');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.disableDomainBlockingFor3DAPIs();

const logs = [];

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: 1600, height: 900, show: true,
    backgroundColor: '#0a0d0a',
    webPreferences: {
      preload: path.join(root, 'dist-electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.on('console-message', (_e, level, message) => {
    logs.push(`[${level === 3 ? 'error' : 'log'}] ${message}`);
  });
  await win.loadFile(path.join(root, 'dist/index.html'), { query: { map: 'forest' } });
  win.focus();

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const capture = async (name) => {
    await wait(600);
    const img = await win.capturePage();
    const file = path.join(outDir, name + '.png');
    fs.writeFileSync(file, img.toPNG());
    console.log('saved ' + file);
  };

  const run = (code) => win.webContents.executeJavaScript(code, true);

  await run(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();
    while (!(window.game && window.game.state.phase === 'menu')) {
      if (Date.now() - t0 > 40000) return 'timeout';
      await wait(120);
    }
    return 'ready';
  })()`);

  await capture('01-menu');

  await run(`(async () => {
    const g = window.game;
    g.headless = true;
    g.startNewRun();
    await new Promise((r) => setTimeout(r, 2500));
    window.__t = g.__test();
    return g.state.phase;
  })()`);
  await capture('02-spawn');

  // Look around from spawn
  await run(`(() => { window.__t.player.look(-2.0, 0); return 1; })()`);
  await capture('03-look-around');

  await run(`(() => { window.__t.player.look(-2.0, 0); return 1; })()`);
  await capture('04-look-around-2');

  // Find the road and stand on it
  await run(`(async () => {
    const t = window.__t;
    const terrain = t.terrain;
    let best = null, bestD = Infinity;
    for (let i = 0; i < 8000; i++) {
      const x = (Math.random() * 2 - 1) * 150;
      const z = (Math.random() * 2 - 1) * 150;
      const d = terrain.distanceToRoad(x, z);
      if (d < bestD) { bestD = d; best = { x, z }; }
      if (bestD < 0.6) break;
    }
    t.player.respawn(best.x, terrain.heightAt(best.x, best.z), best.z);
    t.player.yaw = 0;
    t.player.pitch = -0.05;
    await new Promise((r) => setTimeout(r, 900));
    return 'road at ' + best.x.toFixed(0) + ',' + best.z.toFixed(0) + ' dist ' + bestD.toFixed(2);
  })()`).then((r) => console.log('road:', r));
  await capture('05-road');
  await run(`(() => { window.__t.player.look(-1.6, 0); return 1; })()`);
  await capture('06-road-2');

  // Zombies close up
  await run(`(async () => {
    const g = window.game, t = window.__t;
    const pp = t.player.position;
    t.player.pitch = 0;
    const crowd = t.zombies.zombies.filter((z) => z.alive && z.body).slice(0, 7);
    let i = 0;
    for (const z of crowd) {
      const a = -0.55 + (i / Math.max(crowd.length - 1, 1)) * 1.1;
      const r = 5.5 + (i % 3) * 2.4;
      const fx = -Math.sin(t.player.yaw + a), fz = -Math.cos(t.player.yaw + a);
      z.body.setPosition(pp.x + fx * r, t.player.feetY + 1.2, pp.z + fz * r);
      z.awareness = 1.6;
      z.hasTarget = true;
      z.lastKnownX = pp.x;
      z.lastKnownZ = pp.z;
      z.state = 'chasing';
      i++;
    }
    window.__god = setInterval(() => { g.state.health = g.state.maxHealth; }, 150);
    await new Promise((r) => setTimeout(r, 1400));
    return crowd.length;
  })()`).then((r) => console.log('crowd:', r));
  await capture('07-zombies-approaching');
  await wait(900);
  await capture('08-zombies-closer');

  // Aiming down sights
  await run(`(() => { window.__t.forceIntent({ aim: true }); return 1; })()`);
  await wait(700);
  await capture('09-aiming');

  // Firing the pistol
  await run(`(async () => {
    for (let i = 0; i < 3; i++) {
      window.__t.fireOnce();
      await new Promise((r) => setTimeout(r, 90));
    }
    return window.game.state.magazine;
  })()`);
  await capture('10-firing-pistol');

  // Rifle, hip fire, full auto burst
  await run(`(async () => {
    const g = window.game;
    window.__t.forceIntent({});
    g.weaponsPublic.selectById('rifle');
    await new Promise((r) => setTimeout(r, 700));
    for (let i = 0; i < 6; i++) {
      window.__t.fireOnce();
      await new Promise((r) => setTimeout(r, 70));
    }
    return g.state.weaponName + ' ' + g.state.magazine;
  })()`).then((r) => console.log('rifle:', r));
  await capture('11-firing-rifle');

  // Debug overlay
  await run(`(() => { window.game.setDebug(true); return 1; })()`);
  await wait(900);
  await capture('12-debug-overlay');

  // Kill everything nearby to show blood/death
  await run(`(async () => {
    const t = window.__t;
    for (const z of t.zombies.zombies) {
      if (!z.alive || !z.body) continue;
      if (z.distToPlayer < 16) t.zombies.applyDamage(z, 9999, 'head', 0, 0);
    }
    await new Promise((r) => setTimeout(r, 500));
    return window.game.state.kills;
  })()`).then((r) => console.log('kills:', r));
  await capture('13-after-kills');

  // Low health vignette
  await run(`(() => {
    clearInterval(window.__god);
    window.game.setDebug(false);
    const g = window.game;
    g.state.health = 22;
    g.state.damage(4);
    return g.state.health;
  })()`);
  await wait(300);
  await capture('14-low-health');

  // Death screen
  await run(`(() => { window.game.state.damage(9999); return window.game.state.phase; })()`);
  await wait(1000);
  await capture('15-death-screen');

  // Restart works
  await run(`(async () => {
    window.game.startNewRun();
    await new Promise((r) => setTimeout(r, 2200));
    window.__t = window.game.__test();
    return window.game.state.phase + ' hp=' + window.game.state.health;
  })()`).then((r) => console.log('restart:', r));
  await capture('16-after-restart');

  // Pause screen
  await run(`(() => { window.game.pause(); return window.game.state.phase; })()`);
  await wait(700);
  await capture('17-pause');

  console.log('\n=== CONSOLE ERRORS ===');
  const errs = logs.filter((l) => l.startsWith('[error]'));
  console.log(errs.length ? errs.join('\n') : 'none');
  setTimeout(() => app.exit(0), 400);
});

setTimeout(() => { console.log('SHOT TIMEOUT'); app.exit(2); }, 240000);
