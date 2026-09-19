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
    if (g.mapId !== 'city') { out.errors.push('not the city map: ' + g.mapId); return out; }

    g.headless = true;
    let pumping = true;
    const raf = () => { if (!pumping) return; requestAnimationFrame(() => { try { g.__pump(); } catch (e) {} raf(); }); };
    raf();
    const safety = setInterval(() => { if (pumping) { try { g.__pump(); } catch (e) {} } }, 50);

    const pre = g.__test();
    pre.setLoadout({ weapons: ['pistol'], reserves: { pistol: 75 }, medical: { bandage: 2, medkit: 1 } });
    g.startNewRun();
    await wait(1500);
    const t = g.__test();
    const R = g.__round();
    if (!R.mode) { out.errors.push('no RoundMode'); return out; }

    const standAt = async (x, z, yaw) => {
      t.player.respawn(x, t.terrain.heightAt(x, z) + 0.4, z);
      t.player.yaw = yaw;
      await wait(400);
    };

    const holdInteract = async (frames) => {
      for (let i = 0; i < frames; i++) { t.forceIntent({ interactHeld: true }); await wait(16); }
      t.forceIntent({});
      await wait(250);
    };

    const nudgeToPrompt = async (id) => {
      const pos = R.interactablePosition(id);
      if (!pos) return false;
      for (const radius of [1.2, 1.7, 2.2]) {
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          const px = pos.x + Math.cos(ang) * radius;
          const pz = pos.z + Math.sin(ang) * radius;
          const yaw = Math.atan2(-(pos.x - px), -(pos.z - pz));
          await standAt(px, pz, yaw);
          for (let i = 0; i < 6; i++) { t.forceIntent({}); await wait(16); }
          if (g.state.interactHint) return true;
        }
      }
      return false;
    };

    const startedWithMachete = R.hasWeapon('machete');
    R.setPoints(5000);
    const macheteFound = await nudgeToPrompt('ww_machete');
    const mBefore = g.state.points;
    const mHint = g.state.interactHint;
    await holdInteract(90);
    const mAfter = g.state.points;
    const ownsMachete = R.hasWeapon('machete');
    out.checks.wallWeapon = {
      promptFound: macheteFound, hint: mHint,
      startedOwning: startedWithMachete,
      pointsBefore: mBefore, pointsAfter: mAfter, deducted: mBefore - mAfter,
      ownsAfter: ownsMachete,
      message: g.state.purchaseMessage,
      slotCount: g.weaponsPublic ? g.weaponsPublic.slotCount : -1,
    };
    if (!macheteFound) out.errors.push('no interact prompt ever appeared at the machete wall buy');
    else if (!startedWithMachete) {
      if (!ownsMachete) out.errors.push('wall weapon purchase did not add the weapon to the inventory');
      if (mBefore - mAfter !== 750) out.errors.push('machete wall buy deducted ' + (mBefore - mAfter) + ', expected 750');
    }

    R.drainReserve('pistol');
    const pistolReserveBefore = R.reserveFor('pistol');
    R.setPoints(5000);
    const ammoFound = await nudgeToPrompt('ww_pistol');
    const aBefore = g.state.points;
    const aHint = g.state.interactHint;
    await holdInteract(120);
    const aAfter = g.state.points;
    const pistolReserveAfter = R.reserveFor('pistol');
    out.checks.wallAmmo = {
      promptFound: ammoFound, hint: aHint,
      pointsBefore: aBefore, pointsAfter: aAfter, deducted: aBefore - aAfter,
      reserveBefore: pistolReserveBefore, reserveAfter: pistolReserveAfter,
      message: g.state.purchaseMessage,
    };
    if (!ammoFound) out.errors.push('no interact prompt at the pistol wall buy');
    else if (pistolReserveAfter <= pistolReserveBefore) out.errors.push('ammo purchase did not raise the pistol reserve (' + pistolReserveBefore + ' -> ' + pistolReserveAfter + ')');
    else if (aBefore - aAfter !== 250) out.errors.push('pistol ammo deducted ' + (aBefore - aAfter) + ', expected 250');

    R.openAllBarriers();
    await wait(300);
    out.checks.zonesUnlocked = {
      substation: R.zoneUnlocked('substation'),
      depot: R.zoneUnlocked('depot_yard'),
      market: R.zoneUnlocked('market_square'),
    };

    const powerBefore = R.mode.power.on;
    R.setPoints(5000);
    const powerFound = await nudgeToPrompt('power_main');
    const pHint = g.state.interactHint;
    await holdInteract(140);
    const powerAfter = R.mode.power.on;
    out.checks.power = {
      promptFound: powerFound, hint: pHint,
      before: powerBefore, after: powerAfter,
      hudPowerOn: g.state.powerOn,
      statsPowerActivated: g.matchStats ? g.matchStats.powerActivated : null,
      message: g.state.purchaseMessage,
    };
    if (!powerFound) out.errors.push('no interact prompt at the power switch');
    else if (powerAfter !== true) out.errors.push('power switch did not turn power on');
    else if (g.state.powerOn !== true) out.errors.push('power on in sim but HUD state says off');

    const reloadMulBefore = g.weaponsPublic ? g.weaponsPublic.reloadTimeMultiplier : -1;
    const perksBefore = R.perkCount();
    R.setPoints(9000);
    const perkFound = await nudgeToPrompt('perk_steadyhands');
    const kBefore = g.state.points;
    const kHint = g.state.interactHint;
    await holdInteract(140);
    const kAfter = g.state.points;
    const perksAfter = R.perkCount();
    const reloadMulAfter = g.weaponsPublic ? g.weaponsPublic.reloadTimeMultiplier : -1;
    out.checks.perk = {
      promptFound: perkFound, hint: kHint,
      pointsBefore: kBefore, pointsAfter: kAfter, deducted: kBefore - kAfter,
      perksBefore, perksAfter,
      reloadMultiplierBefore: reloadMulBefore, reloadMultiplierAfter: reloadMulAfter,
      hudBadges: g.state.perks ? g.state.perks.length : 0,
      message: g.state.purchaseMessage,
    };
    if (!perkFound) out.errors.push('no interact prompt at the steadyhands perk machine');
    else if (perksAfter <= perksBefore) out.errors.push('perk machine did not grant a perk');
    else if (!(reloadMulAfter < reloadMulBefore)) {
      out.errors.push('perk was granted but reload multiplier did not change (' + reloadMulBefore + ' -> ' + reloadMulAfter + ') - fake perk state');
    }

    const dupPointsBefore = g.state.points;
    const dupPerksBefore = R.perkCount();
    await holdInteract(120);
    out.checks.duplicatePerk = {
      pointsBefore: dupPointsBefore, pointsAfter: g.state.points,
      deducted: dupPointsBefore - g.state.points,
      perksBefore: dupPerksBefore, perksAfter: R.perkCount(),
    };
    if (R.perkCount() > dupPerksBefore) out.errors.push('duplicate perk purchase granted a second copy');
    if (g.state.points < dupPointsBefore) out.errors.push('duplicate perk purchase still charged ' + (dupPointsBefore - g.state.points));

    const weaponsBefore = ['pistol','rifle','shotgun','machete'].filter((w) => R.hasWeapon(w));
    R.setPoints(9000);
    const rewardFound = await nudgeToPrompt('reward_depot');
    const rBefore = g.state.points;
    const rHint = g.state.interactHint;
    await holdInteract(150);
    const rAfter = g.state.points;
    const weaponsAfter = ['pistol','rifle','shotgun','machete'].filter((w) => R.hasWeapon(w));
    out.checks.reward = {
      promptFound: rewardFound, hint: rHint,
      pointsBefore: rBefore, pointsAfter: rAfter, deducted: rBefore - rAfter,
      weaponsBefore, weaponsAfter,
      rewardsRolled: g.matchStats ? g.matchStats.rewardsRolled : null,
      message: g.state.purchaseMessage,
    };
    if (!rewardFound) out.errors.push('no interact prompt at the reward machine');
    else if (rBefore - rAfter !== 950) out.errors.push('reward machine deducted ' + (rBefore - rAfter) + ', expected 950');
    else if (!g.matchStats || g.matchStats.rewardsRolled < 1) out.errors.push('reward machine charged but rolled no reward');

    pumping = false;
    clearInterval(safety);
    return out;
  })()`, true);

  console.log('PURCHASES_RESULT ' + JSON.stringify(r, null, 2));
  const bad = r === 'timeout' || !r || (r.errors || []).length > 0;
  console.log('VERDICT: ' + (bad ? 'FAIL' : 'PASS'));
  app.exit(bad ? 1 : 0);
});
