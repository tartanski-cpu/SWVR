/**
 * The fish hold at work (owner, Oct 2026: "to have a fish hold"; modules/fishHold): plain
 * shared state (VesselState.hold), stepped by the host.
 *
 *   in      the trawl's boxes go down into the hold while there's room (stowInHold, from
 *           fishing.ts), each one's species kept; full, they're set on deck as before.
 *   out     the LIFT button on the coaming ('hold.lift') lifts the last box stowed back up
 *           onto the deck beside the hatch, if the lid is open and there's room on deck; it's
 *           then carried ashore and sold as any box (cargo.ts).
 *   weight  each box bears on her where it stands in the hold (holdPayload: added to her
 *           payload, simulation.ts), low down: a full hold sinks her by its weight and makes
 *           her stiffer, as a real one does.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { aboard, footprint, deckHeightAt, type CargoItem } from '../cargo/cargo';
import { deckSpot } from '../cargo/deck';
import { gearOf } from '../boats/sims';
import type { GearFacts } from '../modular/module';
import type { VesselState } from '../vessel/vesselState';

const FISH_KIND = () => CONFIG.cargo.kinds.findIndex((k) => k.name === 'Fish box');

/** Her fish hold, if she has one. */
export function holdOf(v: { defId: string }): GearFacts['fishHold'] | null {
  return gearOf(v, 'fishHold');
}

/** Put a box of the catch down into her hold, if she has one with room: true if it went. */
export function stowInHold(v: VesselState, species: string | undefined): boolean {
  const hold = holdOf(v);
  if (!hold) return false;
  const boxes = (v.hold ??= { boxes: [] }).boxes;
  if (boxes.length >= hold.slots.length) return false;
  boxes.push(species ?? '');
  return true;
}

/** Is her hold full (or has she none)? */
export function holdFull(v: VesselState): boolean {
  const hold = holdOf(v);
  return !hold || (v.hold?.boxes.length ?? 0) >= hold.slots.length;
}

/** The boxes in her hold as point masses where they stand (her axes), for her payload. */
export function holdPayload(v: VesselState): { mass: number; pos: THREE.Vector3 }[] {
  const hold = holdOf(v);
  const n = v.hold?.boxes.length ?? 0;
  if (!hold || !n) return [];
  const k = CONFIG.cargo.kinds[FISH_KIND()];
  return hold.slots.slice(0, n).map(([x, y, z]) => ({ mass: k.mass, pos: new THREE.Vector3(x, y + k.size[1] / 2, z) }));
}

/** One tick: a press of LIFT lifts a box out onto the deck by the hatch (the lid open, room on deck). */
export function stepHold(world: WorldState): void {
  for (const v of Object.values(world.vessels)) {
    if (!v.controls.holdLift) continue;
    v.controls.holdLift = 0;
    const hold = holdOf(v);
    const boxes = v.hold?.boxes;
    if (!hold || !boxes?.length || !v.controls.holdHatch) continue;
    const kind = FISH_KIND();
    const k = CONFIG.cargo.kinds[kind];
    const proto = { kind, mass: k.mass } as CargoItem;
    const others = aboard(world, v.id).map((c) => {
      const at = c.at as Extract<CargoItem['at'], { vessel: string }>;
      const fp = footprint(c);
      return { x: at.pos[0], z: at.pos[2], r: Math.max(fp.hx, fp.hz) };
    });
    // Beside the hatch, to port (the side the lid doesn't swing to) or wherever's nearest.
    const [hx, , hz] = hold.hatch.centre;
    const spot = deckSpot(v.defId, footprint(proto), hold.hatch.x0 - 0.6, hz, others) ?? deckSpot(v.defId, footprint(proto), hx, hz, others);
    if (!spot) continue;
    const species = boxes.pop()!;
    const f = world.fishing;
    const seq = f ? (f.seq += 1) : Math.floor(world.time * 1000);
    const item: CargoItem = {
      id: `fish-${seq}-${Math.floor(world.time)}-hold`,
      kind,
      mass: k.mass,
      from: 'trawl',
      to: 'any',
      ...(species ? { species } : {}),
      at: { vessel: v.id, pos: [spot.x, deckHeightAt(v.defId, spot.z), spot.z], yaw: 0, vel: [0, 0], lashed: false },
    };
    world.cargo[item.id] = item;
  }
}
