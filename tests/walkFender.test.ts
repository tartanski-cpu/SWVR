/**
 * The roving fender (vessel/walkFender.ts; owner, Oct 2026): a deckhand hangs a fender at
 * their station where she's about to touch. Only with the fenders out; one per boat; in
 * with the rest; a guard point against the quay like the fixed ones.
 */
import { describe, expect, it } from 'vitest';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { hullPlan } from '../src/vessel/layout';
import { FENDER_HANG } from '../src/vessel/physics/guards';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { canWalkFender, walkFenderProbe } from '../src/vessel/walkFender';
import { BERTHS } from '../src/world/archipelago';
import { nearestBlockEdge } from '../src/world/geography';
import { worldToVessel } from '../src/rescue/recovery';
import { CONFIG } from '../src/config';

const DT = 1 / 60;

function boat() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, value = 1, args?: number[]) => {
    const intent: Intent = { playerId: 't', targetId: v.id, control, value, args };
    stepWorld(world, [intent], DT);
  };
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run };
}

describe('the roving fender', () => {
  it('hangs at a station on a side, only with the fenders out; clamped to her length; in with the rest', () => {
    const { v, send } = boat();
    expect(canWalkFender(v)).toBe(false);
    send('fenderWalk', 1, [-1, 1.5]);
    expect(v.walkFender ?? null).toBeNull();
    send('fenders', 1);
    expect(canWalkFender(v)).toBe(true);
    send('fenderWalk', 1, [-1, 1.5]);
    expect(v.walkFender).toMatchObject({ side: -1, z: 1.5, by: 't' });
    const probe = walkFenderProbe(v)!;
    const plan = hullPlan(VESSEL_DEFS[v.defId]);
    expect(probe[0]).toBeCloseTo(-(plan.halfBeam(1.5) + FENDER_HANG.off + FENDER_HANG.radius), 3);
    expect(probe[2]).toBe(1.5);
    // Moved: a press elsewhere; clamped clear of her ends.
    send('fenderWalk', 1, [1, 100]);
    expect(v.walkFender).toMatchObject({ side: 1, z: Math.round((plan.transom - CONFIG.fenderWalk.endClear) * 100) / 100 });
    send('fenderWalk', 1, [1, -100]);
    expect(v.walkFender!.z).toBeCloseTo(plan.stem + CONFIG.fenderWalk.endClear, 2);
    // Taken in on its own, and with the rest.
    send('fenderWalk', 0);
    expect(v.walkFender).toBeNull();
    send('fenderWalk', 1, [1, 0]);
    send('fenders', 0);
    expect(v.walkFender).toBeNull();
    expect(walkFenderProbe(v)).toBeNull();
  });

  it('against the quay it takes the touch on the guard: hung between the fixed ones, more guard force', () => {
    const berth = BERTHS.find((b) => b.id === 'calder-cargo')!;
    // The quay face: nearestBlockEdge stands 0.6 m in from it, on the shore side of the berth.
    const e = nearestBlockEdge(berth.x + berth.shoreX * 3, berth.z + berth.shoreZ * 3, 30)!;
    const face = { x: e.x - berth.shoreX * 0.6, z: e.z - berth.shoreZ * 0.6 };
    const guardForce = (walk: boolean) => {
      const { v, send, run } = boat();
      const plan = hullPlan(VESSEL_DEFS[v.defId]);
      // Her side laid parallel to the face with the fenders' faces 4 cm into it.
      const off = plan.halfBeam(0) + FENDER_HANG.off + FENDER_HANG.radius - 0.04;
      placeVessel(v, face.x - berth.shoreX * off, 0, face.z - berth.shoreZ * off, berth.headingDeg);
      send('fenders', 1);
      if (walk) {
        // On the quay's side of her, midway between two fixed fenders (full beam there: it touches too).
        const side = worldToVessel(v, [face.x, 0, face.z]).x < 0 ? -1 : 1;
        const zs = CONFIG.vessels.workboat.fenders.z;
        send('fenderWalk', 1, [side, (zs[1] + zs[2]) / 2]);
        expect(v.walkFender?.side).toBe(side);
      }
      let peak = 0;
      for (let i = 0; i < 0.5 / DT; i++) {
        run(DT);
        peak = Math.max(peak, v.contact.guardForce ?? 0);
      }
      return peak;
    };
    const without = guardForce(false);
    const withIt = guardForce(true);
    expect(without).toBeGreaterThan(0);
    expect(withIt).toBeGreaterThan(without * 1.05);
  });
});
