/**
 * Log salvage: a side mission (owner request). Now and then timber washes up on a beach;
 * the crew pull it off with the towline and tow it into any harbour, where the yard buys
 * it. Plain shared state (WorldState.salvage), stepped by the host like the tows.
 *
 *   beaches   spots found once from the terrain (beachSpots): just above the waterline,
 *             a gentle shore, with water deep enough for the boat within reach of the line
 *             (`reachDepth` m deep, `reachOut` m off), and away from the ports.
 *   logs      wash up every `every` s (at most `max` about), each on a free beach spot
 *             well away from the boat (nobody sees it arrive), with a VHF notice saying
 *             where. On the chartplotter as LOG marks.
 *   pulling   the towline goes on a log within `CONFIG.salvage.line.attach` m of our post
 *             (the hook, or the menu's Make fast; tow.ts). A log is a point mass:
 *               beached: it doesn't move until the line's pull beats static friction
 *                        (mu_s m g); sliding, a = (T - mu_k m g) / m along the line.
 *               afloat:  F = T u - (cL + cQ |v|) v (water drag, as for debris), and it
 *                        drifts with the wind like debris when it's off the line.
 *             It floats once the ground under it is `floatDepth` m below the surface (a
 *             log ~0.6 m across floats in half that), and grounds again if it drifts back.
 *   sold      afloat, slow inside any port for CONFIG.tow.deliverTime s: the yard takes it
 *             (radio, `sold` counted). Beached logs nobody wants go after `expire` s if
 *             we're far off.
 */
import { gearOf } from '../boats/sims';
import { CONFIG } from '../config';
import { driftVelocity } from '../world/drift';

const driftV = { x: 0, z: 0 };
import { homeVessel, type WorldState } from '../core/world';

import { sayRadio } from '../rescue/rescue';
import { PORTS } from '../world/archipelago';
import { REGIONS } from '../world/regions';
import { earn, portName } from '../career/career';
import { groundHeight } from '../world/terrain';

export interface SalvageLog {
  id: string;
  x: number;
  z: number;
  /** Lying along this direction (rad, about y; 0 = along z). */
  yaw: number;
  /** Length (m). */
  len: number;
  afloat: boolean;
  /** Velocity (world x, z; m/s). */
  vel: [number, number];
  /** World time it washed up, and seconds it has lain slow in a port. */
  at: number;
  inPort: number;
}

export interface SalvageState {
  logs: SalvageLog[];
  seq: number;
  nextAt: number | null;
  sold: number;
  /** Logs wash up by themselves (the game); off, only the debug intent places them (tests). */
  spawn: boolean;
}

export function createSalvageState(spawn = false): SalvageState {
  return { logs: [], seq: 0, nextAt: null, sold: 0, spawn };
}

function rand(s: SalvageState): number {
  const n = ++s.seq;
  const v = Math.sin(n * 91.345 + 3.17) * 43758.5453;
  return v - Math.floor(v);
}

export interface BeachSpot {
  x: number;
  z: number;
  /** Along the shore (rad), and the island's name and which side of it ("north"...). */
  yaw: number;
  island: string;
  side: string;
}

let beaches: BeachSpot[] | null = null;
const SIDES = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/**
 * Where logs can wash up (computed once): march out from each island's centre along
 * bearings to the shoreline; keep spots just above the water on a gentle slope, with
 * deep enough water within the line's reach, away from the ports.
 */
export function beachSpots(): BeachSpot[] {
  if (beaches) return beaches;
  const c = CONFIG.salvage;
  const out: BeachSpot[] = [];
  // Logs wash up where there's a port to sell them at: a region with no ports yet (a
  // milestone-2 stub) gets none. (Jobs per region: milestone 4.)
  const islands = REGIONS.filter((r) => r.ports.length > 0).flatMap((r) => r.islands);
  for (const isl of islands) {
    if (isl.radius < 40) continue; // rocks: no beaches
    for (let deg = 0; deg < 360; deg += 4) {
      const a = (deg * Math.PI) / 180;
      const dx = Math.sin(a);
      const dz = -Math.cos(a); // bearing: 0 = north (-z)
      let shore = -1;
      for (let r = isl.radius * 0.3; r < isl.radius * 2.2; r += 3) {
        if (groundHeight(isl.x + dx * r, isl.z + dz * r) < 0) {
          shore = r;
          break;
        }
      }
      if (shore < 0) continue;
      const at = (r: number) => groundHeight(isl.x + dx * r, isl.z + dz * r);
      const r0 = shore - 3;
      const g = at(r0);
      if (g < 0.05 || g > 1.0) continue; // just above the water
      if (at(shore - 15) > 3) continue; // a cliff, not a beach
      if (-at(shore + c.reachOut) < c.reachDepth) continue; // too shoal to come in
      const x = isl.x + dx * r0;
      const z = isl.z + dz * r0;
      if (PORTS.some((p) => Math.hypot(p.x - x, p.z - z) < c.portClear)) continue;
      out.push({ x, z, yaw: a + Math.PI / 2, island: isl.name, side: SIDES[Math.round(deg / 45) % 8] });
    }
  }
  beaches = out;
  return out;
}

/** Wash a log up on a beach spot (the first free one from a hashed start, far from `far`). */
export function washUp(world: WorldState, nearX?: number, nearZ?: number): SalvageLog | null {
  const s = (world.salvage ??= createSalvageState());
  const spots = beachSpots();
  if (!spots.length) return null;
  const c = CONFIG.salvage;
  const boat = homeVessel(world);
  const start = Math.floor(rand(s) * spots.length);
  for (let k = 0; k < spots.length; k++) {
    const b = spots[(start + k * 7) % spots.length];
    const taken = s.logs.some((l) => Math.hypot(l.x - b.x, l.z - b.z) < 60);
    if (taken) continue;
    if (nearX !== undefined && nearZ !== undefined) {
      if (Math.hypot(b.x - nearX, b.z - nearZ) > c.debugNear) continue;
    } else if (boat && Math.hypot(b.x - boat.position[0], b.z - boat.position[2]) < c.minDistance) continue;
    const len = c.length[0] + rand(s) * (c.length[1] - c.length[0]);
    const log: SalvageLog = { id: `log${s.seq}`, x: b.x, z: b.z, yaw: b.yaw + (rand(s) - 0.5) * 0.6, len, afloat: false, vel: [0, 0], at: world.time, inPort: 0 };
    s.logs.push(log);
    return log;
  }
  return null;
}

/** Is a log on our towline? */
function onLine(world: WorldState, log: SalvageLog): boolean {
  return world.tow?.line?.target === `l:${log.id}`;
}

/** The log a towline key names. */
export function logOf(world: WorldState, key: string): SalvageLog | undefined {
  return key.startsWith('l:') ? world.salvage?.logs.find((l) => l.id === key.slice(2)) : undefined;
}

/**
 * One tick for one log: the line's pull (tension T along unit vector (ux, uz) toward our
 * post; T = 0 off the line), friction or water drag, and drift. See the header.
 */
export function stepLog(world: WorldState, log: SalvageLog, T: number, ux: number, uz: number, dt: number): void {
  const c = CONFIG.salvage;
  const g = 9.81;
  const v = log.vel;
  const ground = groundHeight(log.x, log.z);
  log.afloat = ground < -c.floatDepth;
  if (!log.afloat) {
    // On the beach: stuck until the pull beats static friction, then sliding.
    const sp = Math.hypot(v[0], v[1]);
    if (sp < 0.01 && T < c.frictionStatic * c.mass * g) {
      v[0] = v[1] = 0;
    } else {
      const fk = c.frictionKinetic * c.mass * g;
      v[0] += ((T * ux) / c.mass) * dt;
      v[1] += ((T * uz) / c.mass) * dt;
      const s2 = Math.hypot(v[0], v[1]);
      const slow = Math.min(s2, (fk / c.mass) * dt);
      if (s2 > 0) {
        v[0] -= (v[0] / s2) * slow;
        v[1] -= (v[1] / s2) * slow;
      }
    }
  } else {
    const sp = Math.hypot(v[0], v[1]);
    const drag = c.dragLinear + c.dragQuad * sp;
    v[0] += ((T * ux - drag * v[0]) / c.mass) * dt;
    v[1] += ((T * uz - drag * v[1]) / c.mass) * dt;
    if (T === 0) {
      // Off the line: it drifts like the debris (world/drift.ts).
      const dv = driftVelocity(world.environment, log.x, log.z, driftV);
      log.x += dv.x * dt;
      log.z += dv.z * dt;
    }
  }
  log.x += v[0] * dt;
  log.z += v[1] * dt;
  // Dragged by one end, it swings in line with the pull.
  if (T > 0 && Math.hypot(v[0], v[1]) > 0.05) {
    const want = Math.atan2(ux, uz);
    let d = want - log.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // A log is the same either way round: turn the short way to either end.
    if (Math.abs(d) > Math.PI / 2) d -= Math.sign(d) * Math.PI;
    log.yaw += d * Math.min(1, dt * 0.8);
  }
}

/** One tick: logs washing up, logs off the line, sales, old logs going. */
export function stepSalvage(world: WorldState, dt: number): void {
  const s = (world.salvage ??= createSalvageState());
  const c = CONFIG.salvage;
  const boat = homeVessel(world);
  // Timber is salvaged with a tow point (M7: a boat without one gets no calls about it).
  if (boat && !gearOf(boat, 'towPoint')) return;
  if (s.nextAt === null) s.nextAt = world.time + c.firstAfter;
  if (s.spawn && world.time >= s.nextAt) {
    s.nextAt = world.time + c.every[0] + rand(s) * (c.every[1] - c.every[0]);
    if (s.logs.length < c.max) {
      const log = washUp(world);
      if (log) {
        const b = beachSpots().find((o) => Math.hypot(o.x - log.x, o.z - log.z) < 1);
        sayRadio(world, 'info', `All stations: timber reported washed up on the ${b?.side ?? ''} shore of ${b?.island ?? 'an island'}. Salvage welcome; the harbours will buy it.`);
      }
    }
  }
  for (const log of [...s.logs]) {
    // On the line, tow.ts steps it with the line's pull.
    if (!onLine(world, log)) stepLog(world, log, 0, 0, 0, dt);
    // Sold: afloat, slow in a port.
    const port = PORTS.find((p) => Math.hypot(p.x - log.x, p.z - log.z) < CONFIG.tow.deliverRadius);
    log.inPort = port && log.afloat && Math.hypot(log.vel[0], log.vel[1]) < CONFIG.tow.deliverSpeed ? log.inPort + dt : 0;
    if (port && log.inPort >= CONFIG.tow.deliverTime) {
      if (onLine(world, log)) world.tow!.line = null;
      s.logs = s.logs.filter((l) => l !== log);
      s.sold += 1;
      earn(world, 'log', { port: port.id, text: `Salvage log sold at ${portName(port.id)}` });
      sayRadio(world, 'info', `${port.name.replace(' (anchorage)', '')} harbour: that's good timber, skipper - the yard will take it. ${s.sold} ${s.sold === 1 ? 'log' : 'logs'} salvaged so far.`);
      continue;
    }
    // Nobody came for it: the tide takes it back.
    if (!log.afloat && boat && world.time - log.at > c.expire && Math.hypot(boat.position[0] - log.x, boat.position[2] - log.z) > c.minDistance) {
      s.logs = s.logs.filter((l) => l !== log);
    }
  }
}

/** Debug intents (targetId: environment): salvageDebugNear (a log on the nearest beach). */
export function applySalvageIntent(world: WorldState, playerId: string, control: string): void {
  if (control !== 'salvageDebugNear') return;
  const p = world.players[playerId];
  const v = p?.aboardVesselId ? world.vessels[p.aboardVesselId] : Object.values(world.vessels)[0];
  if (!v) return;
  // The nearest free beach spot.
  const spots = [...beachSpots()].sort((a, b) => Math.hypot(a.x - v.position[0], a.z - v.position[2]) - Math.hypot(b.x - v.position[0], b.z - v.position[2]));
  const free = spots.find((b) => !(world.salvage?.logs ?? []).some((l) => Math.hypot(l.x - b.x, l.z - b.z) < 60));
  if (free) washUp(world, free.x, free.z);
}

export function isSalvageIntent(control: string): boolean {
  return control.startsWith('salvage');
}

/** One line for displays while a log is on the line, else null. */
export function salvageStatus(world: WorldState): string | null {
  const key = world.tow?.line?.target;
  const log = key ? logOf(world, key) : undefined;
  if (!log) return null;
  const kN = ((world.tow?.line?.tension ?? 0) / 1000).toFixed(1);
  return log.afloat ? `Log afloat: tow it into any harbour (line ${kN} kN)` : `Log on the beach: pull it off - ease ahead, more power (line ${kN} kN)`;
}
