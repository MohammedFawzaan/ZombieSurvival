const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();

const logs = [];

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
      backgroundThrottling: false,
    },
  });
  win.webContents.on('console-message', (_e, level, message) => {
    logs.push(`[${level === 3 ? 'error' : 'log'}] ${message}`);
  });
  await win.loadFile(path.join(root, 'dist/index.html'));
  win.focus();

  const script = `
  (async () => {
    const out = { checks: [], errors: [] };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const start = Date.now();
    while (!(window.game && window.game.state.phase === 'menu')) {
      if (Date.now() - start > 40000) { out.errors.push('never reached menu'); return out; }
      await wait(120);
    }
    const g = window.game;
    g.headless = true;
    g.startNewRun();
    await wait(1200);
    const t = g.__test();
    const terrain = t.terrain;

    // ---- 1) Zombies must not sink below or float above the terrain ----
    await wait(2500);
    let worstBelow = 0, worstAbove = 0, checked = 0;
    for (const z of t.zombies.zombies) {
      if (!z.alive || !z.body) continue;
      const p = z.body.position;
      const feet = p.y - z.body.feetOffset;
      const ground = terrain.heightAt(p.x, p.z);
      const d = feet - ground;
      if (d < worstBelow) worstBelow = d;
      if (d > worstAbove) worstAbove = d;
      checked++;
    }
    out.checks.push('terrain adherence over ' + checked + ' zombies: lowest ' + worstBelow.toFixed(3) + ' m, highest ' + worstAbove.toFixed(3) + ' m');
    if (worstBelow < -0.5) out.errors.push('zombies sinking into terrain: ' + worstBelow.toFixed(2));
    if (worstAbove > 1.2) out.errors.push('zombies floating above terrain: ' + worstAbove.toFixed(2));

    // ---- 2) A zombie driven at a tree must not pass through it ----
    const layout = g.__vegetation ? g.__vegetation() : null;
    if (layout && layout.trees.length > 0) {
      const pp = t.player.position;
      // find a tree near the player
      let tree = null, best = Infinity;
      for (const tr of layout.trees) {
        const d = Math.hypot(tr.x - pp.x, tr.z - pp.z);
        if (d < best) { best = d; tree = tr; }
      }
      const z = t.zombies.zombies.find((q) => q.alive && q.body);
      if (tree && z) {
        // Put the zombie 5 m from the tree, target set beyond the tree.
        const ang = Math.atan2(tree.z - pp.z, tree.x - pp.x);
        const sx = tree.x - Math.cos(ang) * 5;
        const sz = tree.z - Math.sin(ang) * 5;
        z.body.setPosition(sx, terrain.heightAt(sx, sz) + z.body.feetOffset, sz);
        z.state = 'chasing';
        z.awareness = 1.6;
        z.hasTarget = true;
        // Force it to path straight through the tree by putting the goal behind it
        z.lastKnownX = tree.x + Math.cos(ang) * 6;
        z.lastKnownZ = tree.z + Math.sin(ang) * 6;

        let minTreeDist = Infinity;
        for (let i = 0; i < 90; i++) {
          z.awareness = 1.6;
          z.hasTarget = true;
          z.lastKnownX = tree.x + Math.cos(ang) * 6;
          z.lastKnownZ = tree.z + Math.sin(ang) * 6;
          await wait(50);
          const zp = z.body.position;
          const d = Math.hypot(zp.x - tree.x, zp.z - tree.z);
          if (d < minTreeDist) minTreeDist = d;
        }
        const trunkR = 0.19 * tree.scale + 0.08;
        const need = trunkR + z.def.radius;
        out.checks.push('closest approach to tree trunk: ' + minTreeDist.toFixed(3) + ' m (trunk+body radius = ' + need.toFixed(3) + ' m)');
        if (minTreeDist < need * 0.55) out.errors.push('zombie penetrated the tree trunk: ' + minTreeDist.toFixed(2) + ' < ' + need.toFixed(2));
      }
    } else {
      out.checks.push('vegetation layout not exposed; skipped tree test');
    }

    // ---- 3) Crowd separation: zombies should not stack on one point ----
    const pp3 = t.player.position;
    const crowd = t.zombies.zombies.filter((q) => q.alive && q.body).slice(0, 10);
    for (const z of crowd) {
      z.body.setPosition(pp3.x + 6, t.player.feetY + 1.2, pp3.z + 6);
      z.awareness = 1.6;
      z.hasTarget = true;
      z.lastKnownX = pp3.x;
      z.lastKnownZ = pp3.z;
    }
    await wait(2600);
    let minPair = Infinity;
    for (let i = 0; i < crowd.length; i++) {
      for (let j = i + 1; j < crowd.length; j++) {
        const a = crowd[i].body.position;
        const b = crowd[j].body.position;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < minPair) minPair = d;
      }
    }
    out.checks.push('closest zombie pair after stacking ' + crowd.length + ' on one point: ' + minPair.toFixed(3) + ' m');
    if (minPair < 0.25) out.errors.push('zombies stacked on top of each other: ' + minPair.toFixed(2) + ' m apart');

    // ---- 4) Zombies must not walk through the player ----
    let minPlayerDist = Infinity;
    for (let i = 0; i < 60; i++) {
      await wait(50);
      const ap = t.player.position;
      for (const z of crowd) {
        if (!z.alive || !z.body) continue;
        const zp = z.body.position;
        const d = Math.hypot(zp.x - ap.x, zp.z - ap.z);
        if (d < minPlayerDist) minPlayerDist = d;
      }
      g.state.health = g.state.maxHealth;
    }
    out.checks.push('closest zombie approach to player: ' + minPlayerDist.toFixed(3) + ' m');
    if (minPlayerDist < 0.15) out.errors.push('zombie walked into the player: ' + minPlayerDist.toFixed(2) + ' m');

    // ---- 5) The player must not fall through the world over time ----
    t.forceIntent({ forward: 1, sprint: true });
    let minFeetGap = Infinity, maxFeetGap = -Infinity;
    for (let i = 0; i < 120; i++) {
      await wait(50);
      const ap = t.player.position;
      const gap = (ap.y - 0.9) - terrain.heightAt(ap.x, ap.z);
      if (gap < minFeetGap) minFeetGap = gap;
      if (gap > maxFeetGap) maxFeetGap = gap;
      if (ap.y < -50) { out.errors.push('player fell out of the world at y=' + ap.y.toFixed(1)); break; }
    }
    t.forceIntent({});
    out.checks.push('player body-vs-ground gap while sprinting 6 s: min ' + minFeetGap.toFixed(2) + ' max ' + maxFeetGap.toFixed(2));

    // ---- 6) Player collides with trees (cannot walk through) ----
    if (layout && layout.trees.length > 0) {
      const ap = t.player.position;
      let tree = null, best = Infinity;
      for (const tr of layout.trees) {
        const d = Math.hypot(tr.x - ap.x, tr.z - ap.z);
        if (d > 3 && d < best) { best = d; tree = tr; }
      }
      if (tree) {
        const ang = Math.atan2(tree.z - ap.z, tree.x - ap.x);
        const sx = tree.x - Math.cos(ang) * 4;
        const sz = tree.z - Math.sin(ang) * 4;
        t.player.respawn(sx, terrain.heightAt(sx, sz), sz);
        t.player.yaw = Math.atan2(-Math.cos(ang), -Math.sin(ang));
        // face the tree: forward is (-sin(yaw), -cos(yaw))
        t.player.yaw = Math.atan2(-(tree.x - sx), -(tree.z - sz));
        await wait(300);
        t.forceIntent({ forward: 1 });
        let closest = Infinity;
        for (let i = 0; i < 70; i++) {
          await wait(50);
          const q = t.player.position;
          const d = Math.hypot(q.x - tree.x, q.z - tree.z);
          if (d < closest) closest = d;
        }
        t.forceIntent({});
        const trunkR = 0.19 * tree.scale + 0.08;
        out.checks.push('player closest approach to trunk: ' + closest.toFixed(3) + ' m (trunk r=' + trunkR.toFixed(2) + ', player r=0.34)');
        if (closest < trunkR * 0.6) out.errors.push('player walked through a tree: ' + closest.toFixed(2));
      }
    }

    out.finalPhase = g.state.phase;
    return out;
  })()
  `;

  let result;
  try {
    result = await win.webContents.executeJavaScript(script, true);
  } catch (err) {
    logs.push('[error] ' + err.message);
  }
  console.log('\n===== COLLISION RESULT =====');
  console.log(JSON.stringify(result ?? null, null, 2));
  console.log('\n===== CONSOLE =====');
  for (const l of logs.slice(-15)) console.log(l);
  console.log('\nVERDICT: ' + ((result?.errors?.length ?? 1) === 0 ? 'PASS' : 'FAIL'));
  const bad = (result?.errors?.length ?? 1) !== 0;
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});

setTimeout(() => {
  console.log('COLLIDE TIMEOUT');
  for (const l of logs.slice(-15)) console.log(l);
  app.exit(2);
}, 180000);
