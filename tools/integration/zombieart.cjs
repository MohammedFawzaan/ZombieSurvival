const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,WebGPU');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();

const pageErrors = [];

app.whenReady().then(async () => {
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
  win.webContents.on('render-process-gone', (_e, d) => {
    pageErrors.push('render process gone: ' + JSON.stringify(d));
  });

  await win.loadFile(path.join(root, 'dist/index.html'));

  let result;
  try {
    result = await win.webContents.executeJavaScript(
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = { errors: [], checks: [] };
        const t0 = Date.now();
        while (!(window.game && window.game.state.phase === 'menu')) {
          if (Date.now() - t0 > 90000) { out.errors.push('timeout waiting for menu'); return out; }
          await wait(150);
        }
        const g = window.game;
        g.headless = true;
        g.startNewRun();

        for (let i = 0; i < 240; i++) { g.__pump(performance.now()); await wait(8); }

        const cost = g.__zombieCost();
        out.source = cost.source;
        out.visibleRigs = cost.visibleRigs;
        out.drawCallsPerRig = cost.visibleRigs ? +(cost.drawCalls / cost.visibleRigs).toFixed(2) : 0;
        out.trianglesPerRig = cost.visibleRigs ? Math.round(cost.triangles / cost.visibleRigs) : 0;
        out.checks.push('geometry source: ' + cost.source);
        out.checks.push('visible rigs: ' + cost.visibleRigs);
        out.checks.push('draw calls total ' + cost.drawCalls + ' (' + out.drawCallsPerRig + '/rig)');
        out.checks.push('triangles total ' + Math.round(cost.triangles) + ' (' + out.trianglesPerRig + '/rig)');

        if (!/glb|skinned/i.test(cost.source)) {
          out.errors.push('runtime is NOT using the GLB geometry (source=' + cost.source + ')');
        }
        if (cost.visibleRigs === 0) out.errors.push('no visible zombie rigs to measure');

        const animSamples = [];
        const perRigTimes = new Map();
        let frozen = 0;
        let clipChanges = 0;
        const lastClip = new Map();
        for (let i = 0; i < 180; i++) {
          g.__pump(performance.now());
          await wait(8);
          if (i % 6 === 0 && g.__zombieAnimation) {
            const a = g.__zombieAnimation();
            for (const row of a) {
              const prev = perRigTimes.get(row.id);
              if (prev !== undefined && Math.abs(row.time - prev) < 1e-6) frozen++;
              perRigTimes.set(row.id, row.time);
              const pc = lastClip.get(row.id);
              if (pc !== undefined && pc !== row.clip) clipChanges++;
              lastClip.set(row.id, row.clip);
            }
            if (animSamples.length < 4) animSamples.push(a.slice(0, 3));
          }
        }
        out.frozenAnimationSamples = frozen;
        out.clipChanges = clipChanges;
        out.animSamples = animSamples;
        out.checks.push('frozen animation samples: ' + frozen);
        out.checks.push('clip transitions observed: ' + clipChanges);
        if (g.__zombieAnimation && frozen > 0) {
          out.errors.push('animation time froze on ' + frozen + ' samples');
        }

        return out;
      })()`,
      true,
    );
  } catch (err) {
    result = { errors: ['harness threw: ' + err.message], checks: [] };
  }

  for (const e of pageErrors) (result.errors ||= []).push('page error: ' + e);
  console.log(JSON.stringify(result, null, 2));
  console.log('\nVERDICT: ' + ((result.errors || []).length ? 'FAIL' : 'PASS'));
  app.exit((result.errors || []).length ? 1 : 0);
});
