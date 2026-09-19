import { memo, useMemo, useState } from 'react';
import type { MatchStatsSnapshot } from '../rounds/matchStats';
import { WEAPONS } from '../weapons/definitions';
import { MEDICAL, MEDICAL_ORDER } from '../medical/definitions';
import {
  CARRY,
  WEIGHT,
  loadoutWeight,
  validateLoadout,
  type Loadout,
} from '../inventory/loadout';
import type { MedicalId, WeaponId } from '../state/types';
import { BagIcon, ItemIcon } from './ItemIcons';

const WEAPON_ORDER: readonly WeaponId[] = ['pistol', 'rifle', 'shotgun', 'machete'];

const AMMO_STEP: Record<string, number> = {
  '9mm': 15,
  '556': 30,
  '12g': 8,
  none: 0,
};

const AMMO_LABEL: Record<string, string> = {
  '9mm': '9×19mm',
  '556': '5.56mm',
  '12g': '12 gauge',
  none: '—',
};

const BLURB: Record<WeaponId, string> = {
  pistol: 'Light sidearm. Cheap to carry, weak past mid range.',
  rifle: 'Accurate and automatic. The heaviest thing in the bag.',
  shotgun: 'Nine pellets. Devastating under ten metres, useless past thirty.',
  machete: 'Silent, weightless, staggers on hit. No ammo to run dry.',
};

const SLOT_LABEL: Record<WeaponId, string> = {
  pistol: 'Sidearm',
  rifle: 'Primary',
  shotgun: 'Primary',
  machete: 'Melee',
};

type Selected = { kind: 'weapon'; id: WeaponId } | { kind: 'medical'; id: MedicalId };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ldt-stat">
      <span className="ldt-stat__label">{label}</span>
      <span className="ldt-stat__value">{value}</span>
    </div>
  );
}

function Meter({ label, fill }: { label: string; fill: number }) {
  return (
    <div className="ldt-meter">
      <span className="ldt-meter__label">{label}</span>
      <div className="ldt-meter__track">
        <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, fill))})` }} />
      </div>
    </div>
  );
}

function WeaponDetail({ id }: { id: WeaponId }) {
  const def = WEAPONS[id];
  const isMelee = def.kind === 'melee';
  const dps = isMelee
    ? def.damage / ((def.meleeWindup ?? 0.12) + (def.meleeActive ?? 0.1) + (def.meleeRecovery ?? 0.36))
    : (def.damage * (def.pellets ?? 1) * def.rpm) / 60;
  return (
    <>
      <div className="ldt-detail__stats">
        <Stat
          label="Damage"
          value={def.pellets ? `${def.pellets} × ${def.damage}` : String(def.damage)}
        />
        <Stat label="Rate" value={isMelee ? 'Swing' : `${def.rpm} rpm`} />
        <Stat label="Magazine" value={def.magazineSize > 0 ? String(def.magazineSize) : '—'} />
        <Stat label="Ammo" value={AMMO_LABEL[def.ammo] ?? '—'} />
        <Stat label="Reload" value={def.reloadTime > 0 ? `${def.reloadTime.toFixed(1)}s` : '—'} />
        <Stat label="Weight" value={`${WEIGHT[id].toFixed(1)} kg`} />
      </div>
      <div className="ldt-detail__meters">
        <Meter label="Damage" fill={(def.damage * (def.pellets ?? 1)) / 130} />
        <Meter label="Sustained" fill={dps / 700} />
        <Meter label="Range" fill={def.range / 80} />
        <Meter label="Noise" fill={def.noiseRadius / 140} />
      </div>
    </>
  );
}

function MedicalDetail({ id }: { id: MedicalId }) {
  const def = MEDICAL[id];
  return (
    <>
      <div className="ldt-detail__stats">
        <Stat label="Restores" value={`${def.heal} hp`} />
        <Stat label="Use time" value={`${def.useTime.toFixed(1)}s`} />
        <Stat label="Weight" value={`${WEIGHT[id].toFixed(2)} kg`} />
        <Stat label="Stack" value={String(def.stackLimit)} />
      </div>
      <p className="ldt-detail__note">
        {def.cancelOnDamage
          ? 'Interrupted if you take damage, and the item is returned. Use it behind cover.'
          : 'Holds through damage. The one you can use mid-fight.'}
      </p>
    </>
  );
}

export const LoadoutScreen = memo(function LoadoutScreen({
  loadout,
  onChange,
  onDeploy,
  onBack,
}: {
  loadout: Loadout;
  onChange: (next: Loadout) => void;
  onDeploy: () => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<Selected>({ kind: 'weapon', id: 'rifle' });

  const weight = useMemo(() => loadoutWeight(loadout), [loadout]);
  const validation = useMemo(() => validateLoadout(loadout), [loadout]);
  const pct = Math.min(1, weight / CARRY.maxWeight);
  const over = weight > CARRY.maxWeight;

  const toggleWeapon = (id: WeaponId) => {
    const has = loadout.weapons.includes(id);
    const weapons = has ? loadout.weapons.filter((w) => w !== id) : [...loadout.weapons, id];
    const reserves = { ...loadout.reserves };
    if (has) delete reserves[id];
    else if (WEAPONS[id].ammo !== 'none') reserves[id] = WEAPONS[id].startingReserve;
    onChange({ ...loadout, weapons, reserves });
  };

  const changeAmmo = (id: WeaponId, delta: number) => {
    const def = WEAPONS[id];
    const next = Math.max(0, Math.min(def.maxReserve, (loadout.reserves[id] ?? 0) + delta));
    onChange({ ...loadout, reserves: { ...loadout.reserves, [id]: next } });
  };

  const changeMedical = (id: MedicalId, delta: number) => {
    const next = Math.max(
      0,
      Math.min(MEDICAL[id].stackLimit, (loadout.medical[id] ?? 0) + delta),
    );
    onChange({ ...loadout, medical: { ...loadout.medical, [id]: next } });
  };

  return (
    <div className="screen screen--loadout overlay--interactive">
      <div className="ldt">
        <header className="ldt__head">
          <div>
            <h1 className="ldt__title">Loadout</h1>
            <p className="ldt__sub">Choose what you carry into the forest</p>
          </div>
          <div className={`ldt-bag${over ? ' is-over' : ''}`}>
            <BagIcon />
            <div className="ldt-bag__body">
              <div className="ldt-bag__row">
                <span>Bag</span>
                <b>
                  {weight.toFixed(1)}
                  <i>/{CARRY.maxWeight} kg</i>
                </b>
              </div>
              <div className="ldt-bag__track">
                <span style={{ transform: `scaleX(${pct})` }} />
              </div>
            </div>
          </div>
        </header>

        <div className="ldt__main">
          <div className="ldt__list">
            <h2 className="ldt__group">Weapons</h2>
            {WEAPON_ORDER.map((id) => {
              const def = WEAPONS[id];
              const picked = loadout.weapons.includes(id);
              const active = selected.kind === 'weapon' && selected.id === id;
              const reserve = loadout.reserves[id] ?? 0;
              const step = AMMO_STEP[def.ammo] ?? 0;
              return (
                <div
                  key={id}
                  className={`ldt-row${picked ? ' is-picked' : ''}${active ? ' is-active' : ''}`}
                  onMouseEnter={() => setSelected({ kind: 'weapon', id })}
                >
                  <button
                    type="button"
                    className="ldt-row__main"
                    onClick={() => toggleWeapon(id)}
                    aria-pressed={picked}
                  >
                    <span className="ldt-row__icon">
                      <ItemIcon id={id} />
                    </span>
                    <span className="ldt-row__text">
                      <span className="ldt-row__name">{def.name}</span>
                      <span className="ldt-row__slot">{SLOT_LABEL[id]}</span>
                    </span>
                    <span className="ldt-row__weight">{WEIGHT[id].toFixed(1)}kg</span>
                    <span className={`ldt-row__check${picked ? ' is-on' : ''}`} />
                  </button>
                  {picked && step > 0 && (
                    <div className="ldt-row__ammo">
                      <span className="ldt-row__ammo-icon">
                        <ItemIcon id="ammo" />
                      </span>
                      <span className="ldt-row__ammo-label">{AMMO_LABEL[def.ammo]}</span>
                      <button
                        type="button"
                        className="step"
                        onClick={() => changeAmmo(id, -step)}
                        disabled={reserve === 0}
                        aria-label="Less ammo"
                      >
                        −
                      </button>
                      <b className="step__val">{reserve}</b>
                      <button
                        type="button"
                        className="step"
                        onClick={() => changeAmmo(id, step)}
                        disabled={reserve >= def.maxReserve}
                        aria-label="More ammo"
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <h2 className="ldt__group">Medical</h2>
            {MEDICAL_ORDER.map((id) => {
              const def = MEDICAL[id];
              const qty = loadout.medical[id] ?? 0;
              const active = selected.kind === 'medical' && selected.id === id;
              return (
                <div
                  key={id}
                  className={`ldt-row${qty > 0 ? ' is-picked' : ''}${active ? ' is-active' : ''}`}
                  onMouseEnter={() => setSelected({ kind: 'medical', id })}
                >
                  <div className="ldt-row__main is-static">
                    <span className="ldt-row__icon">
                      <ItemIcon id={id} />
                    </span>
                    <span className="ldt-row__text">
                      <span className="ldt-row__name">{def.name}</span>
                      <span className="ldt-row__slot">+{def.heal} hp</span>
                    </span>
                    <span className="ldt-row__weight">{WEIGHT[id].toFixed(2)}kg</span>
                    <span className="ldt-row__steps">
                      <button
                        type="button"
                        className="step"
                        onClick={() => changeMedical(id, -1)}
                        disabled={qty === 0}
                        aria-label={`Fewer ${def.name}`}
                      >
                        −
                      </button>
                      <b className="step__val">{qty}</b>
                      <button
                        type="button"
                        className="step"
                        onClick={() => changeMedical(id, 1)}
                        disabled={qty >= def.stackLimit}
                        aria-label={`More ${def.name}`}
                      >
                        +
                      </button>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <aside className="ldt__detail">
            <div className="ldt-detail__art">
              <ItemIcon id={selected.id} />
            </div>
            <h3 className="ldt-detail__name">
              {selected.kind === 'weapon' ? WEAPONS[selected.id].name : MEDICAL[selected.id].name}
            </h3>
            <p className="ldt-detail__kind">
              {selected.kind === 'weapon' ? SLOT_LABEL[selected.id] : 'Medical'}
            </p>
            {selected.kind === 'weapon' ? (
              <>
                <WeaponDetail id={selected.id} />
                <p className="ldt-detail__note">{BLURB[selected.id]}</p>
              </>
            ) : (
              <MedicalDetail id={selected.id} />
            )}
          </aside>
        </div>

        <footer className="ldt__foot">
          <span className="ldt__error">{validation.errors[0] ?? ''}</span>
          <div className="btn-row">
            <button className="btn btn--ghost" type="button" onClick={onBack}>
              Back
            </button>
            <button
              className="btn"
              type="button"
              onClick={onDeploy}
              disabled={!validation.valid}
              autoFocus
            >
              Deploy
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
});

export const ResultsScreen = memo(function ResultsScreen({
  kills,
  survivedSeconds,
  stats,
  onRestart,
  onMenu,
}: {
  kills: number;
  survivedSeconds: number;
  stats?: MatchStatsSnapshot | null;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const minutes = Math.floor(survivedSeconds / 60);
  const seconds = Math.floor(survivedSeconds % 60);
  return (
    <div className="screen screen--died overlay--interactive">
      <div className="died">
        <h1 className="died__title">You Died</h1>
        <p className="died__tagline">
          {stats ? 'The district keeps what it takes' : 'The forest keeps what it takes'}
        </p>

        <div className="died__stats">
          {stats && (
            <>
              <div className="died-stat">
                <span className="died-stat__value">{stats.highestRound}</span>
                <span className="died-stat__label">Rounds</span>
              </div>
              <span className="died__sep" />
            </>
          )}
          <div className="died-stat">
            <span className="died-stat__value">{kills}</span>
            <span className="died-stat__label">Killed</span>
          </div>
          <span className="died__sep" />
          <div className="died-stat">
            <span className="died-stat__value">
              {minutes}:{String(seconds).padStart(2, '0')}
            </span>
            <span className="died-stat__label">Survived</span>
          </div>
        </div>

        {stats && (
          <div className="died__detail">
            <span>Headshots<b>{stats.headshots}</b></span>
            <span>Accuracy<b>{Math.round(stats.accuracy * 100)}%</b></span>
            <span>Damage<b>{stats.damageDealt}</b></span>
            <span>Points earned<b>{stats.pointsEarned}</b></span>
            <span>Points spent<b>{stats.pointsSpent}</b></span>
            <span>Doors opened<b>{stats.doorsOpened}</b></span>
            <span>Perks<b>{stats.perksBought}</b></span>
            <span>Weapons bought<b>{stats.weaponsBought}</b></span>
            <span>Power<b>{stats.powerActivated ? 'On' : 'Off'}</b></span>
          </div>
        )}

        <div className="died__actions">
          <button className="btn btn--danger" onClick={onRestart} autoFocus>
            Try again
          </button>
          <button className="btn btn--ghost" onClick={onMenu}>
            Main menu
          </button>
        </div>

        <p className="died__hint">Try again keeps your loadout · Main menu lets you change it</p>
      </div>
    </div>
  );
});
