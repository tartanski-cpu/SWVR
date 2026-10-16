import { describe, expect, it } from 'vitest';
import { busOf } from '../../src/modular/bus';
import { initModuleState, mergeConfig, portIO, resolvePorts, restoreModuleState } from '../../src/modular/module';
import { evalCondition, flattenMounts, parseCondition, parseRecipe, validateRecipe, type Recipe } from '../../src/modular/recipe';
import { fits } from '../../src/modular/socket';
import { createVesselState } from '../../src/vessel/vesselState';
import { CONSOLE, CRANE, ENGINE, lib, LEVER, RADIO, TEST_HULL, withWriter } from './fakes';

const sock = (id: string) => TEST_HULL.sockets.find((s) => s.id === id)!;

/** A good recipe for the test hull: console with a lever and a rev counter, an engine, a radio on the roof. */
function good(): Recipe {
  return {
    id: 'vessel.test',
    version: 1,
    name: 'Test boat',
    hull: 'hull.test',
    modules: [
      {
        socket: 'helm',
        module: 'console.test',
        modules: [
          { socket: 'slot1', module: 'control.lever' },
          { socket: 'slot2', module: 'instrument.rpm' },
        ],
      },
      { socket: 'engineBay', module: 'engine.test' },
      { socket: 'roof', module: 'radio.test' },
    ],
    interlocks: [{ when: "hatch.engine.open == false && propulsion.state == 'running'", disable: ['control:dipstick'], message: 'Open the engine hatch first.' }],
  };
}

/** The engine module writing propulsion.rpm, as it will once the engine is converted. */
const asModule = <T>(fn: () => T) => withWriter('propulsion.rpm', 'module', fn);

describe('sockets', () => {
  it('a module fits its socket types only', () => {
    expect(fits(LEVER, sock('helm'), {})).toEqual({ ok: false, why: "control.lever goes on panel.slot, not on a 'helm.console' socket" });
    expect(fits(CONSOLE, sock('helm'), CONSOLE.defaults).ok).toBe(true);
  });

  it('the bay limits power, mass and size; tags are required', () => {
    expect(fits(ENGINE, sock('engineBay'), { powerKw: 400, massKg: 1500 }).ok).toBe(true);
    const big = fits(ENGINE, sock('engineBay'), { powerKw: 600, massKg: 1500 });
    expect(big.ok ? '' : big.why).toBe('engine.test is 600 kW; this engine.bay takes up to 450 kW');
    const heavy = fits(ENGINE, sock('engineBay'), { powerKw: 400, massKg: 2500 });
    expect(heavy.ok ? '' : heavy.why).toMatch(/weighs 2500 kg; .* up to 2000 kg/);
    const untagged = { ...sock('engineBay'), tags: [] };
    const t = fits(ENGINE, untagged, ENGINE.defaults);
    expect(t.ok ? '' : t.why).toBe("engine.test needs a socket tagged 'inboard'");
    const tight = { ...sock('engineBay'), capacity: { size: [0.5, 1, 2] as const } };
    const sz = fits(ENGINE, tight, ENGINE.defaults);
    expect(sz.ok ? '' : sz.why).toMatch(/doesn't fit the space/);
  });

  it("lifting gear can't be rated above its foundation", () => {
    expect(fits(CRANE, sock('foredeck'), { swlKg: 400 }).ok).toBe(true);
    const r = fits(CRANE, sock('foredeck'), { swlKg: 800 });
    expect(r.ok ? '' : r.why).toBe('deck.crane-test lifts 800 kg; this foundation is rated for 500 kg');
    expect(fits(CRANE, { ...sock('foredeck'), capacity: {} }, { swlKg: 100 }).ok).toBe(false);
  });
});

describe('recipe check', () => {
  it('a good recipe passes, with nested sockets', () => {
    asModule(() => {
      expect(validateRecipe(good(), lib)).toEqual([]);
      const { mounted } = flattenMounts(good(), lib.hulls, lib.modules);
      expect(mounted.map((m) => m.path)).toEqual(['helm', 'helm/slot1', 'helm/slot2', 'engineBay', 'roof']);
    });
  });

  it('module ids may be aliases', () => {
    const r = good();
    r.modules[0].modules![0].module = 'control.throttle';
    asModule(() => expect(validateRecipe(r, lib)).toEqual([]));
  });

  it('says what is wrong, where, in plain words', () => {
    const r = good();
    r.hull = 'hull.nope';
    expect(validateRecipe(r, lib)).toEqual(["unknown hull 'hull.nope'"]);

    const cases: [(r: Recipe) => void, string][] = [
      [(r) => (r.modules[1].socket = 'enginebay'), "enginebay: hull.test has no socket 'enginebay' (sockets: helm, engineBay, foredeck, roof)"],
      [(r) => (r.modules[1].module = 'engine.nope'), "engineBay: unknown module 'engine.nope'"],
      [(r) => r.modules.push({ socket: 'roof', module: 'radio.test' }), 'roof: two modules on the same socket'],
      [(r) => (r.modules[2].module = 'control.lever'), "roof: control.lever goes on panel.slot, not on a 'roof.mount' socket"],
      [(r) => (r.modules[1].config = { powerKw: 600 }), 'engineBay: engine.test is 600 kW; this engine.bay takes up to 450 kW'],
      [(r) => (r.modules[1].config = { powerKw: 0 }), 'engineBay: engine.test: powerKw must be more than 0'],
      [(r) => (r.modules[0].modules![0].socket = 'slot9'), "helm/slot9: console.test has no socket 'slot9' (sockets: slot1, slot2, slot3)"],
      [(r) => (r.modules[2].modules = [{ socket: 'x', module: 'radio.test' }]), 'roof: radio.test has no sockets for the 1 module(s) listed under it'],
      [(r) => (r.modules[0].modules![1].bind = { revs: 'propulsion.rpm' }), "helm/slot2: instrument.rpm has no port 'revs' (ports: rpm)"],
      [(r) => (r.modules[0].modules![1].bind = { rpm: 'propulsion.rmp' }), "helm/slot2: port 'rpm' bound to unknown key 'propulsion.rmp' (did you mean 'propulsion.rpm'?)"],
    ];
    for (const [edit, want] of cases) {
      const r = good();
      edit(r);
      asModule(() => expect(validateRecipe(r, lib)).toContain(want));
    }
  });

  it('whatever is read must be written by something on the boat', () => {
    const r = good();
    r.modules.splice(1, 1); // no engine
    asModule(() => expect(validateRecipe(r, lib)).toContain("helm/slot2: instrument.rpm reads 'propulsion.rpm', but nothing on this boat writes it"));
    // Until the engine is converted, today's code writes it: fine.
    expect(validateRecipe(r, lib)).toEqual([]);
  });

  it("one writer per value; none for what the boat works out herself, or what today's code still writes", () => {
    // Two engines writing the same rpm.
    const hull2 = { ...lib.hulls.get('hull.test')!, sockets: [...lib.hulls.get('hull.test')!.sockets, { id: 'engineBay2', type: 'engine.bay' as const, transform: { position: [-0.8, 0.2, 0.3] as const }, tags: ['inboard'] }] };
    const lib2 = { hulls: { get: () => hull2 }, modules: lib.modules };
    const twin = good();
    twin.modules.push({ socket: 'engineBay2', module: 'engine.test' });
    asModule(() => expect(validateRecipe(twin, lib2)).toContain("engineBay and engineBay2: both write 'propulsion.rpm'; one value can have only one writer (rebind one of them)"));
    // Rebound to its own keys, two engines are fine (a twin-screw boat).
    twin.modules[3].bind = { rpm: 'propulsion.load' };
    withWriter('propulsion.load', 'module', () => asModule(() => expect(validateRecipe(twin, lib2)).toEqual([])));
    // Writing a key the boat works out from her motion, or one today's code still writes.
    const r2 = good();
    r2.modules[1].bind = { rpm: 'nav.speedKts' };
    expect(validateRecipe(r2, lib)).toContain("engineBay: engine.test writes 'nav.speedKts', which the boat works out from her own motion");
    expect(validateRecipe(good(), lib)).toContain(
      "engineBay: engine.test writes 'propulsion.rpm', but the registry says today's code still writes it (set its writer to 'module' when this module takes it over)",
    );
  });

  it('needs (12 V on a circuit, hydraulics) must be met by the hull or a module', () => {
    const r = good();
    r.modules.push({ socket: 'foredeck', module: 'deck.crane-test' });
    asModule(() => expect(validateRecipe(r, lib)).toEqual(['foredeck: deck.crane-test needs deck hydraulic pressure, and nothing on this boat gives it']));
    const pumpBay = { ...lib.hulls.get('hull.test')!, sockets: [...TEST_HULL.sockets, { id: 'pumpBay', type: 'engine.bay' as const, transform: { position: [0, 0, 1] as const } }] };
    r.modules.push({ socket: 'pumpBay', module: 'hydraulics.test-pump' });
    asModule(() => expect(validateRecipe(r, { hulls: { get: () => pumpBay }, modules: lib.modules })).toEqual([]));
    const dark = { ...TEST_HULL, provides: [{ power: 'electrical' as const, circuits: ['instruments'] }] };
    asModule(() => expect(validateRecipe(good(), { hulls: { get: () => dark }, modules: lib.modules })).toEqual(["roof: radio.test needs 12 V on the 'radio' circuit, and nothing on this boat gives it"]));
  });

  it('interlocks: parsed, real keys, like compared with like, and they do something', () => {
    const bad = (il: Recipe['interlocks']) => asModule(() => validateRecipe({ ...good(), interlocks: il }, lib));
    expect(bad([{ when: 'hatch.engine.open ==', disable: ['control:x'] }])).toContain("interlock 1: expected a number, 'text', true or false after 'hatch.engine.open =='");
    expect(bad([{ when: 'hatch.engin.open == false', disable: ['control:x'] }])).toContain("interlock 1: unknown key 'hatch.engin.open' (did you mean 'hatch.engine.open'?)");
    expect(bad([{ when: "anchor.phase == 'down'", disable: ['control:x'] }])).toContain("interlock 1: 'anchor.phase' is never 'down' (it is one of stowed / paying / set / weighing / hanging)");
    expect(bad([{ when: 'anchor.phase == 1', disable: ['control:x'] }])).toContain("interlock 1: 'anchor.phase' is one of stowed / paying / set / weighing / hanging; compare it with a 'name'");
    expect(bad([{ when: "anchor.phase > 'set'", disable: ['control:x'] }])).toContain("interlock 1: 'anchor.phase' can only be compared with == or !=");
    expect(bad([{ when: 'lights.nav > 0', disable: ['control:x'] }])).toContain("interlock 1: 'lights.nav' is on/off; compare it with == or !=");
    expect(bad([{ when: 'lights.nav == true' }])).toContain('interlock 1: does nothing (give it a limit or controls to disable)');
    expect(bad([{ when: 'lights.nav == true', limit: { key: 'anchor.phase', to: 1 } }])).toContain("interlock 1: can only limit a number, and 'anchor.phase' is a enum");
    expect(bad([{ when: 'lights.nav == true', disable: ['dipstick'] }])).toContain("interlock 1: 'dipstick' should be 'control:<control id>'");
    expect(bad([{ when: 'propulsion.rpm > 1500 || anchor.phase != \'stowed\'', limit: { key: 'throttle.demand', to: [-0.2, 0.2] } }])).toEqual([]);
  });
});

describe('conditions', () => {
  it('parse && and || (and binds tighter), numbers, names, true / false', () => {
    const p = parseCondition("a.b > 0.1 && c.d == 'x' || e.f != true");
    expect(p.ok && p.cond).toEqual({
      any: [
        {
          all: [
            { key: 'a.b', op: '>', value: 0.1 },
            { key: 'c.d', op: '==', value: 'x' },
          ],
        },
        { all: [{ key: 'e.f', op: '!=', value: true }] },
      ],
    });
    expect(parseCondition('x.y <= -2').ok).toBe(true);
  });

  it('refuse junk, saying where', () => {
    const err = (t: string) => {
      const p = parseCondition(t);
      return p.ok ? 'parsed' : p.error;
    };
    expect(err('')).toBe('empty condition');
    expect(err('x.y > 1 && ')).toBe('expected a key at character 12');
    expect(err('x.y 1')).toBe("expected <, <=, >, >=, == or != after 'x.y'");
    expect(err('x.y == lockedUp')).toBe("expected a number, 'text', true or false after 'x.y =='");
    expect(err('x.y == 1 z.w == 2')).toBe('expected && or || at character 10');
    expect(err('x.y == 1 # 2')).toMatch(/can't read "# 2"/);
  });

  it('evaluate against a boat', () => {
    const s = createVesselState('v', 'workboat');
    const bus = busOf(s);
    const c = (t: string) => {
      const p = parseCondition(t);
      if (!p.ok) throw new Error(p.error);
      return evalCondition(p.cond, bus);
    };
    expect(c('hatch.engine.open == false')).toBe(true);
    s.controls.engineHatch = 1;
    expect(c('hatch.engine.open == false')).toBe(false);
    expect(c("anchor.phase == 'stowed'")).toBe(true);
    expect(c("anchor.phase != 'stowed'")).toBe(false);
    s.controls.lever = 0.5;
    expect(c('throttle.demand > 0.2 && anchor.phase == \'set\'')).toBe(false);
    expect(c("throttle.demand > 0.2 || anchor.phase == 'set'")).toBe(true);
    expect(c('throttle.demand <= 0.5 && throttle.demand >= 0.5')).toBe(true);
  });
});

describe('module state and config', () => {
  it('fresh, current, migrated, or started again', () => {
    expect(initModuleState(ENGINE, ENGINE.defaults)).toEqual({ v: 2, s: { hours: 0 } });
    expect(initModuleState(LEVER, {})).toBeUndefined(); // no sim half, no state
    const now = { v: 2, s: { hours: 12 } };
    expect(restoreModuleState(ENGINE, ENGINE.defaults, now)).toBe(now);
    expect(restoreModuleState(ENGINE, ENGINE.defaults, { v: 1, s: { minutes: 90 } })).toEqual({ v: 2, s: { hours: 1.5 } });
    // From a newer game, or junk: start fresh rather than misread it.
    expect(restoreModuleState(ENGINE, ENGINE.defaults, { v: 3, s: { hours: 5, extra: 1 } })).toEqual({ v: 2, s: { hours: 0 } });
    expect(restoreModuleState(ENGINE, ENGINE.defaults, undefined)).toEqual({ v: 2, s: { hours: 0 } });
    // Saved state survives JSON (saves, the network).
    const st = initModuleState(ENGINE, ENGINE.defaults);
    expect(JSON.parse(JSON.stringify(st))).toEqual(st);
  });

  it('config: recipe overrides laid over the defaults', () => {
    expect(mergeConfig(ENGINE, { powerKw: 300 })).toEqual({ powerKw: 300, massKg: 1500 });
    expect(mergeConfig(ENGINE, undefined)).toBe(ENGINE.defaults);
  });

  it('ports: rebinding changes what a module reads and writes, invisibly to it', () => {
    const s = createVesselState('v', 'workboat');
    s.engine.rpm = 1200;
    s.engine.rack = 0.4;
    const bus = busOf(s);
    const plain = portIO(bus, resolvePorts(ENGINE, undefined));
    const rebound = portIO(bus, resolvePorts(ENGINE, { rpm: 'propulsion.load' }));
    expect(plain.num('rpm')).toBe(1200);
    expect(rebound.num('rpm')).toBe(0.4);
    rebound.set('demand', 0.6);
    expect(s.controls.lever).toBe(0.6);
    expect(() => plain.get('nope')).toThrow(/no port 'nope'/);
  });
});

describe('recipes from JSON', () => {
  it('a good one round-trips', () => {
    const r = good();
    const back = parseRecipe(JSON.parse(JSON.stringify(r)));
    expect('recipe' in back && back.recipe).toEqual(r);
  });

  it('junk and misspelt fields are refused, saying where', () => {
    expect(parseRecipe('nope')).toEqual({ errors: ['a recipe is a JSON object'] });
    const r = JSON.parse(JSON.stringify(good()));
    r.modules[0].modules[0].confg = {};
    r.version = '1';
    r.interlocks[0].limit = { key: 'x' };
    const out = parseRecipe(r);
    expect('errors' in out && out.errors).toEqual([
      "recipe: 'version' should be a number",
      "modules[0].modules[0]: unknown field 'confg'",
      "interlocks[0]: 'limit' is { key, to: number or [min, max] }",
    ]);
  });

  it('the radio fits a roof mount or a panel slot', () => {
    expect(fits(RADIO, sock('roof'), {}).ok).toBe(true);
  });
});
