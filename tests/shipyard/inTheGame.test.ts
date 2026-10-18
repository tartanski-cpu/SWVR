/**
 * Shipyard boats in the game (owner, Oct 2026: they're to take over from the workboat, so
 * they need the workboat's kind of cover). A set of designs, one of each hull type with
 * different gear, pinned by their codes (a player's boat is her code: these must always
 * read back and build as they did), sailed in the game's own world: moored at the start
 * berth, flat out (her speed pinned, as the workboat's sea trials are), answering the helm,
 * stopping, and taking a survivor aboard.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gearOf, hasModule, useDesign } from '../../src/boats/sims';
import { LIBRARY, RECIPES } from '../../src/boats/library';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld } from '../../src/core/world';
import { fillerPoints } from '../../src/fuel/fuelHose';
import { validateRecipe } from '../../src/modular/recipe';
import { vesselToWorld } from '../../src/rescue/recovery';
import { decodeDesign, DEFAULT_DESIGN, encodeDesign, type ShipDesign } from '../../src/shipyard/design';
import { fullAhead } from '../../src/shipyard/trial';
import { hullPlan } from '../../src/vessel/layout';
import { placeVessel } from '../../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import { fakeCanvas } from '../modular/fakes';

beforeAll(fakeCanvas);
// The 'design' vessel type back as the Shipyard starts (for the files run after this one).
afterAll(() => useDesign(DEFAULT_DESIGN));

const DT = 1 / 60;
const KN = 0.5144;

/** The pinned boats: her code, what she is, her speed flat out on calm water (kn, the Shipyard's trial). */
const BOATS = [
  { code: '00XN3-V2SBD-VB2G0-47GG4', what: 'landing craft, basic controls, a life ring', knots: 20.59, skiff: false },
  { code: '03A4C-1JEMK-K20C0-39VN0-8', what: 'gillnetter: a skiff, a side door, a life ring', knots: 10.3, skiff: true },
  { code: '04CWN-VJ7WP-D6HE0-87GG0', what: 'workboat type: deck crane, tow winch and roller, searchlight, fire monitor', knots: 13.22, skiff: false },
  { code: '064GC-J03DJ-35TTG-49K0G', what: 'pilot boat: twin engines, a deckhouse', knots: 23.93, skiff: false },
  { code: '00XN6-S0EAF-FPXHH-81FE5-0Q', what: 'small tug: twin engines, tow winch and roller', knots: 10.08, skiff: false },
];

function design(code: string): ShipDesign {
  const read = decodeDesign(code);
  if (!('design' in read)) throw new Error(`${code}: ${read.error}`);
  return read.design;
}

/** The game's world in her (as App makes it), and intents to her. */
function game(code: string, opts: Parameters<typeof createWorld>[2] = {}) {
  useDesign(design(code));
  const { world, vesselId } = createWorld(new IdFactory(), 'design', opts);
  const v = world.vessels[vesselId];
  const send = (control: string, value: number, more: Partial<Intent> = {}) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value, ...more } as Intent], DT);
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  return { world, v, send, run };
}

const speedKn = (v: { linearVelocity: number[] }) => Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / KN;
/** Her speed ahead (m/s; her bow is -z in her own axes). */
function headway(v: { linearVelocity: number[]; orientation: number[] }): number {
  const [x, y, z, w] = v.orientation;
  const fx = -(2 * (x * z + w * y));
  const fz = -(1 - 2 * (x * x + y * y));
  return v.linearVelocity[0] * fx + v.linearVelocity[2] * fz;
}
const yawDeg = (q: number[]) => (Math.atan2(2 * (q[3] * q[1] + q[0] * q[2]), 1 - 2 * (q[1] * q[1] + q[0] * q[0])) * 180) / Math.PI;

describe.each(BOATS)('Shipyard boat $code ($what)', (b) => {
  it('her code still reads back as her and builds her cleanly: no warnings, a valid recipe', () => {
    const d = design(b.code);
    expect(encodeDesign(d)).toBe(b.code);
    const boat = useDesign(d);
    expect(boat.warnings).toEqual([]);
    expect(validateRecipe(RECIPES.design, LIBRARY)).toEqual([]);
  });

  it('has what every boat in the game needs: a diesel and fillers, a VHF, the hand gear, rescue places for her life ring', () => {
    useDesign(design(b.code));
    const def = VESSEL_DEFS.design;
    expect(gearOf({ defId: 'design' }, 'diesel')).not.toBeNull();
    expect(fillerPoints(def)).toHaveLength(2);
    expect(hasModule('design', 'radio.vhf')).toBe(true);
    expect(def.stowage?.torch).toBeDefined();
    expect(def.stowage?.extinguisher).toBeDefined();
    expect(gearOf({ defId: 'design' }, 'lifeRing')).not.toBeNull();
    expect(gearOf({ defId: 'design' }, 'boatHook')).not.toBeNull();
    // The seats are on her deck, inside her bulwarks; the stern they climb over at her transom.
    const plan = hullPlan(def);
    const rg = def.rescueGear!;
    for (const [x, z] of rg.seats) {
      expect(z).toBeGreaterThan(plan.stem);
      expect(z).toBeLessThan(plan.transom);
      expect(Math.abs(x)).toBeLessThan(plan.halfBeam(z) - 0.2);
    }
    expect(Math.abs(rg.stern[2] - plan.transom)).toBeLessThan(0.3);
  });

  it('starts as the game starts her: moored at the Calder Haven berth, lying quietly (not pressed into the quay), her skiff in its cradle if she has one', () => {
    const { world, v, run } = game(b.code, { harbour: true, tender: true });
    const at = [...v.position];
    run(20);
    expect(v.mooring.phase).toBe('moored');
    expect(Math.hypot(v.position[0] - at[0], v.position[2] - at[2])).toBeLessThan(0.6);
    expect(speedKn(v)).toBeLessThan(0.3);
    const skiff = Object.values(world.vessels).find((x) => x.defId === 'skiff');
    expect(!!skiff).toBe(b.skiff);
    if (skiff) expect(skiff.tender?.phase).toBe('stowed');
  });

  it(`flat out on calm water she makes her speed (${b.knots} kn, within 5 %)`, () => {
    const kn = fullAhead(design(b.code)).knots;
    expect(kn).toBeGreaterThan(b.knots * 0.95);
    expect(kn).toBeLessThan(b.knots * 1.05);
  });

  it('answers the helm under way, and stops when put astern', () => {
    const { world, v, send, run } = game(b.code);
    world.environment.waves = [];
    world.geography = 'openSea';
    placeVessel(v, 0, 0, 0, 0);
    send('quickStart', 1);
    run(5);
    send('lever', 0.6);
    run(30);
    const before = yawDeg(v.orientation);
    send('helm', 1);
    run(15);
    let turned = Math.abs(yawDeg(v.orientation) - before);
    if (turned > 180) turned = 360 - turned;
    expect(turned).toBeGreaterThan(40);
    // Full astern: her headway is gone (she gathers sternway) within a minute.
    send('helm', 0);
    send('lever', -1);
    let stopped = Infinity;
    for (let i = 0; i < 60 / DT && stopped === Infinity; i++) {
      stepWorld(world, [], DT);
      if (headway(v) <= 0) stopped = i * DT;
    }
    expect(stopped).toBeLessThan(60);
  });

  it('a survivor in the water: the life ring thrown to them, the line hauled in, in neutral they climb aboard to a seat', () => {
    const { world, v, send, run } = game(b.code);
    world.environment.waves = [];
    world.geography = 'openSea';
    placeVessel(v, 0, 0, -400, 0);
    send('rescueDebugNear', 1, { ref: 'manOverboard' });
    const inc = world.rescue!.active!;
    expect(inc).toBeTruthy();
    const t = inc.targets[0];
    // Astern on her quarter, where the ring goes.
    const st = vesselToWorld(v, VESSEL_DEFS.design.rescueGear!.stern);
    t.x = st.x + 3;
    t.z = st.z + 12;
    send('ringTake', 1);
    send('ringThrow', 1, { args: [t.x + 1, 2, t.z, 0, 0, 0] });
    run(1);
    expect(t.phase).toBe('onLine');
    for (let k = 0; k < 25 && t.phase === 'onLine'; k++) {
      send('ringPull', 1);
      run(0.2);
    }
    run(CONFIG.rescue.climbTime + 0.5);
    expect(t.phase).toBe('aboard');
    expect(inc.phase).toBe('recovered');
  });
});

describe('Shipyard boats: rescue calls', () => {
  it('a boat with a life ring gets the emergency calls; one without has no rescue places and gets none', () => {
    const { world, v, send } = game(BOATS[0].code);
    placeVessel(v, 0, 0, -400, 0);
    send('rescueDebugTrigger', 1);
    expect(world.rescue!.active?.phase).toBe('calling');
    const bare = game(encodeDesign({ ...design(BOATS[0].code), lifeRing: 0 }));
    expect(VESSEL_DEFS.design.rescueGear).toBeUndefined();
    placeVessel(bare.v, 0, 0, -400, 0);
    bare.send('rescueDebugTrigger', 1);
    expect(bare.world.rescue!.active).toBeNull();
  });
});
