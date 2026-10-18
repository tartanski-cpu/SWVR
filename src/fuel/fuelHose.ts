import * as THREE from 'three';
import { gearOf } from '../boats/sims';
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { hullPlan } from '../vessel/layout';
import { canRefuel } from '../vessel/vesselControl';
import { VESSEL_DEFS, type VesselDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { BERTHS, PORTS, type PortDef } from '../world/archipelago';
import { standingHeight } from '../world/geography';

/**
 * Refuelling by hand (owner, Oct 2026): every harbour's fuel pump has a hose, every boat
 * with a diesel a filler (CONFIG.fuelHose).
 *
 *   take    grip the nozzle (in its holster on the pump, lying on the quay, or in a boat's
 *           filler): it's in your hand, and the hose follows it from the pump. It goes no
 *           further than `reach` from the pump (flat): carried further, it stays at the end.
 *   plug    let go of it at a filler (or pull the trigger; desktop: click the filler): it's
 *           in, if the filler is within reach of the pump.
 *   pump    START on the pump: fuel flows as the menu's Refuel does (vesselControl.ts
 *           stepRefuelling: at a fuel berth, slow, until she's full) and is billed when it
 *           stops (career.ts). The gauge counts the litres from START (owner: it read 25.6 L
 *           while the boat had taken 6: it went on from an earlier fill when the nozzle hadn't
 *           been hung back on the pump in between). STOP stops it; so does taking the nozzle out.
 *   stow    hang it back in the holster. Let go anywhere else and it lies on the quay (over
 *           the water, it swings back to the pump).
 *   pulled  a boat plugged in that drifts `pullOut` m past the hose's reach pulls it out:
 *           the nozzle falls on the quay at the end of the hose, and the fuel stops.
 *
 * Plain JSON in the world (`world.fuel`), so the crew see the hose where it is. Intents
 * carry the port (`ref`); the nozzle in a hand is moved by its holder (`hoseMove`, sent
 * every 0.1 s as a hooked crate is). No physics: the hose is drawn only (fuel/fuelView.ts).
 */

export type Vec3 = [number, number, number];

export type NozzleAt =
  | { kind: 'pump' }
  | { kind: 'hand'; player: string; pos: Vec3 }
  | { kind: 'ground'; pos: Vec3 }
  | { kind: 'filler'; vessel: string; side: number };

export interface FuelHose {
  port: string;
  at: NozzleAt;
  /** Litres through the pump since START was last pressed (the gauge). */
  litres: number;
  /** Her tank last tick, while plugged in (to count what flows). */
  lastFuel?: number;
}

export interface FuelState {
  hoses: Record<string, FuelHose>;
}

const FUEL_INTENTS = new Set(['hoseTake', 'hoseMove', 'hoseDrop', 'hosePlug', 'hoseStow', 'pumpStart', 'pumpStop']);
export const isFuelIntent = (control: string): boolean => FUEL_INTENTS.has(control);

/** The harbours with a fuel pump. */
export function fuelPorts(): PortDef[] {
  return PORTS.filter((p) => p.fuel);
}

/**
 * A pump's frame: where it stands (on the quay) and which way its face looks, toward its
 * fuel berth (yaw about y: its +z axis points at the berth).
 */
export function pumpFrame(port: PortDef): { x: number; y: number; z: number; yaw: number } {
  const f = port.fuel!;
  // It looks at where a boat lies at the fuel berth (else the fuelling area's middle).
  const b = BERTHS.find((x) => x.id === `${port.id}-fuel`) ?? f;
  return { x: f.pumpX, y: standingHeight(f.pumpX, f.pumpZ), z: f.pumpZ, yaw: Math.atan2(b.x - f.pumpX, b.z - f.pumpZ) };
}

/** A point given in the pump's axes (CONFIG.fuelHose.pump), in the world. */
export function pumpPoint(port: PortDef, local: readonly number[], out = new THREE.Vector3()): THREE.Vector3 {
  const p = pumpFrame(port);
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  return out.set(p.x + local[0] * c + local[2] * s, p.y + local[1], p.z - local[0] * s + local[2] * c);
}

/**
 * Her fillers (vessel axes): on the side deck, port and starboard, `filler.aft` m aft of her
 * wheelhouse (of amidships without one), `filler.inset` m in from the deck edge. Every boat
 * with a diesel has them: the workboat, the landing craft and every Shipyard design.
 */
export function fillerPoints(def: VesselDef): Vec3[] {
  const cfg = CONFIG.fuelHose.filler;
  const plan = hullPlan(def);
  const wh = def.layout.wheelhouse;
  const z = Math.min(plan.transom - 0.4, Math.max(plan.stem + 1, (wh ? wh.aft : 0) + cfg.aft));
  const half = Math.max(0.2, plan.halfBeam(z) - cfg.inset);
  const y = plan.deckY(z);
  return [
    [-half, y, z],
    [half, y, z],
  ];
}

/** Has she a filler (a diesel)? */
export function hasFiller(v: VesselState): boolean {
  return !!gearOf(v, 'diesel');
}

const q = new THREE.Quaternion();
const tmp = new THREE.Vector3();
const out1 = new THREE.Vector3();

/** One of her fillers in the world. */
export function fillerWorld(v: VesselState, side: number, out = new THREE.Vector3()): THREE.Vector3 {
  const f = fillerPoints(VESSEL_DEFS[v.defId])[side] ?? [0, 0, 0];
  q.fromArray(v.orientation);
  return out.set(f[0], f[1], f[2]).applyQuaternion(q).add(tmp.fromArray(v.position));
}

/** This pump's hose (made the first time it's wanted). */
export function hoseOf(world: WorldState, portId: string): FuelHose {
  const st = (world.fuel ??= { hoses: {} });
  return (st.hoses[portId] ??= { port: portId, at: { kind: 'pump' }, litres: 0 });
}

/** Where the nozzle is now (world). */
export function nozzleWorld(world: WorldState, hose: FuelHose, out = new THREE.Vector3()): THREE.Vector3 {
  const port = PORTS.find((p) => p.id === hose.port)!;
  const at = hose.at;
  if (at.kind === 'hand' || at.kind === 'ground') return out.fromArray(at.pos);
  if (at.kind === 'filler') {
    const v = world.vessels[at.vessel];
    if (v) return fillerWorld(v, at.side, out);
  }
  return pumpPoint(port, CONFIG.fuelHose.pump.holster, out);
}

/** Flat distance from the pump's outlet. */
function fromOutlet(port: PortDef, x: number, z: number): number {
  const o = pumpPoint(port, CONFIG.fuelHose.pump.outlet, out1);
  return Math.hypot(x - o.x, z - o.z);
}

/** A point brought back within the hose's reach of the outlet (flat), its height kept. */
function withinReach(port: PortDef, p: readonly number[]): Vec3 {
  const o = pumpPoint(port, CONFIG.fuelHose.pump.outlet, out1);
  const dx = p[0] - o.x;
  const dz = p[2] - o.z;
  const d = Math.hypot(dx, dz);
  const r = CONFIG.fuelHose.reach;
  return d <= r ? [p[0], p[1], p[2]] : [o.x + (dx / d) * r, p[1], o.z + (dz / d) * r];
}

/** The nozzle let go at `p`: on the quay, or (over the water) back to the pump. */
function dropAt(hose: FuelHose, port: PortDef, p: readonly number[]): void {
  const [x, , z] = withinReach(port, p);
  const ground = standingHeight(x, z);
  hose.at = ground > 0.2 ? { kind: 'ground', pos: [x, ground + 0.05, z] } : { kind: 'pump' };
}

/** Stop the fuel to a boat the hose comes out of. */
function unplug(world: WorldState, hose: FuelHose): void {
  if (hose.at.kind !== 'filler') return;
  const v = world.vessels[hose.at.vessel];
  if (v) v.refuelling = false;
  hose.lastFuel = undefined;
}

export function applyFuelIntent(world: WorldState, intent: Intent): void {
  const port = PORTS.find((p) => p.id === intent.ref && p.fuel);
  if (!port) return;
  const hose = hoseOf(world, port.id);
  const at = hose.at;
  const mine = at.kind === 'hand' && at.player === intent.playerId;
  const a = intent.args ?? [];
  switch (intent.control) {
    case 'hoseTake': {
      // Someone else has it (and is still here): no.
      if (at.kind === 'hand' && !mine && world.players[at.player]) return;
      const pos = nozzleWorld(world, hose);
      if (at.kind === 'filler') unplug(world, hose);
      if (at.kind === 'pump') hose.litres = 0; // off the pump: the gauge back to nought
      hose.at = { kind: 'hand', player: intent.playerId, pos: [pos.x, pos.y, pos.z] };
      return;
    }
    case 'hoseMove':
      if (mine && a.length >= 3) hose.at = { kind: 'hand', player: intent.playerId, pos: withinReach(port, a) };
      return;
    case 'hoseDrop':
      if (mine) dropAt(hose, port, a.length >= 3 ? a : (at as { pos: Vec3 }).pos);
      return;
    case 'hosePlug': {
      const v = world.vessels[intent.targetId];
      const side = a[0] ?? 0;
      if (!mine || !v || !hasFiller(v)) return;
      const f = fillerWorld(v, side);
      if (fromOutlet(port, f.x, f.z) > CONFIG.fuelHose.reach + 0.5) return;
      hose.at = { kind: 'filler', vessel: v.id, side };
      hose.lastFuel = v.engine.fuelL;
      return;
    }
    case 'hoseStow':
      if (mine || at.kind === 'ground') hose.at = { kind: 'pump' };
      return;
    case 'pumpStart': {
      if (at.kind !== 'filler') return;
      const v = world.vessels[at.vessel];
      const tank = v && gearOf(v, 'diesel')?.engine.fuel.tankL;
      if (!v || !tank || !canRefuel(v) || v.engine.fuelL >= tank) return;
      v.refuelling = true;
      // A new fill: the gauge from nought, so it shows what this START puts in her.
      hose.litres = 0;
      hose.lastFuel = v.engine.fuelL;
      return;
    }
    case 'pumpStop':
      if (at.kind === 'filler') {
        const v = world.vessels[at.vessel];
        if (v) v.refuelling = false;
      }
      return;
  }
}

/** Each tick, after the boats: count the fuel through each hose; a boat drifting off pulls hers out. */
export function stepFuelHoses(world: WorldState): void {
  for (const hose of Object.values(world.fuel?.hoses ?? {})) {
    const at = hose.at;
    if (at.kind === 'hand' && !world.players[at.player]) {
      // Its holder has gone (left the game): it drops where it was.
      dropAt(hose, PORTS.find((p) => p.id === hose.port)!, at.pos);
      continue;
    }
    if (at.kind !== 'filler') continue;
    const port = PORTS.find((p) => p.id === hose.port)!;
    const v = world.vessels[at.vessel];
    if (!v) {
      hose.at = { kind: 'pump' };
      continue;
    }
    const f = fillerWorld(v, at.side);
    if (fromOutlet(port, f.x, f.z) > CONFIG.fuelHose.reach + CONFIG.fuelHose.pullOut) {
      unplug(world, hose);
      dropAt(hose, port, [f.x, f.y, f.z]);
      continue;
    }
    if (v.refuelling && hose.lastFuel !== undefined) hose.litres += Math.max(0, v.engine.fuelL - hose.lastFuel);
    hose.lastFuel = v.engine.fuelL;
  }
}

/** What the pump's gauge shows: litres and their price this fill, and the tank of the boat it's in. */
export function gaugeOf(world: WorldState, portId: string): { litres: number; price: number; pumping: boolean; tank: { litres: number; size: number } | null } {
  const hose = world.fuel?.hoses[portId];
  const litres = hose?.litres ?? 0;
  const at = hose?.at;
  const v = at?.kind === 'filler' ? world.vessels[at.vessel] : undefined;
  const size = v && gearOf(v, 'diesel')?.engine.fuel.tankL;
  return {
    litres,
    price: litres * CONFIG.career.costs.fuelPerL,
    pumping: !!v?.refuelling,
    tank: v && size ? { litres: v.engine.fuelL, size } : null,
  };
}
