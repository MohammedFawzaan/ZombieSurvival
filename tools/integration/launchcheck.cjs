const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();

// Load the built app exactly as electron/main.ts does in production and
// confirm a window becomes visible with a live game inside it.
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 720, show: false,
    webPreferences: {
      preload: path.join(root, 'dist-electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      backgroundThrottling: false,
    },
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, m) => { if (level === 3) errors.push(m); });
  let shown = false;
  win.once('ready-to-show', () => { win.show(); shown = true; });
  await win.loadFile(path.join(root, 'dist/index.html'), { query: { map: 'forest' } });

  const r = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();
    while (!(window.game && window.game.state.phase === 'menu')) {
      if (Date.now() - t0 > 45000) return { ok: false, why: 'never reached menu' };
      await wait(150);
    }
    const g = window.game;
    const info = g.rendererInfo;
    // Also confirm the preload bridge the UI depends on is present.
    const desktop = typeof window.desktop === 'object' && window.desktop !== null
      ? Object.keys(window.desktop).sort()
      : null;
    return { ok: true, phase: g.state.phase, renderer: info, desktopApi: desktop };
  })()`, true);

  await new Promise((res) => setTimeout(res, 600));
  const out = {
    windowShown: shown,
    windowVisible: win.isVisible(),
    title: win.getTitle(),
    page: r,
    pageErrors: errors,
  };
  const bad =
    !out.windowShown ||
    !out.windowVisible ||
    !r?.ok ||
    !r.desktopApi ||
    errors.length > 0;
  console.log(JSON.stringify(out, null, 2));
  console.log('VERDICT: ' + (bad ? 'FAIL' : 'PASS'));
  setTimeout(() => app.exit(bad ? 1 : 0), 200);
});
setTimeout(() => { console.log('VERDICT: FAIL (timeout)'); app.exit(2); }, 90000);
