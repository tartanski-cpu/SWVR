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
import { activeProject, isProjectItem, laidMarks, layProjectBuoy, projectOffered, stepProjects } from '../src/career/projects';
import { useDesign } from '../src/boats/sims';
import { craneStateOf, cranesOf, hookOnBoat } from '../src/cargo/craneHook';
import { DEFAULT_DESIGN } from '../src/shipyard/design';
import { startEngine } from './helpers/engine';

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
    // Nothing more to do until the next stage is built: no jobs, nothing on the quay.
    stepProjects(world);
    expect(activeProject(world)!.jobs).toHaveLength(0);
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
