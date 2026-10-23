/**
 * The fleet (owner, Oct 2026: the game's own boats designed in the Shipyard, "eat our own dog
 * food"): one of each hull type kitted out for her work, and the beginner boat on the
 * fishing boat's hull. Each is a design file (boats/fleet/*.json) the Shipyard reads, built
 * under her own vessel type id, and the game starts in any of them.
 */
import { describe, expect, it } from 'vitest';
import { FLEET, FLEET_IDS } from '../src/boats/fleet';
import { RECIPES } from '../src/boats/library';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { guardParts } from '../src/shipyard/design';
import { hasWheelhouse, VESSEL_DEFS, VESSEL_IDS } from '../src/vessel/vesselDef';
import { placeVessel } from '../src/vessel/vesselControl';

const DT = 1 / 60;
const of = (id: string) => FLEET.find((f) => f.id === id)!;

describe('the fleet', () => {
  it('one of each hull type still offered (but the stern trawler and the fast catamaran, not in the fleet yet), and the beginner boat on the fishing boat’s hull', () => {
    expect(FLEET.map((f) => f.id)).toEqual([...FLEET_IDS]);
    const types = FLEET.filter((f) => f.id !== 'starterBoat').map((f) => f.design.hull).sort();
    expect(types).toEqual(DESIGN_HULLS.map((h, i) => (h.retired || h.name.startsWith('Stern trawler') || h.catamaran ? -1 : i)).filter((i) => i >= 0));
    expect(of('starterBoat').design.hull).toBe(of('fishingBoat').design.hull);
  });

  it('the fishing boat carries a rod rack; the pilot boat a rubbing strake and fenders (owner)', () => {
    expect(of('fishingBoat').design.rodRack).toBeGreaterThan(0);
    expect(buildDesign(of('fishingBoat').design).recipe.modules.some((m) => m.module === 'deck.rod-rack')).toBe(true);
    expect(guardParts(of('pilotBoat').design.guard)).toEqual({ fenders: true, side: 'strake' });
    const pilot = buildDesign(of('pilotBoat').design).recipe.modules.map((m) => m.module);
    expect(pilot).toContain('deck.fenders');
    expect(pilot).toContain('hull.guard');
  });

  it('each builds cleanly from her design file, a vessel type of her own the game can start in', () => {
    for (const f of FLEET) {
      expect(buildDesign(f.design, 'x', f.id).warnings, f.id).toEqual([]);
      expect(VESSEL_IDS).toContain(f.id);
      expect(RECIPES[f.id].id).toBe(`vessel.${f.id}`);
      expect(hasWheelhouse(VESSEL_DEFS[f.id]), f.id).toBe(true);
    }
  });

  it('the beginner boat is the cheapest and the plainest; the landing craft and pilot boat are fast', () => {
    const price = (id: string) => buildDesign(of(id).design).figures.price;
    for (const f of FLEET) if (f.id !== 'starterBoat') expect(price('starterBoat')).toBeLessThan(price(f.id));
    expect(of('starterBoat').design.controls).toBe(0);
    const speed = (id: string) => {
      const { world, vesselId } = createWorld(new IdFactory(), id);
      const v = world.vessels[vesselId];
      placeVessel(v, 0, 0, 0, 0);
      world.geography = 'openSea';
      world.environment.waves = [];
      const send = (c: string, x: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control: c, value: x } as Intent], DT);
      send('quickStart', 1);
      for (let i = 0; i < 5 / DT; i++) stepWorld(world, [], DT);
      send('lever', 1);
      for (let i = 0; i < 45 / DT; i++) stepWorld(world, [], DT);
      return Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / 0.5144;
    };
    expect(speed('lander')).toBeGreaterThan(25);
    expect(speed('pilotBoat')).toBeGreaterThan(30);
    expect(speed('starterBoat')).toBeGreaterThan(6);
  });
});
