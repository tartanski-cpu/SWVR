/**
 * Queries against the static archipelago used by the simulation: solid blocks (quays,
 * piers), fuel berths, ports. Terrain height lives in terrain.ts.
 */
import { BLOCKS, PORTS, type BlockDef, type PortDef } from './archipelago';

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

const PREPARED: PreparedBlock[] = BLOCKS.map((def) => {
  const a = (def.yawDeg * Math.PI) / 180;
  return { def, ax: Math.sin(a), az: -Math.cos(a), reach: Math.hypot(def.halfLength, def.halfWidth) };
});

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
  for (const b of PREPARED) {
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
  return found;
}

/** The port whose fuel berth contains (x, z), if any. */
export function fuelBerthAt(x: number, z: number): PortDef | null {
  for (const p of PORTS) {
    if (p.fuel && Math.hypot(x - p.fuel.x, z - p.fuel.z) < p.fuel.radius) return p;
  }
  return null;
}
