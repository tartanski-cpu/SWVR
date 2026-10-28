/**
 * The electric pods' steering (owner, 28 Oct 2026: "both the solar catamaran and the hydrofoil
 * catamaran hardly steer": 430 m turning circles, about 1°/s). Their pods swing to 45° and
 * their whole side counts as their rudder (CONFIG.shipyard.electricPods); the foiling ferry's
 * long pod strut turns with her pod (physics/foils.ts `steered`), and at speed her wheel's lock
 * shrinks so hard over turns her hard and keeps her flying.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { FOIL_FERRY, SOLAR_CAT } from '../../src/shipyard/parts/catalog';
import { placeVessel } from '../../src/vessel/vesselControl';

afterAll(() => useDesign(DEFAULT_DESIGN));

const DT = 1 / 60;
const typeOf = (hull: number): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[hull].defaults, hull });

/** Up to speed on `lever` (30 s), then the wheel hard over for 20 s: her rate of turn (deg/s), turning circle (m), speed (kn) and how clear of the water her hulls are. */
function hardOver(d: ShipDesign, lever: number) {
  useDesign(d);
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  const v = world.vessels[vesselId];
  placeVessel(v, 0, 0, 0, 0);
  world.environment.waves = [];
  world.geography = 'openSea';
  const send = (control: string, value: number) => stepWorld(world, [{ playerId: 't', targetId: v.id, control, value } as Intent], DT);
  send('quickStart', 1);
  send('lever', lever);
  for (let i = 0; i < 30 / DT; i++) stepWorld(world, [], DT);
  send('helm', 1);
  for (let i = 0; i < 20 / DT; i++) stepWorld(world, [], DT);
  const ms = Math.hypot(v.linearVelocity[0], v.linearVelocity[2]);
  const rate = Math.abs(v.angularVelocity[1]);
  return { degS: (rate * 180) / Math.PI, circle: (2 * ms) / rate, kn: ms / 0.5144, clear: v.foil?.clear ?? 0 };
}

describe('the electric pods steer', () => {
  it('the solar catamaran turns in about 7 of her lengths (was 27)', { timeout: 120000 }, () => {
    const r = hardOver(typeOf(SOLAR_CAT), 1);
    expect(r.circle).toBeLessThan(130);
    expect(r.degS).toBeGreaterThan(2.2);
  });

  it('the foiling ferry turns tightly on her hulls, and hard over at 25 kn turns hard and keeps flying', { timeout: 120000 }, () => {
    const hulls = hardOver(typeOf(FOIL_FERRY), 0.5);
    expect(hulls.circle).toBeLessThan(60);
    expect(hulls.degS).toBeGreaterThan(5);
    const flying = hardOver(typeOf(FOIL_FERRY), 0.9);
    expect(flying.clear).toBe(1);
    expect(flying.kn).toBeGreaterThan(22);
    expect(flying.degS).toBeGreaterThan(10);
    expect(flying.circle).toBeLessThan(130);
  });
});
