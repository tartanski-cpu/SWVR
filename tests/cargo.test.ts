import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  aboard,
  deckVelocitiesBefore,
  GROUND,
  lashPointFor,
  payloadOf,
  portAtPoint,
  stepDeckCargo,
  type CargoItem,
} from '../src/cargo/cargo';
import { onOpenDeck } from '../src/cargo/deck';
import { CONFIG } from '../src/config';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { hullPlan } from '../src/vessel/layout';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { PORTS } from '../src/world/archipelago';
import { standingHeight } from '../src/world/geography';

const DT = 1 / 60;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const plan = hullPlan(VESSEL_DEFS[v.defId]);
  const send = (control: string, ref: string, opts: { target?: string; value?: number; args?: number[]; player?: string } = {}) => {
    const intent: Intent = { playerId: opts.player ?? localPlayerId, targetId: opts.target ?? v.id, control, value: opts.value ?? 1, ref, args: opts.args };
    stepWorld(world, [intent], DT);
  };
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  const waiting = (portId: string) =>
    Object.values(world.cargo).filter((c) => 'ground' in c.at && portAtPoint(c.at.ground[0], c.at.ground[2])?.id === portId);
  /** Conjure an item on deck at (x, z). */
  const onDeck = (id: string, kind: number, x: number, z: number, lashed = false): CargoItem => {
    const c: CargoItem = { id, kind, mass: CONFIG.cargo.kinds[kind].mass, from: 'calder', to: 'brannock', at: { vessel: v.id, pos: [x, plan.deckY(z), z], yaw: 0, vel: [0, 0], lashed } };
    world.cargo[id] = c;
    return c;
  };
  /** Hold the boat still at a heel (deg, + = starboard down), stepping only the deck cargo. */
  const heelAndSlide = (heelDeg: number, s: number) => {
    placeVessel(v, 0, 0, -300, 0, heelDeg, 0);
    for (let i = 0; i < s / DT; i++) stepDeckCargo(world, v, deckVelocitiesBefore(world, v), DT);
  };
  return { world, v, plan, send, run, waiting, onDeck, heelAndSlide, me: localPlayerId };
}

describe('cargo by hand', () => {
  it('every port starts with goods waiting on dry land, each bound somewhere else', () => {
    const { world, waiting } = setup();
    for (const p of PORTS) {
      const items = waiting(p.id);
      expect(items.length).toBe(CONFIG.cargo.perPort);
      for (const c of items) {
        expect(c.to).not.toBe(p.id);
        const [x, , z] = (c.at as { ground: number[] }).ground;
        expect(standingHeight(x, z)).toBeGreaterThan(-0.3);
      }
    }
    expect(world.deliveries).toBe(0);
  });

  it('all kinds are man-portable; the heavy ones need two hands', () => {
    for (const k of CONFIG.cargo.kinds) expect(k.mass).toBeLessThanOrEqual(120);
    expect(CONFIG.cargo.kinds.some((k) => k.mass > CONFIG.cargo.twoHandKg)).toBe(true);
  });

  it('pick up, set down on deck: it lands on the open deck and counts as payload', () => {
    const { world, v, plan, send, waiting, me } = setup();
    const item = waiting('calder')[0];
    send('cargoTake', item.id, { target: GROUND });
    expect(item.at).toEqual({ carriedBy: me });
    // Carried by a player aboard: it already weighs on the boat.
    world.players[me].aboardVesselId = v.id;
    world.players[me].position = [0.5, plan.deckY(4), 4];
    expect(payloadOf(world, v.id).map((p) => p.mass)).toEqual([item.mass]);
    // Set down over the bulwark: it ends up inside, on the deck.
    send('cargoPlace', item.id, { args: [2.3, 1.5, 4, 0] });
    expect('vessel' in item.at).toBe(true);
    const at = item.at as { pos: number[] };
    expect(onOpenDeck(v.defId, { hx: 0.3, hz: 0.3 }, at.pos[0], at.pos[2])).toBe(true);
    expect(at.pos[1]).toBeCloseTo(plan.deckY(at.pos[2]), 3);
    expect(aboard(world, v.id)).toHaveLength(1);
  });

  it("only the carrier can set it down; nobody can take what's carried or lashed", () => {
    const { send, waiting, onDeck } = setup();
    const item = waiting('calder')[0];
    send('cargoTake', item.id, { target: GROUND, player: 'a' });
    send('cargoTake', item.id, { target: GROUND, player: 'b' });
    expect(item.at).toEqual({ carriedBy: 'a' });
    send('cargoPlace', item.id, { target: GROUND, player: 'b', args: [716, 2, 652, 0] });
    expect(item.at).toEqual({ carriedBy: 'a' });
    const lashed = onDeck('L', 0, 0.8, 3.2, true);
    send('cargoTake', 'L', { player: 'b' });
    expect('vessel' in lashed.at).toBe(true);
  });

  it('set down ashore at its destination: delivered, and a replacement appears somewhere', () => {
    const { world, send, waiting } = setup();
    const item = waiting('calder').find((c) => c.to === 'brannock')!;
    const total = Object.keys(world.cargo).length;
    send('cargoTake', item.id, { target: GROUND });
    // Wrong place ashore (back at Calder): it just sits there.
    const calder = PORTS.find((p) => p.id === 'calder')!.cargo;
    send('cargoPlace', item.id, { target: GROUND, args: [calder.stackX + 3, 3, calder.stackZ, 0] });
    expect('ground' in item.at).toBe(true);
    send('cargoTake', item.id, { target: GROUND });
    const b = PORTS.find((p) => p.id === 'brannock')!.cargo;
    send('cargoPlace', item.id, { target: GROUND, args: [b.stackX + 2, 3, b.stackZ + 1, 0] });
    expect(world.cargo[item.id]).toBeUndefined();
    expect(world.deliveries).toBe(1);
    expect(Object.keys(world.cargo).length).toBe(total);
  });

  it('dropped in the sea, it is lost', () => {
    const { world, send, waiting } = setup();
    const item = waiting('calder')[0];
    send('cargoTake', item.id, { target: GROUND });
    send('cargoPlace', item.id, { target: GROUND, args: [0, 0, -300, 0] });
    expect(world.cargo[item.id]).toBeUndefined();
    expect(world.lost).toBe(1);
    expect(world.deliveries).toBe(0);
  });

  it('loose cargo holds at a small heel, slides to the low side past friction, goes over the rail when steep', () => {
    // μ = 0.35: sliding starts at atan(0.35) ≈ 19°; over the rail beyond asin(0.55) ≈ 33°.
    const a = setup();
    const c1 = a.onDeck('c1', 0, 0, 4);
    a.heelAndSlide(15, 2);
    expect((c1.at as { pos: number[] }).pos[0]).toBeCloseTo(0, 3);

    const b = setup();
    const c2 = b.onDeck('c2', 0, 0, 4);
    b.heelAndSlide(25, 3);
    const x = (c2.at as { pos: number[] }).pos[0];
    expect(x).toBeGreaterThan(1.0); // slid to starboard, against the bulwark
    expect(b.world.cargo.c2).toBeDefined();

    const c = setup();
    c.onDeck('c3', 0, 0, 4);
    c.heelAndSlide(40, 3);
    expect(c.world.cargo.c3).toBeUndefined(); // over the side
    expect(c.world.lost).toBe(1);
  });

  it('lashed cargo stays put; lashing needs a D-ring within reach', () => {
    const { world, v, send, onDeck, heelAndSlide } = setup();
    const near = onDeck('n', 1, 1.2, 4.2);
    const far = onDeck('f', 1, 0.8, 1.9 + 0.6);
    expect(lashPointFor(v, near)).not.toBeNull();
    send('cargoLash', 'n');
    expect((near.at as { lashed: boolean }).lashed).toBe(true);
    // Find a spot out of reach of every ring, if the layout has one; else just check the reach rule.
    if (!lashPointFor(v, far)) {
      send('cargoLash', 'f');
      expect((far.at as { lashed: boolean }).lashed).toBe(false);
    }
    heelAndSlide(40, 2);
    expect(world.cargo.n).toBeDefined();
    expect((near.at as { pos: number[] }).pos[0]).toBeCloseTo(1.2, 3);
  });

  it('cargo stowed to one side gives her a list', () => {
    const { world, v, plan, onDeck, run } = setup();
    placeVessel(v, 0, 0, -300, 0);
    run(10);
    const heel = () => {
      const q = new THREE.Quaternion().fromArray(v.orientation);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      return (Math.asin(up.x) * 180) / Math.PI; // + = starboard down (the mast leans to starboard)
    };
    const h0 = heel();
    for (let i = 0; i < 4; i++) onDeck(`s${i}`, 4, 1.3, 2.9 + i * 0.75, true);
    expect(payloadOf(world, v.id).reduce((s, p) => s + p.mass, 0)).toBe(440);
    run(20);
    expect(heel() - h0).toBeGreaterThan(0.5);
    void plan;
  });

  it('at an anchorage the skiff works the cargo, only with the anchor set in the bay', () => {
    const { world, v, send, run, waiting } = setup();
    const a = PORTS.find((p) => p.id === 'selkie')!.cargo.anchorage!;
    placeVessel(v, a.x, 0, a.z, 0);
    run(2);
    const item = waiting('selkie')[0];
    send('cargoLoad', item.id);
    expect('ground' in item.at).toBe(true);
    send('anchor', '');
    run(30);
    expect(v.anchor.phase).toBe('set');
    send('cargoLoad', item.id);
    expect('vessel' in item.at).toBe(true);
    expect(aboard(world, v.id)).toHaveLength(1);
  });
});
