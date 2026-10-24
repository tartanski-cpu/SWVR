/**
 * Crew transfer to the wind farm, stop 2 (owner, Oct 2026): technicians wait on the quay at
 * Calder Haven, board a boat made fast there, and step across to their turbine's landing when
 * she's held on it with her bow; all up, the job pays (transfer/transfer.ts).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { useDesign } from '../src/boats/sims';
import { CONFIG } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld, type WorldState } from '../src/core/world';
import { DESIGN_HULLS } from '../src/shipyard/build';
import { DEFAULT_DESIGN, type ShipDesign } from '../src/shipyard/design';
import { landedOn, raiseTransfer } from '../src/transfer/transfer';
import { hullPlan } from '../src/vessel/layout';
import { placeVessel } from '../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import type { VesselState } from '../src/vessel/vesselState';
import { BERTHS, WIND_FARMS } from '../src/world/archipelago';
import { landingAxis, landingFace, platformAt } from '../src/world/windFarm';
import { worldWalkArea } from '../src/world/landWalkArea';
import { startEngine } from './helpers/engine';

afterAll(() => useDesign(DEFAULT_DESIGN));

const CAT = DESIGN_HULLS.findIndex((h) => h.name.startsWith('Fast catamaran'));
const cat = (): ShipDesign => ({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[CAT].defaults, hull: CAT });
const DT = 1 / 60;
/** What the radio has said (its latest message, heard tick by tick). */
const heard: string[] = [];
const listen = (world: WorldState) => {
  const t = world.rescue?.radio?.text;
  if (t && heard[heard.length - 1] !== t) heard.push(t);
};
const run = (world: WorldState, s: number) => {
  for (let i = 0; i < s / DT; i++) {
    stepWorld(world, [], DT);
    listen(world);
  }
};

/** Made fast at Calder Haven's cargo berth. */
function moorAtCalder(v: VesselState): void {
  const b = BERTHS.find((x) => x.id === 'calder-cargo')!;
  placeVessel(v, b.x - 3, 0, b.z, b.headingDeg);
  Object.assign(v.mooring, { phase: 'moored', berthId: b.id });
}

/** Her bow fender `gap` m off a turbine's landing, heading onto it. */
function offLanding(v: VesselState, farm: number, turbine: number, gap: number): void {
  const t = WIND_FARMS[farm].turbines[turbine];
  const f = landingFace(t);
  const { ax, az } = landingAxis(t.landingDeg);
  const plan = hullPlan(VESSEL_DEFS[v.defId]);
  const off = -(plan.stem - CONFIG.modules.bowFender.thickness) + gap;
  Object.assign(v.mooring, { phase: 'free', berthId: null });
  placeVessel(v, f.x + ax * off, 0, f.z + az * off, (t.landingDeg + 180) % 360);
  v.linearVelocity = [0, 0, 0];
  v.angularVelocity = [0, 0, 0];
}

function setup() {
  useDesign(cat());
  const { world, vesselId } = createWorld(new IdFactory(), 'design');
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  return { world, v };
}

describe('crew transfer to the wind farm', { timeout: 180000 }, () => {
  it('a job: technicians on the quay at Calder Haven; a boat made fast there takes them aboard, one at a time, to seats on her deck', () => {
    const { world, v } = setup();
    expect(world.transfer!.spawn).toBe(false);
    const job = raiseTransfer(world, 0, 1, 3)!;
    expect(job.techs.every((t) => t.phase === 'quay')).toBe(true);
    expect(world.rescue?.radio?.text ?? '').toMatch(/3 technicians for Holm Rig turbine 2/);
    // Not while she's away.
    offLanding(v, 0, 0, 30);
    run(world, 3);
    expect(job.techs.every((t) => t.phase === 'quay')).toBe(true);
    moorAtCalder(v);
    // The first steps aboard as she's made fast; the next `boardEvery` s later.
    run(world, 0.5);
    expect(job.techs.filter((t) => t.phase === 'aboard')).toHaveLength(1);
    run(world, CONFIG.transfer.boardEvery);
    expect(job.techs.filter((t) => t.phase === 'aboard')).toHaveLength(2);
    run(world, 2);
    expect(job.techs.every((t) => t.phase === 'aboard')).toBe(true);
    expect(job.vesselId).toBe(v.id);
    // Each their own seat, on her deck.
    const seats = job.techs.map((t) => t.seat!.join(','));
    expect(new Set(seats).size).toBe(3);
    // Only one job at a time.
    expect(raiseTransfer(world, 0, 0, 2)).toBeNull();
  });

  it('held on their turbine\'s landing they step across one by one, climb to the platform; all up, it pays; the wrong turbine says so', () => {
    const { world, v } = setup();
    const job = raiseTransfer(world, 0, 1, 2)!;
    moorAtCalder(v);
    run(world, 4);
    expect(job.techs.every((t) => t.phase === 'aboard')).toBe(true);
    startEngine(world, v);
    // The wrong turbine first.
    offLanding(v, 0, 0, 1.5);
    stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'lever', value: 0.25 } as Intent], DT);
    run(world, 8);
    expect(landedOn(v)).toEqual({ farm: 0, turbine: 0 });
    expect(world.transfer!.landed[v.id]).toBe('0:0');
    expect(job.techs.every((t) => t.phase === 'aboard')).toBe(true);
    expect(heard.some((m) => /that's Holm Rig turbine 1/.test(m))).toBe(true);
    // Their own: on the landing, held; the first steps across after `hold` s, the next `perTech` later.
    const money0 = world.career!.money;
    offLanding(v, 0, 1, 1.5);
    run(world, 2.5);
    expect(landedOn(v)).toEqual({ farm: 0, turbine: 1 });
    run(world, CONFIG.transfer.landing.hold + 0.2);
    expect(job.techs.filter((t) => t.phase !== 'aboard')).toHaveLength(1);
    run(world, CONFIG.transfer.landing.perTech + 0.2);
    expect(job.techs.filter((t) => t.phase !== 'aboard')).toHaveLength(2);
    // Up the ladder to the platform, and paid.
    run(world, 25);
    expect(job.techs.every((t) => t.phase === 'platform')).toBe(true);
    expect(job.done).toBe(true);
    expect(world.career!.money - money0).toBeGreaterThanOrEqual(CONFIG.career.pay.transfer + 2 * CONFIG.career.pay.transferPerPerson);
    expect(world.career!.ledger.at(-1)!.text).toMatch(/Crew transfer: 2 technicians to Holm Rig turbine 2/);
  });

  it('nobody steps across a gap: off the landing the count starts again', () => {
    const { world, v } = setup();
    const job = raiseTransfer(world, 0, 2, 2)!;
    moorAtCalder(v);
    run(world, 4);
    startEngine(world, v);
    offLanding(v, 0, 2, 1.5);
    stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'lever', value: 0.25 } as Intent], DT);
    run(world, 2.5);
    run(world, CONFIG.transfer.landing.hold - 1);
    // Backed off before the count: nobody across.
    stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'lever', value: -0.4 } as Intent], DT);
    run(world, 4);
    expect(landedOn(v)).toBeNull();
    expect(job.hold).toBe(0);
    expect(job.techs.every((t) => t.phase === 'aboard')).toBe(true);
  });
});

describe('players across to the turbine', { timeout: 120000 }, () => {
  it('held on a landing, a player steps across onto the platform (it can be walked), and back aboard', () => {
    useDesign(cat());
    const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'design');
    world.environment.waves = [];
    const v = world.vessels[vesselId];
    startEngine(world, v);
    offLanding(v, 0, 0, 1.5);
    stepWorld(world, [{ playerId: 'p', targetId: v.id, control: 'lever', value: 0.25 } as Intent], DT);
    run(world, 4);
    expect(world.transfer!.landed[v.id]).toBe('0:0');
    stepWorld(world, [{ playerId: localPlayerId, targetId: localPlayerId, control: 'board', value: 1, ref: 'turbine:0:0' }], DT);
    const p = world.players[localPlayerId];
    expect(p.aboardVesselId).toBeNull();
    expect(p.position[1]).toBe(CONFIG.windFarm.platform.y);
    expect(platformAt(p.position[0], p.position[2])).toBe('0:0');
    // Walkable round it, not off its edge, not inside the tower.
    const t = WIND_FARMS[0].turbines[0];
    const area = worldWalkArea();
    expect(area.walkable(p.position[0], p.position[2], p.position[1])).toBe(true);
    expect(area.walkable(t.x, t.z + CONFIG.windFarm.platform.radius + 1, CONFIG.windFarm.platform.y)).toBe(false);
    expect(area.walkable(t.x, t.z, CONFIG.windFarm.platform.y)).toBe(false);
    stepWorld(world, [{ playerId: localPlayerId, targetId: localPlayerId, control: 'board', value: 1, ref: v.id }], DT);
    expect(p.aboardVesselId).toBe(v.id);
  });
});
