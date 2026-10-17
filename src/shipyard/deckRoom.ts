/**
 * What her deck takes (owner, Oct 2026: "the number of cargo units that the deck space has
 * got is missing"): how many of the game's standard crates, and how many pots, stand on her
 * open deck at once, by the game's own placing rule (cargo/deck.ts `deckCapacity`: inside
 * the bulwarks, clear of the wheelhouse, the narrow bow and her deck gear). One deep: the
 * game doesn't stack cargo.
 *
 * Crates are also limited by what she can carry (her payload, `cargo.maxPayloadKg`): a big
 * deck on a light boat holds fewer than it has room for.
 */
import { deckCapacity } from '../cargo/deck';
import { CONFIG } from '../config';
import { VESSEL_DEFS, type VesselDef } from '../vessel/vesselDef';
import { useDesign } from '../boats/sims';
import { FIELDS, type ShipDesign } from './design';

export interface DeckRoom {
  /** Crates she takes: room on deck, within her payload. */
  crates: number;
  /** Crates there's room for on deck (whatever they weigh). */
  crateRoom: number;
  /** Pots there's room for on deck. */
  pots: number;
  /** What she can carry (kg). */
  payloadKg: number;
}

const kind = (name: string) => CONFIG.cargo.kinds.find((k) => k.name === name)!;
/** An item's plan footprint (half sizes across and along), as cargo.ts `footprint`. */
const half = (name: string) => ({ hx: kind(name).size[0] / 2, hz: kind(name).size[2] / 2 });

const rooms = new WeakMap<VesselDef, DeckRoom>();

/** Her deck room, for the design the 'design' vessel type is now (boats/sims.ts `useDesign`). */
export function deckRoom(): DeckRoom {
  const def = VESSEL_DEFS.design;
  let r = rooms.get(def);
  if (!r) {
    const crateRoom = deckCapacity('design', half('Crate'));
    const payloadKg = def.cargo.maxPayloadKg;
    r = { crateRoom, crates: Math.min(crateRoom, Math.floor(payloadKg / kind('Crate').mass)), pots: deckCapacity('design', half('Pot')), payloadKg };
    rooms.set(def, r);
  }
  return r;
}

/**
 * Size her for the deck the brief asks for (owner, Oct 2026: set 30 crates, start from a
 * type, and she should come with room for 30): her length and beam grown together, a slider
 * step at a time from where they are, so she keeps her proportions, until the crates and pots
 * fit (or she's as big as the type goes). Never made smaller. Builds each size to measure it
 * (`useDesign`), so the caller puts her own boat back after.
 */
export function sizeForDeck(d: ShipDesign, need: { crates: number; pots: number }): { patch: Partial<ShipDesign>; room: DeckRoom; met: boolean } {
  const top = FIELDS.find((f) => f.key === 'length')!.steps - 1;
  const meets = (r: DeckRoom) => r.crates >= need.crates && r.pots >= need.pots;
  let patch: Partial<ShipDesign> = { length: d.length, beam: d.beam };
  useDesign(d);
  let room = deckRoom();
  for (let k = 1; !meets(room) && (d.length + k <= top || d.beam + k <= top); k++) {
    patch = { length: Math.min(top, d.length + k), beam: Math.min(top, d.beam + k) };
    useDesign({ ...d, ...patch });
    room = deckRoom();
  }
  return { patch, room, met: meets(room) };
}
