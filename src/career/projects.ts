/**
 * Construction projects (owner, Oct 2026: "more comprehensive construction missions for career
 * mode ... build [a wind farm] by towing out and doing some missions"; the first, Tarran Rig, a
 * two-turbine farm "to prove the system"). Plain shared state in the career (CareerState.project,
 * saved with it), stepped by the host like the other jobs; the views only draw it
 * (career/projectView.ts, the chartplotter, the menu's Office > Projects).
 *
 *   offered    at its harbour office (CONFIG.career.projects `port`), once you have the
 *              reputation there; one project at a time, alongside the ordinary contracts.
 *   stages     run in order; each is a handful of jobs, done in any order, by any of the
 *              players' boats. Each job pays when done (`pay`), the stage its `bonus` when its
 *              last job is, the project its `bonus` when its last stage is.
 *   survey     a line run at survey speed: every stretch of it covered close to it, heading
 *              along it (either way), neither too slow nor too fast (CONFIG.career.projectSurvey).
 *   buoy       a mark buoy (crane cargo: CONFIG.career.projectBuoy.kind) waits on the office's
 *              quay; a boat with a deck crane big enough lifts it aboard, carries it out and
 *              lowers it into the sea at its spot. Lowered there, it's laid: a lit mark
 *              (a cardinal, or the met buoy's special mark). Lowered anywhere else, it stays on
 *              the hook; lost overboard, another is put on the quay.
 *
 * Voyage has no career, so no projects. The stages after the last one built so far (the
 * foundations onward: later steps) leave the project waiting at the last stage done.
 */
import { CONFIG, type ProjectDef, type ProjectJobDef } from '../config';
import type { Intent } from '../core/intents';
import { playerBoats } from '../core/launch';
import type { WorldState } from '../core/world';
import { freeCraneSpot, type CargoItem } from '../cargo/cargo';
import { sayRadio } from '../rescue/rescue';
import { PORTS } from '../world/archipelago';
import type { MarkDef } from '../world/defs';
import { createCareer, money, officeAt, portName, post, repOf, addRep } from './career';

/** A project under way: which, the stage it's at, the jobs done, the survey lines' stretches covered. */
export interface ProjectProgress {
  id: string;
  /** Index into its stages; its length when every stage built so far is done (waiting for the next). */
  stage: number;
  /** Job ids done (the whole project's, every stage). */
  done: string[];
  /** Each survey line's stretches covered so far (indices, CONFIG.career.projectSurvey.segments). */
  survey: Record<string, number[]>;
}

/** Kept in a cargo item's `from`: a project's mark buoy (its `to` is "project:job"). */
export const PROJECT_FROM = 'project';

export function isProjectItem(item: CargoItem): boolean {
  return item.from === PROJECT_FROM;
}

export function projectDef(id: string | undefined): ProjectDef | undefined {
  return CONFIG.career.projects.find((p) => p.id === id);
}

/** The project under way, its definition, and the stage's jobs (none when waiting for the next stage). */
export function activeProject(world: WorldState): { def: ProjectDef; p: ProjectProgress; jobs: ProjectJobDef[] } | null {
  const p = world.career?.project;
  const def = projectDef(p?.id);
  if (!p || !def) return null;
  return { def, p, jobs: def.stages[p.stage]?.jobs ?? [] };
}

/** The project the office she's at offers now, if any (none while one's under way, or done). */
export function projectOffered(world: WorldState): ProjectDef | null {
  const c = world.career;
  if (!c || world.voyage || c.project) return null;
  const office = officeAt(world);
  return CONFIG.career.projects.find((d) => d.port === office && !(c.projectsDone ?? []).includes(d.id)) ?? null;
}

/** Why the project offered can't be taken, or null. */
export function projectBlocker(world: WorldState, def: ProjectDef): string | null {
  if (repOf(world.career, def.port) < def.minRep) return `Needs reputation ${def.minRep} here`;
  return null;
}

/** The cargo `to` of a job's mark buoy. */
const buoyTo = (def: ProjectDef, job: ProjectJobDef) => `${def.id}:${job.id}`;

/** A project buoy's name, from its job ("North cardinal buoy for Tarran Rig wind farm"). */
export function projectBuoyName(item: CargoItem): string {
  const [pid, jid] = item.to.split(':');
  const def = projectDef(pid);
  const job = def?.stages.flatMap((s) => s.jobs).find((j) => j.id === jid);
  return job && def ? `${job.name} buoy for ${def.name}` : 'Mark buoy';
}

/** A job's line in the menu: its name, and how it stands. */
export function jobStatus(world: WorldState, job: ProjectJobDef): string {
  const a = activeProject(world);
  if (!a) return job.name;
  if (a.p.done.includes(job.id)) return `${job.name}: done`;
  if (job.kind === 'survey') {
    const n = CONFIG.career.projectSurvey.segments;
    const got = a.p.survey[job.id]?.length ?? 0;
    return got ? `${job.name}: ${Math.round((100 * got) / n)} % run` : `${job.name}: run it at ${CONFIG.career.projectSurvey.speedKn.join('-')} kn`;
  }
  const item = Object.values(world.cargo).find((c) => isProjectItem(c) && c.to === buoyTo(a.def, job));
  const where = !item ? 'on the quay soon' : 'ground' in item.at ? `on the ${portName(a.def.port)} quay` : 'hook' in item.at ? 'on a crane hook' : 'aboard';
  return `${job.name}: ${where}, ${money(job.pay)}`;
}

/** The marks laid so far (the view and the chartplotter draw them). */
export function laidMarks(world: WorldState): MarkDef[] {
  const a = activeProject(world);
  if (!a) return [];
  const out: MarkDef[] = [];
  for (const s of a.def.stages)
    for (const j of s.jobs) if (j.kind === 'buoy' && a.p.done.includes(j.id)) out.push({ name: `${a.def.name}: ${j.name}`, kind: j.mark, x: j.at[0], z: j.at[1] });
  return out;
}

/**
 * A project's mark buoy lowered into the sea at (x, z) (cargo/cargo.ts, the crane's set-down):
 * laid if it's at its spot, and the job's paid. False: not its spot (or not wanted now): it
 * stays on the hook, and the office says where it goes.
 */
export function layProjectBuoy(world: WorldState, item: CargoItem, x: number, z: number): boolean {
  const a = activeProject(world);
  const job = a?.jobs.find((j) => j.kind === 'buoy' && buoyTo(a.def, j) === item.to);
  if (!a || !job || job.kind !== 'buoy' || a.p.done.includes(job.id)) return false;
  const off = Math.hypot(x - job.at[0], z - job.at[1]);
  if (off > CONFIG.career.projectBuoy.radius) {
    sayRadio(world, 'info', `${portName(a.def.port)} harbour office: that's ${Math.round(off)} m off its spot, skipper. The ${job.name.toLowerCase()} goes where it's marked on your plotter.`);
    return false;
  }
  delete world.cargo[item.id];
  finishJob(world, a.def, a.p, job, `${job.name} laid on station`);
  return true;
}

/** A project's buoy lost (overboard, sunk): gone; another is put on the quay (stepProjects). */
export function projectItemLost(world: WorldState, item: CargoItem): void {
  delete world.cargo[item.id];
  const a = activeProject(world);
  if (a) sayRadio(world, 'info', `${portName(a.def.port)} harbour office: we've lost a mark buoy, skipper. There's another on the quay for you.`);
}

/** A job done: paid, and the stage (and the project) moved on when it's the last. */
function finishJob(world: WorldState, def: ProjectDef, p: ProjectProgress, job: ProjectJobDef, text: string): void {
  const c = (world.career ??= createCareer());
  if (p.done.includes(job.id)) return;
  p.done.push(job.id);
  post(world, c, `${def.name}: ${text}`, job.pay);
  addRep(c, def.port, CONFIG.career.rep.contract / 2);
  const stage = def.stages[p.stage];
  if (stage && stage.jobs.every((j) => p.done.includes(j.id))) {
    post(world, c, `${def.name}: ${stage.name}, stage done`, stage.bonus);
    addRep(c, def.port, CONFIG.career.rep.contract);
    p.stage += 1;
    const next = def.stages[p.stage];
    sayRadio(world, 'info', next ? `${portName(def.port)} harbour office: ${stage.name.toLowerCase()} done, well done skipper - ${money(stage.bonus)} bonus. Next: ${next.name.toLowerCase()}.` : `${portName(def.port)} harbour office: ${stage.name.toLowerCase()} done - ${money(stage.bonus)} bonus. That's all we can do on ${def.name} for now; the next stage is being planned.`);
  } else sayRadio(world, 'info', `${portName(def.port)} harbour office: ${text.toLowerCase()}, skipper. ${money(job.pay)} to your account.`);
  c.seq += 1;
}

/** Each tick (the host): the stage's buoys on the quay, the survey lines being run. */
export function stepProjects(world: WorldState): void {
  if (world.voyage) return;
  const a = activeProject(world);
  if (!a) return;
  const { def, p, jobs } = a;
  const port = PORTS.find((x) => x.id === def.port);
  for (const job of jobs) {
    if (p.done.includes(job.id)) continue;
    if (job.kind === 'buoy') {
      // Its buoy: one somewhere (the quay, aboard, on a hook), or a new one on the quay.
      if (!port || Object.values(world.cargo).some((c) => isProjectItem(c) && c.to === buoyTo(def, job))) continue;
      const at = freeCraneSpot(world, port);
      if (!at) continue;
      const kind = CONFIG.cargo.kinds.findIndex((k) => k.name === CONFIG.career.projectBuoy.kind);
      const id = `cargo-${++world.cargoSeq}`;
      world.cargo[id] = { id, kind, mass: CONFIG.cargo.kinds[kind].mass, from: PROJECT_FROM, to: buoyTo(def, job), at: { ground: at, yaw: 0 } };
    } else {
      const covered = surveyed(world, job);
      if (!covered.length) continue;
      const have = (p.survey[job.id] ??= []);
      let more = false;
      for (const k of covered) if (!have.includes(k)) (have.push(k), (more = true));
      if (!more) continue;
      world.career!.seq += 1;
      if (have.length >= CONFIG.career.projectSurvey.segments) finishJob(world, def, p, job, `${job.name} run`);
    }
  }
}

/** The stretches of a survey line any player's boat is running now (close to it, along it, at survey speed). */
function surveyed(world: WorldState, job: Extract<ProjectJobDef, { kind: 'survey' }>): number[] {
  const s = CONFIG.career.projectSurvey;
  const [ax, az] = job.from;
  const dx = job.to[0] - ax;
  const dz = job.to[1] - az;
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const cos = Math.cos((s.headingDeg * Math.PI) / 180);
  const out: number[] = [];
  for (const v of playerBoats(world)) {
    const vx = v.linearVelocity[0];
    const vz = v.linearVelocity[2];
    const speed = Math.hypot(vx, vz);
    const kn = speed / 0.514444;
    if (kn < s.speedKn[0] || kn > s.speedKn[1]) continue;
    // Along the line, either way.
    if (Math.abs((vx * ux + vz * uz) / speed) < cos) continue;
    const rx = v.position[0] - ax;
    const rz = v.position[2] - az;
    const along = (rx * ux + rz * uz) / len;
    const off = Math.abs(rx * uz - rz * ux);
    if (along < 0 || along >= 1 || off > s.width) continue;
    out.push(Math.floor(along * s.segments));
  }
  return out;
}

/** Project intents (the career's: CareerState is the host's). */
export function applyProjectIntent(world: WorldState, intent: Intent): void {
  const c = (world.career ??= createCareer());
  if (intent.control === 'careerProjectAccept') {
    const def = projectOffered(world);
    if (!def || def.id !== intent.ref || projectBlocker(world, def)) return;
    c.project = { id: def.id, stage: 0, done: [], survey: {} };
    c.seq += 1;
    sayRadio(world, 'info', `${portName(def.port)} harbour office: ${def.name} is yours, skipper. First: ${def.stages[0].name.toLowerCase()} - it's on your plotter.`);
  } else if (intent.control === 'careerProjectStage') {
    // Debug: the stage's jobs done as if worked (paid as usual).
    const a = activeProject(world);
    if (!a) return;
    for (const job of a.jobs) if (!a.p.done.includes(job.id)) {
      if (job.kind === 'buoy') for (const item of Object.values(world.cargo)) if (isProjectItem(item) && item.to === buoyTo(a.def, job)) delete world.cargo[item.id];
      finishJob(world, a.def, a.p, job, job.kind === 'buoy' ? `${job.name} laid on station` : `${job.name} run`);
    }
  }
}
