const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
app.commandLine.appendSwitch('use-angle', 'default');
app.disableDomainBlockingFor3DAPIs();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 720, show: true,
    webPreferences: { preload: path.join(root,'dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false, backgroundThrottling: false } });
  await win.loadFile(path.join(root, 'dist/index.html'), { query: { map: 'city' } });
  win.focus();
  const r = await win.webContents.executeJavaScript(`(async () => {
    const out = { errors: [], checks: {} };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();
    while (!(window.game && window.game.state.phase === 'menu')) { if (Date.now()-t0>40000) return 'timeout'; await wait(120); }
    const g = window.game;

    out.mapId = g.mapId;
    out.cityAssetsLoaded = g.cityAssetsLoaded;
    if (g.cityAssetsLoaded < 5) out.errors.push('city GLB props did not load: ' + g.cityAssetsLoaded + '/5');
    if (g.mapId !== 'city') { out.errors.push('game did not construct with the city map: ' + g.mapId); return out; }

    g.headless = true;

    let pumping = true;
    const raf = () => { if (!pumping) return; requestAnimationFrame(() => { try { g.__pump(); } catch (e) {} raf(); }); };
    raf();
    const safety = setInterval(() => { if (pumping) { try { g.__pump(); } catch (e) {} } }, 50);

    g.startNewRun();
    await wait(1500);
    const t = g.__test();
    const R = g.__round();
    if (!R.mode) { out.errors.push('city game has no RoundMode instance'); return out; }

    const spawn = { x: 0, z: 96 };
    const p0 = t.player.position;
    const groundY = t.terrain.heightAt(p0.x, p0.z);
    out.checks.spawn = {
      x: +p0.x.toFixed(2), y: +p0.y.toFixed(2), z: +p0.z.toFixed(2),
      authoredX: spawn.x, authoredZ: spawn.z,
      groundY: +groundY.toFixed(2),
      feetAboveGround: +(t.player.feetY - groundY).toFixed(3),
      half: t.terrain.half,
      inBounds: t.terrain.isInBounds(p0.x, p0.z, 1),
    };
    if (Math.hypot(p0.x - spawn.x, p0.z - spawn.z) > 2.5) out.errors.push('player did not spawn at the authored city spawn point');
    if (!t.terrain.isInBounds(p0.x, p0.z, 1)) out.errors.push('spawn is out of city bounds');

    for (let i = 0; i < 90; i++) { t.forceIntent({}); await wait(16); }
    const pSettled = t.player.position;
    const gap = t.player.feetY - t.terrain.heightAt(pSettled.x, pSettled.z);
    out.checks.settled = { y: +pSettled.y.toFixed(2), gap: +gap.toFixed(3) };
    if (pSettled.y < -5) out.errors.push('player fell through the city ground: y=' + pSettled.y.toFixed(2));
    if (Math.abs(gap) > 1.2) out.errors.push('player is not resting on the city ground: gap ' + gap.toFixed(2));

    const walkFrom = async (yaw, seconds) => {
      const a = { x: t.player.position.x, z: t.player.position.z };
      t.player.yaw = yaw;
      const steps = Math.round(seconds * 60);
      for (let i = 0; i < steps; i++) { t.forceIntent({ forward: 1 }); await wait(16); }
      t.forceIntent({});
      const b = t.player.position;
      return { dist: Math.hypot(b.x - a.x, b.z - a.z), from: a, to: { x: b.x, z: b.z } };
    };

    const northWalk = await walkFrom(Math.PI, 1.6);
    out.checks.walkNorth = { travelled: +northWalk.dist.toFixed(2) };
    if (northWalk.dist < 3) out.errors.push('player could not walk away from spawn (travelled ' + northWalk.dist.toFixed(2) + 'm) - likely spawned inside geometry');

    t.player.respawn(-51, t.terrain.heightAt(-51, 90) + 0.4, 90);
    await wait(300);
    const wallStart = { x: t.player.position.x, z: t.player.position.z };
    t.player.yaw = Math.PI;
    for (let i = 0; i < 200; i++) { t.forceIntent({ forward: 1, sprint: true }); await wait(16); }
    t.forceIntent({});
    await wait(200);
    const wallEnd = t.player.position;
    const wallTravel = Math.hypot(wallEnd.x - wallStart.x, wallEnd.z - wallStart.z);
    const freeTravel = 7.1 * (200 / 60);
    out.checks.wallCollision = {
      travelled: +wallTravel.toFixed(2),
      unobstructedWouldBe: +freeTravel.toFixed(2),
      blocked: wallTravel < freeTravel * 0.9,
      end: { x: +wallEnd.x.toFixed(2), z: +wallEnd.z.toFixed(2) },
    };

    t.player.respawn(spawn.x, t.terrain.heightAt(spawn.x, spawn.z) + 0.4, spawn.z);
    g.state.health = g.state.maxHealth;
    const keepAlive = setInterval(() => { g.state.health = g.state.maxHealth; }, 100);

    let minSpawnDist = Infinity;
    let worstFrontDot = -Infinity;
    const seen = new Set();
    const spawnSamples = [];
    const spawnWatch = setInterval(() => {
      const pp = t.player.position;
      const fx = -Math.sin(t.player.yaw), fz = -Math.cos(t.player.yaw);
      for (const z of t.zombies.zombies) {
        if (!z.alive || !z.body || seen.has(z)) continue;
        seen.add(z);
        const dx = z.body.position.x - pp.x, dz = z.body.position.z - pp.z;
        const d = Math.hypot(dx, dz);
        if (d < minSpawnDist) minSpawnDist = d;
        const dot = d > 0.001 ? (dx / d) * fx + (dz / d) * fz : 0;
        if (d < 20 && dot > worstFrontDot) worstFrontDot = dot;
        if (spawnSamples.length < 20) spawnSamples.push({ d: +d.toFixed(1), dot: +dot.toFixed(2), yaw: +t.player.yaw.toFixed(2) });
      }
    }, 50);

    const waitForPhase = async (want, limitMs) => {
      const s = Date.now();
      while (Date.now() - s < limitMs) { if (g.state.roundPhase === want) return true; await wait(80); }
      return false;
    };

    const gotActive = await waitForPhase('active', 20000);
    out.checks.round1 = {
      reachedActive: gotActive,
      roundNumber: g.state.roundNumber,
      phase: g.state.roundPhase,
      startingPoints: g.state.points,
    };
    if (!gotActive) out.errors.push('round 1 never reached the active phase');
    if (g.state.roundNumber !== 1) out.errors.push('round number is ' + g.state.roundNumber + ' at round 1 start');

    const waitForZombies = async (limitMs) => {
      const s = Date.now();
      while (Date.now() - s < limitMs) { if (t.zombies.aliveCount > 0) return true; await wait(80); }
      return false;
    };
    const spawnedAny = await waitForZombies(20000);
    await wait(2500);
    clearInterval(spawnWatch);

    out.checks.spawns = {
      anySpawned: spawnedAny,
      aliveAfterWait: t.zombies.aliveCount,
      distinctSeen: seen.size,
      minSpawnDistance: minSpawnDist === Infinity ? null : +minSpawnDist.toFixed(2),
      worstFrontConeDot: worstFrontDot === -Infinity ? null : +worstFrontDot.toFixed(2),
      samples: spawnSamples,
    };
    if (!spawnedAny) out.errors.push('round 1 active but no zombie ever spawned');
    const committed = R.spawnPlacements();
    const minCommitted = committed.length ? Math.min(...committed.map((p) => p.distance)) : null;
    out.checks.spawns.minCommittedDistance = minCommitted === null ? null : +minCommitted.toFixed(2);
    if (minCommitted !== null && minCommitted < 14) out.errors.push('zombie spawned closer than the 14m minimum: ' + minCommitted.toFixed(2) + 'm');

    const placements = R.spawnPlacements();
    let worstPlacement = null;
    for (const p of placements) {
      if (p.distance < 20 && p.facingDot > 0.9) {
        if (!worstPlacement || p.facingDot > worstPlacement.facingDot) worstPlacement = p;
      }
    }
    out.checks.spawnPlacements = {
      recorded: placements.length,
      minDistance: placements.length ? +Math.min(...placements.map((p) => p.distance)).toFixed(2) : null,
      maxFacingDot: placements.length ? +Math.max(...placements.map((p) => p.facingDot)).toFixed(2) : null,
      violation: worstPlacement,
    };
    if (worstPlacement) {
      out.errors.push('zombie placed point-blank in front of the player at spawn time: ' + worstPlacement.distance.toFixed(2) + 'm at dot ' + worstPlacement.facingDot.toFixed(2));
    }

    const pointsBeforeKills = g.state.points;
    let killed = 0;
    const killOne = () => {
      for (const z of t.zombies.zombies) {
        if (!z.alive || !z.body) continue;
        const pp = t.player.position;
        z.body.setPosition(pp.x, t.player.feetY + 1.2, pp.z - 6);
        return z;
      }
      return null;
    };

    const aimAtZombie = (z) => {
      const pp = t.player.position;
      const ty = z.body.position.y - z.body.feetOffset + z.def.height * 0.62;
      t.player.yaw = 0;
      t.player.pitch = Math.atan2(ty - t.player.eye.y, 6);
      return pp;
    };

    const victim = killOne();
    if (victim) {
      await wait(250);
      aimAtZombie(victim);
      for (let i = 0; i < 90 && victim.alive; i++) {
        const pp = t.player.position;
        victim.body.setPosition(pp.x, t.player.feetY + 1.2, pp.z - 6);
        t.weapons.currentSlot.magazine = 30; t.weapons.currentSlot.reserve = 999;
        t.fireOnce();
        await wait(40);
      }
      if (!victim.alive) killed++;
    }
    await wait(300);
    const pointsAfterKills = g.state.points;
    out.checks.killPoints = {
      before: pointsBeforeKills,
      after: pointsAfterKills,
      delta: pointsAfterKills - pointsBeforeKills,
      killedZombie: killed > 0,
      statsKills: g.matchStats ? g.matchStats.kills : null,
    };
    if (killed === 0) out.errors.push('could not kill a zombie with the probe shot path');
    if (pointsAfterKills <= pointsBeforeKills) out.errors.push('killing a zombie awarded no points: ' + pointsBeforeKills + ' -> ' + pointsAfterKills);

    const clearRound = async (limitMs) => {
      const s = Date.now();
      while (Date.now() - s < limitMs) {
        for (const z of t.zombies.zombies) {
          if (z.alive && z.body) {
            const pp = t.player.position;
            z.body.setPosition(pp.x, t.player.feetY + 1.2, pp.z - 6);
          }
        }
        const live = t.zombies.zombies.find((z) => z.alive && z.body);
        if (live) {
          aimAtZombie(live);
          t.weapons.currentSlot.magazine = 30;
          t.weapons.currentSlot.reserve = 999;
          t.fireOnce();
        }
        if (g.state.roundNumber >= 2) return true;
        await wait(40);
      }
      return false;
    };
    const advanced = await clearRound(90000);
    out.checks.roundAdvance = {
      advancedToRound2: advanced,
      roundNumber: g.state.roundNumber,
      phase: g.state.roundPhase,
      statsRoundsSurvived: g.matchStats ? g.matchStats.roundsSurvived : null,
    };
    if (!advanced) out.errors.push('round 1 never completed / round number never advanced to 2 (stuck at ' + g.state.roundNumber + ', phase ' + g.state.roundPhase + ')');

    const barX = -86, barZ = 74, barCost = 750;

    const standAtBarrier = async () => {
      t.player.respawn(barX, t.terrain.heightAt(barX, barZ + 2.2) + 0.4, barZ + 2.2);
      t.player.yaw = 0;
      await wait(400);
    };

    const holdInteract = async (frames) => {
      for (let i = 0; i < frames; i++) { t.forceIntent({ interactHeld: true }); await wait(16); }
      t.forceIntent({});
      await wait(200);
    };

    R.setPoints(barCost - 1);
    await standAtBarrier();
    out.checks.barrierHint = g.state.interactHint;
    const poorBefore = g.state.points;
    await holdInteract(80);
    const poorAfter = g.state.points;
    const stillClosedPoor = R.barrierColliderExists('bar_start_west');
    out.checks.insufficient = {
      hint: out.checks.barrierHint,
      pointsBefore: poorBefore,
      pointsAfter: poorAfter,
      deducted: poorBefore - poorAfter,
      barrierStillBlocking: stillClosedPoor,
      message: g.state.purchaseMessage,
    };
    if (poorAfter !== poorBefore) out.errors.push('insufficient points still deducted ' + (poorBefore - poorAfter));
    if (stillClosedPoor !== true) out.errors.push('barrier opened despite insufficient points');

    const walkThroughBarrier = async () => {
      t.player.respawn(barX, t.terrain.heightAt(barX, barZ + 4) + 0.4, barZ + 4);
      t.player.yaw = 0;
      await wait(300);
      const z0 = t.player.position.z;
      for (let i = 0; i < 150; i++) { t.forceIntent({ forward: 1, sprint: true }); await wait(16); }
      t.forceIntent({});
      await wait(200);
      const pEnd = t.player.position;
      return { startZ: z0, endZ: pEnd.z, endX: pEnd.x, crossed: pEnd.z < barZ - 1.0 };
    };

    const beforeBuy = await walkThroughBarrier();
    out.checks.barrierBlocksBeforePurchase = {
      startZ: +beforeBuy.startZ.toFixed(2), endZ: +beforeBuy.endZ.toFixed(2),
      crossed: beforeBuy.crossed,
    };
    if (beforeBuy.crossed) out.errors.push('closed barrier did not block the player - walked through at z=' + beforeBuy.endZ.toFixed(2));

    R.setPoints(barCost + 500);
    await standAtBarrier();
    const richBefore = g.state.points;
    await holdInteract(90);
    const richAfter = g.state.points;
    const colliderGone = R.barrierColliderExists('bar_start_west') === false;
    out.checks.purchase = {
      pointsBefore: richBefore,
      pointsAfter: richAfter,
      deducted: richBefore - richAfter,
      expectedCost: barCost,
      message: g.state.purchaseMessage,
      colliderRemoved: colliderGone,
      zoneUnlocked: R.zoneUnlocked('west_row'),
    };
    if (richBefore - richAfter !== barCost) out.errors.push('barrier deducted ' + (richBefore - richAfter) + ' but costs ' + barCost);
    if (!colliderGone) out.errors.push('barrier purchased but its collider was NOT removed');

    const afterBuy = await walkThroughBarrier();
    out.checks.barrierWalkThroughAfterPurchase = {
      startZ: +afterBuy.startZ.toFixed(2), endZ: +afterBuy.endZ.toFixed(2),
      endX: +afterBuy.endX.toFixed(2),
      crossed: afterBuy.crossed,
    };
    if (!afterBuy.crossed) out.errors.push('OPENED barrier still blocks the player: stopped at z=' + afterBuy.endZ.toFixed(2) + ' (barrier at z=' + barZ + ')');

    clearInterval(keepAlive);
    const keepAlive2 = setInterval(() => { g.state.health = g.state.maxHealth; }, 100);
    t.player.respawn(spawn.x, t.terrain.heightAt(spawn.x, spawn.z) + 0.4, spawn.z);
    await wait(500);
    g.setDebug(true);
    await wait(800);

    const frames = [];
    const unsub = g.subscribeDebug((d) => frames.push({ ...d }));
    const rafTimes = [];
    let lastT = performance.now();
    let perfRunning = true;
    const rafProbe = () => {
      if (!perfRunning) return;
      requestAnimationFrame((now) => { rafTimes.push(now - lastT); lastT = now; rafProbe(); });
    };
    rafProbe();

    const patrol = [Math.PI, Math.PI * 0.5, 0, -Math.PI * 0.5];
    for (let s = 0; s < 4; s++) {
      t.player.yaw = patrol[s];
      for (let i = 0; i < 180; i++) {
        t.forceIntent({ forward: 1, sprint: i % 3 === 0 });
        t.forceLook(0.004, 0);
        await wait(16);
      }
    }
    t.forceIntent({});
    perfRunning = false;
    unsub();
    clearInterval(keepAlive2);

    const use = frames.slice(3);
    const fpsVals = use.map((d) => d.fps).filter((v) => v > 0);
    const dcVals = use.map((d) => d.drawCalls).filter((v) => v > 0);
    const triVals = use.map((d) => d.triangles).filter((v) => v > 0);
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
    const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
    const ft = rafTimes.slice(5).filter((v) => v > 0 && v < 500);

    out.performance = {
      samples: use.length,
      avgFps: fpsVals.length ? +(fpsVals.reduce((a, b) => a + b, 0) / fpsVals.length).toFixed(1) : null,
      minFps: fpsVals.length ? +Math.min(...fpsVals).toFixed(1) : null,
      medianFrameMs: +med(ft).toFixed(2),
      p99FrameMs: +pct(ft, 0.99).toFixed(2),
      worstFrameMs: ft.length ? +Math.max(...ft).toFixed(2) : null,
      spikesOver33ms: ft.filter((v) => v > 33).length,
      frameSamples: ft.length,
      drawCallsMedian: med(dcVals),
      drawCallsMax: dcVals.length ? Math.max(...dcVals) : null,
      trianglesMedian: med(triVals),
      trianglesMax: triVals.length ? Math.max(...triVals) : null,
      buckets: use.length ? {
        simMs: +med(use.map((d) => d.simMs)).toFixed(2),
        physicsMs: +med(use.map((d) => d.physicsMs)).toFixed(2),
        aiMs: +med(use.map((d) => d.aiMs)).toFixed(2),
        renderMs: +med(use.map((d) => d.renderMs)).toFixed(2),
        playerMs: +med(use.map((d) => d.playerMs)).toFixed(2),
      } : null,
      zombiesAlive: use.length ? use[use.length - 1].zombieAlive : null,
      memoryMb: use.length ? use[use.length - 1].memoryMb : null,
      renderer: g.rendererInfo,
    };

    if (out.performance.avgFps !== null && out.performance.avgFps < 50) {
      out.errors.push('city average FPS below 50: ' + out.performance.avgFps);
    }
    if (out.performance.drawCallsMax !== null && out.performance.drawCallsMax > 800) {
      out.errors.push('city draw calls exceed the 800 budget: ' + out.performance.drawCallsMax);
    }

    pumping = false; clearInterval(safety);
    return out;
  })()`, true);
  console.log(JSON.stringify(r, null, 2));
  const bad = (r?.errors?.length ?? 1) !== 0;
  console.log('VERDICT: ' + (bad ? 'FAIL' : 'PASS'));
  setTimeout(() => app.exit(bad ? 1 : 0), 300);
});
setTimeout(()=>{ console.log('TIMEOUT'); app.exit(2); }, 420000);
