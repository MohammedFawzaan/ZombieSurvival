import type { ZoneId } from '../mapTypes';

export type BuildingKind =
  | 'house'
  | 'apartment'
  | 'storefront'
  | 'garage'
  | 'warehouse'
  | 'substation'
  | 'kiosk';

export interface BuildingDef {
  id: string;
  kind: BuildingKind;
  zone: ZoneId;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  yaw: number;
  enterable: boolean;
  doorways: DoorwayDef[];
  palette: number;
}

export interface DoorwayDef {
  side: 'north' | 'south' | 'east' | 'west';
  offset: number;
  width: number;
  height: number;
}

export interface RoadSegmentDef {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  width: number;
  kind: 'road' | 'alley';
}

export interface PavementDef {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
}

export type PropKind =
  | 'car'
  | 'lamp'
  | 'pole'
  | 'fence'
  | 'dumpster'
  | 'barricade'
  | 'rubble'
  | 'bench'
  | 'hydrant';

export interface PropPlacementDef {
  kind: PropKind;
  zone: ZoneId;
  x: number;
  z: number;
  yaw: number;
  length: number;
}

export const CITY_SIZE = 300;
export const CITY_HALF = CITY_SIZE / 2;

export const ROAD_WIDTH = 11;
export const ALLEY_WIDTH = 5;
export const PAVEMENT_HEIGHT = 0.14;

export const ZONE_START: ZoneId = 'start_street';
export const ZONE_EAST_ROW: ZoneId = 'east_row';
export const ZONE_WEST_ROW: ZoneId = 'west_row';
export const ZONE_MARKET: ZoneId = 'market_square';
export const ZONE_APARTMENTS: ZoneId = 'apartment_block';
export const ZONE_DEPOT: ZoneId = 'depot_yard';
export const ZONE_SUBSTATION: ZoneId = 'substation';

export const CITY_ZONE_IDS: ZoneId[] = [
  ZONE_START,
  ZONE_EAST_ROW,
  ZONE_WEST_ROW,
  ZONE_MARKET,
  ZONE_APARTMENTS,
  ZONE_DEPOT,
  ZONE_SUBSTATION,
];

export const CITY_ROADS: RoadSegmentDef[] = [
  { id: 'main_south', x1: -110, z1: 96, x2: 110, z2: 96, width: ROAD_WIDTH, kind: 'road' },
  { id: 'main_mid', x1: -110, z1: 10, x2: 110, z2: 10, width: ROAD_WIDTH, kind: 'road' },
  { id: 'main_north', x1: -110, z1: -78, x2: 110, z2: -78, width: ROAD_WIDTH, kind: 'road' },
  { id: 'cross_west', x1: -86, z1: 110, x2: -86, z2: -110, width: ROAD_WIDTH, kind: 'road' },
  { id: 'cross_centre', x1: 0, z1: 110, x2: 0, z2: -110, width: ROAD_WIDTH, kind: 'road' },
  { id: 'cross_east', x1: 86, z1: 110, x2: 86, z2: -110, width: ROAD_WIDTH, kind: 'road' },
  { id: 'alley_sw', x1: -86, z1: 53, x2: 0, z2: 53, width: ALLEY_WIDTH, kind: 'alley' },
  { id: 'alley_se', x1: 0, z1: 53, x2: 86, z2: 53, width: ALLEY_WIDTH, kind: 'alley' },
  { id: 'alley_nw', x1: -86, z1: -34, x2: 0, z2: -34, width: ALLEY_WIDTH, kind: 'alley' },
  { id: 'alley_ne', x1: 0, z1: -34, x2: 86, z2: -34, width: ALLEY_WIDTH, kind: 'alley' },
  { id: 'alley_depot', x1: -43, z1: -78, x2: -43, z2: -110, width: ALLEY_WIDTH, kind: 'alley' },
  { id: 'alley_sub', x1: 43, z1: -78, x2: 43, z2: -110, width: ALLEY_WIDTH, kind: 'alley' },
];

function house(
  id: string,
  zone: ZoneId,
  x: number,
  z: number,
  yaw: number,
  palette: number,
): BuildingDef {
  return {
    id,
    kind: 'house',
    zone,
    x,
    z,
    width: 14,
    depth: 11,
    height: 6.2,
    yaw,
    enterable: false,
    doorways: [],
    palette,
  };
}

function storefront(
  id: string,
  zone: ZoneId,
  x: number,
  z: number,
  yaw: number,
  palette: number,
): BuildingDef {
  return {
    id,
    kind: 'storefront',
    zone,
    x,
    z,
    width: 16,
    depth: 12,
    height: 7.4,
    yaw,
    enterable: false,
    doorways: [],
    palette,
  };
}

function garage(
  id: string,
  zone: ZoneId,
  x: number,
  z: number,
  yaw: number,
  palette: number,
): BuildingDef {
  return {
    id,
    kind: 'garage',
    zone,
    x,
    z,
    width: 10,
    depth: 8,
    height: 4.4,
    yaw,
    enterable: false,
    doorways: [],
    palette,
  };
}

function apartment(
  id: string,
  zone: ZoneId,
  x: number,
  z: number,
  yaw: number,
  palette: number,
): BuildingDef {
  return {
    id,
    kind: 'apartment',
    zone,
    x,
    z,
    width: 22,
    depth: 16,
    height: 15.5,
    yaw,
    enterable: false,
    doorways: [],
    palette,
  };
}

export const CITY_BUILDINGS: BuildingDef[] = [
  house('h_s1', ZONE_START, -62, 72, 0, 0),
  house('h_s2', ZONE_START, -40, 72, 0, 1),
  house('h_s3', ZONE_START, -18, 72, 0, 2),
  house('h_s4', ZONE_START, 18, 72, 0, 1),
  house('h_s5', ZONE_START, 40, 72, 0, 0),
  house('h_s6', ZONE_START, 62, 72, 0, 2),
  garage('g_s1', ZONE_START, -40, 36, 0, 1),
  garage('g_s2', ZONE_START, 40, 36, 0, 2),
  house('h_s7', ZONE_START, -18, 34, Math.PI, 0),
  house('h_s8', ZONE_START, 18, 34, Math.PI, 1),

  house('h_w1', ZONE_WEST_ROW, -62, 34, Math.PI, 2),
  storefront('sf_w1', ZONE_WEST_ROW, -62, -12, 0, 1),
  house('h_w2', ZONE_WEST_ROW, -40, -12, 0, 0),
  house('h_w3', ZONE_WEST_ROW, -62, -56, Math.PI, 1),
  garage('g_w1', ZONE_WEST_ROW, -40, -56, Math.PI, 2),

  house('h_e1', ZONE_EAST_ROW, 62, 34, Math.PI, 0),
  storefront('sf_e1', ZONE_EAST_ROW, 62, -12, 0, 2),
  house('h_e2', ZONE_EAST_ROW, 40, -12, 0, 1),
  house('h_e3', ZONE_EAST_ROW, 62, -56, Math.PI, 0),
  garage('g_e1', ZONE_EAST_ROW, 40, -56, Math.PI, 1),

  storefront('sf_m1', ZONE_MARKET, -20, -12, 0, 1),
  storefront('sf_m2', ZONE_MARKET, 20, -12, 0, 0),
  {
    id: 'kiosk_m1',
    kind: 'kiosk',
    zone: ZONE_MARKET,
    x: 0,
    z: -56,
    width: 7,
    depth: 6,
    height: 3.6,
    yaw: 0,
    enterable: false,
    doorways: [],
    palette: 2,
  },

  apartment('ap_1', ZONE_APARTMENTS, -24, -56, Math.PI, 0),
  apartment('ap_2', ZONE_APARTMENTS, 24, -56, Math.PI, 1),

  {
    id: 'wh_depot',
    kind: 'warehouse',
    zone: ZONE_DEPOT,
    x: -62,
    z: -98,
    width: 34,
    depth: 24,
    height: 10.5,
    yaw: 0,
    enterable: true,
    doorways: [{ side: 'north', offset: 0, width: 6, height: 5 }],
    palette: 1,
  },
  garage('g_d1', ZONE_DEPOT, -20, -98, 0, 2),

  {
    id: 'sub_station',
    kind: 'substation',
    zone: ZONE_SUBSTATION,
    x: 62,
    z: -98,
    width: 26,
    depth: 20,
    height: 8.5,
    yaw: 0,
    enterable: true,
    doorways: [{ side: 'north', offset: 0, width: 5, height: 4.6 }],
    palette: 0,
  },
  garage('g_sub1', ZONE_SUBSTATION, 20, -98, 0, 1),
];

export const CITY_PAVEMENTS: PavementDef[] = [
  { id: 'pv_s_n', x: 0, z: 88, width: 220, depth: 4 },
  { id: 'pv_s_s', x: 0, z: 104, width: 220, depth: 4 },
  { id: 'pv_m_n', x: 0, z: 2, width: 220, depth: 4 },
  { id: 'pv_m_s', x: 0, z: 18, width: 220, depth: 4 },
  { id: 'pv_n_n', x: 0, z: -86, width: 220, depth: 4 },
  { id: 'pv_n_s', x: 0, z: -70, width: 220, depth: 4 },
  { id: 'pv_cw_w', x: -94, z: 0, width: 4, depth: 220 },
  { id: 'pv_cw_e', x: -78, z: 0, width: 4, depth: 220 },
  { id: 'pv_cc_w', x: -8, z: 0, width: 4, depth: 220 },
  { id: 'pv_cc_e', x: 8, z: 0, width: 4, depth: 220 },
  { id: 'pv_ce_w', x: 78, z: 0, width: 4, depth: 220 },
  { id: 'pv_ce_e', x: 94, z: 0, width: 4, depth: 220 },
];

function lampRow(zone: ZoneId, xs: number[], z: number, yaw: number): PropPlacementDef[] {
  return xs.map((x) => ({ kind: 'lamp' as PropKind, zone, x, z, yaw, length: 0 }));
}

export const CITY_PROPS: PropPlacementDef[] = [
  ...lampRow(ZONE_START, [-70, -30, 30, 70], 88, 0),
  ...lampRow(ZONE_START, [-50, 0, 50], 104, Math.PI),
  ...lampRow(ZONE_MARKET, [-60, -20, 20, 60], 2, 0),
  ...lampRow(ZONE_MARKET, [-40, 40], 18, Math.PI),
  ...lampRow(ZONE_DEPOT, [-78, -30], -84, 0),
  ...lampRow(ZONE_SUBSTATION, [30, 78], -84, 0),

  { kind: 'car', zone: ZONE_START, x: -52, z: 92, yaw: 0.1, length: 0 },
  { kind: 'car', zone: ZONE_START, x: 12, z: 100, yaw: Math.PI + 0.2, length: 0 },
  { kind: 'car', zone: ZONE_START, x: 56, z: 92, yaw: -0.08, length: 0 },
  { kind: 'car', zone: ZONE_WEST_ROW, x: -82, z: 40, yaw: 1.6, length: 0 },
  { kind: 'car', zone: ZONE_WEST_ROW, x: -90, z: -40, yaw: 1.5, length: 0 },
  { kind: 'car', zone: ZONE_EAST_ROW, x: 90, z: 44, yaw: -1.6, length: 0 },
  { kind: 'car', zone: ZONE_EAST_ROW, x: 82, z: -38, yaw: 1.55, length: 0 },
  { kind: 'car', zone: ZONE_MARKET, x: -30, z: 6, yaw: 0.05, length: 0 },
  { kind: 'car', zone: ZONE_MARKET, x: 34, z: 14, yaw: Math.PI, length: 0 },
  { kind: 'car', zone: ZONE_APARTMENTS, x: -8, z: -40, yaw: 0.9, length: 0 },
  { kind: 'car', zone: ZONE_DEPOT, x: -30, z: -82, yaw: 0.2, length: 0 },
  { kind: 'car', zone: ZONE_SUBSTATION, x: 34, z: -74, yaw: Math.PI - 0.1, length: 0 },

  { kind: 'dumpster', zone: ZONE_START, x: -29, z: 53, yaw: 0, length: 0 },
  { kind: 'dumpster', zone: ZONE_START, x: 29, z: 53, yaw: Math.PI, length: 0 },
  { kind: 'dumpster', zone: ZONE_WEST_ROW, x: -52, z: -34, yaw: 0, length: 0 },
  { kind: 'dumpster', zone: ZONE_EAST_ROW, x: 52, z: -34, yaw: Math.PI, length: 0 },
  { kind: 'dumpster', zone: ZONE_APARTMENTS, x: 0, z: -38, yaw: 0.4, length: 0 },
  { kind: 'dumpster', zone: ZONE_DEPOT, x: -43, z: -92, yaw: 1.57, length: 0 },

  { kind: 'rubble', zone: ZONE_MARKET, x: -12, z: -30, yaw: 0.3, length: 0 },
  { kind: 'rubble', zone: ZONE_MARKET, x: 14, z: -28, yaw: 1.1, length: 0 },
  { kind: 'rubble', zone: ZONE_APARTMENTS, x: -24, z: -38, yaw: 2.2, length: 0 },
  { kind: 'rubble', zone: ZONE_DEPOT, x: -56, z: -80, yaw: 0.7, length: 0 },
  { kind: 'rubble', zone: ZONE_SUBSTATION, x: 56, z: -80, yaw: 1.9, length: 0 },
  { kind: 'rubble', zone: ZONE_WEST_ROW, x: -70, z: 10, yaw: 0.5, length: 0 },

  { kind: 'hydrant', zone: ZONE_START, x: -8, z: 88, yaw: 0, length: 0 },
  { kind: 'hydrant', zone: ZONE_MARKET, x: 8, z: 2, yaw: 0, length: 0 },
  { kind: 'hydrant', zone: ZONE_DEPOT, x: -80, z: -72, yaw: 0, length: 0 },

  { kind: 'bench', zone: ZONE_START, x: -22, z: 104, yaw: 0, length: 0 },
  { kind: 'bench', zone: ZONE_MARKET, x: 26, z: 2, yaw: Math.PI, length: 0 },

  { kind: 'pole', zone: ZONE_WEST_ROW, x: -78, z: 20, yaw: 0, length: 0 },
  { kind: 'pole', zone: ZONE_WEST_ROW, x: -78, z: -30, yaw: 0, length: 0 },
  { kind: 'pole', zone: ZONE_EAST_ROW, x: 78, z: 20, yaw: 0, length: 0 },
  { kind: 'pole', zone: ZONE_EAST_ROW, x: 78, z: -30, yaw: 0, length: 0 },
  { kind: 'pole', zone: ZONE_SUBSTATION, x: 78, z: -86, yaw: 0, length: 0 },

  { kind: 'fence', zone: ZONE_START, x: -51, z: 60, yaw: 0, length: 18 },
  { kind: 'fence', zone: ZONE_START, x: 51, z: 60, yaw: 0, length: 18 },
  { kind: 'fence', zone: ZONE_WEST_ROW, x: -51, z: -30, yaw: 0, length: 16 },
  { kind: 'fence', zone: ZONE_EAST_ROW, x: 51, z: -30, yaw: 0, length: 16 },
  { kind: 'fence', zone: ZONE_DEPOT, x: -62, z: -82, yaw: 0, length: 22 },
  { kind: 'fence', zone: ZONE_SUBSTATION, x: 62, z: -82, yaw: 0, length: 20 },

  { kind: 'barricade', zone: ZONE_START, x: -11, z: 96, yaw: 0.2, length: 0 },
  { kind: 'barricade', zone: ZONE_MARKET, x: 11, z: 10, yaw: -0.2, length: 0 },
];

export interface BuildingFootprint {
  id: string;
  cx: number;
  cz: number;
  hx: number;
  hz: number;
  yaw: number;
}

export function buildingFootprints(): BuildingFootprint[] {
  return CITY_BUILDINGS.map((b) => ({
    id: b.id,
    cx: b.x,
    cz: b.z,
    hx: b.width * 0.5,
    hz: b.depth * 0.5,
    yaw: b.yaw,
  }));
}

export function pointInFootprint(
  x: number,
  z: number,
  f: BuildingFootprint,
  margin = 0,
): boolean {
  const dx = x - f.cx;
  const dz = z - f.cz;
  const c = Math.cos(-f.yaw);
  const s = Math.sin(-f.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= f.hx + margin && Math.abs(lz) <= f.hz + margin;
}

export function anyFootprintContains(x: number, z: number, margin = 0): string | null {
  for (const f of buildingFootprints()) {
    if (pointInFootprint(x, z, f, margin)) return f.id;
  }
  return null;
}
