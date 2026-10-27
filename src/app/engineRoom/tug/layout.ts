/**
 * Where everything goes in the harbour tug's engine room (owner, 27 Oct 2026): plain numbers in
 * her axes, from her room's plan (../plan.ts) and her two engines, for the drawing (room.ts)
 * and for walking round it (../walk.ts takes `solids`).
 *
 * As a twin-screw ASD tug's engine room is generally laid out (our own arrangement): her two
 * main engines side by side, a centre aisle between them and a walkway outboard of each;
 *   forward, to port, the engine control room: a cabin across the corner, its window aft onto
 *     the port engine, its door into the centre aisle; inside it the console under the
 *     window with its screens and the main switchboard along the forward bulkhead;
 *   forward, centre, the workbench and the tool board; to starboard the fuel day tanks
 *     against the bulkhead, the two starting-air receivers and their compressor;
 *   each engine's fire pump on its free (forward) end;
 *   aft, the shaft lines (cardan shafts, under gratings) to the Z-drives through the aft
 *     bulkhead, and between them the two generator sets, the thruster room door between those;
 *   down the starboard side the bilge and ballast valve chest and pumps; down the port side the
 *     sea water strainers; the pipe runs along both sides, the cable trays, the ventilation duct
 *     and the lifting rails over the engines overhead.
 * Anything that doesn't fit her room (a room too short forward for the control room) is left out.
 */
import type { EngineRoomPlan, RoomEngine } from '../plan';

/** A solid block on the floor (walked round): across x0..x1, along z0..z1, up to y1. */
export interface Solid {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y1: number;
}

export interface TugLayout {
  port: RoomEngine;
  stbd: RoomEngine;
  /** Each engine's forward (free) end and aft end (the flange), along her. */
  front: number;
  aft: number;
  /** The engine control room: its corner box, its door (in its inboard wall, along z) and its window (in its aft wall, across x). */
  ecr: { x0: number; x1: number; z0: number; z1: number; door: [number, number]; window: [number, number] } | null;
  bench: { x0: number; x1: number; z0: number; z1: number } | null;
  /** Fuel day tanks (boxes against the forward bulkhead) and the air receivers (upright, centre x, z, radius). */
  dayTanks: { x0: number; x1: number; z0: number; z1: number }[];
  receivers: { x: number; z: number; r: number }[];
  compressor: { x: number; z: number } | null;
  /** The generator sets (centre x, z0..z1 along her). */
  gensets: { x: number; z0: number; z1: number }[];
  /** The thruster room door in the aft bulkhead (centre x). */
  aftDoor: number;
  /** The fire pumps (in front of each engine): centre x, z. */
  firePumps: { x: number; z: number }[];
  /** The starboard valve chest (along z) and bilge pumps, the port sea water strainers. */
  valveChest: { x: number; z0: number; z1: number };
  bilgePumps: { x: number; z: number }[];
  strainers: { x: number; z: number }[];
  /** Oil drums on their pallet (port aft, outboard), the spares rack (starboard aft), the escape ladder (port aft corner). */
  drums: { x: number; z: number };
  rack: { x: number; z0: number };
  escape: { x: number; z: number };
  /**
   * Each engine's local control stand (port first): in the aisle beside it, inboard of its
   * handrail, its panel facing the aisle (+x for the port engine), `z` its middle.
   */
  lops: { x: number; z: number; facing: '+x' | '-x' }[];
  solids: Solid[];
}

export function tugLayout(p: EngineRoomPlan): TugLayout | null {
  if (p.engines.length !== 2) return null;
  const [a, b] = [...p.engines].sort((m, n) => m.x - n.x);
  const port = a;
  const stbd = b;
  const L = port.size[0];
  const W = port.size[1];
  const front = port.flangeZ - L;
  const aft = port.flangeZ;
  const hw = p.halfWidth;
  const inner = Math.abs(port.x) - W / 2; // the engines' inboard faces (centre aisle half-width)
  const solids: Solid[] = [];
  const top = (h: number) => p.sole + h;

  // Engine control room: forward port corner, if there's room forward of the port engine's fire pump.
  const ecrZ1 = front - 0.9;
  const ecr = ecrZ1 - p.z0 >= 1.7 ? { x0: -hw, x1: -Math.max(0.8, inner - 0.6), z0: p.z0, z1: ecrZ1, door: [0, 0] as [number, number], window: [0, 0] as [number, number] } : null;
  if (ecr) {
    const d = (ecr.z0 + ecr.z1) / 2;
    ecr.door = [d - 0.42, d + 0.42];
    ecr.window = [ecr.x0 + 0.5, ecr.x1 - 0.35];
    // Its walls: the aft one across, the inboard one along (the door a gap in it).
    solids.push({ x0: ecr.x0, x1: ecr.x1, z0: ecr.z1 - 0.06, z1: ecr.z1 + 0.06, y1: top(3) });
    solids.push({ x0: ecr.x1 - 0.06, x1: ecr.x1 + 0.06, z0: ecr.z0, z1: ecr.door[0], y1: top(3) });
    solids.push({ x0: ecr.x1 - 0.06, x1: ecr.x1 + 0.06, z0: ecr.door[1], z1: ecr.z1, y1: top(3) });
    // Inside: the console under the window, the switchboard along the forward bulkhead.
    solids.push({ x0: ecr.x0 + 0.2, x1: ecr.x1 - 0.3, z0: ecr.z1 - 0.7, z1: ecr.z1 - 0.06, y1: top(0.8) });
    solids.push({ x0: ecr.x0 + 0.1, x1: ecr.x1 - 0.5, z0: ecr.z0, z1: ecr.z0 + 0.5, y1: top(2) });
  }
  // The bench forward in the centre aisle, the day tanks and receivers forward to starboard.
  const benchX0 = ecr ? ecr.x1 + 0.6 : -0.9;
  const bench = { x0: benchX0, x1: Math.min(benchX0 + 1.6, inner + 0.4), z0: p.z0, z1: p.z0 + 0.65 };
  if (bench.x1 - bench.x0 < 0.9) Object.assign(bench, { x1: bench.x0 + 0.9 });
  solids.push({ ...bench, y1: top(0.9) });
  const dayTanks: TugLayout['dayTanks'] = [];
  for (let i = 0; i < 2; i++) {
    const x1 = hw - 0.1 - i * 0.95;
    dayTanks.push({ x0: x1 - 0.85, x1, z0: p.z0, z1: p.z0 + 0.62 });
  }
  for (const t of dayTanks) solids.push({ ...t, y1: top(1.6) });
  const rx = Math.max(bench.x1 + 0.35, dayTanks[1].x0 - 0.35);
  const receivers = [
    { x: rx, z: p.z0 + 0.35, r: 0.24 },
    { x: rx, z: p.z0 + 0.95, r: 0.24 },
  ];
  for (const r of receivers) solids.push({ x0: r.x - r.r, x1: r.x + r.r, z0: r.z - r.r, z1: r.z + r.r, y1: top(1.7) });
  const compressor = front - (p.z0 + 0.7) > 1.3 ? { x: (dayTanks[0].x0 + dayTanks[0].x1) / 2, z: p.z0 + 1.25 } : null;
  if (compressor) solids.push({ x0: compressor.x - 0.4, x1: compressor.x + 0.4, z0: compressor.z - 0.3, z1: compressor.z + 0.3, y1: top(0.8) });

  // The fire pumps on the engines' free ends.
  const firePumps = [port, stbd].map((e) => ({ x: e.x, z: front - 0.4 }));
  for (const f of firePumps) solids.push({ x0: f.x - 0.35, x1: f.x + 0.35, z0: f.z - 0.35, z1: front, y1: top(0.9) });

  // Aft: the gensets between the shafts, the door between them.
  const gensets: TugLayout['gensets'] = [];
  const room = p.z1 - 0.35 - (aft + 0.6);
  if (room >= 1.6) {
    const gl = Math.min(2.2, room);
    for (const s of [-1, 1]) gensets.push({ x: s * Math.min(inner - 0.1, 1.05), z0: p.z1 - 0.35 - gl, z1: p.z1 - 0.35 });
  }
  for (const g of gensets) solids.push({ x0: g.x - 0.42, x1: g.x + 0.42, z0: g.z0, z1: g.z1, y1: top(1.3) });

  // Down the sides.
  const out = hw - 0.25;
  const mid = (front + aft) / 2;
  const valveChest = { x: out, z0: mid - 1.0, z1: mid + 1.0 };
  solids.push({ x0: out - 0.2, x1: hw, z0: valveChest.z0, z1: valveChest.z1, y1: top(1.1) });
  const bilgePumps = [aft + 0.7, aft + 1.6].filter((z) => z < p.z1 - 0.4).map((z) => ({ x: out - 0.05, z }));
  for (const b2 of bilgePumps) solids.push({ x0: b2.x - 0.25, x1: hw, z0: b2.z - 0.25, z1: b2.z + 0.25, y1: top(1) });
  const strainers = [mid - 0.6, mid + 0.6].map((z) => ({ x: -out, z }));
  for (const s2 of strainers) solids.push({ x0: -hw, x1: s2.x + 0.22, z0: s2.z - 0.22, z1: s2.z + 0.22, y1: top(0.8) });

  const drums = { x: -(hw - 0.42), z: aft + 1.3 };
  solids.push({ x0: drums.x - 0.38, x1: -hw + 0.01, z0: drums.z - 0.8, z1: drums.z + 0.8, y1: top(1.05) });
  const rack = { x: hw - 0.25, z0: Math.min(p.z1 - 1.3, (bilgePumps[bilgePumps.length - 1]?.z ?? aft) + 0.45) };
  solids.push({ x0: rack.x - 0.24, x1: hw, z0: rack.z0 - 0.05, z1: rack.z0 + 0.95, y1: top(1.8) });
  const escape = { x: -(hw - 0.45), z: p.z1 - 0.3 };
  solids.push({ x0: escape.x - 0.4, x1: escape.x + 0.4, z0: escape.z - 0.42, z1: p.z1, y1: top(3) });
  // The local control stands, a third of the way aft along each engine, inboard of its handrail.
  const lops = [port, stbd].map((e) => {
    const s = e.x < 0 ? 1 : -1;
    return { x: e.x + s * (W / 2 + 0.46), z: front + Math.min(1.2, L / 3), facing: s > 0 ? ('+x' as const) : ('-x' as const) };
  });
  for (const l of lops) solids.push({ x0: l.x - 0.14, x1: l.x + 0.14, z0: l.z - 0.32, z1: l.z + 0.32, y1: top(1.5) });
  return { port, stbd, front, aft, lops, ecr, bench, dayTanks, receivers, compressor, gensets, aftDoor: 0, firePumps, valveChest, bilgePumps, strainers, drums, rack, escape, solids };
}
