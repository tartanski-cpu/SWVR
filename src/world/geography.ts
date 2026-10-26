/**
 * Queries against the static archipelago used by the simulation: solid blocks (quays,
 * piers), fuel berths, ports. Terrain height lives in terrain.ts.
 */
import { BLOCKS, PORTS, type BlockDef, type PortDef } from './archipelago';
import { GridIndex } from './gridIndex';
import { groundHeight } from './terrain';

/** Blocks are solid from this depth (m) up to their deck: piles and walls go to the seabed. */
const BLOCK_BOTTOM = -45;

interface PreparedBlock {
  def: BlockDef;
  /** Unit vector along the long axis (world xz) and across it. */
  ax: number;
  az: number;
  /** Bounding radius in xz (m) for a cheap reject. */
  reach: number;
}

function prepare(def: BlockDef): PreparedBlock {
  const a = (def.yawDeg * Math.PI) / 180;
  return { def, ax: Math.sin(a), az: -Math.cos(a), reach: Math.hypot(def.halfLength, def.halfWidth) };
}
const PREPARED: PreparedBlock[] = BLOCKS.map(prepare);
/** The blocks by where they are, for the point queries below (a coast map has hundreds). */
const NEAR = new GridIndex(PREPARED, (b) => [b.def.x - b.reach, b.def.z - b.reach, b.def.x + b.reach, b.def.z + b.reach]);

/**
 * Blocks that come and go as the game runs, beside the map's (a construction project's
 * foundations, the jack-up's legs, the buoys laid: career/projects.ts projectBlocks). A
 * handful, checked one by one. Solid like the others (blockContact, blockTop), but no berths
 * and nothing to climb out onto (nearestBlockEdge).
 */
let EXTRA: PreparedBlock[] = [];
/** The blocks the game has added now (replacing the last set). */
export function setExtraBlocks(defs: readonly BlockDef[]): void {
  EXTRA = defs.map(prepare);
}
/**
 * The map's blocks near (x, z), then the game's added ones: the two lists in turn, kept in
 * one reused pair (these queries run for every hull point every tick: nothing allocated).
 */
const LISTS: (readonly PreparedBlock[])[] = [[], []];
function near(x: number, z: number): (readonly PreparedBlock[])[] {
  LISTS[0] = NEAR.at(x, z);
  LISTS[1] = EXTRA;
  return LISTS;
}

export interface BlockHit {
  /** Penetration depth (m) and outward unit normal (world) of the nearest face. */
  depth: number;
  nx: number;
  ny: number;
  nz: number;
  fendered: boolean;
}

/**
 * If world point (x, y, z) is inside a quay or pier, the shallowest way out of it.
 * Returns false if the point is clear of all blocks.
 */
export function blockContact(x: number, y: number, z: number, out: BlockHit): boolean {
  let found = false;
  out.depth = Infinity;
  const lists = near(x, z);
  for (let li = 0; li < 2; li++) {
    for (let bi = 0; bi < lists[li].length; bi++) {
      const b = lists[li][bi];
      const d = b.def;
      const dx = x - d.x;
      const dz = z - d.z;
      if (dx * dx + dz * dz > b.reach * b.reach || y > d.top || y < BLOCK_BOTTOM) continue;
      const l = dx * b.ax + dz * b.az; // along
      const w = -dx * b.az + dz * b.ax; // across (+ = to the right of the axis)
      const pl = d.halfLength - Math.abs(l);
      const pw = d.halfWidth - Math.abs(w);
      if (pl <= 0 || pw <= 0) continue;
      const pt = d.top - y;
      found = true;
      if (pt < pw && pt < pl) {
        if (pt < out.depth) Object.assign(out, { depth: pt, nx: 0, ny: 1, nz: 0, fendered: false });
      } else if (pw < pl) {
        const s = Math.sign(w) || 1;
        if (pw < out.depth) Object.assign(out, { depth: pw, nx: -b.az * s, ny: 0, nz: b.ax * s, fendered: d.fendered });
      } else {
        const s = Math.sign(l) || 1;
        if (pl < out.depth) Object.assign(out, { depth: pl, nx: b.ax * s, ny: 0, nz: b.az * s, fendered: d.fendered });
      }
    }
  }
  return found;
}

/** Is any quay or pier within `r` m (in plan) of world (x, z)? A cheap check before probing many points against them. */
export function blockNear(x: number, z: number, r: number): boolean {
  for (const b of PREPARED) {
    const dx = x - b.def.x;
    const dz = z - b.def.z;
    const reach = b.reach + r;
    if (dx * dx + dz * dz <= reach * reach) return true;
  }
  for (const b of EXTRA) {
    const dx = x - b.def.x;
    const dz = z - b.def.z;
    const reach = b.reach + r;
    if (dx * dx + dz * dz <= reach * reach) return true;
  }
  return false;
}

/** What the bottom is at (x, z): the anchorage's bottom when inside one, else sand (PortDef.bottom). */
export function bottomAt(x: number, z: number): NonNullable<PortDef['bottom']> {
  for (const p of PORTS) {
    const a = p.cargo.anchorage;
    if (a && Math.hypot(x - a.x, z - a.z) < a.radius * 1.3) return p.bottom ?? 'sand';
  }
  return 'sand';
}

/** The port whose fuel berth contains (x, z), if any. */
export function fuelBerthAt(x: number, z: number): PortDef | null {
  for (const p of PORTS) {
    if (p.fuel && Math.hypot(x - p.fuel.x, z - p.fuel.z) < p.fuel.radius) return p;
  }
  return null;
}

/**
 * Height you'd stand at: the deck of a quay or pier covering (x, z), else the ground.
 * (Used to set buildings, pumps and cargo stacks down.)
 */
export function standingHeight(x: number, z: number): number {
  return blockTop(x, z) ?? groundHeight(x, z);
}

/**
 * Deck height of the quay or pier covering (x, z), or null if none does. Where two overlap,
 * the higher: a coast map's harbours can have a low pier drawn inside a high one's outline
 * (Rothesay's start spot, owner: "I seem to be on a concrete pier underneath the big wooden
 * one"), and you stand on the top deck, not inside it.
 */
export function blockTop(x: number, z: number): number | null {
  let top: number | null = null;
  const lists = near(x, z);
  for (let li = 0; li < 2; li++) {
    for (let bi = 0; bi < lists[li].length; bi++) {
      const b = lists[li][bi];
      const dx = x - b.def.x;
      const dz = z - b.def.z;
      const l = dx * b.ax + dz * b.az;
      const w = -dx * b.az + dz * b.ax;
      if (Math.abs(l) <= b.def.halfLength && Math.abs(w) <= b.def.halfWidth && (top === null || b.def.top > top)) top = b.def.top;
    }
  }
  return top;
}

/**
 * The nearest quay or pier face within `range` of (x, z) in plan: its deck height and a
 * point just inside the edge to stand on (for climbing out of the water). Null if none.
 */
export function nearestBlockEdge(x: number, z: number, range: number): { top: number; x: number; z: number } | null {
  let best: { top: number; x: number; z: number } | null = null;
  let bestD = range;
  for (const b of PREPARED) {
    const d = b.def;
    const dx = x - d.x;
    const dz = z - d.z;
    const l = dx * b.ax + dz * b.az;
    const w = -dx * b.az + dz * b.ax;
    // Distance from the point to the rectangle (0 inside).
    const ol = Math.max(0, Math.abs(l) - d.halfLength);
    const ow = Math.max(0, Math.abs(w) - d.halfWidth);
    const dist = Math.hypot(ol, ow);
    if (dist >= bestD) continue;
    // Stand 0.6 m in from the edge nearest the point.
    const cl = Math.max(-d.halfLength + 0.6, Math.min(d.halfLength - 0.6, l));
    const cw = Math.max(-d.halfWidth + 0.6, Math.min(d.halfWidth - 0.6, w));
    bestD = dist;
    best = { top: d.top, x: d.x + cl * b.ax - cw * b.az, z: d.z + cl * b.az + cw * b.ax };
  }
  return best;
}
