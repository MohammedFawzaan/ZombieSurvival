import type { PerkId, ZoneId } from '../maps/mapTypes';
import type { InteractKind, PurchaseResult, WeaponId } from '../state/types';

export interface Interactable {
  id: string;
  kind: InteractKind;
  zone: ZoneId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  range: number;
  holdTime: number;
  cost: number;
  label: string;
  requiresPower: boolean;
  weapon?: WeaponId;
  perk?: PerkId;
  unlocksZone?: ZoneId;
  facingLimited: boolean;
}

export interface InteractionAvailability {
  result: PurchaseResult;
  cost: number;
  label: string;
}

export interface InteractionPromptState {
  target: Interactable | null;
  prompt: string | null;
  availability: PurchaseResult;
  cost: number;
  holdProgress: number;
  distance: number;
}

export interface InteractionOutcome {
  performed: boolean;
  kind: InteractKind;
  id: string;
  result: PurchaseResult;
  cost: number;
  message: string;
  weapon?: WeaponId;
  perk?: PerkId;
  unlockedZone?: ZoneId;
  rewardLabel?: string;
  grantedCount?: number;
  newWeapon?: boolean;
}

export interface InteractionInput {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pressed: boolean;
}
