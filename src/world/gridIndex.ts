/**
 * A spatial index for small things over a big map: square cells (`cell` m), each listing
 * the items whose box overlaps it, in the items' own order. A point query then tests only
 * its cell's few items instead of every one in the world: a real-coast map has hundreds of
 * piers and dozens of sheltered harbours, and the physics asks about them for every hull
 * point and wave, every tick (the Clyde ran its simulation at half speed without this).
 */
export class GridIndex<T> {
  private readonly cells = new Map<number, T[]>();

  /** `box`: each item's reach in plan (world x0, z0, x1, z1). */
  constructor(
    items: readonly T[],
    box: (t: T) => [number, number, number, number],
    private readonly cell = 250,
  ) {
    for (const t of items) {
      const [x0, z0, x1, z1] = box(t);
      for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++)
        for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
          const k = key(i, j);
          const list = this.cells.get(k);
          if (list) list.push(t);
          else this.cells.set(k, [t]);
        }
    }
  }

  /** The items whose box may cover world (x, z). */
  at(x: number, z: number): readonly T[] {
    return this.cells.get(key(Math.floor(x / this.cell), Math.floor(z / this.cell))) ?? NONE;
  }
}

const NONE: readonly never[] = [];
// Cells as one number: i and j each within ±2^20 cells (±260 000 km at 250 m: any world).
const key = (i: number, j: number) => (i + 1048576) * 2097152 + (j + 1048576);
