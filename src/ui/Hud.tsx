import { memo } from 'react';
import type { HudSnapshot } from '../state/types';
import { clamp } from '../util/math';

interface DamageDirectionsProps {
  dirs: { angle: number; strength: number; life: number }[];
}

/**
 * Arc indicators around the crosshair showing where incoming attacks came
 * from. 0 rad is straight ahead and positive is to the right, so the arc is
 * simply rotated by the angle.
 */
export const DamageDirections = memo(function DamageDirections({ dirs }: DamageDirectionsProps) {
  if (dirs.length === 0) return null;
  return (
    <div className="dmgdirs">
      {dirs.map((d, i) => {
        const fade = clamp(d.life, 0, 1);
        // Hold full strength briefly, then fade out.
        const opacity = clamp(fade * 1.6, 0, 1) * (0.45 + d.strength * 0.55);
        return (
          <div
            key={i}
            className="dmgdir"
            style={{ transform: `rotate(${(d.angle * 180) / Math.PI}deg)`, opacity }}
          >
            <div className="dmgdir__arc" />
          </div>
        );
      })}
    </div>
  );
});

interface CrosshairProps {
  spreadPx: number;
  aiming: boolean;
  hitMarker: number;
  killMarker: number;
  visible: boolean;
}

export const Crosshair = memo(function Crosshair({
  spreadPx,
  aiming,
  hitMarker,
  killMarker,
  visible,
}: CrosshairProps) {
  const gap = clamp(spreadPx, 2, 18);
  const len = aiming ? 4 : 6;
  const thickness = 1.6;
  const opacity = visible ? (aiming ? 0.95 : 0.8) : 0;

  const lines = [
    { left: '50%', top: `calc(50% - ${gap + len}px)`, width: thickness, height: len, mx: -thickness / 2, my: 0 },
    { left: '50%', top: `calc(50% + ${gap}px)`, width: thickness, height: len, mx: -thickness / 2, my: 0 },
    { left: `calc(50% - ${gap + len}px)`, top: '50%', width: len, height: thickness, mx: 0, my: -thickness / 2 },
    { left: `calc(50% + ${gap}px)`, top: '50%', width: len, height: thickness, mx: 0, my: -thickness / 2 },
  ];

  const marker = Math.max(hitMarker, killMarker);

  return (
    <div className="crosshair" style={{ opacity }}>
      {lines.map((l, i) => (
        <div
          key={i}
          className="crosshair__line"
          style={{
            left: l.left,
            top: l.top,
            width: l.width,
            height: l.height,
            marginLeft: l.mx,
            marginTop: l.my,
          }}
        />
      ))}
      {aiming && <div className="crosshair__dot" />}
      {marker > 0.02 && (
        <div
          className={killMarker > 0.02 ? 'hitmarker hitmarker--kill' : 'hitmarker'}
          style={{ opacity: clamp(marker, 0, 1) }}
        >
          <span style={{ left: 0, top: '50%', width: 8, height: 1.8, marginTop: -0.9 }} />
          <span style={{ right: 0, top: '50%', width: 8, height: 1.8, marginTop: -0.9 }} />
          <span style={{ left: '50%', top: 0, width: 1.8, height: 8, marginLeft: -0.9 }} />
          <span style={{ left: '50%', bottom: 0, width: 1.8, height: 8, marginLeft: -0.9 }} />
        </div>
      )}
    </div>
  );
});

function Bar({
  label,
  value,
  max,
  variant,
  flag,
  display,
}: {
  label: string;
  value: number;
  max: number;
  variant: 'health' | 'stamina';
  flag: boolean;
  display: string;
}) {
  const pct = clamp(value / max, 0, 1);
  const flagClass = variant === 'health' ? 'is-low' : 'is-exhausted';
  return (
    <div className="vital-block">
      <div className="vital-row">
        <span className="vital-row__label">{label}</span>
        <span className="vital-row__value">{display}</span>
      </div>
      <div className={`bar bar--${variant}${flag ? ` ${flagClass}` : ''}`}>
        <div className="bar__fill" style={{ transform: `scaleX(${pct})` }} />
      </div>
    </div>
  );
}

interface HudProps {
  snap: HudSnapshot;
  spreadPx: number;
  reloadProgress: number;
}

export const Hud = memo(function Hud({ snap, spreadPx, reloadProgress }: HudProps) {
  const magClass =
    snap.magazine === 0 ? 'is-empty' : snap.magazine <= snap.magazineSize * 0.25 ? 'is-low' : '';
  const minutes = Math.floor(snap.survivedSeconds / 60);
  const seconds = Math.floor(snap.survivedSeconds % 60);

  return (
    <div className="overlay">
      {snap.lowHealth && snap.health > 0 && <div className="lowhealth-vignette" />}
      <div
        className="damage-vignette"
        style={{ opacity: clamp(snap.damageFlash, 0, 1) * 0.92 }}
      />

      <div className="hud">
        <div className="hud__stats">
          <span>
            Kills<b>{snap.kills}</b>
          </span>
          <span>
            Survived
            <b>
              {minutes}:{String(seconds).padStart(2, '0')}
            </b>
          </span>
        </div>

        <div className="hud__state-tags">
          {snap.exhausted && <div className="tag tag--warn">Exhausted</div>}
          {snap.sprinting && !snap.exhausted && <div className="tag">Sprinting</div>}
          {snap.crouching && <div className="tag">Crouched</div>}
          {snap.aiming && <div className="tag">Aiming</div>}
        </div>

        <div className="hud__vitals">
          <Bar
            label="Health"
            value={snap.health}
            max={snap.maxHealth}
            variant="health"
            flag={snap.lowHealth}
            display={String(Math.ceil(snap.health))}
          />
          <Bar
            label="Stamina"
            value={snap.stamina}
            max={snap.maxStamina}
            variant="stamina"
            flag={snap.exhausted}
            display={`${Math.round(snap.stamina)}%`}
          />
        </div>

        <div className="hud__weapon">
          <div className="hud__weapon-name">{snap.weaponName}</div>
          <div className="hud__ammo">
            <span className={`hud__ammo-mag ${magClass}`}>{snap.magazine}</span>
            <span className="hud__ammo-reserve">/ {snap.reserve}</span>
          </div>
          {snap.reloading ? (
            <>
              <div className="hud__reload">Reloading</div>
              <div className="hud__reload-bar">
                <span style={{ transform: `scaleX(${clamp(reloadProgress, 0, 1)})` }} />
              </div>
            </>
          ) : (
            snap.magazine === 0 && <div className="hud__reload">Press R to reload</div>
          )}
          <div className="hud__slots">
            <div className={`slot${snap.weaponId === 'pistol' ? ' is-active' : ''}`}>
              <span className="slot__key">1</span> Pistol
            </div>
            <div className={`slot${snap.weaponId === 'rifle' ? ' is-active' : ''}`}>
              <span className="slot__key">2</span> Rifle
            </div>
          </div>
        </div>
      </div>

      <Crosshair
        spreadPx={spreadPx}
        aiming={snap.aiming}
        hitMarker={snap.hitMarker}
        killMarker={snap.killMarker}
        visible
      />

      <DamageDirections dirs={snap.damageDirs} />
    </div>
  );
});
