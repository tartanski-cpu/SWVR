/**
 * Fish farm service, step 3: the crew change (owner, 29 Oct 2026: "carry on with farm step 3").
 * A farm (aqua/farmService.ts) calls now and then for its shift to be changed: the day shift
 * waiting on its shore base's quay (the nearest sheltered harbour: Loch Tarsk for the Tarsk farm)
 * to go out to the feed barge, the off-going shift on the barge to come home.
 *
 *   boarding   a boat stopped at the base harbour (alongside its berth, barely moving: the cargo
 *              quick jobs' test, quickPort) takes the waiting shift aboard, one every `boardS`,
 *              each to a seat (her seats, else her rescue seats: the wind farm's seatFor); one
 *              of the off-going shift aboard her steps off onto the quay the same way
 *   at the     a boat stopped at the barge: those going out step off onto the barge, those
 *   barge      waiting there come aboard
 *   done       everyone where they're going: `perPerson` each and the `trip`, and a job toward a
 *              farm service contract; not done by `dueS`, they find another boat
 *
 * Either way round: out first, or the barge first. One person can do it (she only has to lie
 * alongside); crew can help with the lines. Plain data in the farm's call; the figures are
 * drawn by aqua/farmCrewView.ts.
 */
import { CONFIG } from '../config';
import type { Vec3 } from '../core/math';
import type { WorldState } from '../core/world';
import { countContract, earn, portName } from '../career/career';
import { quickPort } from '../cargo/cargo';
import { sayRadio } from '../rescue/rescue';
import { seatFor } from '../transfer/transfer';
import { PORTS } from '../world/archipelago';
import { berthWithId } from '../world/berths';
import { quaySpot } from '../world/startSpot';
import { farmAt, farmName, type FarmCall, type FarmSite } from './farmService';

/** One of the farm's crew on a crew change. */
export interface FarmHand {
  id: string;
  /** Out to the barge (the day shift) or home from it (the off-going shift). */
  going: 'out' | 'back';
  /** On the base's quay, aboard a boat, on the barge, or gone home (off the quay). */
  phase: 'quay' | 'aboard' | 'barge' | 'home';
  vesselId?: string;
  /** Aboard: their seat (vessel axes) and which way it faces (deg). */
  seat?: Vec3;
  seatYaw?: number;
}

/** A deterministic 0..1 from a string. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** A farm's shore base: the sheltered harbour (kind 'harbour') nearest its barge. */
export function farmBase(farmPortId: string): string | null {
  const at = PORTS.find((p) => p.id === farmPortId);
  if (!at) return null;
  let best: string | null = null;
  let bd = Infinity;
  for (const p of PORTS) {
    if (p.kind !== 'harbour' || !p.cargo.berth) continue;
    const d = Math.hypot(p.x - at.x, p.z - at.z);
    if (d < bd) [best, bd] = [p.id, d];
  }
  return best;
}

const words = ['none', 'one', 'two', 'three', 'four', 'five'];
const count = (n: number) => words[n] ?? String(n);

/** Raise a crew change at a farm (farmService.raiseFarmCall). */
export function raiseCrew(world: WorldState, portId: string, site: FarmSite): FarmCall | null {
  const base = farmBase(portId);
  if (!base || !farmAt(portId)) return null;
  const c = CONFIG.aqua.crew;
  const seed = `${portId}:${Math.round(world.time)}`;
  const n = (k: string) => c.people[0] + Math.floor(hash01(seed + k) * (c.people[1] - c.people[0] + 1));
  const out = n('o');
  const back = n('b');
  const hands: FarmHand[] = [
    ...Array.from({ length: out }, (_, i): FarmHand => ({ id: `${portId}-day-${Math.round(world.time)}-${i}`, going: 'out', phase: 'quay' })),
    ...Array.from({ length: back }, (_, i): FarmHand => ({ id: `${portId}-night-${Math.round(world.time)}-${i}`, going: 'back', phase: 'barge' })),
  ];
  site.call = { kind: 'crew', at: world.time, due: world.time + c.dueS, base, hands, nextStep: 0 };
  sayRadio(world, 'info', `${farmName(portId)}: crew change, skipper. ${count(out)[0].toUpperCase()}${count(out).slice(1)} of the day shift on the ${portName(base)} quay to come out to the barge, and ${count(back)} of the night shift here to go home.`);
  return site.call;
}

/** Hands aboard a vessel (of this call). */
function aboardOf(call: FarmCall, vesselId: string): FarmHand[] {
  return (call.hands ?? []).filter((h) => h.phase === 'aboard' && h.vesselId === vesselId);
}

/** Each tick (host), for a farm with a crew change going: boarding and stepping off, one at a time; done or over. */
export function stepCrew(world: WorldState, portId: string, site: FarmSite): void {
  const call = site.call;
  if (call?.kind !== 'crew' || !call.hands || !call.base) return;
  const c = CONFIG.aqua.crew;
  if (world.time >= (call.nextStep ?? 0)) {
    for (const v of Object.values(world.vessels)) {
      const at = quickPort(v)?.id;
      if (at !== call.base && at !== portId) continue;
      const atBase = at === call.base;
      // Off first (the one aboard for here), then on (the one waiting here).
      const off = aboardOf(call, v.id).find((h) => (atBase ? h.going === 'back' : h.going === 'out'));
      const on = call.hands.find((h) => (atBase ? h.going === 'out' && h.phase === 'quay' : h.going === 'back' && h.phase === 'barge'));
      const step = off ?? on;
      if (!step) continue;
      if (step === off) {
        step.phase = atBase ? 'home' : 'barge';
        delete step.seat;
        delete step.vesselId;
      } else {
        const seat = seatFor(v, aboardOf(call, v.id).length);
        step.phase = 'aboard';
        step.vesselId = v.id;
        step.seat = seat.at;
        step.seatYaw = seat.yaw;
      }
      call.nextStep = world.time + c.boardS;
      break;
    }
  }
  const done = call.hands.every((h) => (h.going === 'out' ? h.phase === 'barge' : h.phase === 'home'));
  if (done) {
    site.call = null;
    const n = call.hands.length;
    earn(world, 'farm', { port: portId, base: c.trip + c.perPerson * n, text: `Crew change for ${farmName(portId)}: ${n} people` });
    countContract(world, 'farm', portId);
    sayRadio(world, 'info', `${farmName(portId)}: that's the shift changed. Thanks for the lift, skipper.`);
  } else if (call.due !== undefined && world.time > call.due) {
    // They've found another boat (anyone still aboard yours is let off where they're going).
    site.call = null;
  }
}

/** The crew change's line for the cargo screen and the duty board. */
export function crewLine(call: FarmCall): string {
  const hands = call.hands ?? [];
  const out = hands.filter((h) => h.going === 'out');
  const back = hands.filter((h) => h.going === 'back');
  return `Crew change: ${out.filter((h) => h.phase === 'barge').length}/${out.length} out, ${back.filter((h) => h.phase === 'home').length}/${back.length} home (${portName(call.base)})`;
}

/**
 * Where a hand stands ashore (world x, z and the way they face, deg as a player's yaw): on the
 * base's quay or on the barge, in a row along its berth, a step back from the edge.
 */
export function handSpot(call: FarmCall, farmPortId: string, hand: FarmHand, k: number): { x: number; z: number; yawDeg: number } | null {
  const berthId = `${hand.phase === 'barge' ? farmPortId : call.base}-cargo`;
  const b = berthWithId(berthId);
  if (!b) return null;
  const q = quaySpot(berthId);
  const h = (b.headingDeg * Math.PI) / 180;
  const along = (k - 1) * 0.9;
  return { x: q.x + Math.sin(h) * along, z: q.z - Math.cos(h) * along, yawDeg: q.yawDeg };
}
