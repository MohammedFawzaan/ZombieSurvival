import type { AmmoType, MedicalId, WeaponId } from '../state/types';
import { WEAPONS, usesAmmo } from '../weapons/definitions';
import { MEDICAL, MEDICAL_ORDER } from '../medical/definitions';
import { CARRY, defaultLoadout, type Loadout } from './loadout';

export interface WeaponEntry {
  id: WeaponId;
  magazine: number;
  reserve: number;
}

export class Inventory {
  private readonly weaponList: WeaponEntry[] = [];
  private readonly medical = new Map<MedicalId, number>();
  private loadout: Loadout = defaultLoadout();

  constructor(loadout: Loadout = defaultLoadout()) {
    this.applyLoadout(loadout);
  }

  get weapons(): readonly WeaponEntry[] {
    return this.weaponList;
  }

  get sourceLoadout(): Loadout {
    return this.loadout;
  }

  applyLoadout(loadout: Loadout): void {
    this.loadout = {
      weapons: [...loadout.weapons],
      reserves: { ...loadout.reserves },
      medical: { ...loadout.medical },
    };

    this.weaponList.length = 0;
    for (const id of loadout.weapons) {
      const def = WEAPONS[id];
      if (!def) continue;
      const reserve = usesAmmo(def)
        ? Math.min(def.maxReserve, loadout.reserves[id] ?? def.startingReserve)
        : 0;
      this.weaponList.push({ id, magazine: def.magazineSize, reserve });
    }

    this.medical.clear();
    let medicalTotal = 0;
    for (const id of MEDICAL_ORDER) {
      const requested = loadout.medical[id] ?? 0;
      const room = Math.max(0, CARRY.maxMedicalItems - medicalTotal);
      const count = Math.max(0, Math.min(requested, MEDICAL[id].stackLimit, room));
      this.medical.set(id, count);
      medicalTotal += count;
    }
  }

  hasWeapon(id: WeaponId): boolean {
    return this.weaponList.some((w) => w.id === id);
  }

  addWeapon(id: WeaponId): boolean {
    const def = WEAPONS[id];
    if (!def) return false;
    if (this.hasWeapon(id)) return false;
    const melee = def.kind === 'melee';
    const held = this.weaponList.filter((w) => (WEAPONS[w.id].kind === 'melee') === melee).length;
    if (held >= (melee ? CARRY.maxMelee : CARRY.maxFirearms)) return false;
    const reserve = usesAmmo(def) ? Math.min(def.maxReserve, def.startingReserve) : 0;
    this.weaponList.push({ id, magazine: def.magazineSize, reserve });
    return true;
  }

  weaponEntry(id: WeaponId): WeaponEntry | null {
    return this.weaponList.find((w) => w.id === id) ?? null;
  }

  medicalCount(id: MedicalId): number {
    return this.medical.get(id) ?? 0;
  }

  get totalMedical(): number {
    let total = 0;
    for (const n of this.medical.values()) total += n;
    return total;
  }

  addMedical(id: MedicalId, count: number): number {
    const def = MEDICAL[id];
    if (!def || count <= 0) return 0;
    const current = this.medicalCount(id);
    const stackRoom = def.stackLimit - current;
    const carryRoom = CARRY.maxMedicalItems - this.totalMedical;
    const taken = Math.max(0, Math.min(count, stackRoom, carryRoom));
    if (taken > 0) this.medical.set(id, current + taken);
    return taken;
  }

  consumeMedical(id: MedicalId, count = 1): boolean {
    const current = this.medicalCount(id);
    if (current < count) return false;
    this.medical.set(id, current - count);
    return true;
  }

  addAmmo(ammo: AmmoType, rounds: number): number {
    if (ammo === 'none' || rounds <= 0) return 0;
    let remaining = rounds;
    for (const entry of this.weaponList) {
      const def = WEAPONS[entry.id];
      if (def.ammo !== ammo || !usesAmmo(def)) continue;
      const room = def.maxReserve - entry.reserve;
      const taken = Math.min(room, remaining);
      entry.reserve += taken;
      remaining -= taken;
      if (remaining <= 0) break;
    }
    return rounds - remaining;
  }

  reset(): void {
    this.applyLoadout(this.loadout);
  }
}
