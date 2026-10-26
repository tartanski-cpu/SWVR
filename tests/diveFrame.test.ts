/**
 * The dive A-frame and its submersible (owner, Oct 2026: a dive support ship for the
 * submersible game, "placeable on any boat that's big enough"; modules/diveFrame,
 * shipyard/parts/diveFrame.ts): which boats it fits and why not, and in the game the launch
 * (hoist into the docking head, swing out over the stern, lower until she floats) and the
 * recovery, its interlocks, and the sub's 10 t: designed into the boat on her cradle, moved as
 * she's hung out over the stern, taken off when she floats.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { DIVE_FRAME, diveGeometry, subAt } from '../src/modules/diveFrame';
import { diveFrameOf, diveFrameState, diveSubPayload } from '../src/modules/diveFrame/onBoat';
import { buildDesign, DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../src/shipyard/design';
import { designToken, readDesign, shortCode } from '../src/shipyard/designDoc';
import { startEngine } from './helpers/engine';
import { DIVE_SITES, siteWorld } from '../src/dive/diveSites';
import { diveReady, diveUrl } from '../src/modules/diveFrame/launch';
import { placeVessel } from '../src/vessel/vesselControl';

afterAll(() => useDesign(DEFAULT_DESIGN));

const DT = 1 / 60;
const hull = (name: string) => DESIGN_HULLS.findIndex((h) => h.name.startsWith(name));
const ST = hull('Stern trawler');
const dsv = (more: Partial<ShipDesign> = {}): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[ST].defaults, hull: ST, aFrame: 0, netDrum: 0, trawlWinches: 0, diveFrame: 1, ...more });
const fitted = (d: ShipDesign) => buildDesign(d).recipe.modules.some((m) => m.module === DIVE_FRAME.id);

describe('the dive A-frame', { timeout: 60000 }, () => {
  it('fits the stern trawler; travels as a link or file; smaller boats are told why not', () => {
    const b = buildDesign(dsv());
    expect(b.warnings.filter((w) => /dive/i.test(w))).toEqual([]);
    expect(fitted(dsv())).toBe(true);
    expect(shortCode(dsv())).toBeNull();
    expect(readDesign(designToken(dsv()))).toMatchObject({ design: { diveFrame: 1 } });
    // It takes her transom: the trawl A-frame, if asked for too, is left off, and said.
    const both = buildDesign(dsv({ aFrame: 1 }));
    expect(both.recipe.modules.some((m) => m.module === 'deck.a-frame')).toBe(false);
    expect(both.warnings.some((w) => w.includes('takes her transom'))).toBe(true);
    // Every other hull as she comes: no room aft, or too small, in a few words.
    for (const name of ['Landing craft', 'Gillnetter', 'Pilot boat', 'Fast catamaran']) {
      const H = hull(name);
      const w = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[H].defaults, hull: H, diveFrame: 1 }).warnings.find((x) => x.includes('dive A-frame'));
      expect(w, name).toMatch(/no room for the dive A-frame: (her|she)/);
    }
    // The pilot boat with her house well forward has the deck, but she's far too small for 10 t.
    const pb = hull('Pilot boat');
    const small = buildDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[pb].defaults, hull: pb, housePos: 4, length: 15, diveFrame: 1 });
    expect(small.warnings.find((x) => x.includes('dive A-frame'))).toMatch(/too small for the sub/);
  });

  it('launches the sub over the stern until she floats, and recovers her; its interlocks; her weight where she is', () => {
    useDesign(dsv());
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    world.environment.waves = [];
    world.geography = 'openSea';
    const v = world.vessels[vesselId];
    const hold = (key: string, s: number) => {
      stepWorld(world, [{ playerId: 'p', targetId: v.id, control: key, value: 1 } as Intent], DT);
      for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
      stepWorld(world, [{ playerId: 'p', targetId: v.id, control: key, value: 0 } as Intent], DT);
    };
    const f = diveFrameOf(v)!;
    const c = f.config;
    const g = diveGeometry(c);
    stepWorld(world, [], DT);
    const s = () => diveFrameState(v)!;
    const on = () => subAt(c, s()).on;
    // On her cradle to start: her 10 t is designed into the boat there (no payload).
    expect(on()).toBe('cradle');
    expect(diveSubPayload(v)).toEqual([]);
    // No hydraulic pressure: nothing moves.
    hold('dive.winchUp', 2);
    expect(on()).toBe('cradle');
    startEngine(world, v);
    // Not in the docking head: the frame won't swing.
    hold('dive.frameOut', 2);
    expect(s().luff).toBeCloseTo(g.inDeg, 5);
    // Hoisted into the head, then out over the stern.
    hold('dive.winchUp', 10);
    expect(s().wire).toBe(0);
    expect(on()).toBe('hung');
    hold('dive.frameOut', 25);
    expect(s().luff).toBeCloseTo(g.outDeg, 5);
    expect(subAt(c, s()).lift[2] - c.sub.front).toBeGreaterThan(g.transom); // her bow clear aft of the transom
    // Hung out over the stern: she trims by the stern (the sub's weight there).
    for (let i = 0; i < 4 / DT; i++) stepWorld(world, [], DT);
    const [off, hung] = diveSubPayload(v);
    expect(off.mass).toBe(-c.sub.massKg);
    expect(hung.mass).toBe(c.sub.massKg);
    expect(hung.pos.z).toBeGreaterThan(g.transom);
    // Lowered until she floats: her weight comes off the boat.
    hold('dive.winchDown', 20);
    expect(on()).toBe('afloat');
    expect(diveSubPayload(v).map((p) => p.mass)).toEqual([-c.sub.massKg]);
    // Out at an end with wire out: the frame won't swing her in.
    hold('dive.frameIn', 2);
    expect(s().luff).toBeCloseTo(g.outDeg, 5);
    // Recovered: up into the head, in over the deck, down onto her cradle.
    hold('dive.winchUp', 20);
    expect(s().wire).toBe(0);
    hold('dive.frameIn', 25);
    expect(s().luff).toBeCloseTo(g.inDeg, 5);
    hold('dive.winchDown', 10);
    expect(on()).toBe('cradle');
    expect(diveSubPayload(v)).toEqual([]);
  });

  it('designed in on her cradle, she floats level; hung out over the stern she trims by the stern', () => {
    // (Her trim with the sub on her cradle against her hung out: the sim's payload, measured.)
    useDesign(dsv());
    const trimAfter = (out: boolean) => {
      const { world, vesselId } = createWorld(new IdFactory(), 'design');
      world.environment.waves = [];
      world.geography = 'openSea';
      const v = world.vessels[vesselId];
      stepWorld(world, [], DT);
      const f = diveFrameOf(v)!;
      if (out) Object.assign(diveFrameState(v)!, { luff: diveGeometry(f.config).outDeg, wire: 0 });
      for (let i = 0; i < 20 / DT; i++) stepWorld(world, [], DT);
      // Her pitch (rad): + bow up, her stern down.
      const [x, y, z, w] = v.orientation;
      return Math.asin(2 * (w * x - y * z));
    };
    const aboard = trimAfter(false);
    const out = trimAfter(true);
    expect(Math.abs(aboard)).toBeLessThan(0.01); // level, near enough (her lines carry the sub)
    expect(out - aboard).toBeGreaterThan(0.01); // hung out: by the stern (about 2 deg on the dive ship)
  });

  it('DIVE: only with the sub afloat, the boat over a wreck site and stopped; the submersible game’s address for it', () => {
    useDesign(dsv());
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    const v = world.vessels[vesselId];
    stepWorld(world, [], DT);
    const f = diveFrameOf(v)!;
    const site = DIVE_SITES.find((s) => s.map === 'career')!;
    const at = siteWorld(site)!;
    const why = (map: string | null) => {
      const r = diveReady(v, map);
      return 'why' in r ? r.why : null;
    };
    // On her cradle: put her in the sea first.
    placeVessel(v, at.x, 0, at.z, 0);
    v.linearVelocity = [0, 0, 0];
    expect(why('career')).toMatch(/Put the sub in the sea first/);
    // Afloat over the site, stopped: ready, at this site.
    Object.assign(diveFrameState(v)!, { luff: diveGeometry(f.config).outDeg, wire: 20 });
    expect(diveReady(v, 'career')).toEqual({ site });
    // Moving: stop her first. Away from the site: how far the nearest is. No sites here: said.
    v.linearVelocity = [2, 0, 0];
    expect(why('career')).toMatch(/Stop her over the wreck first/);
    v.linearVelocity = [0, 0, 0];
    placeVessel(v, at.x + 300, 0, at.z, 0);
    expect(why('career')).toMatch(/Not over a wreck: the nearest, the .*, is \d+ m off/);
    expect(why('nowhere')).toMatch(/no dive sites/);
    // The address: the submersible game's own fields (its src/core/handoff.ts).
    const u = new URL(diveUrl(site, 'https://tartanski-cpu.github.io/SWVR/career.html?boat=diveShip', 'abc123'));
    expect(u.origin + u.pathname).toBe(CONFIG.modules.diveFrame.dive.url);
    expect(Object.fromEntries(u.searchParams)).toEqual({ site: site.id, depth: String(site.depthM), sub: 'work3', tier: '3', crew: '1', return: 'https://tartanski-cpu.github.io/SWVR/career.html?boat=diveShip', session: 'abc123' });
  });
});

