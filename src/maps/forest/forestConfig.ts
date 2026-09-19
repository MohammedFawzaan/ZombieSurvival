import type { MapConfig } from '../mapTypes';

export const FOREST_MAP: MapConfig = {
  id: 'forest',
  name: 'Blackpine Forest',
  description: 'The original bounded forest. Free-form survival against a roaming population.',
  roundBased: false,
  playerSpawn: { x: 0, y: 0, z: 0, yaw: 0 },
  zones: [{ id: 'forest', name: 'Blackpine Forest', unlockedAtStart: true }],
  spawnZones: [],
  barriers: [],
  wallWeapons: [],
  perkMachines: [],
  powerSwitch: null,
  rewardMachines: [],
};
