/**
 * Every berth you can dock at: the named ones (fuel and cargo berths, archipelago.ts) and,
 * owner feedback, one at each pair of bollards along every quay and pier face that has
 * deep water in front of it. The faces and their probe are the same ones the world view
 * uses to place fenders and bollards (worldView.buildBlock), so wherever there are bollards
 * on the water, DOCK works. Built once, on first use.
 */
import { BERTHS, BLOCKS, PORTS, type BerthDef, type BlockDef } from './archipelago';
import { groundHeight } from './terrain';

let all: BerthDef[] | null = null;

/** A block's local (x across, z along) point to world, as the world view places it. */
function toWorld(b: BlockDef, lx: number, lz: number): { x: number; z: number } {
  const yaw = (b.yawDeg * Math.PI) / 180;
  return { x: b.x + lx * Math.cos(yaw) - lz * Math.sin(yaw), z: b.z + lx * Math.sin(yaw) + lz * Math.cos(yaw) };
}

function nearestPort(x: number, z: number): (typeof PORTS)[number] {
  return [...PORTS].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
}

function generate(): BerthDef[] {
  const out: BerthDef[] = [...BERTHS];
  const off = 2.5; // boat centreline to the face: half beam plus fenders
  let n = 0;
  for (const b of BLOCKS) {
    const faces = [
      { nx: 1, nz: 0, half: b.halfLength, offset: b.halfWidth, alongX: false },
      { nx: -1, nz: 0, half: b.halfLength, offset: b.halfWidth, alongX: false },
      { nx: 0, nz: 1, half: b.halfWidth, offset: b.halfLength, alongX: true },
      { nx: 0, nz: -1, half: b.halfWidth, offset: b.halfLength, alongX: true },
    ];
    for (const f of faces) {
      const probe = toWorld(b, f.nx * (f.offset + 2), f.nz * (f.offset + 2));
      if (groundHeight(probe.x, probe.z) > -1) continue; // no water here: no bollards either
      // The face's normal and its along-face axis, in world axes.
      const o = toWorld(b, 0, 0);
      const nW = toWorld(b, f.nx, f.nz);
      const nx = nW.x - o.x;
      const nz = nW.z - o.z;
      const aW = toWorld(b, f.alongX ? 1 : 0, f.alongX ? 0 : 1);
      const ax = aW.x - o.x;
      const az = aW.z - o.z;
      const heading = ((Math.atan2(ax, -az) * 180) / Math.PI + 360) % 360;
      // A berth between each pair of bollards (they stand every 12 m from 3 m in).
      for (let s = -f.half + 9; s <= f.half - 6; s += 12) {
        const lx = f.alongX ? s : f.nx * (f.offset + off);
        const lz = f.alongX ? f.nz * (f.offset + off) : s;
        const p = toWorld(b, lx, lz);
        if (groundHeight(p.x, p.z) > -2.2) continue; // too shallow alongside
        if (out.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 9)) continue; // a named berth here already
        const port = nearestPort(p.x, p.z);
        out.push({
          id: `${port.id}-${b.kind}-${++n}`,
          portId: port.id,
          name: `${port.name} (${b.kind} berth)`,
          x: p.x,
          z: p.z,
          headingDeg: heading,
          shoreX: -nx,
          shoreZ: -nz,
          shoreDist: off,
          deckY: b.top,
        });
      }
    }
  }
  return out;
}

/** All dockable berths: named, and one per bollard pair on every seaward face. */
export function allBerths(): BerthDef[] {
  return (all ??= generate());
}
