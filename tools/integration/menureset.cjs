const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

app.commandLine.appendSwitch('enable-unsafe-webgpu');
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

  await win.loadFile(path.join(root, 'dist/index.html'), { query: { map: 'forest' } });

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
        for (let i = 0; i < 200; i++) { g.__pump(performance.now()); await wait(6); }

        const t = g.__test();
        t.player.body.setPosition(30, t.terrain.heightAt(30, 30) + 1, 30);
        for (let i = 0; i < 60; i++) { g.__pump(performance.now()); await wait(6); }

        g.state.damage(55, 0);
        for (let i = 0; i < 30; i++) { g.__pump(performance.now()); await wait(6); }

        const before = {
          health: g.state.health,
          kills: g.state.kills,
          survived: +g.state.survivedSeconds.toFixed(2),
          zombiesAlive: t.zombies.zombies.filter((z) => z.alive).length,
          timeFraction: +g.dayNight.fraction.toFixed(4),
        };
        out.checks.push('before menu: hp=' + before.health + ' survived=' + before.survived +
          ' zombiesAlive=' + before.zombiesAlive);

        g.returnToMenu();
        await wait(120);
        for (let i = 0; i < 30; i++) { g.__pump(performance.now()); await wait(6); }

        const after = {
          phase: g.state.phase,
          health: g.state.health,
          kills: g.state.kills,
          survived: +g.state.survivedSeconds.toFixed(2),
          zombiesAlive: t.zombies.zombies.filter((z) => z.alive).length,
          voices: g.audio.activeVoices,
          timeFraction: +g.dayNight.fraction.toFixed(4),
        };
        out.checks.push('after menu: phase=' + after.phase + ' hp=' + after.health +
          ' survived=' + after.survived + ' zombiesAlive=' + after.zombiesAlive +
          ' voices=' + after.voices);
        out.before = before;
        out.after = after;

        if (after.phase !== 'menu') out.errors.push('phase is not menu: ' + after.phase);
        if (after.health !== g.state.maxHealth) {
          out.errors.push('health not restored: ' + after.health);
        }
        if (after.survived > 0.5) out.errors.push('survived timer not reset: ' + after.survived);
        if (after.kills !== 0) out.errors.push('kills not reset: ' + after.kills);
        if (after.zombiesAlive !== 0) {
          out.errors.push('zombies still alive after menu: ' + after.zombiesAlive);
        }
        if (after.voices > 0) out.errors.push('audio still playing: ' + after.voices + ' voices');

        g.startNewRun();
        for (let i = 0; i < 120; i++) { g.__pump(performance.now()); await wait(6); }
        const restarted = {
          phase: g.state.phase,
          health: g.state.health,
          zombiesAlive: t.zombies.zombies.filter((z) => z.alive).length,
        };
        out.checks.push('after restart: phase=' + restarted.phase + ' hp=' + restarted.health +
          ' zombiesAlive=' + restarted.zombiesAlive);
        if (restarted.phase !== 'playing') {
          out.errors.push('restart did not resume play: ' + restarted.phase);
        }
        if (restarted.zombiesAlive === 0) out.errors.push('no zombies respawned after restart');

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
