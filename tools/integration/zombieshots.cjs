const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..', '..');
const outDir = process.env.SHOT_DIR || path.join(root, 'screenshots', 'zombies');

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,WebGPU');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();

const pageErrors = [];

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: true,
    webPreferences: {
      preload: path.join(root, 'dist-electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.on('console-message', (_e, level, message) => {
    if (level === 3) pageErrors.push(message);
  });

  await win.loadFile(path.join(root, 'dist/index.html'));

  const setup = await win.webContents.executeJavaScript(
    `(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const t0 = Date.now();
      while (!(window.game && window.game.state.phase === 'menu')) {
        if (Date.now() - t0 > 90000) return { ok: false, err: 'timeout' };
        await wait(150);
      }
      const g = window.game;
      g.headless = true;
      g.startNewRun();
      for (let i = 0; i < 120; i++) { g.__pump(performance.now()); await wait(6); }
      window.__vs = {};
      const t = g.__test();
      window.__vs.g = g;
      window.__vs.t = t;
      return { ok: true, source: g.__zombieCost().source };
    })()`,
    true,
  );

  if (!setup.ok) {
    console.log('VERDICT: FAIL');
    console.log('setup failed: ' + setup.err);
    app.exit(1);
    return;
  }
  console.log('geometry source: ' + setup.source);

  async function pose(kind, dist, label, opts) {
    const o = JSON.stringify(opts || {});
    const r = await win.webContents.executeJavaScript(
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const g = window.__vs.g, t = window.__vs.t;
        try {
        const zm = t.zombies, pl = t.player;
        const opts = ${o};
        zm.setOptions({ targetActive: 0, maxAlive: 1, despawnDistance: 100000 });
        for (const z of zm.zombies) {
          if (z.body) { try { z.body.dispose(); } catch (e) {} z.body = null; }
          z.alive = false; z.health = 0; z.state = 'dead'; z.renderInit = false;
          z.distToPlayer = 99999;
        }
        zm.aliveCount = 0;
        for (let i = 0; i < 15; i++) { g.__pump(performance.now()); await wait(6); }

        const yaw = 0;
        pl.yaw = yaw; pl.pitch = 0;
        const dirX = -Math.sin(yaw), dirZ = -Math.cos(yaw);
        const px = pl.position.x, pz = pl.position.z;
        const tx = px + dirX * ${dist};
        const tz = pz + dirZ * ${dist};

        const spawnAt = Object.getPrototypeOf(zm).spawnAt;
        const slot = zm.zombies[0];
        spawnAt.call(zm, slot, '${kind}', tx, tz);
        const ty = t.terrain.heightAt(tx, tz);

        const pin = () => {
          pl.yaw = yaw; pl.pitch = 0;
          slot.alive = true;
          slot.health = slot.maxHealth;
          slot.state = opts.state || 'wandering';
          slot.speed = opts.speed != null ? opts.speed : 0;
          slot.yaw = yaw + Math.PI; slot.targetYaw = slot.yaw;
        };

        for (let i = 0; i < 100; i++) { pin(); g.__pump(performance.now()); await wait(6); }
        pin();
        for (let i = 0; i < 10; i++) { g.__pump(performance.now()); await wait(10); }

        const vis = g.__zombieVisibility();
        const anim = g.__zombieAnimation();
        const cost = g.__zombieCost();
        return {
          visible: vis.filter((v) => v[1]).length,
          anim: anim,
          drawCalls: cost.drawCalls,
          triangles: cost.triangles,
          visibleRigs: cost.visibleRigs,
          dist: +slot.distToPlayer.toFixed(2),
          kind: slot.kind,
          groundY: +ty.toFixed(2),
        };
        } catch (e) { return { err: String((e && e.stack) || e) }; }
      })()`,
      true,
    );
    const img = await win.capturePage();
    const file = path.join(outDir, label + '.png');
    fs.writeFileSync(file, img.toPNG());
    console.log(label + ': ' + JSON.stringify(r) + ' -> ' + file);
    return r;
  }

  const results = [];
  try {
    for (const kind of ['walker', 'runner', 'brute']) {
      for (const d of [15, 35]) {
        results.push(await pose(kind, d, kind + '_' + d + 'm', { speed: 0 }));
      }
    }
    results.push(await pose('walker', 8, 'walker_08m_closeup', { speed: 0 }));
    results.push(await pose('brute', 8, 'brute_08m_closeup', { speed: 0 }));
    results.push(await pose('runner', 8, 'runner_08m_closeup', { speed: 0 }));
  } catch (e) {
    console.log('VERDICT: FAIL');
    console.log('error: ' + (e && e.message));
    app.exit(1);
    return;
  }

  const bad = results.filter((r) => r.visible < 1);
  if (bad.length || pageErrors.length) {
    console.log('page errors: ' + JSON.stringify(pageErrors.slice(0, 5)));
    console.log('VERDICT: FAIL');
    app.exit(1);
    return;
  }
  console.log('VERDICT: PASS');
  app.exit(0);
});
