export class SpatialGrid {
  private readonly cellSize: number;
  private readonly cells = new Map<number, number[]>();

  constructor(cellSize = 6) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cz: number): number {
    return ((cx + 4096) << 13) | (cz + 4096);
  }

  clear(): void {
    for (const list of this.cells.values()) list.length = 0;
  }

  insert(id: number, x: number, z: number): void {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const k = this.key(cx, cz);
    let list = this.cells.get(k);
    if (!list) {
      list = [];
      this.cells.set(k, list);
    }
    list.push(id);
  }

  forEachNear(x: number, z: number, radius: number, fn: (id: number) => void): void {
    const r = Math.max(1, Math.ceil(radius / this.cellSize));
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const list = this.cells.get(this.key(cx + dx, cz + dz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) fn(list[i]);
      }
    }
  }
}
