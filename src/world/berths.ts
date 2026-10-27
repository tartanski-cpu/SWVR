/**
 * Every berth you can dock at: the named ones (fuel and cargo berths, archipelago.ts) and,
 * owner feedback, one at each pair of bollards along every quay and pier face that has
 * deep water in front of it (or, a face too short for a pair, one in its middle). The faces and their probe are the same ones the world view
 * uses to place fenders and bollards (worldView.buildBlock), so wherever there are bollards
 * on the water, the cleats can make fast. Built once, on first use.
 */
import { BERTHS, BLOCKS, PORTS, type BerthDef, type BlockDef } from './archipelago';
import { groundHeight } from './terrain';
import { GridIndex } from './gridIndex';

let all: BerthDef[] | null = null;
let near: GridIndex<BerthDef> | null = null;
let byId: Map<string, BerthDef> | null = null;

/** How far round a point `berthsNear` is sure to find every berth (m): more than the fender duty's 400 m and the docking range. */
export const BERTH_NEAR_REACH = 500;

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
export function inBlock(b: BlockDef, x: number, z: number, grace = 0.5): boolean {
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
  // The blocks by where they are, and the berths made so far likewise: each spot is checked
  // against those near it, not every one on the map (Turku, owner: "takes a while to load";
  // its 3,276 jetty pieces made this 2.6 s, every spot against every block and berth).
  // The same answers, so the same berths and ids.
  const blocksAt = new GridIndex(BLOCKS, (o) => {
    const r = Math.hypot(o.halfLength, o.halfWidth) + 1;
    return [o.x - r, o.z - r, o.x + r, o.z + r];
  }, 50);
  const anyBlock = (x: number, z: number, test: (o: BlockDef) => boolean) => blocksAt.at(x, z).some(test);
  const MADE = 10;
  const made = new Map<string, BerthDef[]>();
  const keep = (q: BerthDef) => {
    const k = `${Math.floor(q.x / MADE)},${Math.floor(q.z / MADE)}`;
    const list = made.get(k);
    if (list) list.push(q);
    else made.set(k, [q]);
  };
  for (const q of out) keep(q);
  const berthWithin9 = (x: number, z: number) => {
    const [i, j] = [Math.floor(x / MADE), Math.floor(z / MADE)];
    for (let a = i - 1; a <= i + 1; a++) for (let c = j - 1; c <= j + 1; c++) if (made.get(`${a},${c}`)?.some((q) => Math.hypot(q.x - x, q.z - z) < 9)) return true;
    return false;
  };
  for (const b of BLOCKS) {
    if (b.farm) continue; // a fish farm's rings and lines: solid, but nowhere to tie up
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
        const blocked = [-1, 0, 1].some((k) => anyBlock(p.x + ax * k * ROOM, p.z + az * k * ROOM, (o) => o !== b && (isPontoon(o) || isPontoon(b)) && inBlock(o, p.x + ax * k * ROOM, p.z + az * k * ROOM)));
        if (blocked) continue;
        // A pontoon's lines go to cleats on a pontoon (half a metre in from the edge, as the lines
        // are drawn), not up to a quay or breakwater it meets.
        if (isPontoon(b)) {
          const half = short ? shortCleat(f.half) : BOLLARD_HALF_SPACING;
          const onDeck = [-1, 1].every((k) => {
            const cx = p.x + ax * k * half - nx * (off + 0.5);
            const cz = p.z + az * k * half - nz * (off + 0.5);
            return anyBlock(cx, cz, (o) => isPontoon(o) && inBlock(o, cx, cz, 0)) && !anyBlock(cx, cz, (o) => !isPontoon(o) && inBlock(o, cx, cz, 0.3));
          });
          if (!onDeck) continue;
        }
        if (berthWithin9(p.x, p.z)) continue; // a named berth here already
        const port = nearestPort(p.x, p.z);
        const berth: BerthDef = {
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
        };
        out.push(berth);
        keep(berth);
      }
    }
  }
  return out;
}

/** A block's local axes in world: (lx, lz) = (dx, dz) projected on them (the inverse of toWorld). */
export function toLocal(b: BlockDef, x: number, z: number): { lx: number; lz: number } {
  const yaw = (b.yawDeg * Math.PI) / 180;
  const dx = x - b.x;
  const dz = z - b.z;
  return { lx: dx * Math.cos(yaw) + dz * Math.sin(yaw), lz: -dx * Math.sin(yaw) + dz * Math.cos(yaw) };
}

/** One face of a block, in its frame: its outward normal, half-length, how far out it stands, and whether it runs along local X. */
export interface BlockFace {
  nx: number;
  nz: number;
  half: number;
  offset: number;
  alongX: boolean;
}

/**
 * Where the bollards stand along a face (positions along it, m from its middle): at the two
 * tie points of every berth on that face (its centre ± its bollard half-spacing, where the
 * mooring lines are drawn to: vessel/view/mooringLines.ts), and, on a face with no berth, one
 * every 12 m from 3 m in as before. (The owner, Oct 2026: the bollards on the start quay
 * didn't stand where the lines tied: a coast map's berths come every 16 m from the pipeline,
 * the hand-built quays' named berths wherever they were put, and the bollards were drawn on
 * their own 12 m grid.)
 */
export function faceBollards(b: BlockDef, f: BlockFace, berths: readonly BerthDef[] = BERTHS): number[] {
  const at: number[] = [];
  for (const berth of berths) {
    // On this face: her shore side is the face's inward normal, she lies off the face by her
    // shoreDist, and within its length.
    const { lx, lz } = toLocal(b, berth.x, berth.z);
    const along = f.alongX ? lx : lz;
    const across = f.alongX ? lz : lx;
    const outward = f.alongX ? f.nz : f.nx;
    if (across * outward < f.offset - 0.5 || across * outward > f.offset + 8 || Math.abs(along) > f.half + 1) continue;
    const { lx: sx, lz: sz } = toLocal({ ...b, x: 0, z: 0 }, berth.shoreX, berth.shoreZ);
    if ((f.alongX ? sz : sx) * outward > -0.7) continue; // her shore isn't this way
    const half = berth.bollardHalf ?? BOLLARD_HALF_SPACING;
    for (const k of [-1, 1]) {
      const s = along + k * half;
      if (Math.abs(s) <= f.half - 0.3 && !at.some((t) => Math.abs(t - s) < 0.6)) at.push(s);
    }
  }
  if (!at.length) {
    for (let s = -f.half + 3; s <= f.half - 3; s += 12) at.push(s);
    return at;
  }
  at.sort((p, q) => p - q);
  // And on along the rest of the face, at the same 12 m spacing (owner, Oct 2026: a 24 m
  // trawler at the start quay had only her berth's two bollards, both within her length, so her
  // bow and stern lines ran inwards; vessel/view/mooringLines.ts leads each to the bollard
  // beyond her end). A gap between two berths' bollards wider than the spacing is shared out.
  const step = 2 * BOLLARD_HALF_SPACING;
  const end = f.half - 3;
  const out: number[] = [];
  for (let s = at[0] - step; s >= -end; s -= step) out.push(s);
  for (let i = 0; i < at.length; i++) {
    out.push(at[i]);
    const gap = i + 1 < at.length ? at[i + 1] - at[i] : 0;
    const n = Math.ceil(gap / step - 0.05) - 1;
    for (let k = 1; k <= n; k++) out.push(at[i] + (gap * k) / (n + 1));
  }
  for (let s = at[at.length - 1] + step; s <= end; s += step) out.push(s);
  return out.sort((p, q) => p - q);
}

let tieCache: Map<string, { x: number; z: number }[]> | null = null;

/**
 * The bollards (world x, z) along the face a berth lies off: the ones its lines can be led to
 * (vessel/view/mooringLines.ts). Empty for a pontoon's berth (its lines go to its own cleats).
 */
export function berthBollards(berth: BerthDef): { x: number; z: number }[] {
  tieCache ??= new Map();
  const hit = tieCache.get(berth.id);
  if (hit) return hit;
  const found: { x: number; z: number }[] = [];
  // Her line of tie points: half a metre in from the face, along her heading.
  const tx = berth.x + berth.shoreX * (berth.shoreDist + 0.5);
  const tz = berth.z + berth.shoreZ * (berth.shoreDist + 0.5);
  for (const b of BLOCKS) {
    if (b.farm || isPontoon(b)) continue;
    if (Math.hypot(b.x - berth.x, b.z - berth.z) > b.halfLength + b.halfWidth + 40) continue;
    for (const f of blockFaces(b)) {
      for (const s of faceBollards(b, f)) {
        const p = toWorld(b, f.alongX ? s : f.nx * (f.offset - 0.5), f.alongX ? f.nz * (f.offset - 0.5) : s);
        // On her line: within a metre of it across (off the shore direction).
        const across = (p.x - tx) * berth.shoreX + (p.z - tz) * berth.shoreZ;
        if (Math.abs(across) < 1 && !found.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.6)) found.push(p);
      }
    }
  }
  tieCache.set(berth.id, found);
  return found;
}

/** A block's four faces, as the world view walks them. */
function blockFaces(b: BlockDef): BlockFace[] {
  return [
    { nx: 1, nz: 0, half: b.halfLength, offset: b.halfWidth, alongX: false },
    { nx: -1, nz: 0, half: b.halfLength, offset: b.halfWidth, alongX: false },
    { nx: 0, nz: 1, half: b.halfWidth, offset: b.halfLength, alongX: true },
    { nx: 0, nz: -1, half: b.halfWidth, offset: b.halfLength, alongX: true },
  ];
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

/**
 * The berths within at least BERTH_NEAR_REACH of world (x, z) (a few more beyond it, never
 * fewer). A real-coast map has over a thousand; the physics asks every tick.
 */
export function berthsNear(x: number, z: number): readonly BerthDef[] {
  near ??= new GridIndex(allBerths(), (b) => [b.x - BERTH_NEAR_REACH, b.z - BERTH_NEAR_REACH, b.x + BERTH_NEAR_REACH, b.z + BERTH_NEAR_REACH]);
  return near.at(x, z);
}

/** A berth by its id. */
export function berthWithId(id: string): BerthDef | undefined {
  byId ??= new Map(allBerths().map((b) => [b.id, b]));
  return byId.get(id);
}
