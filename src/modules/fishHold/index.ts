/**
 * Module hold.fish: a fish hold (owner, Oct 2026: "to have a fish hold", step 1 toward a
 * trawler). An insulated hold in her hull under the open deck, lined, its hatch in the deck on
 * a coaming with a lid you lift (press it: open / shut), and the catch in it in fish boxes,
 * packed in ice, stacked on its floor as many as fit (holdSlots). The Shipyard fits it
 * (shipyard/parts/hold.ts) and cuts the deck over the hatch (layout.fishHold).
 *
 * What's in it is the boat's state (VesselState.hold, bus key 'hold.boxes'): the trawl's boxes
 * go down into it while there's room (fishing/fishHold.ts), and the yellow button on the
 * coaming ('hold.lift') lifts one out onto the deck beside the hatch, with the lid open, to
 * be carried ashore as before. Its weight bears on her where the boxes stand (simulation:
 * payload), low down: a full hold makes her stiffer, not tender, as a real one does.
 *
 * Its socket is the middle of its floor; its axes are the boat's (x across, z aft), so its
 * hatch and the deck's heights over the floor are in its config.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { Button } from '../../controls/Button';
import { EngineHatch } from '../../controls/deckGear';
import { fishBoxGeometry } from '../../cargo/cargoView';
import { busOf } from '../../modular/bus';
import type { GearFootprint, ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, part } from '../../render/geometryUtils';
import { waterStop } from '../../vessel/view/engineLook';

export interface FishHoldConfig {
  /** Inside, along her and across her (m). */
  length: number;
  width: number;
  /** The deck's underside over the floor at the hold's forward and aft ends (m: her sheer). */
  deckFwd: number;
  deckAft: number;
  /** The hatch's opening (its axes), and the deck's height over the floor there. */
  hatch: { x0: number; x1: number; z0: number; z1: number; y: number };
  /** The coaming's height over the deck (m). */
  coaming: number;
}

const C = { lining: 0xdfe3df, floor: 0xb5bcb6, batten: 0x9aa39c, coaming: 0x8f979b };
/** The coaming's plate thickness (m). */
const PLATE = 0.05;
const box = () => CONFIG.cargo.kinds.find((k) => k.name === 'Fish box')!.size;

/**
 * Where the fish boxes stand in it (its axes, each box's base middle), in the order they're
 * filled: the bottom tier first, from the ends in toward the hatch (as they're stowed: the
 * far corners first, the hatch square last). Lying across her, `boxGap` round each, tiers
 * up to `headGap` under the deck at its lower end. Its length is what the hold holds.
 */
export function holdSlots(c: FishHoldConfig): [number, number, number][] {
  const [L, H, W] = box();
  const { boxGap: g, headGap } = CONFIG.shipyard.fishHold;
  const across = Math.floor((c.width - g) / (L + g));
  const along = Math.floor((c.length - g) / (W + g));
  const tiers = Math.floor((Math.min(c.deckFwd, c.deckAft) - headGap) / H);
  const hz = (c.hatch.z0 + c.hatch.z1) / 2;
  const out: [number, number, number][] = [];
  for (let t = 0; t < tiers; t++) {
    const tier: [number, number, number][] = [];
    for (let i = 0; i < along; i++)
      for (let j = 0; j < across; j++) tier.push([(j - (across - 1) / 2) * (L + g), t * H, (i - (along - 1) / 2) * (W + g)]);
    out.push(...tier.sort((a, b) => Math.abs(b[2] - hz) - Math.abs(a[2] - hz) || Math.abs(b[0]) - Math.abs(a[0])));
  }
  return out;
}

/** The hold's hatch lid: the engine hatch's (a plate hinged on its starboard edge, a ring to lift it), on the coaming. */
class HoldHatch extends EngineHatch {
  override readonly label = 'Fish hold hatch: open / shut';
}

/** A slab between two points (its axes). */
const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, colour: number) =>
  part(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), colour);

/** Its lining, the battens on its sides, its ceiling round the hatch, and the coaming on deck. */
function holdParts(c: FishHoldConfig): THREE.BufferGeometry[] {
  const [hx, hz] = [c.width / 2, c.length / 2];
  const t = 0.03;
  const low = Math.min(c.deckFwd, c.deckAft);
  const parts = [
    slab(-hx, hx, -t, 0, -hz, hz, C.floor),
    // Its sides (to the lower end's deck: under the higher deck forward, the gap is in the dark) and ends.
    slab(-hx - t, -hx, 0, low, -hz, hz, C.lining),
    slab(hx, hx + t, 0, low, -hz, hz, C.lining),
    slab(-hx, hx, 0, c.deckFwd, -hz - t, -hz, C.lining),
    slab(-hx, hx, 0, c.deckAft, hz, hz + t, C.lining),
  ];
  // Battens along its sides, so the boxes stand off the lining (and you see it's a hold).
  for (const y of [0.25, 0.55, 0.85].filter((y) => y < low - 0.1))
    for (const s of [-1, 1]) parts.push(slab(s * hx - (s > 0 ? 0.04 : 0), s * hx + (s < 0 ? 0.04 : 0), y, y + 0.06, -hz, hz, C.batten));
  // Its ceiling (the deck's underside, which isn't drawn from below), round the hatch, sloped with the deck.
  const { x0, x1, z0, z1 } = c.hatch;
  const yAt = (z: number) => c.deckFwd + ((c.deckAft - c.deckFwd) * (z + hz)) / (2 * hz);
  const ceiling = (ax0: number, ax1: number, az0: number, az1: number) => {
    if (ax1 - ax0 < 1e-3 || az1 - az0 < 1e-3) return;
    const g = slab(ax0, ax1, -t, 0, az0, az1, C.lining);
    const tilt = Math.atan2(c.deckFwd - c.deckAft, 2 * hz);
    parts.push(g.rotateX(tilt).translate(0, yAt((az0 + az1) / 2), 0));
  };
  ceiling(-hx, hx, -hz, z0);
  ceiling(-hx, hx, z1, hz);
  ceiling(-hx, x0, z0, z1);
  ceiling(x1, hx, z0, z1);
  // The coaming: a plate box round the opening from the deck up, its top edge capped.
  const top = c.hatch.y + c.coaming;
  const y0 = c.hatch.y - 0.04;
  parts.push(
    slab(x0 - PLATE, x1 + PLATE, y0, top, z0 - PLATE, z0, C.coaming),
    slab(x0 - PLATE, x1 + PLATE, y0, top, z1, z1 + PLATE, C.coaming),
    slab(x0 - PLATE, x0, y0, top, z0, z1, C.coaming),
    slab(x1, x1 + PLATE, y0, top, z0, z1, C.coaming),
  );
  return parts;
}

export const FISH_HOLD: ModuleDefinition<FishHoldConfig> = {
  id: 'hold.fish',
  version: 1,
  fits: ['hold.fish'],
  defaults: { length: 2, width: 1.6, deckFwd: 1, deckAft: 1, hatch: { x0: -0.45, x1: 0.45, z0: -0.45, z1: 0.45, y: 1 }, coaming: 0.3 },
  validateConfig: (c) => [
    ...(c.length > 0.5 && c.width > 0.5 ? [] : ['a hold over 0.5 m long and wide']),
    ...(c.hatch.x0 >= -c.width / 2 && c.hatch.x1 <= c.width / 2 && c.hatch.z0 >= -c.length / 2 && c.hatch.z1 <= c.length / 2 ? [] : ['its hatch within it']),
  ],
  ports: {
    open: { dir: 'write', key: 'hatch.hold.open' },
    lift: { dir: 'write', key: 'hold.lift' },
    boxes: { dir: 'read', key: 'hold.boxes', required: false },
  },
  provides: () => [{ gear: 'fishHold' }],
  gear: (c, _hull, at) => {
    const { x0, x1, z0, z1, y } = c.hatch;
    return {
      fishHold: {
        slots: holdSlots(c).map((p) => at(p)),
        hatch: { centre: at([(x0 + x1) / 2, y + c.coaming, (z0 + z1) / 2]), x0: at([x0, 0, 0])[0], x1: at([x1, 0, 0])[0], z0: at([0, 0, z0])[2], z1: at([0, 0, z1])[2] },
      },
    };
  },
  // The coaming and its lid stand on the deck: walked round, not over (in its axes, from the floor).
  footprints: (c): GearFootprint[] => [{ x0: c.hatch.x0 - PLATE, x1: c.hatch.x1 + PLATE, z0: c.hatch.z0 - PLATE, z1: c.hatch.z1 + PLATE, base: c.hatch.y - 0.05, top: c.hatch.y + c.coaming + 0.05 }],
  view: {
    build({ config: c, keys, socket, share }) {
      const { x0, x1, z0, z1, y } = c.hatch;
      const top = y + c.coaming;
      // The lid over the coaming, overlapping its plates, hinged on the starboard side.
      const lid = new HoldHatch(x1 - x0 + 2 * PLATE, z1 - z0 + 2 * PLATE, `${socket.id}.hatch`, { channel: keys.open, read: (s) => busOf(s).num(keys.open) });
      lid.root.position.set(x1 + PLATE, top + 0.035, (z0 + z1) / 2);
      // The lift button: on the aft coaming's top at its port end, yellow.
      const lift = new Button(`${socket.id}.lift`, keys.lift, 'Fish hold: lift a box out (lid open)', 'pulse', 0xe8c020);
      lift.root.position.set(x0 + 0.1, top, z1 + PLATE / 2);
      share(lift.cap, 'buttonCap');
      // Its boxes, iced: one instanced mesh, as many drawn as are in it.
      const slots = holdSlots(c);
      const boxes = new THREE.InstancedMesh(fishBoxGeometry(box(), true), flatVertexColorMaterial(), Math.max(1, slots.length));
      const m = new THREE.Matrix4();
      slots.forEach((p, i) => boxes.setMatrixAt(i, m.makeTranslation(p[0], p[1], p[2])));
      boxes.count = 0;
      boxes.frustumCulled = false;
      // Its floor is often below the sea, which the game draws right through a hull: a water
      // stop fills it (depth only, after the boat and before the sea; engineLook.ts).
      const low = Math.min(c.deckFwd, c.deckAft);
      const stop = waterStop({ depth: low - 0.01, top: low, box: { x0: -c.width / 2, x1: c.width / 2, z0: -c.length / 2, z1: c.length / 2 } });
      return {
        staticParts: holdParts(c),
        movingParts: [boxes, ...stop],
        controls: [lid, lift],
        labels: [{ text: 'FISH HOLD', at: [x0 + 0.35, top + 0.002, z1 + PLATE / 2], yaw: 0, size: [0.24, 0.03] }],
        update: (read) => {
          boxes.count = Math.min(slots.length, Math.max(0, Math.round(read.num(keys.boxes))));
        },
      };
    },
  },
};
