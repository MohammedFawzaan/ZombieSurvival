const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..', '..');
process.env.NODE_ENV = 'production';

require(path.join(root, 'dist-electron/main.cjs'));

app.whenReady().then(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let win = null;
  const t0 = Date.now();
  while (!win && Date.now() - t0 < 10000) {
    win = BrowserWindow.getAllWindows()[0];
    if (!win) await wait(100);
  }
  if (!win) {
    console.log(JSON.stringify({ ok: false, why: 'no window created' }, null, 2));
    console.log('\nVERDICT: FAIL');
    app.exit(1);
    return;
  }

  const errors = [];
  win.webContents.on('console-message', (_e, level, m) => {
    if (level === 3) errors.push(m);
  });
  win.webContents.on('preload-error', (_e, p, e) => errors.push(`preload-error ${p}: ${e.message}`));
  win.webContents.on('render-process-gone', (_e, d) => errors.push(`render-process-gone: ${JSON.stringify(d)}`));

  let result;
  try {
    result = await win.webContents.executeJavaScript(
      `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const t0 = Date.now();
        while (!(window.game && window.game.state)) {
          if (Date.now() - t0 > 20000) return { ok: false, why: 'window.game never appeared (module likely blocked)' };
          await wait(150);
        }
        while (window.game.state.phase !== 'menu') {
          if (Date.now() - t0 > 30000) return { ok: false, why: 'never reached menu phase' };
          await wait(150);
        }
        return { ok: true, phase: window.game.state.phase, rootHasChildren: document.getElementById('root').children.length > 0 };
      })()`,
      true,
    );
  } catch (err) {
    result = { ok: false, why: 'executeJavaScript threw: ' + err.message };
  }

  const currentUrl = win.webContents.getURL();
  const out = {
    loadedUrl: currentUrl,
    usesAppScheme: currentUrl.startsWith('app://'),
    result,
    consoleErrors: errors,
  };
  console.log(JSON.stringify(out, null, 2));

  const pass = result && result.ok === true && errors.length === 0 && out.usesAppScheme;
  console.log('\nVERDICT: ' + (pass ? 'PASS' : 'FAIL'));
  app.exit(pass ? 0 : 1);
});
