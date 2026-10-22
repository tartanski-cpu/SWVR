/**
 * A tug tows from a hook near amidships (owner, Oct 2026: "move the towline position to
 * midships on the tugs"; "tugs should always have the wheelhouse forward"). The Shipyard puts
 * a tug-hull boat's towing hook on her centreline clear aft of the wheelhouse, near her
 * centre of gravity (CONFIG.shipyard.deckGear.tug), her winch just forward of it; the line
 * is still passed aboard over the stern roller. Her wheelhouse ends no further aft than
 * amidships. Towing, a line off to one side then has a short lever arm about her middle, so
 * she answers her helm with a tow on; from the transom it would hold her stern.
 */
import { describe, expect, it } from 'vitest';
import { gearOf, useDesign } from '../src/boats/sims';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { TUG_HULL } from '../src/shipyard/parts/catalog';
import { lineOf } from '../src/tow/tow';
import { compassHeading } from '../src/vessel/autopilot';
import { hullPlan } from '../src/vessel/layout';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import tugFile from '../src/boats/fleet/smallTug.json';
import { CONFIG } from '../src/config';

const DT = 1 / 60;

describe("a tug's towing hook", { timeout: 120000 }, () => {
  it('the Shipyard puts it near amidships, clear aft of her wheelhouse, her winch just forward of it; other hulls tow from the roller', () => {
    useDesign((tugFile as unknown as { design: Parameters<typeof useDesign>[0] }).design);
    const tug = { defId: 'design' };
    const plan = hullPlan(VESSEL_DEFS.design);
    const L = plan.transom - plan.stem;
    const mid = (plan.stem + plan.transom) / 2;
    const tow = gearOf(tug, 'towPoint')!;
    // Aft of amidships, within a fifth of her length; well forward of the roller, where the line comes aboard.
    expect(tow.point[2]).toBeGreaterThan(mid);
    expect(tow.point[2] - mid).toBeLessThan(0.2 * L);
    expect(tow.stern![2]).toBeGreaterThan(plan.transom - 0.3);
    expect(tow.point[1] - plan.deckY(tow.point[2])).toBeCloseTo(CONFIG.shipyard.deckGear.tug.hook.height, 1);
    const house = (VESSEL_DEFS.design as unknown as { layout: { wheelhouse: { aft: number } } }).layout.wheelhouse;
    expect(tow.point[2]).toBeGreaterThan(house.aft + CONFIG.shipyard.deckGear.tug.hook.clearOfHouse - 0.01);
    const lead = gearOf(tug, 'towWinch')!.lead;
    expect(lead[2]).toBeLessThan(tow.point[2]);
    expect(lead[2]).toBeGreaterThan(house.aft);
    // A workboat hull with the same gear tows from her roller, as before.
    useDesign({ ...DEFAULT_DESIGN, hull: 2, sternRoller: 1, towWinch: 1 });
    const wb = gearOf({ defId: 'design' }, 'towPoint')!;
    expect(wb.stern).toBeUndefined();
    expect(wb.point[2]).toBeGreaterThan(hullPlan(VESSEL_DEFS.design).transom - 0.3);
  });

  it("a tug's wheelhouse set right aft stops at amidships; one set forward stays put", () => {
    const aftOf = (housePos: number) => {
      useDesign({ ...DEFAULT_DESIGN, hull: TUG_HULL, housePos });
      return (VESSEL_DEFS.design as unknown as { layout: { wheelhouse: { aft: number } } }).layout.wheelhouse.aft;
    };
    const plan = hullPlan(VESSEL_DEFS.design);
    const mid = (plan.stem + plan.transom) / 2;
    expect(aftOf(0)).toBeCloseTo(mid, 2);
    expect(aftOf(0.25)).toBeCloseTo(mid, 2);
    expect(aftOf(1)).toBeLessThan(mid - 1);
    // Another hull set right aft goes right aft, as before.
    useDesign({ ...DEFAULT_DESIGN, hull: 2, housePos: 0 });
    expect((VESSEL_DEFS.design as unknown as { layout: { wheelhouse: { aft: number } } }).layout.wheelhouse.aft).toBeGreaterThan(hullPlan(VESSEL_DEFS.design).transom - 4);
  });

  it('towing the pontoon, the small tug answers her helm: hard over, she turns further than towing from her stern roller', () => {
    const turn = (fromRoller: boolean) => {
      const { world, vesselId } = createWorld(new IdFactory(), 'smallTug');
      world.environment.waves = [];
      const v = world.vessels[vesselId];
      placeVessel(v, 0, 0, -600, 0);
      const g = gearOf(v, 'towPoint')!;
      const hook = g.point;
      if (fromRoller) g.point = g.stern!;
      try {
        const send = (control: string, value = 1, ref?: string) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value, ref } as Intent], DT);
        send('towDebugNear', 1, 'pontoon');
        send('towMake', 1, `v:${world.tow!.job!.vesselId}`);
        expect(lineOf(world, v.id)).not.toBeNull();
        send('quickStart');
        send('lever', 0.8);
        for (let i = 0; i < 40 / DT; i++) stepWorld(world, [], DT);
        const h0 = compassHeading(v);
        v.controls.helm = 1;
        for (let i = 0; i < 40 / DT; i++) stepWorld(world, [], DT);
        expect(lineOf(world, v.id)).not.toBeNull();
        return Math.abs(((((compassHeading(v) - h0) % 360) + 540) % 360) - 180);
      } finally {
        g.point = hook;
      }
    };
    const hook = turn(false);
    const roller = turn(true);
    console.log('TURN', hook.toFixed(1), roller.toFixed(1));
    expect(hook).toBeGreaterThan(roller * 1.3);
  });
});
