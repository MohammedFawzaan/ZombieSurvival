const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..', '..');
const outDir = process.env.SHOT_DIR || path.join(root, 'screenshots', 'atmosphere');

app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();

const logs = [];
const results = [];
let failed = false;

function fail(msg) {
  failed = true;
  console.log('FAIL: ' + msg);
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    show: true,
    backgroundColor: '#0a0d0a',
    webPreferences: {
      preload: path.join(root, 'dist-electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  win.webContents.on('console-message', (_e, level, message) => {
    logs.push(`[${level === 3 ? 'error' : 'log'}] ${message}`);
  });
  await win.loadFile(path.join(root, 'dist/index.html'));
  win.focus();

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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

  await run(`(async () => {
    const g = window.game;
    g.headless = true;
    g.startNewRun();
    await new Promise((r) => setTimeout(r, 2500));
    const t = g.__test();
    window.__t = t;
    g.dayNight.paused = true;
    const veg = g.__vegetation();
    const clear = (list, x, z, r) => !list.some((i) => Math.hypot(i.x - x, i.z - z) < r);
    let spot = { x: 0, z: 0 };
    outer: for (let ring = 0; ring < 40; ring++) {
      const d = 8 + ring * 2.5;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        if (!t.terrain.isInBounds(x, z, 40)) continue;
        if (t.terrain.slopeAt(x, z) > 0.18) continue;
        if (!clear(veg.trees, x, z, 4)) continue;
        if (!clear(veg.bushes, x, z, 2.6)) continue;
        if (!clear(veg.rocks, x, z, 2.8)) continue;
        spot = { x, z };
        break outer;
      }
    }
    window.__pin = () => {
      t.player.respawn(spot.x, t.terrain.heightAt(spot.x, spot.z) + 0.4, spot.z);
      t.player.yaw = 1.05;
      t.player.pitch = -0.02;
    };
    window.__pin();
    window.__spot = spot;
    return g.state.phase;
  })()`);

  const analyse = async (name) => {
    await wait(900);
    const img = await win.capturePage();
    fs.writeFileSync(path.join(outDir, name + '.png'), img.toPNG());
    const bmp = img.getBitmap();
    const size = img.getSize();
    let sum = 0;
    let count = 0;
    let dark = 0;
    let worldDark = 0;
    let worldCount = 0;
    const hist = new Array(16).fill(0);
    const worldY0 = Math.floor(size.height / 3);
    for (let y = 0; y < size.height; y++) {
      for (let x = 0; x < size.width; x++) {
        const i = (y * size.width + x) * 4;
        const b = bmp[i];
        const g = bmp[i + 1];
        const r = bmp[i + 2];
        const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
        sum += lum;
        if (lum < 0.02) dark++;
        if (y >= worldY0) {
          worldCount++;
          if (lum < 0.02) worldDark++;
        }
        hist[Math.min(15, Math.floor(lum * 16))]++;
        count++;
      }
    }
    const mean = sum / count;
    let varSum = 0;
    for (let i = 0; i < bmp.length; i += 4) {
      const b = bmp[i];
      const g = bmp[i + 1];
      const r = bmp[i + 2];
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      varSum += (lum - mean) * (lum - mean);
    }
    const std = Math.sqrt(varSum / count);
    return {
      name,
      mean,
      std,
      crushedFraction: dark / count,
      crushedWorldFraction: worldDark / Math.max(worldCount, 1),
      size,
      hist,
    };
  };

  const scenes = [
    { name: '01-midday-clear', hour: 12, weather: 'clear' },
    { name: '02-morning-cloudy', hour: 8, weather: 'cloudy' },
    { name: '03-evening-clear', hour: 18.6, weather: 'clear' },
    { name: '04-night-clear', hour: 0.5, weather: 'clear' },
    { name: '05-night-rain', hour: 0.5, weather: 'rain' },
    { name: '06-cloudy-day', hour: 13, weather: 'cloudy' },
    { name: '07-rain-day', hour: 13, weather: 'rain' },
    { name: '08-dawn-clear', hour: 6.2, weather: 'clear' },
  ];

  for (const s of scenes) {
    const info = await run(`(async () => {
      const g = window.game;
      g.__setTimeOfDay(${s.hour});
      g.__setWeather('${s.weather}', true);
      const t = window.__t;
      window.__pin();
      const pp = t.player.position;
      const crowd = t.zombies.zombies.filter((z) => z.alive && z.body).slice(0, 5);
      let i = 0;
      for (const z of crowd) {
        const a = -0.4 + (i / Math.max(crowd.length - 1, 1)) * 0.8;
        const r = 7 + (i % 3) * 3;
        const fx = -Math.sin(t.player.yaw + a), fz = -Math.cos(t.player.yaw + a);
        z.body.setPosition(pp.x + fx * r, t.player.feetY + 1.2, pp.z + fz * r);
        z.awareness = 1.6;
        z.hasTarget = true;
        z.lastKnownX = pp.x;
        z.lastKnownZ = pp.z;
        z.state = 'chasing';
        i++;
      }
      window.__god = window.__god || setInterval(() => { g.state.health = g.state.maxHealth; }, 200);
      await new Promise((r) => setTimeout(r, 1200));
      return JSON.stringify(g.__atmosphere());
    })()`);
    const atmo = JSON.parse(info);
    const shot = await analyse(s.name);
    const fpsRaw = await run(`(async () => {
      const g = window.game;
      g.setDebug(true);
      const frames = [];
      const unsub = g.subscribeDebug((d) => frames.push(d.fps));
      await new Promise((r) => setTimeout(r, 2200));
      unsub();
      g.setDebug(false);
      const use = frames.slice(2).filter((v) => v > 0);
      if (!use.length) return JSON.stringify({ avg: 0, min: 0 });
      const avg = use.reduce((a, b) => a + b, 0) / use.length;
      return JSON.stringify({ avg, min: Math.min(...use) });
    })()`);
    const fps = JSON.parse(fpsRaw);
    results.push({ ...s, ...shot, atmo, fps });
    console.log(
      `${s.name}: mean=${shot.mean.toFixed(4)} std=${shot.std.toFixed(4)} ` +
        `crushed=${(shot.crushedFraction * 100).toFixed(2)}% ` +
        `sun=${atmo.sunIntensity.toFixed(2)} amb=${atmo.ambientIntensity.toFixed(2)} ` +
        `world=${(shot.crushedWorldFraction * 100).toFixed(2)}% ` +
        `fog=${atmo.fogDensity.toFixed(5)} exp=${atmo.exposure.toFixed(3)} ` +
        `drops=${atmo.rainDrops} phase=${atmo.phase} weather=${atmo.weather} ` +
        `fps=${fps.avg.toFixed(1)}/min ${fps.min.toFixed(1)}`,
    );
  }

  const byName = Object.fromEntries(results.map((r) => [r.name, r]));
  const night = byName['04-night-clear'];
  const nightRain = byName['05-night-rain'];
  const midday = byName['01-midday-clear'];

  if (night.mean < 0.05) fail(`night too dark: mean luminance ${night.mean.toFixed(4)}`);
  if (nightRain.mean < 0.045) fail(`night+rain too dark: mean ${nightRain.mean.toFixed(4)}`);
  if (night.std < 0.03) fail(`night has no tonal separation: std ${night.std.toFixed(4)}`);
  if (night.mean >= midday.mean) fail('night is not darker than midday');
  if (night.mean > midday.mean * 0.6) fail('night is not meaningfully darker than midday');

  const pct = (v) => (v * 100).toFixed(2) + '%';
  const CRUSH_LIMIT = 0.34;
  const CRUSH_WORLD_LIMIT = 0.3;
  const CRUSH_OVER_MIDDAY = 0.16;
  for (const r of [night, nightRain]) {
    if (r.crushedFraction > CRUSH_LIMIT) {
      fail(
        `${r.name} crushes too much of the frame to black: ${pct(r.crushedFraction)} ` +
          `(limit ${pct(CRUSH_LIMIT)})`,
      );
    }
    if (r.crushedWorldFraction > CRUSH_WORLD_LIMIT) {
      fail(
        `${r.name} crushes too much of the navigable world to black: ` +
          `${pct(r.crushedWorldFraction)} (limit ${pct(CRUSH_WORLD_LIMIT)})`,
      );
    }
    if (r.crushedFraction > midday.crushedFraction + CRUSH_OVER_MIDDAY) {
      fail(
        `${r.name} crushes ${pct(r.crushedFraction - midday.crushedFraction)} more of the frame ` +
          `than midday (${pct(midday.crushedFraction)}); night shadow detail is lost`,
      );
    }
  }

  const silhouette = await run(`(async () => {
    const g = window.game;
    g.__setTimeOfDay(0.5);
    g.__setWeather('clear', true);
    await new Promise((r) => setTimeout(r, 900));
    return 'ok';
  })()`);
  if (silhouette !== 'ok') fail('could not set night for silhouette test');

  const contrast = await measureSilhouette(win, wait);
  console.log('night zombie silhouette contrast: ' + JSON.stringify(contrast));
  if (contrast.changedPixelFraction < 0.02) {
    fail(
      `zombies occupy too little of the view to judge silhouettes ` +
        `(${(contrast.changedPixelFraction * 100).toFixed(2)}%)`,
    );
  }
  if (contrast.meanDeltaOnChanged < 0.07) {
    fail(
      `zombie silhouettes not distinguishable at night ` +
        `(mean luminance delta ${contrast.meanDeltaOnChanged.toFixed(4)})`,
    );
  }

  fs.writeFileSync(
    path.join(outDir, 'measurements.json'),
    JSON.stringify({ results, contrast }, null, 2),
  );

  console.log('\n===== SUMMARY =====');
  for (const r of results) {
    console.log(
      `${r.name.padEnd(20)} mean ${r.mean.toFixed(4)}  std ${r.std.toFixed(4)}  ` +
        `crushed ${(r.crushedFraction * 100).toFixed(2)}%  world ${(r.crushedWorldFraction * 100).toFixed(2)}%  ` +
        `fps ${r.fps.avg.toFixed(1)}`,
    );
  }

  const errs = logs.filter((l) => l.startsWith('[error]'));
  if (errs.length) {
    console.log('\n=== PAGE ERRORS ===\n' + errs.join('\n'));
    fail(errs.length + ' page errors');
  }

  console.log('\nVERDICT: ' + (failed ? 'FAIL' : 'PASS'));
  setTimeout(() => app.exit(failed ? 1 : 0), 200);
});

async function measureSilhouette(win, wait) {
  const withZ = await captureStats(win, wait, true);
  const withoutZ = await captureStats(win, wait, false);

  const a = withZ.lum;
  const b = withoutZ.lum;
  let changed = 0;
  let sumDelta = 0;
  let maxDelta = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > 0.01) {
      changed++;
      sumDelta += d;
      if (d > maxDelta) maxDelta = d;
    }
  }
  return {
    meanWithZombies: withZ.mean,
    meanWithoutZombies: withoutZ.mean,
    contrast: Math.abs(withZ.centre - withoutZ.centre),
    centreWith: withZ.centre,
    centreWithout: withoutZ.centre,
    changedPixelFraction: changed / a.length,
    meanDeltaOnChanged: changed ? sumDelta / changed : 0,
    maxDelta,
  };
}

async function captureStats(win, wait, zombiesVisible) {
  await win.webContents.executeJavaScript(
    `(async () => {
      const t = window.__t;
      window.__pin();
      const pp = t.player.position;
      const place = () => {
        const crowd = t.zombies.zombies.filter((z) => z.alive && z.body).slice(0, 5);
        let i = 0;
        for (const z of crowd) {
          if (${zombiesVisible}) {
            const a = -0.3 + (i / Math.max(crowd.length - 1, 1)) * 0.6;
            const r = 6 + (i % 2) * 2;
            const fx = -Math.sin(t.player.yaw + a), fz = -Math.cos(t.player.yaw + a);
            z.body.setPosition(pp.x + fx * r, t.player.feetY + 1.2, pp.z + fz * r);
          } else {
            z.body.setPosition(pp.x, t.player.feetY - 60, pp.z);
          }
          i++;
        }
      };
      place();
      await new Promise((r) => setTimeout(r, 600));
      place();
      await new Promise((r) => setTimeout(r, 120));
      return 1;
    })()`,
    true,
  );
  await wait(120);
  const img = await win.capturePage();
  const bmp = img.getBitmap();
  const size = img.getSize();
  let sum = 0;
  let count = 0;
  let centreSum = 0;
  let centreCount = 0;
  const x0 = Math.floor(size.width * 0.3);
  const x1 = Math.floor(size.width * 0.55);
  const y0 = Math.floor(size.height * 0.5);
  const y1 = Math.floor(size.height * 0.85);
  const lum = new Float32Array((x1 - x0) * (y1 - y0));
  let k = 0;
  for (let y = 0; y < size.height; y++) {
    for (let x = 0; x < size.width; x++) {
      const i = (y * size.width + x) * 4;
      const l = (0.2126 * bmp[i + 2] + 0.7152 * bmp[i + 1] + 0.0722 * bmp[i]) / 255;
      sum += l;
      count++;
      if (x >= x0 && x < x1 && y >= y0 && y < y1) {
        centreSum += l;
        centreCount++;
        lum[k++] = l;
      }
    }
  }
  return { mean: sum / count, centre: centreSum / Math.max(centreCount, 1), lum };
}
