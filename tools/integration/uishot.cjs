const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const root = 'D:\\ZombieSurvival';
const outDir = path.join(root, 'screenshots', 'ui');
fs.mkdirSync(outDir, { recursive: true });

app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG());
  console.log('captured', name);
}

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
  await win.loadFile(path.join(root, 'dist/index.html'), { query: { map: 'forest' } });

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  await win.webContents.executeJavaScript(`(async () => {
    const w = (ms) => new Promise(r => setTimeout(r, ms));
    const t0 = Date.now();
    while (!(window.game && window.game.state.phase === 'menu')) {
      if (Date.now() - t0 > 90000) return 'timeout';
      await w(150);
    }
    window.game.headless = true;
    return 'ok';
  })()`, true);
  await wait(1200);
  await shot(win, '1-home');

  const clickByText = (txt) => `(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().toLowerCase().startsWith(${JSON.stringify(txt)}));
    if (b) { b.click(); return 'clicked'; }
    return 'notfound:' + [...document.querySelectorAll('button')].map(x=>x.textContent.trim()).join('|');
  })()`;

  console.log('settings:', await win.webContents.executeJavaScript(clickByText('settings'), true));
  await wait(700);
  await shot(win, '2-settings');

  console.log('done-btn:', await win.webContents.executeJavaScript(clickByText('done'), true));
  await wait(500);

  console.log('newrun:', await win.webContents.executeJavaScript(clickByText('new run'), true));
  await wait(700);
  await shot(win, '3-loadout');

  await win.webContents.executeJavaScript(`(async () => {
    const w = (ms) => new Promise(r => setTimeout(r, ms));
    const g = window.game;
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().toLowerCase().startsWith('deploy'));
    if (b) b.click();
    await w(300);
    for (let i=0;i<120;i++){ g.__pump(performance.now()); await w(6); }
    g.pause();
    return 'paused';
  })()`, true);
  await wait(900);
  await shot(win, '4-paused');

  await win.webContents.executeJavaScript(`(async () => {
    const w = (ms) => new Promise(r => setTimeout(r, ms));
    const g = window.game;
    g.resume();
    await w(200);
    for (let i=0;i<10;i++){ g.state.damage(60, 0); g.__pump(performance.now()); await w(10); }
    for (let i=0;i<220;i++){ g.__pump(performance.now()); await w(9); }
    return g.state.phase + ' hp=' + g.state.health;
  })()`, true).then(r => console.log('death:', r));

  await wait(1800);
  await shot(win, '5-youdied');

  app.exit(0);
});
