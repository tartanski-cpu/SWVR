/**
 * Fish farm service, milestone 2: the net check (owner, 29 Oct 2026: "carry on with farm step
 * 2"). A farm (aqua/farmService.ts) calls now and then for its nets to be looked over:
 *
 *   checking  bring her alongside each cage ring in turn (her hull within `reachM` of its float)
 *             and hold her there, barely moving, `holdS` seconds: the ring's checked (its flag
 *             on the ring goes from yellow to green; each ring pays `payPerRing`). Crew aboard
 *             looking over the side check it quicker: each one after the first adds `crewRate`.
 *   a hole    one ring may have a torn net (`holeChance`), found when that ring's checked: its
 *             flag goes red. Crates at the barge's cargo screen are then net patches: carry one
 *             (or lower it by crane) and set it down on the ring by the red flag, within
 *             `patchReachM`: mended (`mendPay`). One person can do it, holding her alongside
 *             with the throttle; easier with one on the helm and one with the patch.
 *   morts     a ring may have a bag of dead fish on its walkway (`mortChance`), there from the
 *             call: lift it aboard (two hands, or the crane) and set it down on the barge
 *             (`mortPay`).
 *   done      every ring checked, the hole mended, the morts landed: `bonus`, and it counts as
 *             a job toward a farm service contract. Not done by `dueS`: the farm's own crew
 *             see to it.
 *
 * Plain data in the farm's call (FarmCall), stepped by the host; the flags are drawn by
 * aqua/aquaView.ts. A ring's bag and flag are on its outer float pipe where a boat stopped
 * against it has them within arm's reach (ringPoint).
 */
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { countContract, earn } from '../career/career';
import { sayRadio } from '../rescue/rescue';
import { distanceToHull } from '../rescue/recovery';
import { ringCentres } from '../world/farms';
import type { FarmDef } from '../world/defs';
import type { CargoItem } from '../cargo/cargo';
import { farmAt, farmName, type FarmCall, type FarmSite } from './farmService';

/** A cage's number for the radio (1 up, row by row). */
const cageNo = (i: number) => i + 1;

/**
 * The point on a ring a bag or a hole is at (world x, z): on its outer float pipe
 * (`onRingOut` m beyond its radius: worldView.ts draws the pipe at the radius and the outer
 * one 0.9 m beyond it, the walkway between), on the diagonal facing away from the farm's
 * middle. A boat stops against a ring at its collision square (world/farms.ts, 0.8 of the
 * radius each side), whose corners reach out past the outer pipe on the diagonals: there the
 * pipe is within arm's reach of her gunwale.
 */
export function ringPoint(farm: FarmDef, ring: number): [number, number] {
  const rings = ringCentres(farm);
  const [cx, cz] = rings[ring];
  const mx = rings.reduce((s, r) => s + r[0], 0) / rings.length;
  const mz = rings.reduce((s, r) => s + r[1], 0) / rings.length;
  // The farm's axes (world/farms.ts): along its rows, and across them.
  const a = (farm.yawDeg * Math.PI) / 180;
  const along = [Math.sin(a), -Math.cos(a)];
  const across = [Math.cos(a), Math.sin(a)];
  const oa = Math.sign((cx - mx) * along[0] + (cz - mz) * along[1]) || 1;
  const oc = Math.sign((cx - mx) * across[0] + (cz - mz) * across[1]) || 1;
  const r = farm.ringRadius + CONFIG.aqua.check.onRingOut;
  const k = r / Math.SQRT2;
  return [cx + (oa * along[0] + oc * across[0]) * k, cz + (oa * along[1] + oc * across[1]) * k];
}

/** A deterministic 0..1 from a string. */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

/** The cargo kind index of a name. */
function kindIndex(name: string): number {
  return CONFIG.cargo.kinds.findIndex((k) => k.name === name);
}

/** Raise a net check at a farm (farmService.raiseFarmCall): the rings to check, a hidden hole maybe, a bag of morts maybe. */
export function raiseCheck(world: WorldState, portId: string, site: FarmSite): FarmCall | null {
  const at = farmAt(portId);
  if (!at) return null;
  const c = CONFIG.aqua.check;
  const n = ringCentres(at.farm).length;
  const seed = `${portId}:${Math.round(world.time)}`;
  const call: FarmCall = { kind: 'check', at: world.time, due: world.time + c.dueS, checked: Array.from({ length: n }, () => false), hold: 0, holdRing: -1 };
  if (hash01(seed + 'h') < c.holeChance) call.hole = { ring: Math.floor(hash01(seed + 'hr') * n), found: false, mended: false };
  let mortText = '';
  if (hash01(seed + 'm') < c.mortChance) {
    const ring = Math.floor(hash01(seed + 'mr') * n);
    const kind = kindIndex('Mort bag');
    const [x, z] = ringPoint(at.farm, ring);
    const id = `cargo-${++world.cargoSeq}`;
    world.cargo[id] = { id, kind, mass: CONFIG.cargo.kinds[kind].mass, from: portId, to: portId, at: { ground: [x, c.ringTop, z], yaw: 0 } };
    call.mort = { ring, id, landed: false };
    mortText = ` And there's a bag of morts on the walkway of cage ${cageNo(ring)}: bring it back to the barge.`;
  }
  site.call = call;
  sayRadio(world, 'info', `${farmName(portId)}: net check wanted. Work along the cages and hold her alongside each ring a few seconds so we can see the nets, ${n} of them.${mortText}`);
  return call;
}

/** How many players are aboard a vessel. */
function crewAboard(world: WorldState, vesselId: string): number {
  let n = 0;
  for (const p of Object.values(world.players)) if (p.aboardVesselId === vesselId) n++;
  return n;
}

/** The unchecked ring a vessel is alongside (hull within `reachM` of its float), barely moving: its index, or -1. */
function ringAlongside(call: FarmCall, x: (i: number) => number): number {
  for (let i = 0; i < (call.checked?.length ?? 0); i++) if (!call.checked![i] && x(i) < CONFIG.aqua.check.reachM) return i;
  return -1;
}

/** Each tick (host), for a farm with a net check going: the hold at a ring, the rings checked, done or over. */
export function stepCheck(world: WorldState, portId: string, site: FarmSite, dt: number): void {
  const call = site.call;
  const at = farmAt(portId);
  if (call?.kind !== 'check' || !at) return;
  const c = CONFIG.aqua.check;
  const rings = ringCentres(at.farm);
  // A boat with someone aboard, alongside an unchecked ring, barely moving: the hold there.
  let ring = -1;
  let rate = 0;
  for (const v of Object.values(world.vessels)) {
    const crew = crewAboard(world, v.id);
    if (!crew || Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) > c.maxSpeed) continue;
    const i = ringAlongside(call, (k) => distanceToHull(v, rings[k][0], rings[k][1]) - at.farm.ringRadius);
    if (i >= 0) {
      ring = i;
      rate = 1 + c.crewRate * (crew - 1);
      break;
    }
  }
  if (ring < 0) {
    call.hold = 0;
    call.holdRing = -1;
  } else {
    if (call.holdRing !== ring) [call.holdRing, call.hold] = [ring, 0];
    call.hold = (call.hold ?? 0) + dt * rate;
    if (call.hold >= c.holdS) {
      call.checked![ring] = true;
      call.hold = 0;
      call.holdRing = -1;
      earn(world, 'farm', { port: portId, base: c.payPerRing, text: `Net check, ${farmName(portId)}: cage ${cageNo(ring)}` });
      if (call.hole && call.hole.ring === ring && !call.hole.found) {
        call.hole.found = true;
        sayRadio(world, 'info', `${farmName(portId)}: there's a hole in the net on cage ${cageNo(ring)}! A net patch from the barge, quick, and set it on the ring by the red flag before the fish find it.`);
      }
    }
  }
  if (checkDone(call)) {
    site.call = null;
    earn(world, 'farm', { port: portId, base: c.bonus, text: `Net check done for ${farmName(portId)}` });
    countContract(world, 'farm', portId);
    sayRadio(world, 'info', `${farmName(portId)}: nets all checked${call.hole ? ' and mended' : ''}. Thanks, skipper: that's paid.`);
  } else if (call.due !== undefined && world.time > call.due) {
    site.call = null;
    // The farm's own crew see to it; the morts with them.
    if (call.mort && !call.mort.landed) {
      const m = world.cargo[call.mort.id];
      if (m && 'ground' in m.at) delete world.cargo[call.mort.id];
    }
  }
}

/** Every ring checked, the hole (if any) mended, the morts (if any) landed. */
export function checkDone(call: FarmCall): boolean {
  return !!call.checked?.every(Boolean) && (!call.hole || call.hole.mended) && (!call.mort || call.mort.landed);
}

/** Is this item a net patch? */
export function isNetPatch(item: { kind: number }): boolean {
  return CONFIG.cargo.kinds[item.kind]?.name === 'Net patch';
}

/**
 * A net patch set down (by hand or crane) at (x, z): by a found, unmended hole (within
 * `patchReachM` of its red flag), it mends it and is used up. Returns true if it did.
 */
export function patchNet(world: WorldState, item: CargoItem, x: number, z: number): boolean {
  if (!isNetPatch(item)) return false;
  for (const [id, site] of Object.entries(world.aqua?.sites ?? {})) {
    const call = site.call;
    const at = farmAt(id);
    if (call?.kind !== 'check' || !call.hole?.found || call.hole.mended || !at) continue;
    const [hx, hz] = ringPoint(at.farm, call.hole.ring);
    if (Math.hypot(x - hx, z - hz) > CONFIG.aqua.check.patchReachM) continue;
    delete world.cargo[item.id];
    call.hole.mended = true;
    earn(world, 'farm', { port: id, base: CONFIG.aqua.check.mendPay, text: `Net mended at ${farmName(id)}, cage ${cageNo(call.hole.ring)}` });
    sayRadio(world, 'info', `${farmName(id)}: patch is on, the net's whole again. Good work.`);
    return true;
  }
  return false;
}

/** A farm's bag of morts landed on its barge (cargo.ts retire): paid, and the check knows. Returns true if it was one. */
export function mortLanded(world: WorldState, item: CargoItem, at: string): boolean {
  if (CONFIG.cargo.kinds[item.kind]?.name !== 'Mort bag' || item.from !== at) return false;
  const call = world.aqua?.sites[at]?.call;
  if (call?.kind === 'check' && call.mort?.id === item.id) call.mort.landed = true;
  earn(world, 'farm', { port: at, base: CONFIG.aqua.check.mortPay, text: `Morts brought in to ${farmName(at)}` });
  return true;
}

/** The check's line for the cargo screen and the duty board: rings checked, the hole, the morts. */
export function checkLine(call: FarmCall): string {
  const n = call.checked?.length ?? 0;
  const done = call.checked?.filter(Boolean).length ?? 0;
  const parts = [`Net check: ${done}/${n} cages`];
  if (call.hole?.found && !call.hole.mended) parts.push(`hole at cage ${cageNo(call.hole.ring)} (Crates are net patches)`);
  if (call.mort && !call.mort.landed) parts.push(`morts on cage ${cageNo(call.mort.ring)}`);
  return parts.join(' · ');
}
