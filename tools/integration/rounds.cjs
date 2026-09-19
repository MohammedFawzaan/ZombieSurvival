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
    const out = { errors: [], rounds: [], checks: {} };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = Date.now();
    while (!(window.game && window.game.state.phase === 'menu')) { if (Date.now()-t0>40000) return 'timeout'; await wait(120); }
    const g = window.game;
    if (g.mapId !== 'city') { out.errors.push('not the city map'); return out; }

    g.headless = true;
    let pumping = true;
    const raf = () => { if (!pumping) return; requestAnimationFrame(() => { try { g.__pump(); } catch (e) {} raf(); }); };
    raf();
    const safety = setInterval(() => { if (pumping) { try { g.__pump(); } catch (e) {} } }, 50);

    g.startNewRun();
    await wait(1500);
    const t = g.__test();
    const R = g.__round();
    if (!R.mode) { out.errors.push('no RoundMode'); return out; }

    const killAllAlive = () => {
      let killed = 0;
      for (const z of t.zombies.zombies) {
        if (z.alive && z.body) {
          const died = t.zombies.applyDamage(z, 100000, 'head', 0, 0);
          if (died) { R.mode.registerHit(100, 'head', true, false); killed++; }
        }
      }
      return killed;
    };

    const runRound = async (budgetMs) => {
      const startRound = g.state.roundNumber;
      const deadline = Date.now() + budgetMs;
      let spawnedSeen = 0;
      while (Date.now() < deadline) {
        const snap = R.mode.rounds.snapshot();
        spawnedSeen = Math.max(spawnedSeen, snap.spawned);
        if (g.state.roundNumber > startRound) return { advanced: true, spawnedSeen };
        killAllAlive();
        await wait(120);
      }
      return { advanced: false, spawnedSeen };
    };

    const waitForRound1 = Date.now() + 20000;
    while (g.state.roundNumber < 1 && Date.now() < waitForRound1) await wait(120);
    if (g.state.roundNumber < 1) out.errors.push('round 1 never started');

    for (let i = 0; i < 5; i++) {
      const before = R.mode.rounds.snapshot();
      const plan = { round: before.round, total: before.total, maxAlive: before.plan ? before.plan.maxAlive : null,
        healthMul: before.plan ? +before.plan.healthMultiplier.toFixed(2) : null,
        speedMul: before.plan ? +before.plan.speedMultiplier.toFixed(2) : null,
        special: before.plan ? before.plan.special : null,
        label: before.plan ? before.plan.label : null };
      const res = await runRound(70000);
      out.rounds.push({ ...plan, spawnedSeen: res.spawnedSeen, advanced: res.advanced, points: g.state.points });
      if (!res.advanced) { out.errors.push('round ' + plan.round + ' never completed'); break; }
    }

    if (out.rounds.length >= 4) {
      const totals = out.rounds.map((r) => r.total);
      const nonDecreasing = totals.every((v, i) => i === 0 || v >= totals[i-1]);
      const grew = totals[totals.length-1] > totals[0];
      out.checks.scaling = { totals, nonDecreasing, grew };
      if (!nonDecreasing) out.errors.push('round zombie totals decreased across rounds: ' + totals.join(','));
      if (!grew) out.errors.push('round zombie totals never grew: ' + totals.join(','));
      const everySpawned = out.rounds.every((r) => r.spawnedSeen > 0);
      if (!everySpawned) out.errors.push('a round spawned no zombies at all');
    }

    out.checks.reachedRound = g.state.roundNumber;
    if (g.state.roundNumber < 5) out.errors.push('did not reach round 5, stopped at ' + g.state.roundNumber);

    const statsBeforeDeath = g.matchStats ? { ...g.matchStats } : null;
    t.player.respawn(0, t.terrain.heightAt(0, 96) + 0.4, 96);
    await wait(200);
    g.state.damage(100000, 0);
    await wait(900);

    out.checks.gameOver = {
      phase: g.state.phase,
      roundPhase: g.state.roundPhase,
      roundAtDeath: statsBeforeDeath ? statsBeforeDeath.highestRound : null,
      statsKills: g.matchStats ? g.matchStats.kills : null,
      statsRoundsSurvived: g.matchStats ? g.matchStats.roundsSurvived : null,
      statsPointsEarned: g.matchStats ? g.matchStats.pointsEarned : null,
    };
    if (g.state.phase !== 'dead') out.errors.push('player death did not reach the dead phase: ' + g.state.phase);
    if (g.state.roundPhase !== 'game-over') out.errors.push('round phase did not become game-over: ' + g.state.roundPhase);
    if (!g.matchStats || g.matchStats.kills <= 0) out.errors.push('match stats recorded no kills across five rounds');

    g.startNewRun();
    const restartDeadline = Date.now() + 20000;
    while (g.state.roundNumber < 1 && Date.now() < restartDeadline) await wait(120);
    out.checks.afterRestart = {
      phase: g.state.phase,
      round: g.state.roundNumber,
      points: g.state.points,
      health: g.state.health,
      perks: g.state.perks ? g.state.perks.length : -1,
      powerOn: g.state.powerOn,
      barrierRestored: R.barrierColliderExists('bar_start_west'),
    };
    if (g.state.roundNumber !== 1) out.errors.push('restart did not return to round 1: ' + g.state.roundNumber);
    if (!R.barrierColliderExists('bar_start_west')) out.errors.push('restart did not restore barrier colliders');
    if (g.state.powerOn) out.errors.push('restart left power on');

    pumping = false;
    clearInterval(safety);
    return out;
  })()`, true);

  console.log('ROUNDS_RESULT ' + JSON.stringify(r, null, 2));
  const bad = r === 'timeout' || !r || (r.errors || []).length > 0;
  console.log('VERDICT: ' + (bad ? 'FAIL' : 'PASS'));
  app.exit(bad ? 1 : 0);
});
