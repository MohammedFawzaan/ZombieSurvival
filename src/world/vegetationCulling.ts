import * as THREE from 'three';
import type { VegetationPlacement } from './vegetation';

export interface CullLayer {
  mesh: THREE.InstancedMesh;
  placements: VegetationPlacement[];
  radius: number;
  buildMatrix: (p: VegetationPlacement, out: THREE.Matrix4) => void;
}

interface LayerState extends CullLayer {
  cellIndex: Map<number, number[]>;
  lastCount: number;
}

const CELL = 24;

/**
 * Extra distance beyond a layer's cull radius that is kept resident. The
 * camera can travel this far before anything genuinely new must appear, so
 * rebuilds are infrequent and never pop something into view.
 */
const REBUILD_MARGIN = 18;

function cellKey(cx: number, cz: number): number {
  return ((cx + 2048) << 12) | (cz + 2048);
}

export class VegetationCuller {
  private readonly layers: LayerState[] = [];
  private readonly matrix = new THREE.Matrix4();
  private lastX = Infinity;
  private lastZ = Infinity;
  private rebuildAccum = 0;

  add(layer: CullLayer): void {
    const cellIndex = new Map<number, number[]>();
    layer.placements.forEach((p, i) => {
      const key = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
      let list = cellIndex.get(key);
      if (!list) {
        list = [];
        cellIndex.set(key, list);
      }
      list.push(i);
    });
    this.layers.push({ ...layer, cellIndex, lastCount: -1 });
  }

  update(cameraX: number, cameraZ: number, dt: number, force = false): void {
    this.rebuildAccum += dt;
    const moved = Math.hypot(cameraX - this.lastX, cameraZ - this.lastZ);

    // Each layer keeps a margin of extra instances beyond its cull radius, so
    // it stays correct until the camera has travelled that margin. Rebuilding
    // only then makes rebuilds rare, and nothing pops in the meantime because
    // everything newly in range was already included.
    const due = force || moved >= REBUILD_MARGIN * 0.75;
    if (!due) return;

    this.rebuildAccum = 0;
    this.lastX = cameraX;
    this.lastZ = cameraZ;

    // Every layer is rebuilt against the SAME, CURRENT camera position. The
    // previous version spread layers across frames from a stale snapshot,
    // which left trees, rocks and bushes positioned for different camera
    // positions on the same frame -- visible as the whole scene flickering.
    for (const layer of this.layers) {
      this.rebuildLayer(layer, cameraX, cameraZ);
    }
  }

  private rebuildLayer(layer: LayerState, cameraX: number, cameraZ: number): void {
    const range = layer.radius + REBUILD_MARGIN;
    const cellRange = Math.ceil(range / CELL);
    const ccx = Math.floor(cameraX / CELL);
    const ccz = Math.floor(cameraZ / CELL);
    const rangeSq = range * range;
    let count = 0;
    const capacity = layer.mesh.instanceMatrix.count;

    for (let dz = -cellRange; dz <= cellRange && count < capacity; dz++) {
      for (let dx = -cellRange; dx <= cellRange && count < capacity; dx++) {
        const list = layer.cellIndex.get(cellKey(ccx + dx, ccz + dz));
        if (!list) continue;
        for (let k = 0; k < list.length && count < capacity; k++) {
          const p = layer.placements[list[k]];
          const ddx = p.x - cameraX;
          const ddz = p.z - cameraZ;
          if (ddx * ddx + ddz * ddz > rangeSq) continue;
          layer.buildMatrix(p, this.matrix);
          layer.mesh.setMatrixAt(count, this.matrix);
          count++;
        }
      }
    }

    layer.mesh.count = count;
    layer.lastCount = count;
    layer.mesh.instanceMatrix.needsUpdate = true;
  }
}
