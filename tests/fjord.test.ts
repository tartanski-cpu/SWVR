/**
 * The Fjord (regions, milestone 5): the walls and the narrow side fjord, the spine (the
 * cheapest fuel, the outer pier, the mud anchorage), the fish farm (its cages solid, its
 * barge a port that takes feed and ships salmon), the race in the narrows, the region's
 * jobs and weather, and the katabatic gusts: when they fall, the wind they add, and the
 * shove they give a boat.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { cargoLabel, spawnCargo } from '../src/cargo/cargo';
import { gustEnvelope, gustNow, stepGusts } from '../src/environment/gusts';
import { forecastText } from '../src/environment/forecast';
import { createWeather, setWeatherPreset, windVector } from '../src/environment/weather';
import { SHEETS } from '../src/nav/chartSheets';
import { startIncident } from '../src/rescue/rescue';
import { startTowCall } from '../src/tow/tow';
import { placeVessel } from '../src/vessel/vesselControl';
import { BERTHS, CURRENTS, GUSTS, PORTS } from '../src/world/archipelago';
import { ringCentres } from '../src/world/farms';
import { blockContact, bottomAt, fuelBerthAt, standingHeight } from '../src/world/geography';
import { distanceToBounds, regionAt, regionById } from '../src/world/regions';
import { FJORD } from '../src/world/regions/fjord';
import { SOUNDS } from '../src/world/regions/sounds';
import { shelterFactor } from '../src/world/shelter';
import { groundHeight } from '../src/world/terrain';

const port = (id: string) => PORTS.find((p) => p.id === id)!;

function game() {
  const { world, vesselId } = createWorld(new IdFactory(), 'workboat');
  const v = world.vessels[vesselId];
  world.environment.waves = [];
  return { world, v };
}

/** Width of the water (ground below 0) along a line across a channel at (x, z), direction (ux, uz). */
function waterWidth(x: number, z: number, ux: number, uz: number): number {
  let w = 0;
  for (let s = -300; s <= 300; s += 1) if (groundHeight(x + ux * s, z + uz * s) < 0) w += 1;
  return w;
}

describe('the geography', () => {
  it('one gap out from the Sounds, to the north-east; its own footprint', () => {
    expect(regionById('fjord')).toBe(FJORD);
    expect(distanceToBounds(SOUNDS, FJORD.bounds.x0, FJORD.bounds.z1)).toBeGreaterThan(0);
    expect(regionAt(5300, -7100).id).toBe('fjord');
    // The gap between the Sounds' and the Fjord's nearest land: about the diagonal rule (3 km, give or take).
    let gap = Infinity;
    for (const a of SOUNDS.islands) for (const b of FJORD.islands) gap = Math.min(gap, Math.hypot(a.x - b.x, a.z - b.z) - a.radius - b.radius);
    expect(gap).toBeGreaterThan(2500);
    expect(gap).toBeLessThan(4500);
  });

  it('the fjord: deep water between walls rising hundreds of metres', () => {
    // Mid-fjord: deep; a few hundred metres either side, the mountain.
    expect(groundHeight(5850, -6900)).toBeLessThan(-30);
    // Across the fjord (its axis runs about 070° here): 450 m either side of the middle.
    expect(groundHeight(5850 - 450 * 0.32, -6900 - 450 * 0.95)).toBeGreaterThan(200);
    expect(groundHeight(5850 + 450 * 0.32, -6900 + 450 * 0.95)).toBeGreaterThan(200);
    // The mountain is the landmark: high, far higher than anything at home.
    expect(groundHeight(5800, -7900)).toBeGreaterThan(600);
  });

  it('Trangfjorden: a gut about 100 m wide between walls over 200 m high, no room to turn, then a basin', () => {
    for (const z of [-7050, -7200, -7350]) {
      const w = waterWidth(5250, z, 1, 0);
      expect(w, `width at z ${z}`).toBeGreaterThan(90);
      expect(w, `width at z ${z}`).toBeLessThan(150);
      // 70 m back from the water the walls are already well over 100 m; further back, 300.
      expect(groundHeight(5250 - 120, z)).toBeGreaterThan(120);
      expect(groundHeight(5250 + 120, z)).toBeGreaterThan(120);
      expect(groundHeight(5250 - 250, z)).toBeGreaterThan(250);
      expect(groundHeight(5250 + 250, z)).toBeGreaterThan(250);
    }
    // Trangvika: room to anchor and swing, 14 m.
    expect(waterWidth(5160, -7630, 1, 0)).toBeGreaterThan(280);
    expect(groundHeight(5160, -7630)).toBeCloseTo(-14, 0);
  });

  it('the narrows at the mouth carry the race; the village stands on the valley floor', () => {
    const race = CURRENTS.find((c) => c.id === 'kvasstraumen')!;
    expect(race.peakKn).toBe(8);
    expect(groundHeight(race.x, race.z)).toBeLessThan(-30);
    expect(waterWidth(race.x, race.z, -Math.SQRT1_2, -Math.SQRT1_2)).toBeLessThan(280);
    for (const b of FJORD.buildings) {
      const h = standingHeight(b.x, b.z);
      expect(h, `${b.x},${b.z}`).toBeGreaterThan(0.5);
      expect(h, `${b.x},${b.z}`).toBeLessThan(12);
    }
  });
});

describe('the spine', () => {
  it('a harbour with the cheapest fuel, an exposed pier, a mud anchorage: berths in deep water by their decks', () => {
    expect(port('kvassvik').kind).toBe('harbour');
    const fuel = port('kvassvik').economy!.fuelPrice!;
    expect(fuel).toBeLessThan(CONFIG.career.costs.fuelPerL);
    for (const p of PORTS) if (p.id !== 'kvassvik' && p.economy?.fuelPrice) expect(fuel).toBeLessThan(p.economy.fuelPrice);
    expect(fuelBerthAt(6640, -7615.5)?.id).toBe('kvassvik');
    expect(port('ytterbrygga').kind).toBe('pier');
    expect(shelterFactor(4024, -5412)).toBe(1); // open to the sea
    expect(port('trangvika').kind).toBe('anchorage');
    expect(bottomAt(5160, -7630)).toBe('mud');
    expect(shelterFactor(5160, -7630)).toBeLessThan(0.2);
    // Calmer inside the fjord than outside.
    expect(shelterFactor(6200, -6900)).toBeLessThan(0.5);
    for (const b of FJORD.berths) {
      expect(groundHeight(b.x, b.z), b.id).toBeLessThan(-4);
      expect(standingHeight(b.x + b.shoreX * (b.shoreDist + 1), b.z + b.shoreZ * (b.shoreDist + 1)), b.id).toBeCloseTo(b.deckY, 1);
    }
    // The menu's teleport finds a cargo berth at each port with one.
    for (const p of FJORD.ports) if (p.cargo.berth) expect(BERTHS.some((b) => b.portId === p.id && b.id.endsWith('cargo')), p.id).toBe(true);
  });

  it('lights stand on the ground, the potting grounds lie in 6-25 m, the goods stacks ashore', () => {
    for (const l of FJORD.lights) expect(l.y - standingHeight(l.x, l.z), l.name).toBeGreaterThan(2);
    for (const g of FJORD.pottingGrounds) {
      const d = -groundHeight(g.x, g.z);
      expect(d, g.id).toBeGreaterThan(6);
      expect(d, g.id).toBeLessThan(25);
    }
    for (const p of FJORD.ports) expect(standingHeight(p.cargo.stackX, p.cargo.stackZ), p.id).toBeGreaterThan(0.5);
  });
});

describe('the fish farm', () => {
  it('six cage rings in deep water, each solid to a boat; the barge a port for feed in and salmon out', () => {
    const farm = FJORD.farms![0];
    const rings = ringCentres(farm);
    expect(rings.length).toBe(6);
    const hit = { depth: 0, nx: 0, ny: 0, nz: 0, fendered: false };
    for (const [x, z] of rings) {
      expect(groundHeight(x, z)).toBeLessThan(-20);
      expect(blockContact(x, 0, z, hit)).toBe(true);
    }
    expect(port('kvassfarm').economy!.products).toEqual(['Salmon box']);
    expect(port('kvassfarm').economy!.needs).toEqual(['Feed pellets']);
  });

  it('cargo runs: salmon out of the farm, feed pellets from the outer pier to the farm', () => {
    const { world } = game();
    for (const id of Object.keys(world.cargo)) delete world.cargo[id];
    for (let i = 0; i < 400; i++) if (!spawnCargo(world)) break;
    const items = Object.values(world.cargo);
    const kind = (i: (typeof items)[number]) => CONFIG.cargo.kinds[i.kind].name;
    const fromFarm = items.filter((i) => i.from === 'kvassfarm');
    expect(fromFarm.length).toBeGreaterThan(0);
    for (const i of fromFarm) expect(kind(i)).toBe('Salmon box');
    for (const i of items.filter((i) => i.to === 'kvassfarm')) expect(kind(i)).toBe('Feed pellets');
    for (const i of items.filter((i) => i.from === 'ytterbrygga')) expect(kind(i)).toBe('Feed pellets');
    for (const i of items.filter((i) => kind(i) === 'Feed pellets')) expect(i.to).toBe('kvassfarm');
    for (const i of items.filter((i) => i.from === 'kvassvik')) expect(kind(i)).toBe('Timber');
    void cargoLabel;
  });
});

describe('jobs and weather', () => {
  it('the cage ring drifts down the fjord; the kayaker is in Trangfjorden', () => {
    const { world, v } = game();
    placeVessel(v, 5900, 0, -6650, 45);
    const tpl = FJORD.jobs!.tows![0];
    const job = startTowCall(world, v, tpl.kind, { name: tpl.name, at: tpl.at });
    const t = world.vessels[job.vesselId];
    expect(t.defId).toBe('cage');
    expect(Math.hypot(t.position[0] - tpl.at!.x, t.position[2] - tpl.at!.z)).toBeLessThanOrEqual(tpl.at!.r + 1);
    expect(groundHeight(t.position[0], t.position[2])).toBeLessThan(-CONFIG.tow.minDepth);
    const r = FJORD.jobs!.rescues![0];
    const inc = startIncident(world, v, null, r.def, r.at);
    expect(inc.defId).toBe('kayaker');
    expect(groundHeight(inc.x, inc.z)).toBeLessThan(0);
  });

  it('a calmer profile than the Sounds: clear days hold, never clear to squall', () => {
    const w = createWeather('Clear', 0);
    for (let i = 0; i < 40; i++) {
      setWeatherPreset(w, 'Clear', 1000 * i, false, undefined, FJORD.weather);
      expect(w.next.preset).not.toBe('Squall');
      expect(w.next.preset).not.toBe('Rain');
    }
  });

  it('the archipelago sheet takes in the Fjord and names every region', () => {
    expect(SHEETS[0].title).toBe('SKERRY SOUND, THE SOUNDS AND THE FJORD');
    expect(SHEETS.some((s) => s.id === 'fjord')).toBe(true);
  });
});

describe('katabatic gusts', () => {
  /** A world with weather, light and fixed (Clear), the home boat at (x, z). */
  function gusty(x: number, z: number) {
    const g = game();
    g.world.environment.weather = createWeather('Clear', 0);
    g.world.environment.weather.fixed = true;
    placeVessel(g.v, x, 0, z, 0);
    return g;
  }

  it('fall in the Fjord in light weather, mostly where the boat is; none at home', () => {
    const { world } = gusty(5250, -7200);
    const env = world.environment;
    const counts: Record<string, number> = {};
    let t = 0;
    for (let i = 0; i < 40000; i++, t += 1) {
      stepGusts(env, t, FJORD, 5250, -7200);
      const g = env.weather!.gust!;
      if (g.zone && g.at === t) counts[g.zone] = (counts[g.zone] ?? 0) + 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    // About one every (150..420 s + its own 25..60 s): 40000 s gives ~120.
    expect(total).toBeGreaterThan(70);
    expect(total).toBeLessThan(200);
    expect(counts.trang / total).toBeGreaterThan(0.6);
    // At home: none.
    const h = gusty(600, 400);
    for (let i = 0; i < 4000; i++) stepGusts(h.world.environment, i, regionById('home'), 600, 400);
    expect(h.world.environment.weather!.gust!.zone).toBeNull();
  });

  it('wait while the weather blows hard', () => {
    const { world } = gusty(5250, -7200);
    const env = world.environment;
    env.weather!.now.wind = CONFIG.gusts.maxBaseWind + 3;
    for (let t = 0; t < 3000; t++) stepGusts(env, t, FJORD, 5250, -7200);
    expect(env.weather!.gust!.zone).toBeNull();
  });

  it('rise, hold and die away; add their wind inside the zone only, from the mountain', () => {
    const { world } = gusty(5250, -7200);
    const env = world.environment;
    const zone = gustNow(env, 100, 5250, -7200)!;
    expect(zone.id).toBe('trang');
    const g = env.weather!.gust!;
    expect(gustEnvelope(g, 100)).toBe(0);
    expect(gustEnvelope(g, 100 + CONFIG.gusts.rise + 1)).toBeGreaterThan(1 - CONFIG.gusts.flutter - 0.01);
    expect(gustEnvelope(g, g.until + 1)).toBe(0);
    stepGusts(env, 100 + CONFIG.gusts.rise + 2, FJORD, 5250, -7200);
    const base = windVector(env, { x: 0, z: 0 });
    const inGut = windVector(env, { x: 0, z: 0 }, { x: zone.x, z: zone.z });
    const outside = windVector(env, { x: 0, z: 0 }, { x: zone.x + zone.r + 50, z: zone.z });
    expect(outside).toEqual(base);
    const add = { x: inGut.x - base.x, z: inGut.z - base.z };
    // From 355°: blowing south (+z), as strong as the zone's peak times the envelope.
    expect(add.z).toBeGreaterThan(0.6 * zone.peakMs);
    expect(Math.abs(add.x)).toBeLessThan(0.15 * Math.hypot(add.x, add.z));
    // The forecast warns of them while the weather is light.
    expect(forecastText(env.weather!, 0, env)).toContain('squalls off the mountains');
  });

  it('shove a stopped boat down the gut: tens of metres in half a minute, none without', () => {
    const drift = (gust: boolean) => {
      const { world, v } = gusty(5255, -7300);
      world.environment.weather!.now.wind = 0.5;
      world.environment.weather!.target.wind = 0.5;
      if (gust) gustNow(world.environment, world.time, 5255, -7300);
      const z0 = v.position[2];
      for (let i = 0; i < 30 * 60; i++) stepWorld(world, [], 1 / 60);
      return v.position[2] - z0;
    };
    const calm = drift(false);
    const blown = drift(true);
    expect(Math.abs(calm)).toBeLessThan(3);
    expect(blown).toBeGreaterThan(15);
  });

  it('every gust zone lies over the Fjord\'s water', () => {
    for (const z of GUSTS) expect(groundHeight(z.x, z.z), z.id).toBeLessThan(0);
  });
});
