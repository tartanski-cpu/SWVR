/**
 * Ferries on a coast map's real routes (the coast extras plan, C7; FerryRouteDef, the map's
 * route=ferry ways cut to the map). Plain shared state (WorldState.ferries), stepped by the
 * host; the crew see it in the snapshots.
 *
 * Fleets: routes that share an end (a terminal, or the same gap at the map's edge, within
 * `shareReach` m) are one fleet, sailed by up to `fleet` ships, each her own name and design
 * (her first route's). Oban's six island routes all leave the one pier down the one sound, so
 * three ships work them between them, not five sailing through each other. A ship out past the
 * map's edge comes back in on the fleet's next route that has an end there (Oban's ships take
 * the islands in turn); a route with a terminal at each end keeps its ship.
 *
 * Each ship, to and fro along her route:
 *   berthed  at a terminal, her bow `stopShort` m short of the route's end (the linkspan),
 *            for `dwell` s; then off the other way, with a call on the VHF ("Morvern Star,
 *            leaving Rothesay for Wemyss Bay") if your boat is within `radio` m
 *   sailing  along the route at her class's service speed, slowing over `brake` of her
 *            lengths into a terminal to `minSpeed`; she follows the route's line, no physics,
 *            `lane` of her beams to starboard of it (two ships meeting on the line pass port
 *            to port), easing onto the line over `laneTaper` of her lengths into a terminal
 *            A ship meeting her head on, too close abeam (on another route alongside hers),
 *            she steps aside from at `avoid.rate` m/s, up to `avoid.most` of her beams, back
 *            onto her lane once clear
 *   holding  she keeps her course and expects you to keep clear, as a ferry does, but she
 *            stops rather than run you down: a boat within `hold.ahead` m beyond her bow and
 *            `hold.side` m beyond her side, on her course, stops her until it's clear; so does
 *            a ship of her own going the same way. And she lies off `berthWait` of her lengths
 *            short of a terminal while another of the fleet has the berth (or is still leaving it).
 *   away     past the map's edge (her crossing out of sight) for `away` s, then back in
 *            (waiting longer if another ship is just coming in there)
 *
 * Solid to a hull: a box her size (world/harbourBoats.ts hullBoxContact), posed each tick for
 * the ferries near any vessel. Where each starts comes from her route's id and her place in the
 * fleet, so a new game's ferries are spread over their timetables. CONFIG.ferries.
 */
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { sayRadio } from '../rescue/rescue';
import { FERRY_ROUTES } from '../world/archipelago';
import type { FerryRouteDef } from '../world/defs';
import type { BlockHit } from '../world/geography';
import { hullBoxContact, type HarbourBoatPose } from '../world/harbourBoats';

export interface FerryState {
  /** Her id: her fleet's first route's id and her number in the fleet. */
  id: string;
  /** Her name (her first route's ship). */
  ship: string;
  /** The route whose class and livery she's built to (her first). */
  design: string;
  /** The route she's on now. */
  route: string;
  /** How far along the route she is (m from its first point). */
  s: number;
  /** Which way she's going: +1 toward the route's end, -1 toward its start. */
  dir: 1 | -1;
  phase: 'berthed' | 'sailing' | 'holding' | 'away';
  /** Seconds in this phase (berthed, away). */
  t: number;
  /** Her speed now (m/s along the route). */
  v: number;
  /** Trips made (which of the fleet's routes she takes next from the map's edge). */
  trips: number;
  /** How far she's stepped aside from her lane for a ship meeting her (m, + to starboard). */
  aside?: number;
}

export interface FerriesState {
  list: FerryState[];
}

/** A small hash of a string, 0-1. */
function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/** Where along the route she berths at each end (m): `stopShort` and half her length short of a terminal; at an edge, the end itself. */
export function stops(r: FerryRouteDef, cls: FerryRouteDef['cls'] = r.cls): [number, number] {
  const k = CONFIG.ferries.classes[cls];
  const short = k.length / 2 + CONFIG.ferries.stopShort;
  return [r.ends[0].dock ? Math.min(short, r.length / 2) : 0, r.ends[1].dock ? Math.max(r.length - short, r.length / 2) : r.length];
}

/** The point `s` m along the route (clamped to it). */
export function routePoint(r: FerryRouteDef, s: number): [number, number] {
  let left = Math.max(0, Math.min(r.length, s));
  for (let i = 1; i < r.path.length; i++) {
    const [ax, az] = r.path[i - 1];
    const [bx, bz] = r.path[i];
    const seg = Math.hypot(bx - ax, bz - az);
    if (left <= seg || i === r.path.length - 1) {
      const t = seg > 0 ? Math.min(1, left / seg) : 0;
      return [ax + (bx - ax) * t, az + (bz - az) * t];
    }
    left -= seg;
  }
  return r.path[r.path.length - 1];
}

/**
 * Where she is and which way her bow points (rad, 0 north, clockwise), from how far along she
 * is and which way she's going: her heading the line between points a third of her length
 * either side of her middle, so she turns smoothly round the route's bends; her place `lane`
 * of her beams to starboard of the line, eased onto it into a terminal.
 */
export function ferryPose(r: FerryRouteDef, f: Pick<FerryState, 's' | 'dir' | 'aside'>, out: HarbourBoatPose, cls: FerryRouteDef['cls'] = r.cls): HarbourBoatPose {
  const c = CONFIG.ferries;
  const k = c.classes[cls];
  const [x, z] = routePoint(r, f.s);
  const [ax, az] = routePoint(r, f.s - (f.dir * k.length) / 3);
  const [bx, bz] = routePoint(r, f.s + (f.dir * k.length) / 3);
  out.heading = Math.atan2(bx - ax, -(bz - az));
  // How far from the nearer terminal (an edge doesn't count), for easing onto the line.
  const [s0, s1] = stops(r, cls);
  const fromDock = Math.min(r.ends[0].dock ? f.s - s0 : Infinity, r.ends[1].dock ? s1 - f.s : Infinity);
  const lane = (c.lane * k.beam + (f.aside ?? 0)) * Math.max(0, Math.min(1, fromDock / (k.length * c.laneTaper)));
  // Starboard of a heading h (0 north, x east, z south) is (cos h, sin h).
  out.x = x + Math.cos(out.heading) * lane;
  out.z = z + Math.sin(out.heading) * lane;
  return out;
}

// ── Fleets: the routes sharing an end ──
interface Fleet {
  routes: FerryRouteDef[];
}
const fleetsOf = new WeakMap<readonly FerryRouteDef[], Fleet[]>();

/** The routes grouped into fleets: those with an end within `shareReach` of another's, linked. */
export function fleets(routes: readonly FerryRouteDef[]): Fleet[] {
  const done = fleetsOf.get(routes);
  if (done) return done;
  const reach = CONFIG.ferries.shareReach;
  const sorted = [...routes].sort((a, b) => (a.id < b.id ? -1 : 1));
  const up = sorted.map((_, i) => i);
  const root = (i: number): number => (up[i] === i ? i : (up[i] = root(up[i])));
  const endsOf = (r: FerryRouteDef) => [r.path[0], r.path[r.path.length - 1]];
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length; j++)
      if (endsOf(sorted[i]).some(([ax, az]) => endsOf(sorted[j]).some(([bx, bz]) => Math.hypot(ax - bx, az - bz) < reach))) up[root(j)] = root(i);
  const by = new Map<number, Fleet>();
  sorted.forEach((r, i) => {
    const g = by.get(root(i)) ?? { routes: [] };
    g.routes.push(r);
    by.set(root(i), g);
  });
  const out = [...by.values()];
  fleetsOf.set(routes, out);
  return out;
}

/** Each fleet's ships, spread over the timetable: the first by her route's id, the rest a share of a round trip apart. */
function startFerries(routes: readonly FerryRouteDef[]): FerriesState {
  const c = CONFIG.ferries;
  const list: FerryState[] = [];
  for (const g of fleets(routes)) {
    const n = Math.min(c.fleet, g.routes.length);
    for (let i = 0; i < n; i++) {
      const r = g.routes[i];
      const base = { id: `${g.routes[0].id}#${i}`, ship: r.ship, design: r.id, route: r.id, t: 0, v: 0, trips: i };
      const [s0, s1] = stops(r);
      const dock = r.ends[0].dock ? 0 : r.ends[1].dock ? 1 : -1;
      const edge = !r.ends[1].dock ? 1 : !r.ends[0].dock ? 0 : -1;
      // Alone: berthed or part way along, by her route's id. In a fleet: the first berthed, the
      // second half way along outward bound, the third out past the edge half her time.
      const turn = n > 1 ? i % 3 : hash(r.id) < 0.35 ? 0 : 1;
      if (turn === 0 && dock >= 0) list.push({ ...base, s: dock ? s1 : s0, dir: dock ? -1 : 1, phase: 'berthed', t: hash(`${r.id}t`) * c.dwell });
      else if (turn === 2 && edge >= 0) list.push({ ...base, s: edge ? s1 : s0, dir: edge ? -1 : 1, phase: 'away', t: c.away * 0.5 });
      else {
        const dir = n > 1 && dock >= 0 ? (dock ? -1 : 1) : hash(`${r.id}d`) < 0.5 ? 1 : -1;
        list.push({ ...base, s: s0 + (s1 - s0) * (n > 1 ? 0.5 : 0.15 + 0.7 * hash(`${r.id}s`)), dir, phase: 'sailing', v: c.classes[r.cls].speed });
      }
    }
  }
  return { list };
}

const routeOf = new Map<string, FerryRouteDef>();
function routeById(id: string, routes: readonly FerryRouteDef[]): FerryRouteDef | undefined {
  const r = routes.find((x) => x.id === id);
  if (r || routes !== FERRY_ROUTES) return r;
  if (!routeOf.size) for (const x of FERRY_ROUTES) routeOf.set(x.id, x);
  return routeOf.get(id);
}

/** Her class (her design's). */
function clsOf(f: FerryState, routes: readonly FerryRouteDef[]): FerryRouteDef['cls'] {
  return routeById(f.design, routes)?.cls ?? 'large';
}

const pose: HarbourBoatPose = { x: 0, z: 0, heading: 0 };
const other: HarbourBoatPose = { x: 0, z: 0, heading: 0 };

/** Is a vessel, or a ship going her way, on her course close ahead (her hold box)? */
function blockedAhead(world: WorldState, r: FerryRouteDef, f: FerryState, routes: readonly FerryRouteDef[]): boolean {
  const c = CONFIG.ferries;
  const cls = clsOf(f, routes);
  const k = c.classes[cls];
  ferryPose(r, f, pose, cls);
  const fx = Math.sin(pose.heading);
  const fz = -Math.cos(pose.heading);
  const inBox = (x: number, z: number) => {
    const dx = x - pose.x;
    const dz = z - pose.z;
    const along = dx * fx + dz * fz;
    return along > k.length * 0.3 && along < k.length / 2 + c.hold.ahead && Math.abs(-dx * fz + dz * fx) < k.beam / 2 + c.hold.side;
  };
  for (const v of Object.values(world.vessels)) if (inBox(v.position[0], v.position[2])) return true;
  for (const g of world.ferries!.list) {
    if (g === f || g.phase === 'away' || g.phase === 'berthed') continue;
    const rg = routeById(g.route, routes);
    if (!rg) continue;
    ferryPose(rg, g, other, clsOf(g, routes));
    // Only a ship going her way (one meeting her passes on her own side of the line).
    if (Math.cos(other.heading - pose.heading) > 0 && inBox(other.x, other.z)) return true;
  }
  return false;
}

/**
 * Step aside for a ship meeting her: one coming the other way within `avoid.ahead` m ahead that
 * will pass closer abeam than `avoid.clear` of their beams, she eases away from (each of the two does,
 * so they open the gap between them, whichever side they're passing); clear, back to her lane.
 */
function stepAside(world: WorldState, r: FerryRouteDef, f: FerryState, dt: number, routes: readonly FerryRouteDef[]): void {
  const a = CONFIG.ferries.avoid;
  const cls = clsOf(f, routes);
  const k = CONFIG.ferries.classes[cls];
  ferryPose(r, f, pose, cls);
  const fx = Math.sin(pose.heading);
  const fz = -Math.cos(pose.heading);
  let away = 0;
  for (const g of world.ferries!.list) {
    if (g === f || g.phase === 'away') continue;
    const rg = routeById(g.route, routes);
    if (!rg) continue;
    const kg = CONFIG.ferries.classes[clsOf(g, routes)];
    ferryPose(rg, g, other, clsOf(g, routes));
    if (Math.cos(other.heading - pose.heading) > -0.5) continue; // not meeting her
    const dx = other.x - pose.x;
    const dz = other.z - pose.z;
    const along = dx * fx + dz * fz;
    if (along < -k.length || along > a.ahead + k.length) continue;
    // Where she'll be abeam of her when they meet (routes can cross at an angle): her drift
    // across this one's course over the time till they're level.
    const gx = Math.sin(other.heading) * g.v;
    const gz = -Math.cos(other.heading) * g.v;
    const closing = f.v - (gx * fx + gz * fz);
    const meet = closing > 0.1 ? Math.max(0, along) / closing : 0;
    const across = -dx * fz + dz * fx + (-gx * fz + gz * fx) * meet; // + to her starboard
    if (Math.abs(across) < ((k.beam + kg.beam) / 2) * a.clear) away = across > 0 ? -1 : 1;
  }
  const most = a.most * k.beam;
  const now = f.aside ?? 0;
  const want = away ? Math.max(-most, Math.min(most, now + away * a.rate * dt)) : now - Math.sign(now) * Math.min(Math.abs(now), a.rate * 0.5 * dt);
  if (want) f.aside = want;
  else delete f.aside;
}

/**
 * Is the berth she's making for taken: another ship berthed at it, still leaving it, or nearer
 * it and making for it too? (`end` the route end she's making for, 0 or 1.)
 */
function berthTaken(world: WorldState, r: FerryRouteDef, f: FerryState, end: 0 | 1, routes: readonly FerryRouteDef[]): boolean {
  const [tx, tz] = r.path[end ? r.path.length - 1 : 0];
  const reach = CONFIG.ferries.shareReach;
  const left = (g: FerryState, rg: FerryRouteDef) => (g.dir > 0 ? rg.length - g.s : g.s);
  const mine = left(f, r);
  for (const g of world.ferries!.list) {
    if (g === f || g.phase === 'away') continue;
    const rg = routeById(g.route, routes);
    if (!rg) continue;
    if (g.phase === 'berthed') {
      // A berthed ship's dir already points away from her terminal: the end behind her.
      const [bx, bz] = rg.path[g.dir > 0 ? 0 : rg.path.length - 1];
      if (Math.hypot(bx - tx, bz - tz) < reach) return true;
      continue;
    }
    // One still leaving it (within her waiting distance and a length more): wait till she's clear.
    const [lx, lz] = rg.path[g.dir > 0 ? 0 : rg.path.length - 1];
    const gone = g.dir > 0 ? g.s : rg.length - g.s;
    if (rg.ends[g.dir > 0 ? 0 : 1].dock && Math.hypot(lx - tx, lz - tz) < reach && gone < CONFIG.ferries.classes[clsOf(g, routes)].length * (CONFIG.ferries.berthWait + 1)) return true;
    const gEnd = g.dir > 0 ? rg.path.length - 1 : 0;
    const [gx, gz] = rg.path[gEnd];
    if (rg.ends[g.dir > 0 ? 1 : 0].dock && Math.hypot(gx - tx, gz - tz) < reach && left(g, rg) < mine) return true;
  }
  return false;
}

/** The home boat's position (the VHF's range is from her), if any. */
function homeAt(world: WorldState): [number, number] | null {
  const v = world.homeVesselId ? world.vessels[world.homeVesselId] : Object.values(world.vessels)[0];
  return v ? [v.position[0], v.position[2]] : null;
}

function call(world: WorldState, r: FerryRouteDef, f: FerryState, text: string, cls: FerryRouteDef['cls']): void {
  const home = homeAt(world);
  if (!home) return;
  ferryPose(r, f, pose, cls);
  if (Math.hypot(pose.x - home[0], pose.z - home[1]) < CONFIG.ferries.radio) sayRadio(world, 'info', text);
}

/**
 * Back in from the map's edge: on the fleet's next route with an end at the map's edge (the one
 * after her last, skipping any another of the fleet is on), coming in from that edge. A route
 * with no edge keeps her. Not yet if another ship is just coming in there.
 */
function comeBackIn(world: WorldState, f: FerryState, r: FerryRouteDef, routes: readonly FerryRouteDef[]): boolean {
  const g = fleets(routes).find((x) => x.routes.some((y) => y.id === r.id));
  const out = (x: FerryRouteDef) => !x.ends[0].dock || !x.ends[1].dock;
  const choices = g ? g.routes.filter(out) : [r];
  const busy = new Set(world.ferries!.list.filter((x) => x !== f).map((x) => x.route));
  let next = r;
  for (let i = 1; i <= choices.length; i++) {
    const cand = choices[(f.trips + i) % choices.length];
    if (!busy.has(cand.id) || i === choices.length) {
      next = cand;
      break;
    }
  }
  const cls = clsOf(f, routes);
  const edge = next.ends[1].dock ? 0 : 1;
  const [s0, s1] = stops(next, cls);
  const s = edge ? s1 : s0;
  const dir: 1 | -1 = edge ? -1 : 1;
  // Another of the fleet just in at that edge (within two of her lengths)? Wait.
  const [ex, ez] = routePoint(next, s);
  const L = CONFIG.ferries.classes[cls].length;
  for (const o of world.ferries!.list) {
    if (o === f || o.phase === 'away') continue;
    const ro = routeById(o.route, routes);
    if (!ro) continue;
    ferryPose(ro, o, other, clsOf(o, routes));
    if (Math.hypot(other.x - ex, other.z - ez) < 2 * L) return false;
  }
  Object.assign(f, { route: next.id, s, dir, trips: f.trips + 1 });
  return true;
}

/** One tick (the host's simulation step, core/simulation.ts). */
export function stepFerries(world: WorldState, dt: number, routes: readonly FerryRouteDef[] = FERRY_ROUTES): void {
  if (!routes.length) return;
  world.ferries ??= startFerries(routes);
  const c = CONFIG.ferries;
  for (const f of world.ferries.list) {
    let r = routeById(f.route, routes);
    if (!r) continue;
    const cls = clsOf(f, routes);
    const k = c.classes[cls];
    if (f.phase === 'berthed' || f.phase === 'away') {
      f.t += dt;
      f.v = 0;
      if (f.t < (f.phase === 'berthed' ? c.dwell : c.away)) continue;
      if (f.phase === 'away') {
        if (!comeBackIn(world, f, r, routes)) continue;
        r = routeById(f.route, routes)!;
      }
      f.phase = 'sailing';
      f.t = 0;
      const from = r.ends[f.dir > 0 ? 0 : 1];
      if (from.dock) call(world, r, f, `${f.ship}, leaving ${from.name} for ${r.ends[f.dir > 0 ? 1 : 0].name}.`, cls);
      continue;
    }
    const [s0, s1] = stops(r, cls);
    const toEnd: 0 | 1 = f.dir > 0 ? 1 : 0;
    const to = r.ends[toEnd];
    // Sailing (or holding for a boat in her way).
    stepAside(world, r, f, dt, routes);
    if (blockedAhead(world, r, f, routes)) {
      f.phase = 'holding';
      f.v = Math.max(0, f.v - k.speed * 0.25 * dt);
    } else {
      const left = f.dir > 0 ? s1 - f.s : f.s - s0;
      let want = to.dock ? Math.max(c.minSpeed, Math.min(k.speed, (k.speed * left) / (k.length * c.brake))) : k.speed;
      // The berth taken: she lies off short of it, slowing to a stop there.
      const off = k.length * c.berthWait;
      const waiting = to.dock && left < off + k.length * c.brake && berthTaken(world, r, f, toEnd, routes);
      if (waiting) want = Math.min(want, Math.max(0, (k.speed * (left - off)) / (k.length * c.brake)));
      f.phase = waiting && want < c.minSpeed ? 'holding' : 'sailing';
      f.v += Math.sign(want - f.v) * Math.min(Math.abs(want - f.v), k.speed * 0.08 * dt);
    }
    f.s += f.dir * f.v * dt;
    // At the end of her run: berthed at a terminal (turning round), or away past the edge.
    if ((f.dir > 0 && f.s >= s1) || (f.dir < 0 && f.s <= s0)) {
      f.s = f.dir > 0 ? s1 : s0;
      f.phase = to.dock ? 'berthed' : 'away';
      f.t = 0;
      f.v = 0;
      if (to.dock) call(world, r, f, `${f.ship}, arriving ${to.name}.`, cls);
      f.dir = f.dir > 0 ? -1 : 1;
    }
  }
}

// ── Collision: the ferries near any vessel, posed each tick ──
const posed: { cls: FerryRouteDef['cls']; p: HarbourBoatPose }[] = [];

/** Pose the ferries near a vessel for this tick's collisions (core/simulation.ts, after stepFerries). */
export function poseFerries(world: WorldState, routes: readonly FerryRouteDef[] = FERRY_ROUTES): void {
  posed.length = 0;
  const reach = CONFIG.ferries.stepReach;
  for (const { cls, p } of ferriesInSight(world, routes))
    if (Object.values(world.vessels).some((v) => Math.hypot(v.position[0] - p.x, v.position[2] - p.z) < reach)) posed.push({ cls, p });
}

/** If world point (x, y, z) is inside a ferry posed this tick, the shallowest way out (as a fendered pier's). */
export function ferryContact(x: number, y: number, z: number, out: BlockHit): boolean {
  for (const { cls, p } of posed) if (hullBoxContact(CONFIG.ferries.classes[cls], p, x, y, z, out)) return true;
  return false;
}

export interface FerryInSight {
  f: FerryState;
  /** The route she's on. */
  r: FerryRouteDef;
  /** Her design (class and livery). */
  cls: FerryRouteDef['cls'];
  livery: FerryRouteDef['livery'];
  p: HarbourBoatPose;
}

/** The ferries in sight (not away), each with her route, design and pose: the view and the plotter. */
export function ferriesInSight(world: WorldState, routes: readonly FerryRouteDef[] = FERRY_ROUTES): FerryInSight[] {
  const out: FerryInSight[] = [];
  for (const f of world.ferries?.list ?? []) {
    if (f.phase === 'away') continue;
    const r = routeById(f.route, routes);
    const d = routeById(f.design, routes);
    if (r && d) out.push({ f, r, cls: d.cls, livery: d.livery, p: ferryPose(r, f, { x: 0, z: 0, heading: 0 }, d.cls) });
  }
  return out;
}
