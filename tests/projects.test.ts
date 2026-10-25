/**
 * Construction projects (career/projects.ts; owner, Oct 2026: the first, Tarran Rig, a
 * two-turbine wind farm north of Calder Haven): offered at its office, its survey lines run at
 * survey speed, its mark buoys lifted off the quay and lowered into the sea at their spots, each
 * job paid, each stage's bonus when its last job's done; saved with the career.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG, type ProjectJobDef } from '../src/config';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld, type WorldState } from '../src/core/world';
import { parseCareer, serializeCareer } from '../src/career/career';
import { activeProject, foundations, installAt, isProjectItem, jackUpAt, laidMarks, layProjectBuoy, projectOffered, stepProjects, towId } from '../src/career/projects';
import { useDesign } from '../src/boats/sims';
import { craneStateOf, cranesOf, hookOnBoat } from '../src/cargo/craneHook';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { startEngine } from './helpers/engine';
import type { Ship } from '../src/traffic/traffic';

const DT = 1 / 60;
const def = CONFIG.career.projects[0];
const KN = 0.514444;

function setup() {
  const { world, vesselId, localPlayerId } = createWorld(new IdFactory(), 'starterBoat');
  const v = world.vessels[vesselId];
  const send = (control: string, ref?: string, targetId = 'env') => stepWorld(world, [{ playerId: localPlayerId, targetId, control, value: 1, ref } as Intent], DT);
  return { world, v, send };
}

/** At Calder's office and the project taken. */
function taken() {
  const s = setup();
  s.send('teleportToPort', 'calder', s.v.id);
  for (let i = 0; i < 0.5 / DT; i++) stepWorld(s.world, [], DT);
  expect(projectOffered(s.world)?.id).toBe(def.id);
  s.send('careerProjectAccept', def.id);
  return s;
}

/** The project's buoy items for a job. */
const buoysFor = (world: WorldState, job: ProjectJobDef) => Object.values(world.cargo).filter((c) => isProjectItem(c) && c.to === `${def.id}:${job.id}`);

describe('construction projects', { timeout: 30000 }, () => {
  it('Tarran Rig is offered at the Calder office, not elsewhere; taken, it starts at its survey', () => {
    const { world, v, send } = setup();
    send('teleportToPort', 'brannock', v.id);
    for (let i = 0; i < 0.5 / DT; i++) stepWorld(world, [], DT);
    expect(projectOffered(world)).toBeNull();
    const t = taken();
    const a = activeProject(t.world)!;
    expect(a.def.id).toBe('tarranRig');
    expect(a.p.stage).toBe(0);
    expect(projectOffered(t.world)).toBeNull(); // one at a time
  });

  it('the debug button, with no project under way, takes the first (anywhere); pressed again it finishes its stage', () => {
    const { world, send } = setup();
    expect(activeProject(world)).toBeNull();
    send('careerProjectStage');
    expect(activeProject(world)?.def.id).toBe(def.id);
    expect(activeProject(world)!.p.stage).toBe(0);
    send('careerProjectStage');
    expect(activeProject(world)!.p.stage).toBe(1);
  });

  it('a survey line counts only run along it, close to it, at survey speed; the whole of it run, it is paid', () => {
    const { world, v } = taken();
    const job = def.stages[0].jobs.find((j) => j.kind === 'survey')!;
    if (job.kind !== 'survey') throw new Error('no survey');
    const money0 = world.career!.money;
    const run = (kn: number, off: number, across = false) => {
      for (let t = 0.01; t < 1; t += 0.02) {
        v.position[0] = job.from[0] + (job.to[0] - job.from[0]) * t;
        v.position[2] = job.from[1] + (job.to[1] - job.from[1]) * t + off;
        v.linearVelocity[0] = across ? 0 : kn * KN;
        v.linearVelocity[2] = across ? kn * KN : 0;
        stepProjects(world);
      }
    };
    run(12, 0); // too fast
    run(4, 50); // too far off (midway between two lines)
    run(4, 0, true); // across it
    expect(activeProject(world)!.p.survey[job.id] ?? []).toHaveLength(0);
    run(4, 10); // right
    expect(activeProject(world)!.p.done).toContain(job.id);
    expect(world.career!.money).toBe(money0 + job.pay);
  });

  it('a mark buoy waits on the quay; lowered at its spot it is laid and paid, elsewhere it stays on the hook; lost, another comes', () => {
    const { world } = taken();
    stepProjects(world);
    const met = def.stages[0].jobs.find((j) => j.kind === 'buoy')!;
    if (met.kind !== 'buoy') throw new Error('no buoy');
    const [item] = buoysFor(world, met);
    expect(item && 'ground' in item.at).toBe(true);
    expect(layProjectBuoy(world, item, met.at[0] + 200, met.at[1])).toBe(false);
    expect(activeProject(world)!.p.done).not.toContain(met.id);
    const money0 = world.career!.money;
    expect(layProjectBuoy(world, item, met.at[0] + 10, met.at[1] - 5)).toBe(true);
    expect(world.cargo[item.id]).toBeUndefined();
    expect(world.career!.money).toBe(money0 + met.pay);
    expect(laidMarks(world).map((m) => m.kind)).toEqual(['special']);
    // Stage 2's buoys: one lost overboard is put back on the quay.
    for (const j of def.stages[0].jobs) if (j.kind === 'survey') activeProject(world)!.p.survey[j.id] = Array.from({ length: CONFIG.career.projectSurvey.segments }, (_, k) => k);
    stepWorld(world, [{ playerId: 'p', targetId: 'env', control: 'careerProjectStage', value: 1 } as Intent], DT);
    expect(activeProject(world)!.p.stage).toBe(1);
    stepProjects(world);
    const north = def.stages[1].jobs[0];
    const [nb] = buoysFor(world, north);
    expect(nb).toBeTruthy();
    // Lost: gone, and another on the quay the next tick.
    delete world.cargo[nb.id];
    stepProjects(world);
    expect(buoysFor(world, north)).toHaveLength(1);
  });

  it('each stage pays its bonus when its last job is done; the next stage follows; the progress is saved with the career', () => {
    const { world, send } = taken();
    const money0 = world.career!.money;
    send('careerProjectStage'); // debug: the survey done
    const s0 = def.stages[0];
    expect(world.career!.money).toBe(money0 + s0.jobs.reduce((m, j) => m + j.pay, 0) + s0.bonus);
    expect(activeProject(world)!.p.stage).toBe(1);
    const back = parseCareer(serializeCareer(world.career!))!;
    expect(back.project).toEqual(world.career!.project);
    send('careerProjectStage'); // the site marked
    expect(activeProject(world)!.p.stage).toBe(2);
    expect(laidMarks(world).map((m) => m.kind).sort()).toEqual(['E', 'N', 'S', 'W', 'special']);
    // Then the foundations: the monopile tows; no more buoys on the quay.
    stepProjects(world);
    expect(activeProject(world)!.jobs.map((j) => j.kind)).toEqual(['tow', 'tow']);
    expect(Object.values(world.cargo).some(isProjectItem)).toBe(false);
  });

  it('a boat with a deck crane lowers the buoy from her hook into the sea at its spot, and it is laid', () => {
    useDesign({ ...DEFAULT_DESIGN, deckCrane: 1 });
    const { world, vesselId } = createWorld(new IdFactory(), 'design');
    world.environment.waves = [];
    world.geography = 'openSea';
    const v = world.vessels[vesselId];
    startEngine(world, v);
    const send = (control: string, value = 1) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], DT);
    world.career!.project = { id: def.id, stage: 0, done: [], survey: {} };
    const met = def.stages[0].jobs.find((j) => j.kind === 'buoy')!;
    if (met.kind !== 'buoy') throw new Error('no buoy');
    // The boom swung out over her side, the buoy on the hook.
    const path = cranesOf(v)[0].path;
    send('crane.luff', 20);
    send('crane.slew', 90);
    for (let i = 0; i < 6 / DT; i++) stepWorld(world, [], DT);
    const kind = CONFIG.cargo.kinds.findIndex((k) => k.name === CONFIG.career.projectBuoy.kind);
    world.cargo.b1 = { id: 'b1', kind, mass: CONFIG.cargo.kinds[kind].mass, from: 'project', to: `${def.id}:${met.id}`, at: { hook: v.id, crane: path } };
    const s = craneStateOf(v, path)!;
    s.hooked = 'b1';
    // She's on the buoy's spot (the hook a few metres off her side: well inside its radius).
    v.position[0] = met.at[0];
    v.position[2] = met.at[1];
    // Lower the hook to the water and let go.
    const hook = hookOnBoat(v, path)!;
    s.wire += hook.y - v.position[1] + 0.5;
    send('crane.wire', s.wire);
    for (let i = 0; i < 4 / DT; i++) stepWorld(world, [], DT);
    send('crane.hook', 1);
    send('crane.hook', 0);
    expect(world.cargo.b1).toBeUndefined();
    expect(world.career!.project!.done).toContain(met.id);
  });
});

describe('construction projects: the foundations', { timeout: 60000 }, () => {
  /** At stage 3 (the foundations): the survey and the marks done by the debug button. */
  function atFoundations() {
    const s = taken();
    s.send('careerProjectStage');
    s.send('careerProjectStage');
    expect(activeProject(s.world)!.def.stages[activeProject(s.world)!.p.stage].name).toBe('Foundations');
    return s;
  }
  const tows = def.stages[2].jobs;

  it('a monopile comes out to the laydown and waits there, held on its moorings; only a tug can make fast to it', async () => {
    const { world } = atFoundations();
    stepProjects(world);
    const pile = world.vessels[towId(def, tows[0])];
    expect(pile?.defId).toBe('monopile');
    const lay = CONFIG.career.projectTow.laydown;
    for (let i = 0; i < 10 / DT; i++) stepWorld(world, [], DT);
    expect(Math.hypot(pile.position[0] - lay.x, pile.position[2] - lay.z)).toBeLessThan(0.5);
    // Only one out at a time.
    expect(world.vessels[towId(def, tows[1])]).toBeUndefined();
    // The beginner boat can't take it; a tug can.
    const { towTargets } = await import('../src/tow/tow');
    expect(towTargets(world, world.homeVesselId!)).not.toContain(`v:${pile.id}`);
    const tug = createWorld(new IdFactory(), 'smallTug').world;
    tug.vessels[pile.id] = pile;
    expect(towTargets(tug, tug.homeVesselId!)).toContain(`v:${pile.id}`);
  });

  it('let go at its turbine and lying slow, the jack-up takes it, drives it, and a foundation stands there, solid; then the next comes out', async () => {
    const { world } = atFoundations();
    stepProjects(world);
    const pile = world.vessels[towId(def, tows[0])];
    const t = def.turbines[0];
    // As if a tug had brought it out and let go: off its moorings, lying at the turbine.
    activeProject(world)!.p.released = [tows[0].id];
    const money0 = world.career!.money;
    for (let i = 0; i < 12 / DT; i++) {
      pile.position[0] = t.x + 12;
      pile.position[2] = t.z + 5;
      pile.linearVelocity[0] = pile.linearVelocity[2] = 0;
      stepProjects(world, DT);
      if (!world.vessels[pile.id]) break;
    }
    expect(world.vessels[pile.id]).toBeUndefined();
    expect(world.career!.money).toBe(money0 + tows[0].pay);
    expect(foundations(world)).toMatchObject([{ x: t.x, z: t.z, driving: expect.any(Number), tp: null }]);
    expect(jackUpAt(world)).toEqual({ x: t.x, z: t.z - CONFIG.career.projectJackUp.offsetM });
    // Driven: a foundation, solid.
    const { blockContact } = await import('../src/world/geography');
    const hit = { depth: 0, nx: 0, ny: 0, nz: 0, fendered: false };
    for (let i = 0; i < (CONFIG.career.projectTow.driveS + 1) / DT; i++) stepWorld(world, [], DT);
    expect(foundations(world)).toMatchObject([{ x: t.x, z: t.z, driving: null, tp: null }]);
    expect(blockContact(t.x + 1, 0, t.z, hit)).toBe(true);
    expect(blockContact(t.x + 10, 0, t.z, hit)).toBe(false);
    // The next pile at the laydown; the jack-up moved to its turbine.
    expect(world.vessels[towId(def, tows[1])]?.defId).toBe('monopile');
    expect(jackUpAt(world)!.x).toBe(def.turbines[1].x);
    // Saved mid-way: the pile being driven counts as driven when read back.
    activeProject(world)!.p.driving = { [tows[1].id]: world.time };
    const back = parseCareer(serializeCareer(world.career!))!;
    expect(back.project!.driven).toEqual([tows[0].id, tows[1].id]);
  });
});

describe('construction projects: the transition pieces', { timeout: 60000 }, () => {
  /** At stage 4: everything before done by the debug button (both piles driven). */
  function atTps() {
    const s = taken();
    for (let i = 0; i < 3; i++) s.send('careerProjectStage');
    const a = activeProject(s.world)!;
    expect(a.def.stages[a.p.stage].name).toBe('Transition pieces');
    return s;
  }
  const [tpsJob, supplyJob] = def.stages[3].jobs;

  it('the barge comes out to the laydown; handed over alongside the jack-up, the pieces go on one by one, each a turbine base with its boat landing, solid', async () => {
    const { world } = atTps();
    stepProjects(world);
    const barge = world.vessels[towId(def, tpsJob)];
    expect(barge?.defId).toBe('tpBarge');
    // The jack-up stands at the first turbine; the barge let go alongside her.
    const ju = jackUpAt(world)!;
    expect(ju.x).toBe(def.turbines[0].x);
    activeProject(world)!.p.released = [tpsJob.id];
    for (let i = 0; i < 12 / DT && world.vessels[barge.id]; i++) {
      barge.position[0] = ju.x + 30;
      barge.position[2] = ju.z;
      barge.linearVelocity[0] = barge.linearVelocity[2] = 0;
      stepProjects(world, DT);
    }
    expect(world.vessels[barge.id]).toBeUndefined();
    expect(activeProject(world)!.p.done).toContain(tpsJob.id);
    // The first piece being lifted on; then the second; then the jack-up's gone.
    stepProjects(world, DT);
    expect(foundations(world)[0].tp).not.toBeNull();
    for (let i = 0; i < (2 * CONFIG.career.projectTow.fitS + 2) / DT; i++) stepWorld(world, [], DT);
    expect(foundations(world).map((f) => f.tp)).toEqual([1, 1]);
    // Each a turbine base: its boat landing's face solid, as Holm Rig's.
    const { blockContact } = await import('../src/world/geography');
    const { landingFace } = await import('../src/world/windFarm');
    const face = landingFace(def.turbines[0]);
    const hit = { depth: 0, nx: 0, ny: 0, nz: 0, fendered: false };
    expect(blockContact(face.x * 0.98 + def.turbines[0].x * 0.02, 2, face.z * 0.98 + def.turbines[0].z * 0.02, hit)).toBe(true);
    // The supplies still to go: the jack-up stays till they're aboard, then she's gone.
    expect(activeProject(world)!.p.stage).toBe(3);
    expect(jackUpAt(world)).not.toBeNull();
    stepWorld(world, [{ playerId: 'p', targetId: 'env', control: 'careerProjectStage', value: 1 } as Intent], DT);
    expect(jackUpAt(world)).toBeNull();
  });

  it('a supply run: its loads on the Calder quay, carried by hand; brought alongside the jack-up and held there, her crane takes them', () => {
    const { world, v } = atTps();
    stepProjects(world);
    stepProjects(world);
    if (supplyJob.kind !== 'supply') throw new Error('no supply');
    for (let i = 0; i < supplyJob.count + 2; i++) stepProjects(world);
    const loads = Object.values(world.cargo).filter((c) => isProjectItem(c) && c.to === `${def.id}:${supplyJob.id}`);
    expect(loads).toHaveLength(supplyJob.count);
    expect(loads.every((c) => 'ground' in c.at)).toBe(true);
    // Hand cargo, not crane only.
    expect(loads[0].mass).toBeLessThanOrEqual(CONFIG.cargo.twoHandKg);
    // Two of them aboard, alongside the jack-up and slow: taken.
    const ju = jackUpAt(world)!;
    for (const c of loads.slice(0, 2)) c.at = { vessel: v.id, pos: [0, 1, 2], yaw: 0, vel: [0, 0], lashed: false };
    const money0 = world.career!.money;
    for (let i = 0; i < 8 / DT; i++) {
      v.position[0] = ju.x + 25;
      v.position[2] = ju.z;
      v.linearVelocity[0] = v.linearVelocity[2] = 0;
      stepProjects(world, DT);
    }
    expect(activeProject(world)!.p.supplied?.[supplyJob.id]).toBe(2);
    expect(world.career!.money).toBe(money0); // paid when all are aboard her
    for (const c of Object.values(world.cargo).filter((c) => isProjectItem(c) && c.to === `${def.id}:${supplyJob.id}`)) c.at = { vessel: v.id, pos: [0, 1, 2], yaw: 0, vel: [0, 0], lashed: false };
    for (let i = 0; i < 8 / DT && !activeProject(world)!.p.done.includes(supplyJob.id); i++) {
      v.position[0] = ju.x + 25;
      v.position[2] = ju.z;
      v.linearVelocity[0] = v.linearVelocity[2] = 0;
      stepProjects(world, DT);
    }
    expect(activeProject(world)!.p.done).toContain(supplyJob.id);
    expect(world.career!.money).toBe(money0 + supplyJob.pay);
  });

  it('saved mid-way, a piece being lifted on reads back as on, and the supplies taken stay counted', () => {
    const { world } = atTps();
    const p = activeProject(world)!.p;
    p.fitting = { '0': world.time };
    p.supplied = { [supplyJob.id]: 3 };
    const back = parseCareer(serializeCareer(world.career!))!;
    expect(back.project!.fitted).toEqual([0]);
    expect(back.project!.supplied).toEqual({ [supplyJob.id]: 3 });
  });
});

describe('construction projects: the turbines', { timeout: 60000 }, () => {
  /** At stage 5: everything before done by the debug button (piles driven, pieces on). */
  function atTurbines() {
    const s = taken();
    for (let i = 0; i < 4; i++) s.send('careerProjectStage');
    const a = activeProject(s.world)!;
    expect(a.def.stages[a.p.stage].name).toBe('Turbines');
    return s;
  }
  const [guardJob, fit1, fit2] = def.stages[4].jobs;
  const g = CONFIG.career.projectGuard;
  const ic = CONFIG.career.projectInstall;

  it('the installation ship stands at turbine 1; she lifts only while a guard boat stands by and no ship is in the zone', () => {
    const { world, v } = atTurbines();
    stepProjects(world, DT);
    const inst = installAt(world)!;
    expect(inst.turbine).toBe(0);
    expect(inst.x).toBe(def.turbines[0].x);
    // The boat in Calder, far off: no work.
    for (let i = 0; i < 60; i++) stepProjects(world, DT);
    expect(foundations(world)[0].erect).toBeNull();
    // Standing by: the tower goes up.
    v.position[0] = inst.x + 300;
    v.position[2] = inst.z;
    for (let i = 0; i < 60; i++) stepProjects(world, DT);
    expect(activeProject(world)!.p.guarded).toBe(true);
    const e1 = foundations(world)[0].erect!;
    expect(e1).toBeGreaterThan(0);
    // A ship bound for the works, unmet, gets into the zone: a strike, all stop, and she's turned away.
    const ship: Ship = { id: 'shipX', type: 'cargo', name: 'Test Trader', x: inst.x - g.zone + 10, z: inst.z, course: Math.PI / 2, speed: 0, sighted: false, hornAt: 0, bound: def.id };
    world.traffic!.ships.push(ship);
    stepProjects(world, DT);
    expect(activeProject(world)!.p.strikes).toBe(1);
    expect(ship.bound).toBeUndefined();
    expect(ship.want).toBeDefined();
    const e2 = foundations(world)[0].erect!;
    for (let i = 0; i < 30; i++) stepProjects(world, DT);
    expect(foundations(world)[0].erect).toBe(e2); // still in the zone: no lifting
    // Met by the guard boat before the zone: called up, she alters away, no strike.
    world.traffic!.ships = [];
    const ship2: Ship = { id: 'shipY', type: 'yacht', name: 'Test Yacht', x: inst.x - 800, z: inst.z, course: Math.PI / 2, speed: 0, sighted: false, hornAt: 0, bound: def.id };
    world.traffic!.ships.push(ship2);
    v.position[0] = ship2.x + 100;
    stepProjects(world, DT);
    expect(activeProject(world)!.p.warned).toBe(1);
    expect(activeProject(world)!.p.strikes).toBe(1);
    expect(ship2.bound).toBeUndefined();
    // Her new course passes clear of the works (she was heading straight for them).
    const c = ship2.want!;
    const dx = inst.x - ship2.x;
    const dz = inst.z - ship2.z;
    expect(Math.abs(dx * Math.cos(c) + dz * Math.sin(c))).toBeGreaterThan(g.zone);
  });

  it('while a guard stands by, ships are sent for the works, straight at them', () => {
    const { world, v } = atTurbines();
    stepProjects(world, DT);
    const inst = installAt(world)!;
    v.position[0] = inst.x + 300;
    v.position[2] = inst.z;
    activeProject(world)!.p.shipAt = world.time;
    stepProjects(world, DT);
    const bound = (world.traffic?.ships ?? []).filter((s) => s.bound === def.id);
    expect(bound).toHaveLength(1);
    const s = bound[0];
    expect(Math.hypot(s.x - inst.x, s.z - inst.z)).toBeCloseTo(g.from, 0);
    // Heading for her: her track passes through the works.
    const dx = inst.x - s.x;
    const dz = inst.z - s.z;
    expect(Math.abs(dx * Math.cos(s.course) + dz * Math.sin(s.course))).toBeLessThan(1);
    // One at a time.
    activeProject(world)!.p.shipAt = world.time;
    stepProjects(world, DT);
    expect((world.traffic?.ships ?? []).filter((s) => s.bound === def.id)).toHaveLength(1);
  });

  it('the turbines up, the guard job pays (less a strike); the fitters go out on a crew transfer to the new farm, paid by the project', async () => {
    const { world, v } = atTurbines();
    const { allFarms, platformAt } = await import('../src/world/windFarm');
    const { WIND_FARMS } = await import('../src/world/archipelago');
    stepProjects(world, DT);
    // The farm, for crew transfer and its platforms underfoot, once the pieces are on.
    expect(allFarms()).toHaveLength(WIND_FARMS.length + 1);
    const t0 = def.turbines[0];
    expect(platformAt(t0.x + 4, t0.z)).toBe(`${WIND_FARMS.length}:0`);
    const p = activeProject(world)!.p;
    p.strikes = 1;
    const inst = installAt(world)!;
    v.position[0] = inst.x + 300;
    v.position[2] = inst.z;
    p.shipAt = Infinity;
    // Turbine 1 nearly up: then up, and the ship moves on to turbine 2.
    p.erect = { '0': ic.erectS - 0.05 };
    for (let i = 0; i < 10; i++) stepProjects(world, DT);
    expect(p.erected).toEqual([0]);
    expect(installAt(world)!.turbine).toBe(1);
    // The fitters for turbine 1 called, on the project's farm.
    if (fit1.kind !== 'transfer' || fit2.kind !== 'transfer') throw new Error('no transfer');
    const tj = world.transfer!.job!;
    expect(tj.project).toBe(`${def.id}:${fit1.id}`);
    expect(tj.farm).toBe(WIND_FARMS.length);
    expect(tj.turbine).toBe(0);
    expect(tj.techs).toHaveLength(fit1.techs);
    // All up on the platform: paid by the project (not by the transfer as well).
    const money0 = world.career!.money;
    for (const t of tj.techs) t.phase = 'platform';
    stepWorld(world, [], DT);
    expect(p.done).toContain(fit1.id);
    expect(world.career!.money).toBe(money0 + fit1.pay);
    // Turbine 2 up: the guard job done, less the strike; the installation ship gone.
    const inst2 = installAt(world)!;
    v.position[0] = inst2.x + 300;
    v.position[2] = inst2.z;
    p.erect = { '1': ic.erectS - 0.05 };
    const money1 = world.career!.money;
    for (let i = 0; i < 10; i++) stepProjects(world, DT);
    expect(p.done).toContain(guardJob.id);
    expect(installAt(world)).toBeNull();
    expect(world.career!.money).toBe(money1 + guardJob.pay - g.strike);
    expect(foundations(world).map((f) => f.erect)).toEqual([1, 1]);
  });

  it('saved mid-way, a turbine going up reads back as up, and the guard tally stays', () => {
    const { world } = atTurbines();
    const p = activeProject(world)!.p;
    p.erect = { '0': 30 };
    p.warned = 2;
    p.strikes = 1;
    const back = parseCareer(serializeCareer(world.career!))!;
    expect(back.project!.erected).toEqual([0]);
    expect(back.project!.warned).toBe(2);
    expect(back.project!.strikes).toBe(1);
  });

  it('the debug button finishes the stage: the turbines up, the fitters across', () => {
    const { world, send } = atTurbines();
    send('careerProjectStage');
    const a = activeProject(world)!;
    expect(a.p.stage).toBe(5);
    expect(a.p.erected).toEqual([0, 1]);
    expect(installAt(world)).toBeNull();
  });
});
