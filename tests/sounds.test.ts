/**
 * The Sounds (regions, milestone 4): the region's spine, its gapped shelter, the anchorage
 * bottom, the per-port economy (yards, repairs, buyers, products and needs), the species on
 * the fish box, the region's own jobs, its weather profile, and the chart sheets.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import { createEnvironment } from '../src/environment/environmentState';
import { createWeather, setWeatherPreset } from '../src/environment/weather';
import { buyBlocker, repairCost, repairBlocker, yardAt } from '../src/career/career';
import { cargoLabel, spawnCargo } from '../src/cargo/cargo';
import { groundAt } from '../src/fishing/fishing';
import { SHEETS, SHEET_ASPECT } from '../src/nav/chartSheets';
import { startIncident } from '../src/rescue/rescue';
import { RESCUE_DEFS } from '../src/rescue/rescueDefs';
import { startTowCall } from '../src/tow/tow';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS, TOW_DEFS } from '../src/vessel/vesselDef';
import { BERTHS, BLOCKS, PORTS } from '../src/world/archipelago';
import { bottomAt } from '../src/world/geography';
import { REGIONS, regionById } from '../src/world/regions';
import { SOUNDS } from '../src/world/regions/sounds';
import { arcShelter, shelterFactor } from '../src/world/shelter';
import { groundHeight } from '../src/world/terrain';
import { standingHeight } from '../src/world/geography';

const port = (id: string) => PORTS.find((p) => p.id === id)!;

function game() {
  const { world, vesselId } = createWorld(new IdFactory(), 'workboat');
  const v = world.vessels[vesselId];
  world.environment.waves = [];
  return { world, v };
}
/** Alongside a port's cargo berth, stopped: the harbour office counts her as in. */
function alongside(v: { position: number[] }, berthId: string) {
  const b = BERTHS.find((x) => x.id === berthId)!;
  placeVessel(v as never, b.x, 0, b.z, b.headingDeg);
}

describe('the spine', () => {
  it('a sheltered harbour with fuel and a yard, an exposed pier, an anchorage: in the water, by their quays', () => {
    expect(port('tarsk').kind).toBe('harbour');
    expect(port('tarsk').fuel).toBeDefined();
    expect(CONFIG.boatyards.some((y) => y.port === 'tarsk')).toBe(true);
    expect(port('garbh').kind).toBe('pier');
    expect(port('camas').kind).toBe('anchorage');
    for (const b of SOUNDS.berths) {
      expect(groundHeight(b.x, b.z), b.id).toBeLessThan(-4);
      // The quay or pier deck is where the lines go ashore.
      expect(standingHeight(b.x + b.shoreX * (b.shoreDist + 1), b.z + b.shoreZ * (b.shoreDist + 1)), b.id).toBeCloseTo(b.deckY, 1);
    }
    // The loch is calm; the pier is open water (no shelter zone within reach).
    expect(shelterFactor(600, -4000)).toBeLessThan(0.2);
    expect(shelterFactor(-475, -2175)).toBe(1);
    // The anchorage lies in deep water inside the inlet, and the rocks narrow its entrance.
    const a = port('camas').cargo.anchorage!;
    expect(groundHeight(a.x, a.z)).toBeLessThan(-8);
    expect(groundHeight(400, -3620)).toBeLessThan(-9);
    expect(groundHeight(359, -3620)).toBeGreaterThan(1);
    expect(groundHeight(441, -3620)).toBeGreaterThan(1);
    // The leading lights stand in line on 000°, the rear higher.
    const ldg = SOUNDS.lights.filter((l) => l.name.startsWith('Camas ldg'));
    expect(ldg).toHaveLength(2);
    expect(ldg[0].x).toBe(ldg[1].x);
    expect(ldg[1].y).toBeGreaterThan(ldg[0].y);
    // The quay block is where the berths say.
    expect(BLOCKS.some((b) => b.kind === 'quay' && Math.hypot(b.x - 600, b.z + 3940) < 1)).toBe(true);
  });

  it('the inlet is sheltered from every side but the south; the loch from all', () => {
    const [x, z] = [400, -3740];
    // A sea travelling north (from the south) comes in; one travelling south (from the north) does not.
    expect(arcShelter(x, z, 0, -1)).toBeGreaterThan(0.9);
    expect(arcShelter(x, z, 0, 1)).toBeLessThan(0.2);
    expect(arcShelter(x, z, 1, 0)).toBeLessThan(0.2);
    // The gapped zone is left out of the plain factor (it's applied per wave instead).
    expect(shelterFactor(x, z)).toBe(1);
    // Nowhere near a gapped bay: no effect on any wave.
    expect(arcShelter(0, 0, 0, 1)).toBe(1);
  });

  it('the anchorage bottom: sand in the inlet, sand where nothing says otherwise, holding by bottom', () => {
    expect(bottomAt(400, -3740)).toBe('sand');
    expect(bottomAt(0, -3000)).toBe('sand');
    expect(CONFIG.anchoring.bottomHolding.rock).toBeLessThan(CONFIG.anchoring.bottomHolding.sand);
  });
});

describe('the economy', () => {
  it('the radar is fitted at Loch Tarsk only; the trawl gear at Calder only; repairs cheaper at Tarsk', () => {
    const { world, v } = game();
    world.career!.money = 10000;
    world.career!.rep.calder = 60;
    alongside(v, 'calder-cargo');
    expect(yardAt(world)?.port.id).toBe('calder');
    expect(buyBlocker(world, 'radar')).toBe('Fitted at Loch Tarsk');
    expect(buyBlocker(world, 'trawlGear')).toBeNull();
    v.damage = 0.5;
    const atCalder = repairCost(world, 'hull');
    expect(atCalder).toBe(Math.round(50 * CONFIG.career.repairs.hullPerPercent));
    alongside(v, 'tarsk-cargo');
    expect(yardAt(world)?.port.id).toBe('tarsk');
    expect(buyBlocker(world, 'radar')).toBeNull();
    expect(buyBlocker(world, 'trawlGear')).toBe('Fitted at Calder Haven');
    expect(repairCost(world, 'hull')).toBe(Math.round(atCalder * 0.65));
    expect(repairBlocker(world, 'hull')).toBeNull();
    // At the pier: no yard.
    alongside(v, 'garbh-cargo');
    expect(yardAt(world)).toBeNull();
    expect(repairBlocker(world, 'hull')).toBe('Bring her into a boatyard');
  });

  it('cargo runs follow products and needs: whisky out of Loch Tarsk, feed and materials in', () => {
    const { world } = game();
    for (const id of Object.keys(world.cargo)) delete world.cargo[id];
    for (let i = 0; i < 400; i++) if (!spawnCargo(world)) break;
    const items = Object.values(world.cargo);
    expect(items.length).toBeGreaterThan(20);
    const kind = (i: (typeof items)[number]) => CONFIG.cargo.kinds[i.kind].name;
    const fromTarsk = items.filter((i) => i.from === 'tarsk');
    expect(fromTarsk.length).toBeGreaterThan(0);
    for (const i of fromTarsk) {
      expect(kind(i)).toBe('Whisky cask');
      // Nobody lists whisky as a need: it goes to a port that takes anything (home's).
      expect(['calder', 'brannock', 'selkie']).toContain(i.to);
    }
    // (Feed sacks to Loch Tarsk, or to the Tarsk salmon farm's barge: fish farm service.)
    for (const i of items.filter((x) => kind(x) === 'Feed sack')) expect(['tarsk', 'tarskfarm']).toContain(i.to);
    // Building materials are wanted at Loch Tarsk and, since the Fjord, at Kvassvik.
    for (const i of items.filter((x) => kind(x) === 'Building materials')) expect(['tarsk', 'kvassvik']).toContain(i.to);
    for (const i of items.filter((i) => i.from === 'garbh')) expect(kind(i)).toBe('Feed sack');
  });

  it('the fish box names the ground\'s species', () => {
    expect(groundAt(470, -3250)?.species).toBe('mackerel');
    expect(groundAt(1500, -4300)?.species).toBe('haddock');
    const fish = CONFIG.cargo.kinds.findIndex((k) => k.name === 'Fish box');
    expect(cargoLabel({ id: 'f', kind: fish, mass: 30, from: 'trawl', to: 'any', species: 'mackerel', at: { ground: [0, 0, 0], yaw: 0 } })).toMatch(/Fish box \(mackerel\) 30 kg/);
  });
});

describe('the jobs', () => {
  it('the creel boat is a tow at its own spot, in the radio\'s own words; the cage section floats and tows', () => {
    const { world, v } = game();
    placeVessel(v, 470, 0, -3500, 0);
    const tpl = SOUNDS.jobs!.tows![0];
    const job = startTowCall(world, v, tpl.kind, { name: tpl.name, at: tpl.at });
    const t = world.vessels[job.vesselId];
    expect(t.defId).toBe('dory');
    expect(Math.hypot(t.position[0] - tpl.at!.x, t.position[2] - tpl.at!.z)).toBeLessThanOrEqual(tpl.at!.r + 1);
    expect(groundHeight(t.position[0], t.position[2])).toBeLessThan(-CONFIG.tow.minDepth);
    expect(world.rescue?.radio?.text).toContain('creel boat');
    expect(TOW_DEFS).toContain('cage');
    expect(VESSEL_DEFS.cage.tow?.size).toBe('medium');
    expect(CONFIG.career.pay.tow.cage).toBeGreaterThan(0);
  });

  it('the kayaker is a rescue off the skerries', () => {
    const { world, v } = game();
    placeVessel(v, 900, 0, -3300, 90);
    const tpl = SOUNDS.jobs!.rescues![0];
    const inc = startIncident(world, v, null, tpl.def, tpl.at);
    expect(inc.defId).toBe('kayaker');
    expect(Math.hypot(inc.x - tpl.at!.x, inc.z - tpl.at!.z)).toBeLessThanOrEqual(tpl.at!.r + 1);
    expect(inc.targets[0].kind).toBe('person');
    expect(RESCUE_DEFS.find((d) => d.id === 'kayaker')!.weight).toBe(0); // never from the open-water pool
  });
});

describe('the weather profile', () => {
  it('the Sounds\' director never goes from clear to rain in one step, and holds its own times', () => {
    const w = createWeather('Clear', 0);
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      setWeatherPreset(w, 'Clear', 1000 * i, false, undefined, SOUNDS.weather);
      seen.add(w.next.preset);
      const hold = w.next.at - 1000 * i;
      expect(hold).toBeGreaterThanOrEqual(SOUNDS.weather!.hold![0]);
      expect(hold).toBeLessThanOrEqual(SOUNDS.weather!.hold![1]);
    }
    expect(seen.has('Rain')).toBe(false);
    expect(seen.has('Fog')).toBe(true);
    // Home: the game's own table and holds.
    const env = createEnvironment();
    void env;
    setWeatherPreset(w, 'Clear', 0);
    expect(w.next.at).toBeGreaterThanOrEqual(CONFIG.weather.hold[0]);
  });
});

describe('the chart sheets', () => {
  it('an archipelago sheet with every region, a detail sheet each, all one shape', () => {
    expect(SHEETS[0].id).toBe('archipelago');
    for (const r of REGIONS) expect(SHEETS.some((s) => s.id === r.id)).toBe(true);
    for (const s of SHEETS) {
      expect((s.bounds.x1 - s.bounds.x0) / (s.bounds.z1 - s.bounds.z0)).toBeCloseTo(SHEET_ASPECT, 6);
      const islands = s.id === 'archipelago' ? REGIONS.flatMap((r) => r.islands) : regionById(s.id)!.islands;
      for (const i of islands) {
        expect(i.x - i.radius).toBeGreaterThanOrEqual(s.bounds.x0);
        expect(i.x + i.radius).toBeLessThanOrEqual(s.bounds.x1);
        expect(i.z - i.radius).toBeGreaterThanOrEqual(s.bounds.z0);
        expect(i.z + i.radius).toBeLessThanOrEqual(s.bounds.z1);
      }
    }
    expect(SHEETS[0].gridMinutes).toBeGreaterThan(SHEETS[1].gridMinutes);
  });
});
