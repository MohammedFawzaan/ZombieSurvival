const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,WebGPU');
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
  win.show(); win.moveTop(); win.focus();

  const script = `
  (async () => {
    const out = { errors: [], checks: [] };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitFor = async (fn, label, timeout = 40000) => {
      const s = Date.now();
      while (Date.now() - s < timeout) { try { if (fn()) return true; } catch (e) {} await wait(120); }
      out.errors.push('timeout: ' + label); return false;
    };
    if (!(await waitFor(() => window.game && window.game.state.phase === 'menu', 'menu'))) return out;
    const g = window.game;
    g.headless = true;
    g.startNewRun();
    await wait(1500);
    const t = g.__test();

    // Walk toward zombies and sample per-frame visibility of every rig.
    // A zombie that toggles visible->hidden->visible is the flicker.
    t.forceIntent({ forward: 1, sprint: true });
    const history = new Map();
    let toggles = 0, frames = 0;
    for (let i = 0; i < 360; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      frames++;
      const vis = g.__zombieVisibility();
      for (const [id, v] of vis) {
        const prev = history.get(id);
        if (prev !== undefined && prev !== v) toggles++;
        history.set(id, v);
      }
    }
    t.forceIntent({});
    out.checks.push('frames sampled: ' + frames + ', rigs tracked: ' + history.size);
    out.visibilityToggles = toggles;
    // Some toggling is legitimate (spawn/despawn at range); heavy toggling is flicker.
    if (toggles > frames * 0.08) {
      out.errors.push('excessive zombie visibility toggling: ' + toggles + ' over ' + frames + ' frames');
    }
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
