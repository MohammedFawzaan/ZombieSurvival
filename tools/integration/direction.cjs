const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();

const logs = [];

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 720, show: true,
    webPreferences: {
      preload: path.join(root, 'dist-electron/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
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
    const out = { moves: [], checks: [], errors: [] };
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

    // Flat open spot so terrain does not deflect the test.
    let spot = null;
    for (let i = 0; i < 4000; i++) {
      const x = (Math.random() * 2 - 1) * 120;
      const z = (Math.random() * 2 - 1) * 120;
      if (terrain.slopeAt(x, z) > 0.06) continue;
      const layout = g.__vegetation();
      let clear = true;
      for (const tr of layout.trees) if (Math.hypot(tr.x - x, tr.z - z) < 9) { clear = false; break; }
      if (clear) for (const r of layout.rocks) if (Math.hypot(r.x - x, r.z - z) < 8) { clear = false; break; }
      if (clear) { spot = { x, z }; break; }
    }
    if (!spot) { out.errors.push('no flat clear spot'); return out; }

    // Movement direction must be measured without zombies bumping the player.
    const parkZombies = () => {
      let i = 0;
      for (const q of t.zombies.zombies) {
        if (!q.body) continue;
        const a = (i++ / 30) * Math.PI * 2;
        q.body.setPosition(spot.x + Math.cos(a) * 170, terrain.heightAt(spot.x, spot.z) + 2, spot.z + Math.sin(a) * 170);
        q.awareness = 0;
        q.hasTarget = false;
        q.speed = 0;
        q.state = 'idle';
      }
    };
    const godMode = setInterval(() => { g.state.health = g.state.maxHealth; parkZombies(); }, 200);

    // Camera forward for a given yaw, matching THREE YXZ euler on (0,0,-1).
    const camFwd = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
    const camRight = (yaw) => ({ x: Math.cos(yaw), z: -Math.sin(yaw) });

    const testMove = async (label, yaw, intent, expect) => {
      t.player.respawn(spot.x, terrain.heightAt(spot.x, spot.z), spot.z);
      t.player.yaw = yaw;
      t.player.pitch = 0;
      await wait(400);
      const a = { x: t.player.position.x, z: t.player.position.z };
      t.forceIntent(intent);
      await wait(1100);
      t.forceIntent({});
      const b = { x: t.player.position.x, z: t.player.position.z };
      await wait(250);

      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.0) {
        out.errors.push(label + ': barely moved (' + dist.toFixed(2) + ' m)');
        return;
      }
      const ux = dx / dist, uz = dz / dist;
      const dot = ux * expect.x + uz * expect.z;
      const angleErr = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
      out.moves.push(label + ': moved ' + dist.toFixed(2) + ' m toward (' + ux.toFixed(2) + ',' + uz.toFixed(2) + '), expected (' + expect.x.toFixed(2) + ',' + expect.z.toFixed(2) + '), error ' + angleErr.toFixed(1) + ' deg');
      if (angleErr > 12) out.errors.push(label + ': moved ' + angleErr.toFixed(1) + ' deg off the expected direction');
    };

    for (const yawDeg of [0, 45, 90, 135, 180, -90, -135]) {
      const yaw = (yawDeg * Math.PI) / 180;
      const f = camFwd(yaw);
      const r = camRight(yaw);
      await testMove('W @ yaw ' + yawDeg, yaw, { forward: 1 }, f);
      await testMove('D @ yaw ' + yawDeg, yaw, { right: 1 }, r);
    }
    // Backward and strafe-left at one angle
    {
      const yaw = (60 * Math.PI) / 180;
      const f = camFwd(yaw), r = camRight(yaw);
      await testMove('S @ yaw 60', yaw, { forward: -1 }, { x: -f.x, z: -f.z });
      await testMove('A @ yaw 60', yaw, { right: -1 }, { x: -r.x, z: -r.z });
      const dx = f.x + r.x, dz = f.z + r.z;
      const l = Math.hypot(dx, dz);
      await testMove('W+D @ yaw 60', yaw, { forward: 1, right: 1 }, { x: dx / l, z: dz / l });
    }

    clearInterval(godMode);

    // Shots must land where the crosshair points. Freeze the target so its AI
    // cannot drift between placement and firing, and read the live eye/target
    // positions rather than assuming them.
    const z = t.zombies.zombies.find((q) => q.alive && q.body);
    if (z) {
      let hits = 0, tries = 0;
      const detail = [];
      for (const yawDeg of [0, 60, 120, 180, -60, -120]) {
        const yaw = (yawDeg * Math.PI) / 180;
        t.player.respawn(spot.x, terrain.heightAt(spot.x, spot.z), spot.z);
        t.player.yaw = yaw;
        t.player.pitch = 0;
        // Let the player settle on the ground so the eye height is real.
        for (let k = 0; k < 25; k++) await wait(40);

        const pp = { x: t.player.position.x, y: t.player.position.y, z: t.player.position.z };
        const f = camFwd(yaw);
        const d = 8;

        // Freeze the zombie: no awareness, no speed, parked in front of us.
        z.state = 'idle';
        z.awareness = 0;
        z.hasTarget = false;
        z.speed = 0;
        z.def = Object.assign({}, z.def, { walkSpeed: 0, chaseSpeed: 0 });
        const groundY = terrain.heightAt(pp.x + f.x * d, pp.z + f.z * d);
        z.body.setPosition(pp.x + f.x * d, groundY + z.body.feetOffset, pp.z + f.z * d);
        z.health = 100000;
        for (let k = 0; k < 10; k++) await wait(40);

        // Aim from the real eye at the real torso centre of the real position.
        const eye = { x: t.player.eye.x, y: t.player.eye.y, z: t.player.eye.z };
        const zp = z.body.position;
        const feetY = zp.y - z.body.feetOffset;
        const aimY = feetY + z.def.height * 0.68;
        let vx = zp.x - eye.x, vy = aimY - eye.y, vz = zp.z - eye.z;
        const vl = Math.hypot(vx, vy, vz);
        vx /= vl; vy /= vl; vz /= vl;

        // Check the aim vector really points along the camera forward axis.
        const horiz = Math.hypot(vx, vz) || 1;
        const alignDeg = Math.acos(Math.max(-1, Math.min(1, (vx / horiz) * f.x + (vz / horiz) * f.z))) * 180 / Math.PI;

        const res = g.__probeShot(eye.x, eye.y, eye.z, vx, vy, vz);
        tries++;
        if (res.hitZombie) {
          hits++;
          detail.push('yaw ' + yawDeg + ': hit ' + res.impacts.filter((i) => i.onZombie).map((i) => i.region).join('/') + ' dmg ' + res.damageDealt.toFixed(0) + ' (aim ' + alignDeg.toFixed(1) + ' deg off forward)');
        } else {
          const wr = g.__probeRay(eye.x, eye.y, eye.z, vx, vy, vz, 20);
          out.errors.push('yaw ' + yawDeg + ' missed a frozen zombie ' + vl.toFixed(2) + ' m ahead; world ray hit=' + wr.hit + ' at ' + wr.distance.toFixed(2) + ' m; aim was ' + alignDeg.toFixed(1) + ' deg off forward');
        }
      }
      out.checks.push('crosshair-to-hit: ' + hits + '/' + tries + ' yaw angles hit a frozen zombie 8 m dead ahead');
      out.shotDetail = detail;
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
  console.log('\n===== DIRECTION RESULT =====');
  console.log(JSON.stringify(result ?? null, null, 2));
  console.log('\nVERDICT: ' + ((result?.errors?.length ?? 1) === 0 ? 'PASS' : 'FAIL'));
  const bad = (result?.errors?.length ?? 1) !== 0;
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});

setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 240000);
