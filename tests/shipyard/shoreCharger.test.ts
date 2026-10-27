/**
 * Quay chargers (owner, 27 Oct 2026: "a plug-in charger at the quayside"; agreed: 22 kW posts at
 * the berths, 150 kW by the fuel pumps, on the game's clock): stations beside the fuel pumps
 * (fuel/fuelHose.ts), their cables plugged into an electric boat's socket as the fuel hose is,
 * charging her at once (vessel/shorePower.ts), billed when she unplugs (career.ts).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../../src/boats/sims';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { fillerWorld, fits, hoseOf, stationById, stationPoint, stations } from '../../src/fuel/fuelHose';
import { DESIGN_HULLS } from '../../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../../src/shipyard/design';
import { SOLAR_CAT } from '../../src/shipyard/parts/catalog';
import { placeVessel } from '../../src/vessel/vesselControl';
import { createVesselState } from '../../src/vessel/vesselState';
import { BERTHS, PORTS } from '../../src/world/archipelago';

afterAll(() => useDesign(DEFAULT_DESIGN));

const cat: ShipDesign = { ...DEFAULT_DESIGN, ...DESIGN_HULLS[SOLAR_CAT].defaults, hull: SOLAR_CAT };
const DT = 1 / 60;
const POST = 'ac:calder-cargo';

/** The solar catamaran alongside the Calder Haven cargo quay, a player on the quay. */
function setup() {
  useDesign(cat);
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const berth = BERTHS.find((b) => b.id === 'calder-cargo')!;
  const hold = () => {
    placeVessel(v, berth.x, v.position[1], berth.z, berth.headingDeg);
    v.linearVelocity = [0, v.linearVelocity[1], 0];
  };
  hold();
  const send = (control: string, ref: string, args?: number[], targetId = 'player-1') => stepWorld(world, [{ playerId: 'player-1', targetId, control, value: 1, ref, args } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) {
      hold();
      stepWorld(world, [], DT);
    }
  };
  // Her socket on the quay side (the berth's shore is to her starboard).
  const side = 1;
  const plug = () => {
    send('hoseTake', POST);
    const f = fillerWorld(v, side);
    send('hoseMove', POST, [f.x, f.y, f.z]);
    send('hosePlug', POST, [side], v.id);
  };
  return { world, v, send, run, plug, side };
}

describe('quay chargers', () => {
  it('a 22 kW post at every berth but the fuel berths, a 150 kW fast charger beside every fuel pump', () => {
    const all = stations();
    const fuelPorts = PORTS.filter((p) => p.fuel);
    expect(all.filter((s) => s.kind === 'fuel').length).toBe(fuelPorts.length);
    const fast = all.filter((s) => s.kind === 'charger' && s.ratedKw === CONFIG.charger.fastKw);
    expect(fast.length).toBe(fuelPorts.length);
    const posts = all.filter((s) => s.kind === 'charger' && s.ratedKw === CONFIG.charger.postKw);
    expect(posts.length).toBe(BERTHS.filter((b) => !b.id.endsWith('-fuel')).length);
    // Each on the quay (its ground above the water), the post facing its berth.
    for (const s of [...fast, ...posts]) expect(s.y, s.id).toBeGreaterThan(0.3);
    const post = stationById(POST)!;
    const berth = BERTHS.find((b) => b.id === 'calder-cargo')!;
    const facing = [Math.sin(post.yaw), Math.cos(post.yaw)];
    expect(facing[0] * (berth.x - post.x) + facing[1] * (berth.z - post.z)).toBeGreaterThan(0);
  });

  it('only an electric boat takes a charger’s plug; only a diesel takes the fuel nozzle', () => {
    useDesign(cat);
    const electric = createVesselState('e', 'design');
    const diesel = createVesselState('d', 'workboat');
    const post = stationById(POST)!;
    const pump = stationById('calder')!;
    expect(fits(post, electric)).toBe(true);
    expect(fits(post, diesel)).toBe(false);
    expect(fits(pump, diesel)).toBe(true);
    expect(fits(pump, electric)).toBe(false);
  });

  it('plugged in, she charges at once at 22 kW on the game’s clock, faster asleep; unplugged, she’s billed', () => {
    const { world, v, run, plug, send } = setup();
    v.battery = 0.3;
    run(1);
    const money = world.career!.money;
    plug();
    expect(hoseOf(world, POST).at.kind).toBe('filler');
    expect(v.shore?.ratedKw).toBe(22);
    const was = v.battery!;
    run(60);
    // A real minute is twelve game minutes: 22 kW x 0.95 x 0.2 h = 4.2 kWh of her 90.
    const hours = 60 * world.environment.timeScale;
    expect(v.battery!).toBeCloseTo(was + (22 * CONFIG.charger.chargeEff * hours) / 90, 2);
    expect(v.shore!.chargeKw).toBeCloseTo(22 * CONFIG.charger.chargeEff, 5);
    // Everyone asleep aboard: the clock runs on, and the charger with it.
    for (const p of Object.values(world.players)) p.avatar = { ...(p.avatar ?? ({} as never)), resting: true } as never;
    const before = v.battery!;
    run(10);
    const asleep = (v.battery! - before) * 90;
    expect(asleep).toBeGreaterThan(22 * CONFIG.charger.chargeEff * 10 * CONFIG.health.sleepHoursPerS * 0.9);
    for (const p of Object.values(world.players)) if (p.avatar) (p.avatar as { resting?: boolean }).resting = false;
    // Out: the charging stops, and the career bills what came from the grid.
    const taken = v.shore!.kWh;
    send('hoseTake', POST);
    run(0.5);
    expect(v.shore).toBeUndefined();
    expect(world.career!.money).toBeCloseTo(money - taken * CONFIG.charger.pricePerKWh, 0);
    // Hung back up on the post.
    send('hoseStow', POST);
    expect(hoseOf(world, POST).at.kind).toBe('pump');
  });

  it('she pulls the plug out if she leaves still plugged in, and it stops', () => {
    const { world, v, run, plug } = setup();
    v.battery = 0.5;
    run(1);
    plug();
    expect(v.shore).toBeTruthy();
    // Moved 20 m off the quay.
    placeVessel(v, v.position[0] - 20, v.position[1], v.position[2], 0);
    stepWorld(world, [], DT);
    expect(v.shore).toBeUndefined();
    const at = hoseOf(world, POST).at;
    expect(at.kind === 'ground' || at.kind === 'pump').toBe(true);
    // (The plug lies on the quay at the cable's end, near its post.)
    if (at.kind === 'ground') {
      const o = stationPoint(stationById(POST)!, stationById(POST)!.outlet);
      expect(Math.hypot(at.pos[0] - o.x, at.pos[2] - o.z)).toBeLessThanOrEqual(CONFIG.fuelHose.reach + 0.01);
    }
  });
});
