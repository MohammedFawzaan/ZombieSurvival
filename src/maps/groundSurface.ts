import type { RoadPath, TerrainConfig } from '../world/terrain';

export interface GroundSurface {
  readonly road?: RoadPath;
  distanceToRoad?(x: number, z: number): number;
  readonly config: TerrainConfig;
  readonly heights: Float32Array;
  readonly gridSize: number;
  readonly cellSize: number;
  readonly half: number;
  heightAt(x: number, z: number): number;
  normalAt(x: number, z: number, out: { x: number; y: number; z: number }): void;
  slopeAt(x: number, z: number): number;
  isInBounds(x: number, z: number, margin?: number): boolean;
}
