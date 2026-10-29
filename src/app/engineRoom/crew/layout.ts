/**
 * Where everything goes in the crew area (crew/plan.ts says where its decks are): plain numbers
 * in her axes, for the drawing (crew/view.ts) and for walking round it (crew/walk.ts). As a
 * harbour tug's crew area is generally laid out (our own arrangement, fitted to her own house):
 *
 *   main deck, inside the deckhouse
 *     the lobby       across its aft end, in by the weathertight door: a boot rack, oilskins on
 *                     their hooks, the lifejacket locker, a fire extinguisher, the muster list;
 *                     doorways forward into the messroom, the stair and the galley
 *     the messroom    to port: a U-shaped settee round a fixed table, the TV, a harbour chart
 *     the galley      to starboard: worktops along her side and forward, the cooker under its
 *                     hood, the sink, a tall fridge, lockers over the windows, the kettle and mugs
 *     the stair       down the middle between them, its head by the lobby, its foot forward
 *   lower deck, forward of the engine room
 *     the corridor    across her at the stair's foot
 *     the cabins      aft of it, either side of the stair: the master's to port (a bunk, a
 *                     desk and chair, a wardrobe), the crew's to starboard (two-high bunks,
 *                     two lockers, a seat)
 *     forward of it   the washroom to port (shower, WC, basin and mirror), the laundry and
 *                     store to starboard (washer and dryer, shelves of stores)
 *
 * Anything that doesn't fit her decks (a short house, a narrow lower deck) is left out or made
 * smaller, never pushed through a wall.
 */
import type { CrewAreaPlan, CrewDeck } from './plan';

export type DeckName = 'main' | 'lower';
/** Which way a piece's front faces (into the room): along her axes. */
export type Face = '+x' | '-x' | '+z' | '-z';

/** A box standing on a deck (her axes): a wall, or a piece's room on the floor. */
export interface Box {
  deck: DeckName;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** Its height over the floor (walls: to the deckhead). */
  h: number;
}

export type PieceKind =
  | 'settee'
  | 'table'
  | 'tv'
  | 'chart'
  | 'counter'
  | 'cooker'
  | 'sink'
  | 'fridge'
  | 'cupboards'
  | 'bootRack'
  | 'oilskins'
  | 'lifejackets'
  | 'extinguisher'
  | 'notice'
  | 'berth'
  | 'bunk'
  | 'desk'
  | 'chair'
  | 'wardrobe'
  | 'shower'
  | 'wc'
  | 'basin'
  | 'washer'
  | 'shelves'
  | 'stores';

/** A piece of furniture or kit: its box, which way it faces, and whether you walk round it. */
export interface Piece extends Box {
  kind: PieceKind;
  face: Face;
  /** Off the floor (things on a wall: the TV, the chart, lockers over), m. */
  lift?: number;
  solid: boolean;
}

/**
 * A doorway in a wall: the wall's line (`along` it runs along x or z, `at` the other
 * coordinate), the gap's ends, its name plate (if any) and which side it faces, its door leaf
 * (hinged at the gap's `hinge` end, swung open into the side `into`).
 */
export interface Doorway {
  deck: DeckName;
  along: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  plate?: string;
  plateSide: 1 | -1;
  leaf?: { hinge: 0 | 1; into: 1 | -1 };
}

export interface CrewLayout {
  plan: CrewAreaPlan;
  /** Each deck (the lower may be absent). */
  decks: Partial<Record<DeckName, CrewDeck>>;
  /** The main deck's hole for the stair (no floor there: the stair's steps are). */
  well: { x0: number; x1: number; z0: number; z1: number } | null;
  /** The stair's steps, head first (each a level tread). */
  steps: { x0: number; x1: number; z0: number; z1: number; y: number }[];
  walls: Box[];
  doorways: Doorway[];
  pieces: Piece[];
  /** Windows in the main deck's sides and front, portholes in the lower deck's sides: a wall line, centre, size. */
  windows: { deck: DeckName; along: 'x' | 'z'; at: number; c: number; w: number; y0: number; y1: number; round: boolean; side: 1 | -1 }[];
  /** Ceiling lights: deck, x, z. */
  lamps: { deck: DeckName; x: number; z: number }[];
  /** Where you stand coming in (just inside the door) and the door's place (the mark's), her axes. */
  inside: [number, number, number];
}

/** Partition walls this thick (m). */
const WALL = 0.06;

/** A wall along x at z = `at`, from x0 to x1, with gaps. */
function wallAlongX(deck: CrewDeck, name: DeckName, at: number, x0: number, x1: number, gaps: [number, number][] = []): Box[] {
  return segments(x0, x1, gaps).map(([a, b]) => ({ deck: name, x0: a, x1: b, z0: at - WALL / 2, z1: at + WALL / 2, h: deck.deckhead - deck.floor }));
}

/** A wall along z at x = `at`, from z0 to z1, with gaps. */
function wallAlongZ(deck: CrewDeck, name: DeckName, at: number, z0: number, z1: number, gaps: [number, number][] = []): Box[] {
  return segments(z0, z1, gaps).map(([a, b]) => ({ deck: name, x0: at - WALL / 2, x1: at + WALL / 2, z0: a, z1: b, h: deck.deckhead - deck.floor }));
}

/** The pieces of [from, to] between the gaps. */
function segments(from: number, to: number, gaps: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let a = from;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > a + 0.01) out.push([a, g0]);
    a = Math.max(a, g1);
  }
  if (to > a + 0.01) out.push([a, to]);
  return out;
}

export function crewLayout(plan: CrewAreaPlan): CrewLayout {
  const M = plan.main;
  const L = plan.lower;
  const S = plan.stair;
  const walls: Box[] = [];
  const doorways: Doorway[] = [];
  const pieces: Piece[] = [];
  const windows: CrewLayout['windows'] = [];
  const lamps: CrewLayout['lamps'] = [];
  const piece = (kind: PieceKind, deck: DeckName, x0: number, x1: number, z0: number, z1: number, h: number, face: Face, solid = true, lift = 0) =>
    pieces.push({ kind, deck, x0, x1, z0, z1, h, face, solid, lift });

  // ── Main deck ──
  // The corridor down the middle (the stair in it), its walls the messroom's and the galley's.
  const cw = S ? S.width / 2 + 0.1 : 0.45;
  const zL = Math.max(S ? S.zTop + 0.6 : M.z0 + 2.5, M.z1 - 2.2);
  // (Each room's inside, clear of its partitions: half a wall in from their middles.)
  const h = WALL / 2 + 0.005;
  const lobby = { z0: zL + h, z1: M.z1 };
  const well = S ? { x0: S.x - S.width / 2, x1: S.x + S.width / 2, z0: S.zFoot, z1: S.zTop } : null;
  // The lobby's forward wall: doorways into the messroom (port), the corridor (middle), the galley (starboard).
  // (Doorways 0.85 m clear: a person passes without brushing the frames.)
  const messDoor: [number, number] = [-cw - 0.95, -cw - 0.1];
  const galleyDoor: [number, number] = [cw + 0.1, cw + 0.95];
  walls.push(...wallAlongX(M, 'main', zL, -M.halfWidth, M.halfWidth, [messDoor, [-cw + 0.03, cw - 0.03], galleyDoor]));
  doorways.push({ deck: 'main', along: 'x', at: zL, from: messDoor[0], to: messDoor[1], plate: 'MESS', plateSide: 1, leaf: { hinge: 0, into: -1 } });
  doorways.push({ deck: 'main', along: 'x', at: zL, from: galleyDoor[0], to: galleyDoor[1], plate: 'GALLEY', plateSide: 1, leaf: { hinge: 1, into: -1 } });
  // The corridor's sides, from the lobby forward to the house front.
  for (const s of [-1, 1]) walls.push(...wallAlongZ(M, 'main', s * cw, M.z0, zL));
  // The messroom (port): a U-shaped settee round a fixed table, open aft; the TV on the
  // corridor wall; the chart over the settee on her side.
  const mess = { x0: -M.halfWidth, x1: -cw - h, z0: M.z0, z1: zL - h };
  const messW = mess.x1 - mess.x0;
  const messL = mess.z1 - mess.z0;
  const sd = 0.55; // settee depth
  const uw = Math.min(2.3, messW - 0.4);
  const ul = Math.min(2.2, messL - 0.9);
  piece('settee', 'main', mess.x0, mess.x0 + uw, mess.z0, mess.z0 + sd, 0.85, '+z'); // along the front
  piece('settee', 'main', mess.x0, mess.x0 + sd, mess.z0 + sd, mess.z0 + ul, 0.85, '+x'); // along her side
  piece('settee', 'main', mess.x0 + uw - sd, mess.x0 + uw, mess.z0 + sd, mess.z0 + Math.min(ul, 1.5), 0.85, '-x'); // the inboard leg
  piece('table', 'main', mess.x0 + sd + 0.12, mess.x0 + uw - sd - 0.12, mess.z0 + sd + 0.12, mess.z0 + Math.min(ul, 1.5) - 0.15, 0.74, '+z');
  piece('tv', 'main', mess.x1 - 0.12, mess.x1, mess.z0 + messL * 0.55 - 0.4, mess.z0 + messL * 0.55 + 0.4, 0.5, '-x', false, 1.1);
  // (The chart on the messroom's aft wall, between her side and its door: her side has the windows.)
  piece('chart', 'main', Math.max(mess.x0 + 0.3, messDoor[0] - 1.25), messDoor[0] - 0.25, mess.z1 - 0.03, mess.z1, 0.7, '-z', false, 1.15);
  // The galley (starboard): worktops along her side and across the front, the fridge at the
  // aft end of the side run, the cooker under its hood, the sink forward; lockers over.
  const gal = { x0: cw + h, x1: M.halfWidth, z0: M.z0, z1: zL - h };
  const cd = 0.6;
  const fridgeZ1 = gal.z1 - 0.15;
  piece('fridge', 'main', gal.x1 - 0.65, gal.x1, fridgeZ1 - 0.65, fridgeZ1, 1.8, '-x');
  const runZ1 = fridgeZ1 - 0.67;
  if (runZ1 - gal.z0 > 1.6) {
    piece('counter', 'main', gal.x1 - cd, gal.x1, gal.z0 + cd, runZ1, 0.9, '-x');
    const cookZ = gal.z0 + cd + (runZ1 - gal.z0 - cd) * 0.55;
    // (The cooker and the sink are set into the worktops: the worktop's solid, not them.)
    piece('cooker', 'main', gal.x1 - cd, gal.x1, cookZ - 0.32, cookZ + 0.32, 0.92, '-x', false);
    piece('cupboards', 'main', gal.x1 - 0.35, gal.x1, gal.z0 + cd, runZ1, 0.36, '-x', false, 1.75);
  }
  const frontX0 = gal.x0 + 0.35;
  piece('counter', 'main', frontX0, gal.x1, gal.z0, gal.z0 + cd, 0.9, '+z');
  piece('sink', 'main', frontX0 + 0.3, frontX0 + 0.95, gal.z0, gal.z0 + cd, 0.9, '+z', false);
  piece('cupboards', 'main', frontX0, gal.x1 - 0.4, gal.z0, gal.z0 + 0.35, 0.36, '+z', false, 1.75);
  // The lobby: in by the door; the boot rack beside it, oilskins on the port side, the
  // lifejacket locker to starboard against the aft wall, the extinguisher by the door, the
  // muster list on the forward wall.
  const d = plan.door;
  const away = d.x <= 0 ? 1 : -1; // toward the lobby's other end, from the door
  const rackX = d.x + away * (d.width / 2 + 0.75);
  piece('bootRack', 'main', rackX - 0.5, rackX + 0.5, lobby.z1 - 0.32, lobby.z1, 0.45, '-z');
  piece('oilskins', 'main', -M.halfWidth, -M.halfWidth + 0.35, lobby.z0 + 0.25, Math.min(lobby.z1 - 0.3, lobby.z0 + 1.6), 1.6, '+x', false);
  piece('lifejackets', 'main', M.halfWidth - 1.0, M.halfWidth - 0.1, lobby.z1 - 0.5, lobby.z1, 1.2, '-z');
  piece('extinguisher', 'main', d.x - away * (d.width / 2 + 0.3) - 0.1, d.x - away * (d.width / 2 + 0.3) + 0.1, lobby.z1 - 0.18, lobby.z1, 0.6, '-z', true, 0.15);
  piece('notice', 'main', cw + 1.0, cw + 1.6, lobby.z0, lobby.z0 + 0.02, 0.8, '+z', false, 1.15);
  // Windows: her sides and the front, along the messroom and the galley; lamps over each room.
  for (const s of [-1, 1] as const)
    for (let z = M.z0 + 0.9; z < zL - 0.5; z += 1.4) windows.push({ deck: 'main', along: 'z', at: s * M.halfWidth, c: z, w: 0.75, y0: M.floor + 1.1, y1: M.floor + 1.7, round: false, side: s });
  for (const x of [mess.x0 + messW / 2, gal.x0 + (gal.x1 - gal.x0) / 2]) windows.push({ deck: 'main', along: 'x', at: M.z0, c: x, w: 0.9, y0: M.floor + 1.15, y1: M.floor + 1.7, round: false, side: -1 });
  lamps.push({ deck: 'main', x: mess.x0 + messW / 2, z: mess.z0 + messL / 2 }, { deck: 'main', x: gal.x0 + (gal.x1 - gal.x0) / 2, z: gal.z0 + (gal.z1 - gal.z0) / 2 });
  lamps.push({ deck: 'main', x: 0, z: (lobby.z0 + lobby.z1) / 2 }, { deck: 'main', x: 0, z: S ? (S.zFoot + S.zTop) / 2 : M.z0 + 1 });

  // ── The stair ──
  const steps: CrewLayout['steps'] = [];
  if (S)
    for (let k = 1; k < S.steps; k++) steps.push({ x0: S.x - S.width / 2, x1: S.x + S.width / 2, z0: S.zTop - k * S.tread, z1: S.zTop - (k - 1) * S.tread, y: S.top - k * S.rise });

  // ── Lower deck ──
  if (L && S) {
    const tw = S.width / 2 + 0.08; // the stair trunk's walls
    const cz1 = S.zFoot;
    const cz0 = cz1 - 1.0;
    // The stair trunk, aft from its foot to the engine room bulkhead (the cabins' inboard walls).
    for (const s of [-1, 1]) walls.push(...wallAlongZ(L, 'lower', s * tw, cz1, L.z1));
    // The cabins' forward wall, their doorways near the trunk.
    const master: [number, number] = [-tw - 0.95, -tw - 0.1];
    const crew: [number, number] = [tw + 0.1, tw + 0.95];
    walls.push(...wallAlongX(L, 'lower', cz1, -L.halfWidth, L.halfWidth, [master, [-tw + 0.03, tw - 0.03], crew]));
    doorways.push({ deck: 'lower', along: 'x', at: cz1, from: master[0], to: master[1], plate: 'MASTER', plateSide: -1, leaf: { hinge: 0, into: 1 } });
    doorways.push({ deck: 'lower', along: 'x', at: cz1, from: crew[0], to: crew[1], plate: 'CREW', plateSide: -1, leaf: { hinge: 1, into: 1 } });
    // The corridor's forward wall, the washroom and the laundry beyond, split down the middle.
    const wc: [number, number] = [-1.05, -0.2];
    const lau: [number, number] = [0.2, 1.05];
    walls.push(...wallAlongX(L, 'lower', cz0, -L.halfWidth, L.halfWidth, [wc, lau]));
    walls.push(...wallAlongZ(L, 'lower', 0, L.z0, cz0));
    doorways.push({ deck: 'lower', along: 'x', at: cz0, from: wc[0], to: wc[1], plate: 'WC', plateSide: 1, leaf: { hinge: 1, into: -1 } });
    doorways.push({ deck: 'lower', along: 'x', at: cz0, from: lau[0], to: lau[1], plate: 'LAUNDRY', plateSide: 1, leaf: { hinge: 0, into: -1 } });
    // The master's cabin (port, aft): the bunk along her side at the aft end, the desk and
    // chair against the trunk, the wardrobe forward by her side.
    const mc = { x0: -L.halfWidth, x1: -tw - h, z0: cz1 + h, z1: L.z1 };
    const bl = Math.min(1.95, mc.z1 - mc.z0 - 0.7);
    piece('berth', 'lower', mc.x0, mc.x0 + 0.8, mc.z1 - bl, mc.z1, 0.55, '+x');
    piece('desk', 'lower', mc.x1 - 0.55, mc.x1, mc.z1 - 1.25, mc.z1 - 0.15, 0.75, '-x');
    piece('chair', 'lower', mc.x1 - 1.05, mc.x1 - 0.6, mc.z1 - 0.95, mc.z1 - 0.5, 0.9, '+x');
    piece('wardrobe', 'lower', mc.x0, mc.x0 + 0.6, mc.z0 + 0.05, mc.z0 + 0.65, L.deckhead - L.floor - 0.05, '+x');
    // The crew's cabin (starboard, aft): two-high bunks along her side, two lockers forward by her side, a seat.
    const cc = { x0: tw + h, x1: L.halfWidth, z0: cz1 + h, z1: L.z1 };
    piece('bunk', 'lower', cc.x1 - 0.85, cc.x1, cc.z1 - Math.min(1.95, cc.z1 - cc.z0 - 0.75), cc.z1, 1.75, '-x');
    piece('wardrobe', 'lower', cc.x1 - 0.6, cc.x1, cc.z0 + 0.05, cc.z0 + 0.65, L.deckhead - L.floor - 0.05, '-x');
    piece('wardrobe', 'lower', cc.x1 - 1.25, cc.x1 - 0.65, cc.z0 + 0.05, cc.z0 + 0.65, L.deckhead - L.floor - 0.05, '+z');
    piece('chair', 'lower', cc.x0 + 0.1, cc.x0 + 0.55, cc.z1 - 1.2, cc.z1 - 0.75, 0.9, '+x');
    // The washroom (port, forward): the shower in the outboard corner, the WC against the
    // forward bulkhead, the basin and mirror on the middle wall.
    const wr = { x0: -L.halfWidth, x1: -h, z0: L.z0, z1: cz0 - h };
    piece('shower', 'lower', wr.x0, wr.x0 + 0.9, wr.z0, wr.z0 + 0.9, L.deckhead - L.floor - 0.05, '+x');
    piece('wc', 'lower', wr.x0 + 1.05, wr.x0 + 1.55, wr.z0, wr.z0 + 0.7, 0.75, '+z');
    piece('basin', 'lower', wr.x1 - 0.48, wr.x1, wr.z0 + Math.min(1.3, (wr.z1 - wr.z0) * 0.45), wr.z0 + Math.min(1.3, (wr.z1 - wr.z0) * 0.45) + 0.55, 0.85, '-x');
    // The laundry and store (starboard, forward): the washer and dryer against the forward
    // bulkhead, shelves of stores along her side.
    const ls = { x0: h, x1: L.halfWidth, z0: L.z0, z1: cz0 - h };
    piece('washer', 'lower', ls.x0 + 0.2, ls.x0 + 0.85, ls.z0, ls.z0 + 0.65, 1.75, '+z');
    piece('shelves', 'lower', ls.x1 - 0.45, ls.x1, ls.z0 + 0.1, ls.z1 - 0.15, 1.8, '-x');
    piece('stores', 'lower', ls.x0 + 1.0, ls.x0 + 1.6, ls.z0, ls.z0 + 0.45, 0.6, '+z');
    // Portholes in her sides (one a cabin, one each forward room), lamps over each room and the corridor.
    const ph = L.floor + 1.35;
    for (const s of [-1, 1] as const) {
      windows.push({ deck: 'lower', along: 'z', at: s * L.halfWidth, c: (cz1 + L.z1) / 2 + 0.3, w: 0.32, y0: ph - 0.16, y1: ph + 0.16, round: true, side: s });
      windows.push({ deck: 'lower', along: 'z', at: s * L.halfWidth, c: (L.z0 + cz0) / 2 + 0.6, w: 0.32, y0: ph - 0.16, y1: ph + 0.16, round: true, side: s });
    }
    lamps.push({ deck: 'lower', x: (mc.x0 + mc.x1) / 2, z: (mc.z0 + mc.z1) / 2 }, { deck: 'lower', x: (cc.x0 + cc.x1) / 2, z: (cc.z0 + cc.z1) / 2 });
    lamps.push({ deck: 'lower', x: (wr.x0 + wr.x1) / 2, z: (wr.z0 + wr.z1) / 2 }, { deck: 'lower', x: (ls.x0 + ls.x1) / 2, z: (ls.z0 + ls.z1) / 2 });
    lamps.push({ deck: 'lower', x: -L.halfWidth / 2, z: (cz0 + cz1) / 2 }, { deck: 'lower', x: L.halfWidth / 2, z: (cz0 + cz1) / 2 });
  }
  return {
    plan,
    decks: L && S ? { main: M, lower: L } : { main: M },
    well,
    steps,
    walls,
    doorways,
    pieces,
    windows,
    lamps,
    inside: [d.x, M.floor, M.z1 - 0.6],
  };
}

/** Which deck a height is on (a stair tread counts as the deck it's nearer). */
export function deckAtHeight(layout: CrewLayout, y: number): DeckName {
  const L = layout.decks.lower;
  if (!L) return 'main';
  return y > (L.deckhead + layout.plan.main.floor) / 2 ? 'main' : 'lower';
}

/** Is (x, z) inside this deck's walls (with a margin)? */
export function onDeck(deck: CrewDeck, x: number, z: number, m = 0): boolean {
  return Math.abs(x) <= deck.halfWidth - m && z >= deck.z0 + m && z <= deck.z1 - m;
}

/** A doorway by its name plate ('MASTER'). */
export function doorway(layout: CrewLayout, plate: string): Doorway | undefined {
  return layout.doorways.find((d) => d.plate === plate);
}
