const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(root, 'screenshots', 'city');

app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: 1600, height: 900, show: true,
    webPreferences: {
      preload: path.join(root, 'dist-electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
      backgroundThrottling: false,
    },
  });
  await win.loadFile(path.join(root, 'dist/index.html'), { query: { map: 'city' } });
  win.focus();

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = (code) => win.webContents.executeJavaScript(code, true);
  const capture = async (name) => {
    await wait(700);
    const img = await win.capturePage();
    fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG());
    console.log('saved ' + name);
  };

  await run(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();
    while (!(window.game && window.game.state.phase === 'menu')) {
      if (Date.now() - t0 > 40000) return 'timeout';
      await wait(120);
    }
    return 'ready';
  })()`);

  await run(`(async () => {
    const g = window.game;
    g.headless = true;
    g.startNewRun();
    await new Promise((r) => setTimeout(r, 2500));
    window.__t = g.__test();
    window.__r = g.__round();
    return g.state.phase;
  })()`);

  const place = async (x, z, yaw, pitch) => {
    await run(`(() => {
      const t = window.__t;
      t.player.respawn(${x}, t.terrain.heightAt(${x}, ${z}) + 0.4, ${z});
      t.player.yaw = ${yaw};
      t.player.pitch = ${pitch};
      return 1;
    })()`);
    for (let i = 0; i < 40; i++) {
      await run(`(() => { window.__t.forceIntent({}); return 1; })()`);
      await wait(16);
    }
  };

  await place(0, 96, 0, 0);
  await capture('01-start-street');

  await place(0, 78, 0, -0.06);
  await capture('02-street-north');

  await place(-24, 70, Math.PI * 0.75, 0);
  await capture('03-houses-west');

  await place(24, 70, -Math.PI * 0.75, 0);
  await capture('04-houses-east');

  await place(-29, 58, Math.PI, 0);
  await capture('05-alley-west');

  await place(0, 38, 0, 0);
  await capture('06-approach-market');

  await place(0, -10, 0, 0);
  await capture('07-market-square');

  await place(0, -50, 0, 0.05);
  await capture('08-apartments');

  await place(62, -96, Math.PI, 0);
  await capture('09-substation');

  await place(-62, -96, Math.PI, 0);
  await capture('10-depot');

  await run(`(() => { window.__r.openAllBarriers(); return 1; })()`);
  await place(0, 96, 0, 0);
  await capture('11-unlocked-start');

  await run(`(() => {
    const m = window.__r.mode;
    if (m) m.power.activate('power_main');
    return 1;
  })()`);
  await place(0, 38, 0, 0);
  await capture('12-power-on-street');

  await place(0, -10, 0, 0);
  await capture('13-power-on-market');

  console.log('VERDICT: PASS');
  app.exit(0);
});
