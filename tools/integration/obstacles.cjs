const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
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
  await win.loadFile(path.join(root, 'dist/index.html'), { query: { map: 'forest' } });
  win.focus();

  const script = `
  (async () => {
    const out = { checks: [], errors: [] };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();
    while (!(window.game && window.game.state.phase === 'menu')) {
      if (Date.now() - t0 > 40000) { out.errors.push('no menu'); return out; }
      await wait(120);
    }
    const g = window.game;
    g.headless = true;
    g.startNewRun();
    await wait(1200);
    const t = g.__test();
    const terrain = t.terrain;
    const layout = g.__vegetation();

    const parkOthers = (keep) => {
      let i = 0;
      for (const q of t.zombies.zombies) {
        if (!q.body || q === keep) continue;
        const a = (i++ / 30) * Math.PI * 2;
        q.body.setPosition(Math.cos(a) * 190, 40, Math.sin(a) * 190);
        q.awareness = 0; q.hasTarget = false; q.speed = 0; q.state = 'idle';
      }
    };
    const keepAlive = setInterval(() => { g.state.health = g.state.maxHealth; }, 200);

    // Pick a tree on reasonably flat ground with clear space around it.
    let tree = null;
    for (const tr of layout.trees) {
      if (terrain.slopeAt(tr.x, tr.z) > 0.2) continue;
      let clear = true;
      for (const other of layout.trees) {
        if (other === tr) continue;
        if (Math.hypot(other.x - tr.x, other.z - tr.z) < 6) { clear = false; break; }
      }
      if (!clear) continue;
      for (const r of layout.rocks) {
        if (Math.hypot(r.x - tr.x, r.z - tr.z) < 5) { clear = false; break; }
      }
      if (clear) { tree = tr; break; }
    }
    if (!tree) { out.errors.push('no isolated tree found'); return out; }
    const trunkR = 0.19 * tree.scale + 0.08;
    out.tree = { x: +tree.x.toFixed(1), z: +tree.z.toFixed(1), scale: +tree.scale.toFixed(2), trunkR: +trunkR.toFixed(3) };

    // ---- PLAYER walks straight into the trunk ----
    {
      parkOthers(null);
      const approach = 3.0;
      const dirX = 1, dirZ = 0;
      const sx = tree.x - dirX * approach;
      const sz = tree.z - dirZ * approach;
      t.player.respawn(sx, terrain.heightAt(sx, sz), sz);
      // forward = (-sin(yaw), -cos(yaw)); we want forward = (+1, 0) => yaw = -PI/2
      t.player.yaw = -Math.PI / 2;
      t.player.pitch = 0;
      await wait (500);

      let closest = Infinity;
      const samples = [];
      t.forceIntent({ forward: 1 });
      for (let i = 0; i < 80; i++) {
        await wait(50);
        const p = t.player.position;
        const d = Math.hypot(p.x - tree.x, p.z - tree.z);
        if (d < closest) closest = d;
        if (i % 20 === 0) samples.push(+d.toFixed(2));
      }
      t.forceIntent({});
      const limit = trunkR + 0.34;
      out.checks.push('PLAYER into trunk: start 3.00 m, closest ' + closest.toFixed(3) + ' m, expected stop >= ' + (limit * 0.75).toFixed(2) + ' m; samples ' + samples.join(' -> '));
      if (closest > 2.5) out.errors.push('player never approached the tree (walk failed): closest ' + closest.toFixed(2));
      else if (closest < limit * 0.6) out.errors.push('player penetrated the trunk: ' + closest.toFixed(2) + ' < ' + limit.toFixed(2));
    }

    // ---- ZOMBIE driven straight into the trunk ----
    {
      const z = t.zombies.zombies.find((q) => q.alive && q.body);
      if (!z) { out.errors.push('no zombie'); return out; }
      parkOthers(z);
      const approach = 3.0;
      const sx = tree.x - approach;
      const sz = tree.z;
      z.body.setPosition(sx, terrain.heightAt(sx, sz) + z.body.feetOffset, sz);
      z.speed = 0;
      await wait(300);

      let closest = Infinity;
      const samples = [];
      for (let i = 0; i < 100; i++) {
        // Continuously order it to a goal on the far side of the trunk.
        z.state = 'chasing';
        z.awareness = 1.6;
        z.hasTarget = true;
        z.searchTimer = 10;
        z.lastKnownX = tree.x + 6;
        z.lastKnownZ = tree.z;
        // Chasing targets the player, so move the AI goal by relocating logic:
        // use 'detecting' which steers to lastKnown instead.
        z.state = 'detecting';
        await wait(50);
        const p = z.body.position;
        const d = Math.hypot(p.x - tree.x, p.z - tree.z);
        if (d < closest) closest = d;
        if (i % 25 === 0) samples.push(+d.toFixed(2));
      }
      const limit = trunkR + z.def.radius;
      out.checks.push('ZOMBIE into trunk: start 3.00 m, closest ' + closest.toFixed(3) + ' m, body r=' + z.def.radius + ', expected stop >= ' + (limit * 0.75).toFixed(2) + ' m; samples ' + samples.join(' -> '));
      if (closest > 2.5) out.errors.push('zombie never approached the tree: closest ' + closest.toFixed(2));
      else if (closest < limit * 0.55) out.errors.push('zombie penetrated the trunk: ' + closest.toFixed(2) + ' < ' + limit.toFixed(2));
    }

    // ---- ZOMBIE must route around the tree and still reach a goal behind it ----
    {
      const z = t.zombies.zombies.filter((q) => q.alive && q.body)[1];
      if (z) {
        parkOthers(z);
        const sx = tree.x - 7;
        const sz = tree.z;
        z.body.setPosition(sx, terrain.heightAt(sx, sz) + z.body.feetOffset, sz);
        const goalX = tree.x + 7;
        const goalZ = tree.z;
        let reached = false;
        let best = Infinity;
        for (let i = 0; i < 220; i++) {
          z.state = 'detecting';
          z.awareness = 0.6;
          z.hasTarget = true;
          z.searchTimer = 20;
          z.lastKnownX = goalX;
          z.lastKnownZ = goalZ;
          await wait(50);
          const p = z.body.position;
          const d = Math.hypot(p.x - goalX, p.z - goalZ);
          if (d < best) best = d;
          if (d < 2.0) { reached = true; break; }
        }
        out.checks.push('ZOMBIE navigating past the tree to a goal 14 m away: reached=' + reached + ', closest to goal ' + best.toFixed(2) + ' m');
        if (!reached) out.errors.push('zombie could not navigate around the tree (stuck at ' + best.toFixed(2) + ' m from goal)');
      }
    }

    // ---- Player cannot escape the world bounds ----
    {
      const half = terrain.half;
      t.player.respawn(half - 30, terrain.heightAt(half - 30, 0), 0);
      t.player.yaw = -Math.PI / 2;
      await wait(400);
      t.forceIntent({ forward: 1, sprint: true });
      for (let i = 0; i < 200; i++) await wait(50);
      t.forceIntent({});
      const p = t.player.position;
      out.checks.push('player sprinting at the world edge for 10 s ended at x=' + p.x.toFixed(1) + ' (world half=' + half.toFixed(0) + ')');
      if (p.x > half + 2) out.errors.push('player left the world bounds: x=' + p.x.toFixed(1));
      if (p.y < -20) out.errors.push('player fell out of the world: y=' + p.y.toFixed(1));
    }

    clearInterval(keepAlive);
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
  console.log('\n===== COLLISION 2 RESULT =====');
  console.log(JSON.stringify(result ?? null, null, 2));
  console.log('\n===== CONSOLE =====');
  for (const l of logs.slice(-10)) console.log(l);
  console.log('\nVERDICT: ' + ((result?.errors?.length ?? 1) === 0 ? 'PASS' : 'FAIL'));
  const bad = (result?.errors?.length ?? 1) !== 0;
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});

setTimeout(() => {
  console.log('TIMEOUT');
  for (const l of logs.slice(-10)) console.log(l);
  app.exit(2);
}, 240000);
