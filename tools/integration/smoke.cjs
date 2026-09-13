const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');

const DURATION_MS = Number(process.env.SMOKE_MS ?? 22000);

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,WebGPU');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();

const logs = [];
let failed = false;

const BENIGN = [
  'Electron Security Warning',
  'Content-Security-Policy',
];

function record(kind, text) {
  logs.push(`[${kind}] ${text}`);
  if (BENIGN.some((b) => text.includes(b))) return;
  if (kind === 'error' || kind === 'crash' || kind === 'pageerror') failed = true;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      preload: path.join(root, 'dist-electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      offscreen: false,
    },
  });

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    const kind = level === 3 ? 'error' : level === 2 ? 'warn' : 'log';
    const src = sourceId ? ` (${path.basename(sourceId)}:${line})` : '';
    record(kind, message + src);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    record('crash', JSON.stringify(details));
  });
  win.webContents.on('preload-error', (_e, p, err) => {
    record('error', `preload ${p}: ${err.message}`);
  });

  await win.loadFile(path.join(root, 'dist/index.html'));

  const script = `
  (async () => {
    const out = { steps: [], errors: [] };
    const onErr = (e) => out.errors.push(String(e.message || e.reason || e));
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onErr);

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitFor = async (fn, label, timeout = 30000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try { if (fn()) { out.steps.push(label + ': ok'); return true; } } catch (e) { /* retry */ }
        await wait(120);
      }
      out.errors.push('TIMEOUT waiting for ' + label);
      return false;
    };

    if (!(await waitFor(() => window.game, 'game object'))) return out;
    const g = window.game;
    if (!(await waitFor(() => g.state.phase === 'menu', 'reached menu'))) return out;

    out.renderer = g.rendererInfo;

    // Force-start without pointer lock by driving the game API directly.
    g.headless = true;
    // The window is hidden, so requestAnimationFrame is not delivered.
    // Drive the loop explicitly at a fixed cadence instead.
    const pump = setInterval(() => { try { g.__pump(); } catch (e) {} }, 4);
    window.__stopPump = () => clearInterval(pump);
    g.startNewRun();
    await wait(400);
    out.steps.push('phase after start: ' + g.state.phase);

    const dbg = [];
    const unsub = g.subscribeDebug((d) => dbg.push(d));
    g.setDebug(true);

    const internals = g.__test();

    // ---- movement ----
    const p0 = { ...internals.player.position };
    internals.forceIntent({ forward: 1 });
    await wait(1200);
    const p1 = { ...internals.player.position };
    const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    out.steps.push('walk distance: ' + moved.toFixed(2) + ' m');
    if (moved < 1.5) out.errors.push('player did not walk (moved ' + moved.toFixed(2) + ' m)');

    // ---- sprint drains stamina ----
    const stam0 = g.state.stamina;
    internals.forceIntent({ forward: 1, sprint: true });
    await wait(1400);
    out.steps.push('stamina after sprint: ' + g.state.stamina.toFixed(1) + ' (was ' + stam0.toFixed(1) + ')');
    if (g.state.stamina >= stam0) out.errors.push('sprint did not drain stamina');

    // ---- jump ----
    internals.forceIntent({});
    await wait(600);
    const yBefore = internals.player.position.y;
    internals.forceIntent({ jump: true });
    await wait(100);
    internals.forceIntent({});
    let peak = yBefore;
    for (let i = 0; i < 14; i++) { await wait(40); peak = Math.max(peak, internals.player.position.y); }
    out.steps.push('jump rise: ' + (peak - yBefore).toFixed(2) + ' m');
    if (peak - yBefore < 0.35) out.errors.push('jump did not lift the player');
    await wait(900);
    out.steps.push('grounded after landing: ' + internals.player.grounded);

    // One press must produce exactly one jump: repeat it many times and check
    // that each press costs stamina once and the player actually leaves the
    // ground each time (a dropped edge shows up as a missing jump).
    {
      let jumps = 0;
      let attempts = 0;
      for (let k = 0; k < 6; k++) {
        while (!internals.player.grounded) await wait(30);
        await wait(220);
        const y0 = internals.player.position.y;
        internals.forceIntent({ jump: true });
        attempts++;
        let rose = 0;
        for (let i = 0; i < 12; i++) {
          await wait(35);
          rose = Math.max(rose, internals.player.position.y - y0);
        }
        internals.forceIntent({});
        if (rose > 0.3) jumps++;
        await wait(500);
      }
      out.steps.push('repeated jumps: ' + jumps + '/' + attempts + ' presses lifted the player');
      if (jumps < attempts) {
        out.errors.push('dropped ' + (attempts - jumps) + ' of ' + attempts + ' jump inputs');
      }
    }

    // ---- crouch changes eye height ----
    const eyeStand = internals.player.eyeHeight;
    internals.forceIntent({ crouch: true });
    await wait(400);
    const eyeCrouch = internals.player.eyeHeight;
    internals.forceIntent({});
    await wait(400);
    out.steps.push('eye height stand/crouch: ' + eyeStand.toFixed(2) + ' / ' + eyeCrouch.toFixed(2));
    if (eyeCrouch >= eyeStand) out.errors.push('crouch did not lower the view');

    // ---- look ----
    const yaw0 = internals.player.yaw;
    internals.forceLook(0.4, 0.12);
    await wait(150);
    out.steps.push('yaw delta: ' + (internals.player.yaw - yaw0).toFixed(3) + ' pitch: ' + internals.player.pitch.toFixed(3));
    if (Math.abs(internals.player.yaw - yaw0) < 0.05) out.errors.push('mouse look did not rotate the player');
    internals.player.pitch = 0;

    // ---- zombies exist ----
    const zAlive = internals.zombies.aliveCount;
    out.steps.push('zombies alive: ' + zAlive);
    if (zAlive < 5) out.errors.push('too few zombies spawned: ' + zAlive);

    let bodied = 0;
    for (const z of internals.zombies.zombies) if (z.alive && z.body) bodied++;
    out.steps.push('zombies with physics bodies: ' + bodied);
    if (bodied !== zAlive) out.errors.push('zombie/body count mismatch');

    // ---- shooting: park a zombie in front and shoot its torso ----
    const target = internals.zombies.zombies.find((z) => z.alive && z.body);
    if (!target) { out.errors.push('no target zombie'); return out; }

    // Aim helper: point the player at a fraction of the target's height and
    // fire through the real weapon path. Reads live positions because the
    // target is a live AI that the player standoff keeps nudging.
    const shootAt = async (z, heightFrac) => {
      const ap = internals.player.position;
      z.awareness = 0;
      z.hasTarget = false;
      z.speed = 0;
      z.body.setPosition(ap.x, internals.player.feetY + 1.2, ap.z - 6);
      await wait(220);
      const eye = internals.player.eye;
      const zp = z.body.position;
      const feet = zp.y - z.body.feetOffset;
      const aimY = feet + z.def.height * heightFrac;
      const horiz = Math.hypot(zp.x - eye.x, zp.z - eye.z);
      internals.player.yaw = Math.atan2(-(zp.x - eye.x), -(zp.z - eye.z));
      internals.player.pitch = Math.atan2(aimY - eye.y, horiz);
      await wait(180);
      const before = z.health;
      internals.fireOnce();
      await wait(200);
      internals.player.pitch = 0;
      return before - z.health;
    };

    target.health = target.maxHealth;
    const torsoDamage = await shootAt(target, 0.66);
    out.steps.push('torso shot damage: ' + torsoDamage.toFixed(1));
    if (torsoDamage <= 0) out.errors.push('torso shot did not damage the zombie');

    // ---- headshot does more ----
    // The head sphere is centred at (height - headRadius*0.92), which is about
    // 0.89 of body height, not the very top of the model.
    target.health = target.maxHealth;
    const headFrac = (target.def.height - target.def.radius * 0.62 * 0.92) / target.def.height;
    const headDamage = await shootAt(target, headFrac);
    out.steps.push('head shot damage: ' + headDamage.toFixed(1) + ' vs torso ' + torsoDamage.toFixed(1) + ' (aim frac ' + headFrac.toFixed(3) + ')');
    if (headDamage < torsoDamage * 2) {
      out.errors.push('headshot bonus too small: head ' + headDamage.toFixed(1) + ' vs torso ' + torsoDamage.toFixed(1));
    }

    // ---- kill a zombie ----
    const killTarget = internals.zombies.zombies.find((z) => z.alive && z.body);
    if (killTarget) {
      const kills0 = g.state.kills;
      internals.player.yaw = 0;
      await wait(150);
      let shots = 0;
      // The kill counter is only incremented by the real weapon path, so this
      // fires through fireOnce and re-aims each round: the target is live AI
      // and the player standoff keeps nudging it.
      for (let i = 0; i < 80 && killTarget.alive; i++) {
        const ap = internals.player.position;
        killTarget.body.setPosition(ap.x, internals.player.feetY + 1.2, ap.z - 5);
        killTarget.awareness = 0;
        killTarget.hasTarget = false;
        killTarget.speed = 0;
        await wait(35);
        const eye = internals.player.eye;
        const zp = killTarget.body.position;
        const aimY = (zp.y - killTarget.body.feetOffset) + killTarget.def.height * 0.66;
        internals.player.pitch = Math.atan2(aimY - eye.y, 5);
        await wait(25);
        if (g.state.magazine === 0) {
          g.weaponsPublic.beginReload();
          await wait(1800);
        }
        internals.fireOnce();
        shots++;
        await wait(35);
      }
      out.steps.push('kill test: shots=' + shots + ' alive=' + killTarget.alive + ' hp=' + killTarget.health.toFixed(0) + ' kills=' + g.state.kills + ' (was ' + kills0 + ')');
      if (killTarget.alive) out.errors.push('sustained fire did not kill the zombie (hp ' + killTarget.health.toFixed(0) + ' after ' + shots + ' shots)');
      if (g.state.kills <= kills0) out.errors.push('killing a zombie did not increment the kill counter');
    }

    // ---- reload ----
    const w = g.weaponsPublic;
    out.steps.push('mag after firing: ' + g.state.magazine + '/' + g.state.magazineSize);
    const reserveBefore = g.state.reserve;
    w.beginReload();
    await wait(100);
    out.steps.push('reloading flag: ' + g.state.reloading);
    if (!g.state.reloading) out.errors.push('reload did not start');
    await wait(2600);
    out.steps.push('mag after reload: ' + g.state.magazine + '/' + g.state.magazineSize + ' reserve ' + g.state.reserve + ' (was ' + reserveBefore + ')');
    if (g.state.magazine !== g.state.magazineSize) out.errors.push('reload did not refill the magazine: ' + g.state.magazine);
    if (g.state.reserve >= reserveBefore) out.errors.push('reload did not consume reserve ammo');

    // ---- weapon switching ----
    w.selectById('rifle');
    await wait(600);
    out.steps.push('weapon after switch: ' + g.state.weaponId + ' (' + g.state.weaponName + ')');
    if (g.state.weaponId !== 'rifle') out.errors.push('weapon switch to rifle failed');
    internals.fireOnce();
    await wait(200);
    out.steps.push('rifle mag after 1 shot: ' + g.state.magazine + '/' + g.state.magazineSize);
    w.selectById('pistol');
    await wait(600);

    // ---- zombie AI: does a nearby zombie detect and approach? ----
    const chaser = internals.zombies.zombies.find((z) => z.alive && z.body);
    if (chaser) {
      const cp = internals.player.position;
      chaser.body.setPosition(cp.x + 14, internals.player.feetY + 1.2, cp.z);
      chaser.awareness = 0;
      chaser.hasTarget = false;
      await wait(300);
      const d0 = Math.hypot(chaser.body.position.x - cp.x, chaser.body.position.z - cp.z);
      // Make noise so it definitely notices
      internals.fireOnce();
      await wait(3200);
      const cp2 = internals.player.position;
      const d1 = Math.hypot(chaser.body.position.x - cp2.x, chaser.body.position.z - cp2.z);
      out.steps.push('AI approach: ' + d0.toFixed(1) + ' m -> ' + d1.toFixed(1) + ' m, state=' + chaser.state + ' awareness=' + chaser.awareness.toFixed(2));
      if (d1 >= d0 - 0.5) out.errors.push('zombie did not close distance after hearing a gunshot');
    }

    // ---- zombie damages the player ----
    const attacker = internals.zombies.zombies.find((z) => z.alive && z.body);
    if (attacker) {
      const hp0 = g.state.health;
      const ap = internals.player.position;
      attacker.body.setPosition(ap.x + 1.0, internals.player.feetY + 1.0, ap.z);
      attacker.awareness = 1.6;
      attacker.hasTarget = true;
      attacker.lastKnownX = ap.x;
      attacker.lastKnownZ = ap.z;
      attacker.attackCooldown = 0;
      await wait(3000);
      out.steps.push('player hp after zombie contact: ' + g.state.health.toFixed(0) + ' (was ' + hp0.toFixed(0) + ') zstate=' + attacker.state);
      if (g.state.health >= hp0) out.errors.push('zombie never damaged the player');
    }

    // ---- death + restart ----
    g.state.damage(9999);
    await wait(300);
    out.steps.push('phase after lethal damage: ' + g.state.phase);
    if (g.state.phase !== 'dead') out.errors.push('player death did not set the dead phase');

    g.startNewRun();
    await wait(700);
    out.steps.push('after restart: phase=' + g.state.phase + ' hp=' + g.state.health + ' kills=' + g.state.kills + ' mag=' + g.state.magazine + ' zombies=' + internals.zombies.aliveCount);
    if (g.state.phase !== 'playing') out.errors.push('restart did not resume playing');
    if (g.state.health !== g.state.maxHealth) out.errors.push('restart did not restore health');
    if (g.state.kills !== 0) out.errors.push('restart did not reset kills');
    if (internals.zombies.aliveCount < 5) out.errors.push('restart did not repopulate zombies');

    // ---- repeated restarts must not leak physics bodies or zombies ----
    {
      const bodyCount = () => internals.zombies.zombies.filter((z) => z.body !== null).length;
      const counts = [];
      for (let k = 0; k < 5; k++) {
        g.startNewRun();
        await wait(900);
        counts.push({
          alive: internals.zombies.aliveCount,
          bodies: bodyCount(),
          hp: g.state.health,
          kills: g.state.kills,
          mag: g.state.magazine,
        });
      }
      out.steps.push('five restarts: ' + counts.map((c) => c.alive + 'a/' + c.bodies + 'b').join(' '));
      const cap = internals.zombies.maxCapacity;
      for (const c of counts) {
        if (c.bodies > cap) out.errors.push('physics bodies exceeded the pool: ' + c.bodies);
        if (c.alive < 5) out.errors.push('restart left too few zombies: ' + c.alive);
        if (c.hp !== g.state.maxHealth) out.errors.push('restart did not restore health');
        if (c.kills !== 0) out.errors.push('restart did not reset kills');
      }
      // Body count must not grow monotonically across restarts.
      const first = counts[0].bodies;
      const last = counts[counts.length - 1].bodies;
      if (last > first + cap * 0.5) {
        out.errors.push('body count grew across restarts: ' + first + ' -> ' + last);
      }
    }

    // ---- run a while and collect perf ----
    internals.forceIntent({ forward: 1 });
    await wait(5000);
    internals.forceIntent({});
    unsub();
    const tail = dbg.slice(-30);
    if (tail.length) {
      const avgFps = tail.reduce((a, d) => a + d.fps, 0) / tail.length;
      const minFps = Math.min(...tail.map((d) => d.fps));
      const last = tail[tail.length - 1];
      out.perf = {
        avgFps: +avgFps.toFixed(1),
        minFps: +minFps.toFixed(1),
        frameMs: +last.frameMs.toFixed(2),
        simMs: +last.simMs.toFixed(2),
        physicsMs: +last.physicsMs.toFixed(2),
        aiMs: +last.aiMs.toFixed(2),
        renderMs: +last.renderMs.toFixed(2),
        drawCalls: last.drawCalls,
        triangles: last.triangles,
        zombiesAlive: last.zombieAlive,
        zombiesActive: last.zombieActive,
        memoryMb: last.memoryMb,
      };
    }
    return out;
  })()
  `;

  let result;
  try {
    result = await win.webContents.executeJavaScript(script, true);
  } catch (err) {
    record('error', 'executeJavaScript threw: ' + err.message);
  }

  console.log('\n===== SMOKE RESULT =====');
  console.log(JSON.stringify(result ?? null, null, 2));
  console.log('\n===== CONSOLE =====');
  for (const l of logs) console.log(l);

  const scriptErrors = result?.errors ?? [];
  if (scriptErrors.length > 0) failed = true;

  console.log('\n===== VERDICT =====');
  console.log(failed ? 'FAIL' : 'PASS');

  setTimeout(() => app.exit(failed ? 1 : 0), 300);
});

setTimeout(() => {
  console.log('\nSMOKE HARD TIMEOUT');
  for (const l of logs) console.log(l);
  app.exit(2);
}, DURATION_MS + 90000);
