/**
 * Every berth you can dock at: the named ones (fuel and cargo berths, archipelago.ts) and,
 * owner feedback, one at each pair of bollards along every quay and pier face that has
 * deep water in front of it (or, a face too short for a pair, one in its middle). The faces and their probe are the same ones the world view
 * uses to place fenders and bollards (worldView.buildBlock), so wherever there are bollards
 * on the water, the cleats can make fast. Built once, on first use.
 */
import { BERTHS, BLOCKS, PORTS, type BerthDef, type BlockDef } from './archipelago';
import { groundHeight } from './terrain';

let all: BerthDef[] | null = null;

/** A block's local (x across, z along) point to world, as the world view places it. */
function toWorld(b: BlockDef, lx: number, lz: number): { x: number; z: number } {
  const yaw = (b.yawDeg * Math.PI) / 180;
  return { x: b.x + lx * Math.cos(yaw) - lz * Math.sin(yaw), z: b.z + lx * Math.sin(yaw) + lz * Math.cos(yaw) };
}

/** A berth needs this much clear water either way along the face (m): most of a workboat's half-length (her ends overhang a finger's root). */
const ROOM = 4;

/** A pontoon (a coast region's marinas): a low pier, its deck just above the water. */
const isPontoon = (b: BlockDef) => b.kind === 'pier' && b.top < 1;

/** Is (x, z) on the block (its deck's footprint, with `grace` m to spare)? */
function inBlock(b: BlockDef, x: number, z: number, grace = 0.5): boolean {
  const yaw = (b.yawDeg * Math.PI) / 180;
  const dx = x - b.x;
  const dz = z - b.z;
  // Block-local: across (x) and along (z), the inverse of toWorld.
  const lx = dx * Math.cos(yaw) + dz * Math.sin(yaw);
  const lz = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
  return Math.abs(lx) <= b.halfWidth + grace && Math.abs(lz) <= b.halfLength + grace;
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
      // A berth between each pair of bollards (they stand every 12 m from 3 m in). A pontoon's
      // face too short for two of them (a marina's finger) gets one berth in its middle, its two
      // cleats near its ends (worldView.buildBlock draws them there).
      const short = isPontoon(b) && f.half * 2 < 18 && f.half >= 3; // pontoons only: a pier's short end has one bollard
      const spots = short ? [0] : [];
      for (let s = -f.half + 9; s <= f.half - 6; s += 12) spots.push(s);
      for (const s of spots) {
        const lx = f.alongX ? s : f.nx * (f.offset + off);
        const lz = f.alongX ? f.nz * (f.offset + off) : s;
        const p = toWorld(b, lx, lz);
        if (groundHeight(p.x, p.z) > -2.2) continue; // too shallow alongside
        // Room to lie there: her length along the face clear of the pontoons (a marina's finger
        // pontoons stand across the main pontoon's face between them). Pontoons only: the
        // hand-built regions' berths stay as they were.
        // (A pontoon's own berths keep clear of everything: one may lie along a quay's foot.)
        const blocked = [-1, 0, 1].some((k) => BLOCKS.some((o) => o !== b && (isPontoon(o) || isPontoon(b)) && inBlock(o, p.x + ax * k * ROOM, p.z + az * k * ROOM)));
        if (blocked) continue;
        // A pontoon's lines go to cleats on a pontoon (half a metre in from the edge, as the lines
        // are drawn), not up to a quay or breakwater it meets.
        if (isPontoon(b)) {
          const half = short ? shortCleat(f.half) : BOLLARD_HALF_SPACING;
          const onDeck = [-1, 1].every((k) => {
            const cx = p.x + ax * k * half - nx * (off + 0.5);
            const cz = p.z + az * k * half - nz * (off + 0.5);
            return BLOCKS.some((o) => isPontoon(o) && inBlock(o, cx, cz, 0)) && !BLOCKS.some((o) => !isPontoon(o) && inBlock(o, cx, cz, 0.3));
          });
          if (!onDeck) continue;
        }
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
          ...(short ? { bollardHalf: shortCleat(f.half) } : {}),
        });
      }
    }
  }
  return out;
}

/** A berth's bollards stand this far either side of its centre, along the face (half the 12 m spacing), and 0.5 m in from the edge. */
export const BOLLARD_HALF_SPACING = 6;

/** On a face too short for two 12 m-spaced bollards, its cleats stand this far from its middle: a metre in from each end. */
export function shortCleat(half: number): number {
  return half - 1;
}

/** All dockable berths: named, and one per bollard pair on every seaward face. */
export function allBerths(): BerthDef[] {
  return (all ??= generate());
}
