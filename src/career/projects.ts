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
import { castOffKey, onAnyLine, vesselKey } from '../tow/tow';
import { createVesselState } from '../vessel/vesselState';
import { placeVessel } from '../vessel/vesselControl';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { PORTS } from '../world/archipelago';
import type { BlockDef, MarkDef } from '../world/defs';
import { setExtraBlocks } from '../world/geography';
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
  /** Monopiles handed over and being driven by the jack-up: the job's id and the world time it began (s). Not saved: a session that ends finishes them. */
  driving?: Record<string, number>;
  /** Monopiles driven: their jobs' ids (each a foundation standing at its turbine). */
  driven?: string[];
  /** Monopiles let go from the laydown moorings (a tug made fast once): free to drift from then on. Not saved. */
  released?: string[];
  /** Seconds each monopile has lain slow at its turbine (the hand-over: CONFIG.career.projectTow.handover). Not saved. */
  hold?: Record<string, number>;
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
  if (a.p.done.includes(job.id)) {
    const since = a.p.driving?.[job.id];
    return since !== undefined ? `${job.name}: handed over, being driven (${Math.min(99, Math.round((100 * (world.time - since)) / CONFIG.career.projectTow.driveS))} %)` : `${job.name}: done`;
  }
  if (job.kind === 'tow') {
    const v = world.vessels[towId(a.def, job)];
    if (!v) return `${job.name}: a tug's tow, coming out to the laydown (south-west of ${portName(a.def.port)}'s mouth)`;
    if (!a.p.released?.includes(job.id)) return `${job.name}: at the laydown, south-west of ${portName(a.def.port)}'s mouth: a tug makes fast to its bridle`;
    const t = a.def.turbines[job.turbine];
    const left = Math.hypot(v.position[0] - t.x, v.position[2] - t.z);
    return `${job.name}: in tow, ${left < 1000 ? `${Math.round(left)} m` : `${(left / 1852).toFixed(1)} nm`} to go; stop her within ${CONFIG.career.projectTow.handover.radius} m of the turbine`;
  }
  if (job.kind === 'survey') {
    const n = CONFIG.career.projectSurvey.segments;
    const got = a.p.survey[job.id]?.length ?? 0;
    return got ? `${job.name}: ${Math.round((100 * got) / n)} % run` : `${job.name}: run it at ${CONFIG.career.projectSurvey.speedKn.join('-')} kn`;
  }
  const item = Object.values(world.cargo).find((c) => isProjectItem(c) && c.to === buoyTo(a.def, job));
  const where = !item ? 'on the quay soon' : 'ground' in item.at ? `on the ${portName(a.def.port)} quay` : 'hook' in item.at ? 'on a crane hook' : 'aboard';
  return `${job.name}: ${where}, ${money(job.pay)}`;
}

/** A monopile tow's vessel id (it's in world.vessels while it waits and while it's towed). */
export const towId = (def: ProjectDef, job: ProjectJobDef) => `proj-${def.id}-${job.id}`;

/** The foundations standing (driven) and the one being driven, at their turbines (the view, the plotter, the blocks). */
export function foundations(world: WorldState): { x: number; z: number; driving: number | null }[] {
  const a = activeProject(world);
  if (!a) return [];
  const out: { x: number; z: number; driving: number | null }[] = [];
  for (const s of a.def.stages)
    for (const j of s.jobs) {
      if (j.kind !== 'tow') continue;
      const t = a.def.turbines[j.turbine];
      const since = a.p.driving?.[j.id];
      if (a.p.driven?.includes(j.id)) out.push({ x: t.x, z: t.z, driving: null });
      else if (since !== undefined) out.push({ x: t.x, z: t.z, driving: Math.min(1, (world.time - since) / CONFIG.career.projectTow.driveS) });
    }
  return out;
}

/**
 * Where the jack-up stands (north of the turbine it's working on), or null: it's on site while
 * the stage with the monopile tows is on, or a pile is still being driven.
 */
export function jackUpAt(world: WorldState): { x: number; z: number } | null {
  const a = activeProject(world);
  if (!a) return null;
  const tows = a.def.stages.flatMap((s) => s.jobs).filter((j): j is Extract<ProjectJobDef, { kind: 'tow' }> => j.kind === 'tow');
  const driving = tows.find((j) => a.p.driving?.[j.id] !== undefined);
  const next = a.jobs.find((j): j is Extract<ProjectJobDef, { kind: 'tow' }> => j.kind === 'tow' && !a.p.done.includes(j.id));
  const at = driving ?? next;
  if (!at) return null;
  const t = a.def.turbines[at.turbine];
  return { x: t.x, z: t.z - CONFIG.career.projectJackUp.offsetM };
}

/**
 * The solid blocks the project has added (world/geography.ts setExtraBlocks): each foundation
 * (and the pile being driven), the jack-up's four legs, the buoys laid (fendered: a buoy
 * gives a little when a boat leans on it).
 */
export function projectBlocks(world: WorldState): BlockDef[] {
  const out: BlockDef[] = [];
  const pile = CONFIG.windFarm.pile.radius * 0.92;
  for (const f of foundations(world)) out.push({ kind: 'pier', x: f.x, z: f.z, halfLength: pile, halfWidth: pile, yawDeg: 0, top: f.driving === null ? 4 : 14, fendered: false, farm: true });
  const ju = jackUpAt(world);
  if (ju) {
    const j = CONFIG.career.projectJackUp;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ kind: 'pier', x: ju.x + (sx * j.legSpacing[0]) / 2, z: ju.z + (sz * j.legSpacing[1]) / 2, halfLength: j.legHalf, halfWidth: j.legHalf, yawDeg: 0, top: j.hullY + 20, fendered: false, farm: true });
  }
  for (const m of laidMarks(world)) out.push({ kind: 'pier', x: m.x, z: m.z, halfLength: 0.7, halfWidth: 0.7, yawDeg: 0, top: 1.4, fendered: true, farm: true });
  return out;
}

let blocksKey = '';
/** Keep the collision's added blocks in step with the project (the host's tick; crew's frames). */
export function syncProjectBlocks(world: WorldState): void {
  const blocks = projectBlocks(world);
  const key = blocks.map((b) => `${b.x.toFixed(1)},${b.z.toFixed(1)},${b.top}`).join('|');
  if (key === blocksKey) return;
  blocksKey = key;
  setExtraBlocks(blocks);
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
export function stepProjects(world: WorldState, dt = 1 / 60): void {
  if (world.voyage) return;
  syncProjectBlocks(world);
  const a = activeProject(world);
  if (!a) return;
  const { def, p, jobs } = a;
  const port = PORTS.find((x) => x.id === def.port);
  stepDriving(world, def, p);
  // One monopile out at a time: the next comes out to the laydown once the jack-up's free.
  const busy = Object.keys(p.driving ?? {}).length > 0;
  const firstTow = jobs.find((j) => j.kind === 'tow' && !p.done.includes(j.id));
  for (const job of jobs) {
    if (p.done.includes(job.id)) continue;
    if (job.kind === 'tow') {
      if (job === firstTow && !busy) stepTowJob(world, def, p, job, dt);
    } else if (job.kind === 'buoy') {
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

/** The piles being driven: done after CONFIG.career.projectTow.driveS, each a foundation from then on. */
function stepDriving(world: WorldState, def: ProjectDef, p: ProjectProgress): void {
  for (const [id, since] of Object.entries(p.driving ?? {})) {
    if (world.time - since < CONFIG.career.projectTow.driveS) continue;
    delete p.driving![id];
    (p.driven ??= []).push(id);
    world.career!.seq += 1;
    const job = def.stages.flatMap((s) => s.jobs).find((j) => j.id === id);
    sayRadio(world, 'info', `${def.name}: jack-up here. ${job && job.kind === 'tow' ? `Turbine ${job.turbine + 1}'s` : 'The'} pile is driven to depth, skipper. Foundation in.`);
  }
}

/**
 * A monopile tow (the stage's first not yet handed over): out at the laydown, held on its
 * moorings until a tug makes fast; handed over to the jack-up when she lies slow at its turbine.
 */
function stepTowJob(world: WorldState, def: ProjectDef, p: ProjectProgress, job: Extract<ProjectJobDef, { kind: 'tow' }>, dt: number): void {
  const cfg = CONFIG.career.projectTow;
  const id = towId(def, job);
  let v = world.vessels[id];
  if (!v) {
    if (!VESSEL_DEFS[job.tow]) return;
    v = createVesselState(id, job.tow);
    placeVessel(v, cfg.laydown.x, 0, cfg.laydown.z, cfg.laydown.headingDeg);
    world.vessels[id] = v;
    p.released = (p.released ?? []).filter((r) => r !== job.id);
    sayRadio(world, 'info', `${portName(def.port)} harbour office: ${job.name.toLowerCase().replace(/ to .*/, '')} is floated out at the laydown, south-west of the harbour mouth. A tug's tow, skipper: make fast to her bridle and take her out to turbine ${job.turbine + 1}.`);
  }
  if (!p.released?.includes(job.id)) {
    // On the laydown moorings until a tug's line is on her: held where she lies, heading and all.
    if (onAnyLine(world, vesselKey(id))) (p.released ??= []).push(job.id);
    else {
      v.position[0] = cfg.laydown.x;
      v.position[2] = cfg.laydown.z;
      v.linearVelocity[0] = 0;
      v.linearVelocity[2] = 0;
      v.angularVelocity[1] = 0;
      return;
    }
  }
  const t = def.turbines[job.turbine];
  const near = Math.hypot(v.position[0] - t.x, v.position[2] - t.z) < cfg.handover.radius;
  const slow = Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) < cfg.handover.speed;
  const hold = (p.hold ??= {});
  hold[job.id] = near && slow ? (hold[job.id] ?? 0) + dt : 0;
  if (hold[job.id] < cfg.handover.holdS) return;
  // The jack-up takes her: the lines cast off, the pile lifted and pitched upright (it's the
  // jack-up's now: gone from the water), and driven from here (stepDriving).
  if (Object.values(world.players).some((pl) => pl.aboardVesselId === id)) return;
  castOffKey(world, vesselKey(id));
  delete world.vessels[id];
  delete hold[job.id];
  (p.driving ??= {})[job.id] = world.time;
  finishJob(world, def, p, job, `${job.name.replace(/ to .*/, '')} handed over to the jack-up`);
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
      // A monopile: off the laydown (or wherever it's got to) and driven at once.
      if (job.kind === 'tow') {
        castOffKey(world, vesselKey(towId(a.def, job)));
        delete world.vessels[towId(a.def, job)];
        (a.p.driven ??= []).push(job.id);
      }
      finishJob(world, a.def, a.p, job, job.kind === 'buoy' ? `${job.name} laid on station` : job.kind === 'tow' ? `${job.name.replace(/ to .*/, '')} driven` : `${job.name} run`);
    }
  }
}
