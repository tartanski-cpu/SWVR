/**
 * The coast extras plan, C7: ferries on the real routes. The maps' routes (classes, liveries,
 * named ends); and the sailing itself on a made-up route: she slows into port, berths, waits
 * and leaves the other way with a call on the radio; out of sight at the map's edge and back;
 * she holds for a boat in her way; she's solid. Fleets: routes sharing a terminal sailed by a
 * few ships between them, passing port to port, one at the berth at a time.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import { createWorld } from '../src/core/world';
import { ferryContact, ferryPose, fleets, poseFerries, stepFerries, stops, type FerryState } from '../src/traffic/ferries';
import type { FerryRouteDef } from '../src/world/defs';
import { OBAN } from '../src/world/regions/oban';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DT = 0.5;

describe('the maps’ ferry routes', () => {
  it('the Clyde: Rothesay to Wemyss Bay a large ferry in the Clyde colours, docking both ends; Western Ferries in their own; the launches', () => {
    const routes = (JSON.parse(readFileSync(join(root, 'public/regions/clyde/package.json'), 'utf8')) as { ferries: FerryRouteDef[] }).ferries;
    const wb = routes.find((r) => r.name === 'Rothesay - Wemyss Bay')!;
    expect(wb.cls).toBe('large');
    expect(wb.livery).toBe('calmac');
    expect(wb.ends.every((e) => e.dock)).toBe(true);
    expect(wb.ends.map((e) => e.name).sort()).toEqual(['Rothesay', 'Wemyss Bay']);
    expect(routes.find((r) => r.name.startsWith("Hunter's Quay"))?.livery).toBe('other');
    expect(routes.filter((r) => r.cls === 'launch').length).toBe(2);
    // Each ship with a name of her own on the map.
    expect(new Set(routes.map((r) => r.ship)).size).toBe(routes.length);
  });

  it("Oban's: the big ferries sail out past the map's edge for their islands", () => {
    const craignure = OBAN.ferries!.find((r) => r.name === 'Oban - Craignure')!;
    expect(craignure.ends[0]).toEqual({ dock: true, name: 'Oban' });
    expect(craignure.ends[1]).toEqual({ dock: false, name: 'Craignure' });
  });

  it("Oban's island routes, sharing the one pier, are one fleet of three ships; Kerrera's ferry her own", () => {
    const fl = fleets(OBAN.ferries!);
    const big = fl.find((g) => g.routes.some((r) => r.name === 'Oban - Craignure'))!;
    expect(big.routes.length).toBe(6);
    expect(fl.find((g) => g.routes.some((r) => r.name === 'Isle of Kerrera Ferry'))!.routes.length).toBe(1);
    const { world } = createWorld(new IdFactory());
    stepFerries(world, DT, OBAN.ferries!);
    expect(world.ferries!.list.length).toBe(CONFIG.ferries.fleet + 1);
    // Only one of them at the pier to begin with.
    expect(world.ferries!.list.filter((f) => f.phase === 'berthed' && f.route !== fl.find((g) => g.routes.length === 1)!.routes[0].id).length).toBe(1);
  });
});

describe('sailing (C7)', () => {
  // 3 km straight across open water east of the career start, a terminal at each end.
  function setup(ends: FerryRouteDef['ends'] = [{ dock: true, name: 'Westport' }, { dock: true, name: 'Eastport' }]) {
    const { world, vesselId } = createWorld(new IdFactory());
    const v = world.vessels[vesselId];
    const x0 = v.position[0] + 50_000;
    const z0 = v.position[2] + 50_000;
    const route: FerryRouteDef = { id: 'test-ferry', name: 'Westport - Eastport', ship: 'Morvern Star', cls: 'large', livery: 'calmac', path: [[x0, z0], [x0 + 3000, z0]], ends, length: 3000 };
    stepFerries(world, DT, [route]);
    const f = world.ferries!.list[0];
    return { world, v, route, f };
  }
  const run = (s: ReturnType<typeof setup>, sec: number, each?: () => boolean) => {
    for (let t = 0; t < sec; t += DT) {
      stepFerries(s.world, DT, [s.route]);
      if (each?.()) return true;
    }
    return false;
  };

  it('sails to a terminal, slowing into it, berths short of the linkspan, waits, then leaves the other way and says so', () => {
    const s = setup();
    Object.assign(s.f, { s: 100, dir: 1, phase: 'sailing', v: CONFIG.ferries.classes.large.speed, t: 0 });
    let slowest = Infinity;
    expect(run(s, 1200, () => {
      if (s.f.phase === 'sailing' && 3000 - s.f.s < 100) slowest = Math.min(slowest, s.f.v);
      return s.f.phase === 'berthed';
    })).toBe(true);
    expect(slowest).toBeLessThan(CONFIG.ferries.classes.large.speed * 0.5);
    expect(s.f.s).toBeCloseTo(stops(s.route)[1], 3);
    expect(s.f.dir).toBe(-1);
    // Waits, then leaves for the other end; the call is heard, the home boat near.
    s.v.position[0] = s.route.path[1][0];
    s.v.position[2] = s.route.path[1][1] + 600;
    const said = () => s.world.rescue?.radio?.text ?? '';
    expect(run(s, CONFIG.ferries.dwell + 5, () => s.f.phase === 'sailing')).toBe(true);
    expect(said()).toContain('Morvern Star, leaving Eastport for Westport.');
  });

  it("at the map's edge she goes out of sight a while, then comes back in", () => {
    const s = setup([{ dock: true, name: 'Westport' }, { dock: false, name: 'The Islands' }]);
    Object.assign(s.f, { s: 2800, dir: 1, phase: 'sailing', v: 7, t: 0 });
    expect(run(s, 200, () => s.f.phase === 'away')).toBe(true);
    expect(run(s, CONFIG.ferries.away + 5, () => s.f.phase === 'sailing')).toBe(true);
    expect(s.f.dir).toBe(-1);
  });

  it('holds for a boat in her way, on again once it moves', () => {
    const s = setup();
    Object.assign(s.f, { s: 1000, dir: 1, phase: 'sailing', v: 7, t: 0 });
    const p = ferryPose(s.route, s.f, { x: 0, z: 0, heading: 0 });
    s.v.position[0] = p.x + 80;
    s.v.position[2] = p.z;
    run(s, 60);
    expect(s.f.phase).toBe('holding');
    expect(s.f.v).toBe(0);
    s.v.position[2] = p.z + 500;
    run(s, 20);
    expect(s.f.phase).toBe('sailing');
    expect(s.f.v).toBeGreaterThan(0);
  });

  it('is solid: a point in her hull is pushed out; one well clear is not', () => {
    const s = setup();
    Object.assign(s.f, { s: 1500, dir: 1, phase: 'sailing', v: 7, t: 0 });
    const p = ferryPose(s.route, s.f, { x: 0, z: 0, heading: 0 });
    s.v.position[0] = p.x;
    s.v.position[2] = p.z + 30;
    poseFerries(s.world, [s.route]);
    const hit = { depth: 0, nx: 0, ny: 0, nz: 0, fendered: false };
    expect(ferryContact(p.x, 0, p.z + CONFIG.ferries.classes.large.beam / 2 - 0.5, hit)).toBe(true);
    expect(hit.depth).toBeCloseTo(0.5, 5);
    expect(ferryContact(p.x, 0, p.z + 40, hit)).toBe(false);
  });
});

describe('fleets (C7)', () => {
  // Two routes out of the one terminal (Westport, west) to two edges of the map (east and north-east).
  function setup() {
    const { world, vesselId } = createWorld(new IdFactory());
    const v = world.vessels[vesselId];
    const x0 = v.position[0] + 50_000;
    const z0 = v.position[2] + 50_000;
    const a: FerryRouteDef = { id: 'f-a', name: 'Westport - Isles', ship: 'Morvern Star', cls: 'large', livery: 'calmac', path: [[x0, z0], [x0 + 3000, z0]], ends: [{ dock: true, name: 'Westport' }, { dock: false, name: 'Isles' }], length: 3000 };
    const b: FerryRouteDef = { id: 'f-b', name: 'Westport - Far Isles', ship: 'Loch Sunart', cls: 'large', livery: 'calmac', path: [[x0 + 40, z0], [x0 + 3040, z0 - 400]], ends: [{ dock: true, name: 'Westport' }, { dock: false, name: 'Far Isles' }], length: Math.hypot(3000, 400) };
    const routes = [a, b];
    stepFerries(world, DT, routes);
    // The home boat well out of the way.
    v.position[2] = z0 + 20_000;
    return { world, routes, a, b, list: world.ferries!.list };
  }
  const run = (s: ReturnType<typeof setup>, sec: number, each?: () => boolean) => {
    for (let t = 0; t < sec; t += DT) {
      stepFerries(s.world, DT, s.routes);
      if (each?.()) return true;
    }
    return false;
  };

  it('two routes from one terminal are one fleet, a ship each, each with her own name', () => {
    const s = setup();
    expect(fleets(s.routes).length).toBe(1);
    expect(s.list.map((f) => f.ship).sort()).toEqual(['Loch Sunart', 'Morvern Star']);
  });

  it('meeting on the line, two ships pass port to port, well clear', () => {
    const s = setup();
    const [f, g] = s.list;
    Object.assign(f, { route: 'f-a', s: 1000, dir: 1, phase: 'sailing', v: 7 });
    Object.assign(g, { route: 'f-a', s: 2000, dir: -1, phase: 'sailing', v: 7 });
    const pf = { x: 0, z: 0, heading: 0 };
    const pg = { x: 0, z: 0, heading: 0 };
    let closest = Infinity;
    run(s, 120, () => {
      ferryPose(s.a, f, pf);
      ferryPose(s.a, g, pg);
      closest = Math.min(closest, Math.hypot(pf.x - pg.x, pf.z - pg.z));
      return false;
    });
    expect(f.phase).toBe('sailing');
    expect(closest).toBeGreaterThan(CONFIG.ferries.classes.large.beam * 1.5);
  });

  it('a ship behind another going her way keeps station rather than sail into her', () => {
    const s = setup();
    const [f, g] = s.list;
    Object.assign(f, { route: 'f-a', s: 1500, dir: 1, phase: 'holding', v: 0, t: 0 });
    Object.assign(g, { route: 'f-a', s: 1400, dir: 1, phase: 'sailing', v: 7, t: 0 });
    // The one ahead stopped (as for a boat in her way): the one behind stops short of her.
    for (let t = 0; t < 60; t += DT) {
      Object.assign(f, { v: 0, s: 1500, phase: 'holding' });
      stepFerries(s.world, DT, s.routes);
      f.s = 1500;
    }
    expect(g.phase).toBe('holding');
    expect(1500 - g.s).toBeGreaterThan(CONFIG.ferries.classes.large.length * 0.8);
  });

  it('one at the berth at a time: the other lies off till it is free, then comes in', () => {
    const s = setup();
    const [f, g] = s.list;
    Object.assign(f, { route: 'f-a', s: stops(s.a)[0], dir: 1, phase: 'berthed', v: 0, t: 0 });
    Object.assign(g, { route: 'f-b', s: 1200, dir: -1, phase: 'sailing', v: 7, t: 0 });
    run(s, 400);
    expect(f.phase).toBe('berthed');
    expect(g.phase).toBe('holding');
    expect(g.s).toBeGreaterThan(CONFIG.ferries.classes.large.length * (CONFIG.ferries.berthWait - 0.5));
    // Once she's gone, in comes the other.
    expect(run(s, CONFIG.ferries.dwell + 600, () => g.phase === 'berthed')).toBe(true);
  });

  it("back in from the map's edge on the fleet's other route", () => {
    const s = setup();
    const [f, g] = s.list as FerryState[];
    Object.assign(f, { route: 'f-a', s: 3000, dir: -1, phase: 'away', v: 0, t: CONFIG.ferries.away, trips: 0 });
    Object.assign(g, { route: 'f-a', s: 500, dir: 1, phase: 'sailing', v: 7, t: 0 });
    run(s, 2);
    expect(f.route).toBe('f-b');
    expect(f.phase).toBe('sailing');
    expect(f.dir).toBe(-1);
  });
});

describe('a long day at the busiest terminals (C7)', () => {
  for (const [name, load] of [
    ['Oban', () => OBAN.ferries!],
    ['Syros', () => (JSON.parse(readFileSync(join(root, 'public/regions/syros/package.json'), 'utf8')) as { ferries: FerryRouteDef[] }).ferries],
  ] as const)
    it(`${name}: six hours, every ship keeps working and no two lie on top of each other`, () => {
      const routes = load();
      const { world, vesselId } = createWorld(new IdFactory());
      world.vessels[vesselId].position[0] = 1e6; // the home boat far off, out of everyone's way
      stepFerries(world, 2, routes);
      const list = world.ferries!.list;
      const trips = new Map(list.map((f) => [f.id, 0]));
      const was = new Map(list.map((f) => [f.id, f.phase]));
      const a = { x: 0, z: 0, heading: 0 };
      const b = { x: 0, z: 0, heading: 0 };
      let closest = Infinity;
      for (let t = 0; t < 6 * 3600; t += 2) {
        stepFerries(world, 2, routes);
        for (const f of list) {
          if (f.phase !== was.get(f.id) && (f.phase === 'berthed' || f.phase === 'away')) trips.set(f.id, trips.get(f.id)! + 1);
          was.set(f.id, f.phase);
        }
        for (let i = 0; i < list.length; i++)
          for (let j = i + 1; j < list.length; j++) {
            const f = list[i];
            const g = list[j];
            if (f.phase === 'away' || g.phase === 'away') continue;
            ferryPose(routes.find((r) => r.id === f.route)!, f, a, routes.find((r) => r.id === f.design)!.cls);
            ferryPose(routes.find((r) => r.id === g.route)!, g, b, routes.find((r) => r.id === g.design)!.cls);
            closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
          }
      }
      for (const n of trips.values()) expect(n).toBeGreaterThan(2);
      expect(closest).toBeGreaterThan(CONFIG.ferries.classes.large.beam * 1.5);
    });
});
