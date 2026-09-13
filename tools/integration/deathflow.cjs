const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 720, show: true, backgroundColor: '#0a0d0a',
    webPreferences: {
      preload: path.join(root, 'dist-electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      backgroundThrottling: false,
    },
  });
  await win.loadFile(path.join(root, 'dist/index.html'));
  win.show(); win.focus();

  const script = `
  (async () => {
    const out = { errors: [], checks: [] };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitFor = async (fn, l, timeout = 40000) => {
      const s = Date.now();
      while (Date.now() - s < timeout) { try { if (fn()) return true; } catch (e) {} await wait(100); }
      out.errors.push('timeout: ' + l); return false;
    };
    if (!(await waitFor(() => window.game && window.game.state.phase === 'menu', 'menu'))) return out;
    const g = window.game;
    g.headless = true;
    g.startNewRun();
    await wait(1200);

    // --- ROCK GEOMETRY: must be a closed solid, not loose triangles ---
    const rockInfo = g.__rockGeometryInfo();
    out.checks.push('rock verts=' + rockInfo.vertices + ' uniquePositions=' + rockInfo.unique +
                    ' maxRadius=' + rockInfo.maxR.toFixed(3) + ' minRadius=' + rockInfo.minR.toFixed(3));
    // A torn rock has vertices flung far apart; a solid one stays in a tight shell.
    if (rockInfo.maxR / Math.max(rockInfo.minR, 0.001) > 2.6) {
      out.errors.push('rock geometry looks torn: radius ratio ' + (rockInfo.maxR / rockInfo.minR).toFixed(2));
    }
    // The real tell for the tearing bug: corners must be SHARED. A torn mesh
    // has as many unique positions as vertices.
    if (rockInfo.unique >= rockInfo.vertices * 0.5) {
      out.errors.push('rock vertices are not welded: ' + rockInfo.unique + ' unique of ' + rockInfo.vertices);
    }

    // --- DEATH: cursor must be released, camera must collapse ---
    const eyeBefore = g.__eye();
    g.state.health = 0;
    g.state.damage(1);
    await wait(120);
    out.checks.push('phase after death: ' + g.state.phase);
    if (g.state.phase !== 'dead') out.errors.push('phase did not become dead');
    if (document.pointerLockElement) out.errors.push('pointer lock NOT released on death');
    else out.checks.push('pointer lock released on death: yes');

    await wait(1400);
    const eyeAfter = g.__eye();
    const drop = eyeBefore.y - eyeAfter.y;
    out.checks.push('camera drop during death: ' + drop.toFixed(3) + ' m');
    if (drop < 0.4) out.errors.push('death collapse did not lower the camera (drop ' + drop.toFixed(3) + ')');

    // --- RESTART: state resets ---
    g.startNewRun();
    await wait(600);
    out.checks.push('after restart: phase=' + g.state.phase + ' hp=' + g.state.health);
    if (g.state.phase !== 'playing') out.errors.push('restart did not resume play');
    if (g.state.health !== g.state.maxHealth) out.errors.push('restart did not restore health');
    const eyeReset = g.__eye();
    out.checks.push('camera after restart y=' + eyeReset.y.toFixed(2));
    return out;
  })()
  `;
  let result;
  try { result = await win.webContents.executeJavaScript(script, true); }
  catch (e) { result = { errors: ['exec failed: ' + String(e && e.message)] }; }
  console.log(JSON.stringify(result, null, 2));
  console.log('\nVERDICT: ' + ((result.errors || []).length ? 'FAIL' : 'PASS'));
  app.exit((result.errors || []).length ? 1 : 0);
});
