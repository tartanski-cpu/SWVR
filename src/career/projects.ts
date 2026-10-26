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
 *   tow        a tug's tow (CONFIG.vessels: the floated monopile, the transition pieces' barge)
 *              waits at the laydown, held on its moorings until a towline is made fast; stopped
 *              at its turbine (a monopile) or alongside the jack-up (the barge), the jack-up takes
 *              it. A monopile is driven (`driving`, then `driven`: a foundation); the barge's
 *              transition pieces are lifted onto the foundations one by one (`fitting`, then
 *              `fitted`). One tow out at a time; a monopile only once the jack-up's free.
 *   supply     loads of hand cargo on the office's quay for the jack-up: brought alongside her
 *              (CONFIG.career.projectSupply), her crane takes what's aboard.
 *   jack-up    a set piece on site from the foundations until the transition pieces are on
 *              (jackUpAt), at the turbine it's working on.
 *   guard      guard duty while the installation ship (another set piece, installAt) puts the
 *              turbines up, one at a time (`erect`, then `erected`): her work goes on only
 *              while a players' boat stands by her, and stops while any ship is inside the
 *              zone round her. Now and then a ship is sent for the works (traffic.ts
 *              spawnShipFor); meet her (`hail` m) and she's called on the VHF and alters away.
 *              One that gets into the zone is a strike: she's turned away by the installation
 *              ship, and the guard job pays less.
 *   transfer   fitters for a turbine once it's up: a crew transfer (transfer/transfer.ts) to
 *              the project's farm (world/windFarm.ts setProjectFarm: its turbines, once their
 *              transition pieces are on, are a farm like the map's), paid by the project. A
 *              commissioning crew's (`commission`): once they're up, the turbine is
 *              commissioned (`commissioning`, then `commissioned`): lit, its rotor turning.
 *   done       the last stage done and every turbine commissioned: the project's bonus paid,
 *              it's moved to CareerState.projectsDone, and its farm stands for good
 *              (builtProject: drawn, solid and worked like the map's own farms).
 *
 * Voyage has no career, so no projects.
 */
import { CONFIG, type ProjectDef, type ProjectJobDef } from '../config';
import type { Intent } from '../core/intents';
import { playerBoats } from '../core/launch';
import type { WorldState } from '../core/world';
import { freeCraneSpot, freeStackSpot, type CargoItem } from '../cargo/cargo';
import { sayRadio } from '../rescue/rescue';
import { castOffKey, onAnyLine, vesselKey } from '../tow/tow';
import { SHIP_NAMES, spawnShipFor, type Ship } from '../traffic/traffic';
import { raiseTransfer } from '../transfer/transfer';
import { createVesselState } from '../vessel/vesselState';
import { placeVessel } from '../vessel/vesselControl';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import { PORTS } from '../world/archipelago';
import type { BlockDef, MarkDef } from '../world/defs';
import { setExtraBlocks } from '../world/geography';
import { setProjectFarm, windFarmBlocks } from '../world/windFarm';
import { WIND_FARMS } from '../world/archipelago';
import { createCareer, money, officeAt, portName, post, repOf, addRep } from './career';

type TowJob = Extract<ProjectJobDef, { kind: 'tow' }>;
type SupplyJob = Extract<ProjectJobDef, { kind: 'supply' }>;
type GuardJob = Extract<ProjectJobDef, { kind: 'guard' }>;
type TransferJobDef = Extract<ProjectJobDef, { kind: 'transfer' }>;

/** A project under way: which, the stage it's at, the jobs done, and what's being built. */
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
  /** A transition piece being lifted onto its foundation: the turbine's index and the world time it began (s). Not saved: a session that ends finishes it. */
  fitting?: Record<string, number>;
  /** Transition pieces on: their turbines' indices. */
  fitted?: number[];
  /** Supplies taken aboard the jack-up so far, by job. */
  supplied?: Record<string, number>;
  /** The turbine the installation ship is putting up: its index and the seconds of work done on it (CONFIG.career.projectInstall.erectS). Not saved: a session that ends finishes it. */
  erect?: Record<string, number>;
  /** Turbines up (tower, nacelle and rotor): their indices. */
  erected?: number[];
  /** A turbine being commissioned (its engineers up): its index and the world time it began (s). Not saved: a session that ends finishes it. */
  commissioning?: Record<string, number>;
  /** Turbines commissioned (lit, turning): their indices. */
  commissioned?: number[];
  /** Guard duty: ships turned away (met), and ships that got into the zone (each docks the guard job's pay). Saved. */
  warned?: number;
  strikes?: number;
  /** Guard duty: when the next ship is sent for the works (world time, s), and whether a guard boat stood by last tick (the radio says when that changes). Not saved. */
  shipAt?: number;
  guarded?: boolean;
  /** Tows let go from the laydown moorings (a tug made fast once): free to drift from then on. Not saved. */
  released?: string[];
  /** Seconds each tow (or supply run, by its job id) has lain slow at its hand-over (CONFIG.career.projectTow.handover). Not saved. */
  hold?: Record<string, number>;
}

/** Kept in a cargo item's `from`: a project's (its `to` is "project:job"). */
export const PROJECT_FROM = 'project';

export function isProjectItem(item: CargoItem): boolean {
  return item.from === PROJECT_FROM;
}

/** A project's mark buoy (crane cargo), not its hand cargo (a supply run's). */
export function isProjectBuoy(item: CargoItem): boolean {
  return isProjectItem(item) && CONFIG.cargo.kinds[item.kind]?.name === CONFIG.career.projectBuoy.kind;
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

/** The cargo `to` of a job's items (its mark buoy, its supplies). */
const itemTo = (def: ProjectDef, job: ProjectJobDef) => `${def.id}:${job.id}`;

/** A job by id, anywhere in the project. */
function jobById(def: ProjectDef, id: string): ProjectJobDef | undefined {
  return def.stages.flatMap((s) => s.jobs).find((j) => j.id === id);
}

/** A project item's name, from its job ("North cardinal buoy for Tarran Rig wind farm"). */
export function projectItemName(item: CargoItem): string {
  const [pid, jid] = item.to.split(':');
  const def = projectDef(pid);
  const job = def ? jobById(def, jid) : undefined;
  if (!job || !def) return CONFIG.cargo.kinds[item.kind]?.name ?? 'Project cargo';
  return job.kind === 'buoy' ? `${job.name} buoy for ${def.name}` : `${CONFIG.cargo.kinds[item.kind]?.name ?? 'Cargo'} for the jack-up at ${def.name}`;
}

/** A tow's vessel id (it's in world.vessels while it waits and while it's towed). */
export const towId = (def: ProjectDef, job: ProjectJobDef) => `proj-${def.id}-${job.id}`;

/**
 * The project under way in two short lines, for the duty board (duties/dutyBoardView.ts): the
 * stage and how many of its jobs are left, then the next job's name. Only words and counts
 * (no live percentages), so the board redraws only when it moves on. Empty: no project.
 */
export function projectBoardLines(world: WorldState): string[] {
  const a = activeProject(world);
  if (!a) return [];
  const name = a.def.name.replace(/ wind farm$/, '');
  const n = a.def.stages.length;
  if (!a.jobs.length) {
    const on = a.p.commissioned?.length ?? 0;
    return [`Project: ${name}, every stage done: commissioning, ${on} of ${a.def.turbines.length} turbines generating`, 'Nothing more to do: the engineers are bringing her on line'];
  }
  const left = a.jobs.filter((j) => !a.p.done.includes(j.id));
  const next = left[0];
  return [`Project: ${name}, stage ${a.p.stage + 1} of ${n}: ${a.def.stages[a.p.stage].name}, ${left.length} of ${a.jobs.length} jobs left`, next ? `Next: ${next.name}${left.length > 1 ? ' (any order: Menu > Office > Projects)' : ''}` : ''];
}

/** Where a tow is to be handed over: its turbine, or (none) the jack-up wherever she stands; and how near. */
function handoverAt(world: WorldState, def: ProjectDef, job: TowJob): { x: number; z: number; r: number } | null {
  if (job.turbine !== undefined) {
    const t = def.turbines[job.turbine];
    return { x: t.x, z: t.z, r: CONFIG.career.projectTow.handover.radius };
  }
  const ju = jackUpAt(world);
  return ju ? { ...ju, r: CONFIG.career.projectTow.toJackUpRadius } : null;
}

/** A job's line in the menu: its name, and how it stands. */
export function jobStatus(world: WorldState, job: ProjectJobDef): string {
  const a = activeProject(world);
  if (!a) return job.name;
  if (a.p.done.includes(job.id)) {
    if (job.kind === 'transfer' && job.commission) {
      const c0 = a.p.commissioning?.[String(job.turbine)];
      if (c0 !== undefined) return `${job.name}: up, commissioning (${Math.min(99, Math.round((100 * (world.time - c0)) / CONFIG.career.projectCommission.s))} %)`;
      return `${job.name}: done, turbine ${job.turbine + 1} generating`;
    }
    const since = a.p.driving?.[job.id];
    if (since !== undefined) return `${job.name}: handed over, being driven (${Math.min(99, Math.round((100 * (world.time - since)) / CONFIG.career.projectTow.driveS))} %)`;
    if (job.kind === 'tow' && job.turbine === undefined) {
      const on = a.p.fitted?.length ?? 0;
      if (on < a.def.turbines.length) return `${job.name}: handed over, ${on} of ${a.def.turbines.length} lifted on`;
    }
    return `${job.name}: done`;
  }
  if (job.kind === 'tow') {
    const v = world.vessels[towId(a.def, job)];
    const where = job.turbine !== undefined ? `turbine ${job.turbine + 1}` : 'the jack-up';
    if (!v) return `${job.name}: a tug's tow, coming out to the laydown (south-west of ${portName(a.def.port)}'s mouth)`;
    if (!a.p.released?.includes(job.id)) return `${job.name}: at the laydown, south-west of ${portName(a.def.port)}'s mouth: a tug makes fast to its bow`;
    const h = handoverAt(world, a.def, job);
    const left = h ? Math.hypot(v.position[0] - h.x, v.position[2] - h.z) : 0;
    return `${job.name}: in tow, ${left < 1000 ? `${Math.round(left)} m` : `${(left / 1852).toFixed(1)} nm`} to go; stop her within ${h?.r ?? 0} m of ${where}`;
  }
  if (job.kind === 'guard') {
    const k = a.def.turbines.findIndex((_, i) => !a.p.erected?.includes(i));
    const tally = `${a.p.warned ?? 0} turned away, ${a.p.strikes ?? 0} got into the zone`;
    if (k < 0) return `${job.name}: turbines up (${tally})`;
    const f = erectFraction(a.p, k);
    const lift = f < CONFIG.career.projectInstall.nacelleAt ? 'tower' : f < CONFIG.career.projectInstall.rotorAt ? 'nacelle' : 'rotor';
    return `${job.name}: turbine ${k + 1} going up (${lift}, ${Math.round(f * 100)} %); ${a.p.guarded ? 'you are standing by' : `stand by within ${CONFIG.career.projectGuard.standBy} m of the installation ship`}; ${tally}`;
  }
  if (job.kind === 'transfer') {
    if (!a.p.erected?.includes(job.turbine)) return `${job.name}: once turbine ${job.turbine + 1} is up, ${money(job.pay)}`;
    const tj = world.transfer?.job;
    if (tj && !tj.done && tj.project === itemTo(a.def, job)) {
      const up = tj.techs.filter((t) => t.phase === 'platform').length;
      const quay = tj.techs.filter((t) => t.phase === 'quay').length;
      return `${job.name}: ${quay ? `${quay} on the ${portName(CONFIG.transfer.pickupPort)} crew-transfer quay` : `aboard, ${up} of ${tj.techs.length} up`}; put your bow on turbine ${job.turbine + 1}'s landing`;
    }
    return `${job.name}: waiting for the crew-transfer quay to be free`;
  }
  if (job.kind === 'supply') {
    const got = a.p.supplied?.[job.id] ?? 0;
    const items = Object.values(world.cargo).filter((c) => isProjectItem(c) && c.to === itemTo(a.def, job));
    const aboardN = items.filter((c) => 'vessel' in c.at || 'carriedBy' in c.at || 'hook' in c.at).length;
    return `${job.name}: ${got} of ${job.count} taken aboard her${aboardN ? `, ${aboardN} on the way` : ''}; on the ${portName(a.def.port)} quay, ${money(job.pay)}`;
  }
  if (job.kind === 'survey') {
    const n = CONFIG.career.projectSurvey.segments;
    const got = a.p.survey[job.id]?.length ?? 0;
    return got ? `${job.name}: ${Math.round((100 * got) / n)} % run` : `${job.name}: run it at ${CONFIG.career.projectSurvey.speedKn.join('-')} kn`;
  }
  const item = Object.values(world.cargo).find((c) => isProjectItem(c) && c.to === itemTo(a.def, job));
  const where = !item ? 'on the quay soon' : 'ground' in item.at ? `on the ${portName(a.def.port)} quay` : 'hook' in item.at ? 'on a crane hook' : 'aboard';
  return `${job.name}: ${where}, ${money(job.pay)}`;
}

/** What's standing at each turbine: a foundation driven (or being driven), its transition piece fitted (or being lifted on). */
export interface FoundationState {
  turbine: number;
  x: number;
  z: number;
  /** Driven: null; being driven: how far (0..1). */
  driving: number | null;
  /** The transition piece: none, being lifted on (how far, 0..1), or on (1). */
  tp: number | null;
  /** The turbine itself: none, going up (how far, 0..1), or up (1). */
  erect: number | null;
  /** Commissioned: lit, its rotor turning with the wind. */
  turning: boolean;
  landingDeg: number;
}

/** A finished project whose farm stands (the last done with turbines), or null. */
export function builtProject(world: WorldState): ProjectDef | null {
  const done = world.career?.projectsDone ?? [];
  for (let i = done.length - 1; i >= 0; i--) {
    const def = projectDef(done[i]);
    if (def?.turbines.length) return def;
  }
  return null;
}

/** How far the turbine `k` is up (0..1): its work done over CONFIG.career.projectInstall.erectS, or 1 once up. */
function erectFraction(p: ProjectProgress, k: number): number {
  if (p.erected?.includes(k)) return 1;
  return Math.min(1, (p.erect?.[String(k)] ?? 0) / CONFIG.career.projectInstall.erectS);
}

/** The foundations standing (driven) and the one being driven, at their turbines, with their transition pieces (the view, the plotter, the blocks). */
export function foundations(world: WorldState): FoundationState[] {
  const a = activeProject(world);
  if (!a) {
    // A finished project's farm: every turbine up and turning.
    const built = world.career?.project ? null : builtProject(world);
    return built ? built.turbines.map((t, i) => ({ turbine: i, x: t.x, z: t.z, driving: null, tp: 1, erect: 1, turning: true, landingDeg: t.landingDeg })) : [];
  }
  const out: FoundationState[] = [];
  const cfg = CONFIG.career.projectTow;
  for (const s of a.def.stages)
    for (const j of s.jobs) {
      if (j.kind !== 'tow' || j.turbine === undefined) continue;
      const t = a.def.turbines[j.turbine];
      const since = a.p.driving?.[j.id];
      const driven = a.p.driven?.includes(j.id);
      if (!driven && since === undefined) continue;
      const fit = a.p.fitting?.[String(j.turbine)];
      const tp = a.p.fitted?.includes(j.turbine) ? 1 : fit !== undefined ? Math.min(1, (world.time - fit) / cfg.fitS) : null;
      const erect = a.p.erected?.includes(j.turbine) ? 1 : a.p.erect?.[String(j.turbine)] !== undefined ? erectFraction(a.p, j.turbine) : null;
      out.push({ turbine: j.turbine, x: t.x, z: t.z, driving: driven ? null : Math.min(1, (world.time - since!) / cfg.driveS), tp, erect, turning: !!a.p.commissioned?.includes(j.turbine), landingDeg: t.landingDeg });
    }
  return out;
}

/**
 * Where the jack-up stands (north of the turbine it's working on), or null. On site from the
 * foundations until the transition pieces are all on and her supplies aboard: at a pile being
 * driven, else the next monopile's turbine, else a transition piece being lifted on, else the
 * next to have one, else (supplies still to come) the last turbine.
 */
export function jackUpAt(world: WorldState): { x: number; z: number } | null {
  const a = activeProject(world);
  if (!a) return null;
  const { def, p } = a;
  const all = def.stages.flatMap((s) => s.jobs);
  const piles = all.filter((j): j is TowJob => j.kind === 'tow' && j.turbine !== undefined);
  const at = (turbine: number) => ({ x: def.turbines[turbine].x, z: def.turbines[turbine].z - CONFIG.career.projectJackUp.offsetM });
  const driving = piles.find((j) => p.driving?.[j.id] !== undefined);
  if (driving) return at(driving.turbine!);
  const nextPile = a.jobs.find((j): j is TowJob => j.kind === 'tow' && j.turbine !== undefined && !p.done.includes(j.id));
  if (nextPile) return at(nextPile.turbine!);
  const fitting = Object.keys(p.fitting ?? {})[0];
  if (fitting !== undefined) return at(Number(fitting));
  // The transition pieces' stage on, or its barge handed over and pieces still to lift on.
  const tpsJob = all.find((j): j is TowJob => j.kind === 'tow' && j.turbine === undefined);
  const tpStage = !!tpsJob && (a.jobs.includes(tpsJob) || p.done.includes(tpsJob.id));
  const unfitted = def.turbines.findIndex((_, i) => !p.fitted?.includes(i));
  if (tpStage && unfitted >= 0) return at(unfitted);
  // Supplies still wanted aboard her this stage: she stays, at the last turbine she worked on.
  if (a.jobs.some((j) => j.kind === 'supply' && !p.done.includes(j.id))) return at(def.turbines.length - 1);
  return null;
}

/** The guard job of the stage under way, while it's not done. */
function guardJob(world: WorldState): GuardJob | null {
  const a = activeProject(world);
  const g = a?.jobs.find((j): j is GuardJob => j.kind === 'guard');
  return a && g && !a.p.done.includes(g.id) ? g : null;
}

/**
 * Where the installation ship stands (north of the turbine she's putting up), and which
 * turbine that is; or null (no turbines going up now: before the guard job's stage, or all up).
 */
export function installAt(world: WorldState): { x: number; z: number; turbine: number } | null {
  const a = activeProject(world);
  if (!a || !guardJob(world)) return null;
  const k = a.def.turbines.findIndex((_, i) => !a.p.erected?.includes(i));
  if (k < 0) return null;
  const t = a.def.turbines[k];
  return { x: t.x, z: t.z - CONFIG.career.projectInstall.offsetM, turbine: k };
}

/**
 * The solid blocks the project has added (world/geography.ts setExtraBlocks): each foundation
 * (and the pile being driven), and once its transition piece is on, the turbine's own (its
 * piece up to the platform and its boat landing, as Holm Rig's: world/windFarm.ts); the
 * jack-up's four legs; the buoys laid (fendered: a buoy gives a little when a boat leans on it).
 */
export function projectBlocks(world: WorldState): BlockDef[] {
  const out: BlockDef[] = [];
  const pile = CONFIG.windFarm.pile.radius * 0.92;
  for (const f of foundations(world)) {
    if (f.tp === 1) out.push(...windFarmBlocks({ name: '', turbines: [{ x: f.x, z: f.z, landingDeg: f.landingDeg }] }));
    else out.push({ kind: 'pier', x: f.x, z: f.z, halfLength: pile, halfWidth: pile, yawDeg: 0, top: f.driving === null ? 4 : 14, fendered: false, farm: true });
  }
  const ju = jackUpAt(world);
  if (ju) {
    const j = CONFIG.career.projectJackUp;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ kind: 'pier', x: ju.x + (sx * j.legSpacing[0]) / 2, z: ju.z + (sz * j.legSpacing[1]) / 2, halfLength: j.legHalf, halfWidth: j.legHalf, yawDeg: 0, top: j.hullY + 20, fendered: false, farm: true });
  }
  const inst = installAt(world);
  if (inst) {
    const j = CONFIG.career.projectInstall;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ kind: 'pier', x: inst.x + (sx * j.legSpacing[0]) / 2, z: inst.z + (sz * j.legSpacing[1]) / 2, halfLength: j.legHalf, halfWidth: j.legHalf, yawDeg: 0, top: j.hullY + 20, fendered: false, farm: true });
  }
  for (const m of laidMarks(world)) out.push({ kind: 'pier', x: m.x, z: m.z, halfLength: 0.7, halfWidth: 0.7, yawDeg: 0, top: 1.4, fendered: true, farm: true });
  return out;
}

let blocksKey = '';
let farmKey = '';
/**
 * Keep the collision's added blocks in step with the project (the host's tick; crew's frames),
 * and its wind farm (world/windFarm.ts setProjectFarm: for crew transfer and the platforms
 * underfoot) once every transition piece is on.
 */
export function syncProjectBlocks(world: WorldState): void {
  const def = activeProject(world)?.def ?? (world.career?.project ? null : builtProject(world));
  const found = foundations(world);
  const standing = !!def && found.length === def.turbines.length && found.every((f) => f.tp === 1);
  const fk = standing ? def!.id : '';
  if (fk !== farmKey) {
    farmKey = fk;
    setProjectFarm(standing ? { name: def!.name, turbines: def!.turbines } : null);
  }
  const blocks = projectBlocks(world);
  const key = blocks.map((b) => `${b.x.toFixed(1)},${b.z.toFixed(1)},${b.top}`).join('|');
  if (key === blocksKey) return;
  blocksKey = key;
  setExtraBlocks(blocks);
}

/** The marks laid so far (the view and the chartplotter draw them). */
export function laidMarks(world: WorldState): MarkDef[] {
  const a = activeProject(world);
  // A finished project's marks stay laid round its farm.
  const def = a?.def ?? (world.career?.project ? null : builtProject(world));
  if (!def) return [];
  const out: MarkDef[] = [];
  for (const s of def.stages)
    for (const j of s.jobs) if (j.kind === 'buoy' && (!a || a.p.done.includes(j.id))) out.push({ name: `${def.name}: ${j.name}`, kind: j.mark, x: j.at[0], z: j.at[1] });
  return out;
}

/**
 * A project's mark buoy lowered into the sea at (x, z) (cargo/cargo.ts, the crane's set-down):
 * laid if it's at its spot, and the job's paid. False: not its spot (or not wanted now): it
 * stays on the hook, and the office says where it goes.
 */
export function layProjectBuoy(world: WorldState, item: CargoItem, x: number, z: number): boolean {
  const a = activeProject(world);
  const job = a?.jobs.find((j) => j.kind === 'buoy' && itemTo(a.def, j) === item.to);
  if (!a || !job || job.kind !== 'buoy' || a.p.done.includes(job.id)) {
    // (Not this stage's, or laid already: said, so the press isn't met with silence.)
    if (a) sayRadio(world, 'info', `${portName(a.def.port)} harbour office: that buoy isn't wanted now, skipper. Bring it back to the quay.`);
    return false;
  }
  const off = Math.hypot(x - job.at[0], z - job.at[1]);
  if (off > CONFIG.career.projectBuoy.radius) {
    sayRadio(world, 'info', `${portName(a.def.port)} harbour office: that's ${Math.round(off)} m off its spot, skipper. The ${job.name.toLowerCase()} goes where it's marked on your plotter.`);
    return false;
  }
  delete world.cargo[item.id];
  finishJob(world, a.def, a.p, job, `${job.name} laid on station`);
  return true;
}

/** A project's item lost (overboard, sunk): gone; another is put on the quay (stepProjects). */
export function projectItemLost(world: WorldState, item: CargoItem): void {
  delete world.cargo[item.id];
  const a = activeProject(world);
  if (a) sayRadio(world, 'info', `${portName(a.def.port)} harbour office: we've lost the ${projectItemName(item).replace(/ for .*/, '').toLowerCase()}, skipper. There's another on the quay for you.`);
}

/** A job done: paid, and the stage (and the project) moved on when it's the last. */
function finishJob(world: WorldState, def: ProjectDef, p: ProjectProgress, job: ProjectJobDef, text: string, pay = job.pay): void {
  const c = (world.career ??= createCareer());
  if (p.done.includes(job.id)) return;
  p.done.push(job.id);
  post(world, c, `${def.name}: ${text}`, pay);
  addRep(c, def.port, CONFIG.career.rep.contract / 2);
  const stage = def.stages[p.stage];
  if (stage && stage.jobs.every((j) => p.done.includes(j.id))) {
    post(world, c, `${def.name}: ${stage.name}, stage done`, stage.bonus);
    addRep(c, def.port, CONFIG.career.rep.contract);
    p.stage += 1;
    const next = def.stages[p.stage];
    sayRadio(world, 'info', next ? `${portName(def.port)} harbour office: ${stage.name.toLowerCase()} done, well done skipper - ${money(stage.bonus)} bonus. Next: ${next.name.toLowerCase()}.` : `${portName(def.port)} harbour office: ${stage.name.toLowerCase()} done - ${money(stage.bonus)} bonus. The engineers are bringing ${def.name} on line now.`);
  } else sayRadio(world, 'info', `${portName(def.port)} harbour office: ${text.toLowerCase()}, skipper. ${money(pay)} to your account.`);
  c.seq += 1;
}

/** Each tick (the host): the stage's items on the quay, the survey lines being run, the tows and the supplies, the jack-up's work. */
export function stepProjects(world: WorldState, dt = 1 / 60): void {
  if (world.voyage) return;
  syncProjectBlocks(world);
  const a = activeProject(world);
  if (!a) return;
  const { def, p, jobs } = a;
  const port = PORTS.find((x) => x.id === def.port);
  stepDriving(world, def, p);
  stepFitting(world, def, p);
  if (stepCommissioning(world, def, p)) return;
  // One tow out at a time; a monopile only once the jack-up's free of the last.
  const busy = Object.keys(p.driving ?? {}).length > 0;
  const firstTow = jobs.find((j): j is TowJob => j.kind === 'tow' && !p.done.includes(j.id));
  for (const job of jobs) {
    if (p.done.includes(job.id)) continue;
    if (job.kind === 'tow') {
      if (job === firstTow && !(busy && job.turbine !== undefined)) stepTowJob(world, def, p, job, dt);
    } else if (job.kind === 'supply') {
      if (port) stepSupply(world, def, p, job, port, dt);
    } else if (job.kind === 'guard') {
      stepGuard(world, def, p, job, dt);
    } else if (job.kind === 'transfer') {
      stepFitters(world, def, p, job);
    } else if (job.kind === 'buoy') {
      // Its buoy: one somewhere (the quay, aboard, on a hook), or a new one on the quay.
      if (!port || Object.values(world.cargo).some((c) => isProjectItem(c) && c.to === itemTo(def, job))) continue;
      const at = freeCraneSpot(world, port);
      if (!at) continue;
      const kind = CONFIG.cargo.kinds.findIndex((k) => k.name === CONFIG.career.projectBuoy.kind);
      const id = `cargo-${++world.cargoSeq}`;
      world.cargo[id] = { id, kind, mass: CONFIG.cargo.kinds[kind].mass, from: PROJECT_FROM, to: itemTo(def, job), at: { ground: at, yaw: 0 } };
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

/**
 * The turbines being commissioned: each commissioned `projectCommission.s` after its engineers
 * are up (lit, turning). The last stage done and every turbine commissioned: the project's
 * done (true: it's gone from under way, into projectsDone).
 */
function stepCommissioning(world: WorldState, def: ProjectDef, p: ProjectProgress): boolean {
  for (const [k, since] of Object.entries(p.commissioning ?? {})) {
    if (world.time - since < CONFIG.career.projectCommission.s) continue;
    delete p.commissioning![k];
    if (!p.commissioned?.includes(Number(k))) (p.commissioned ??= []).push(Number(k));
    world.career!.seq += 1;
    sayRadio(world, 'info', `${def.name}: turbine ${Number(k) + 1} is commissioned and generating, skipper. Lights on.`);
  }
  const commissioned = def.turbines.every((_, i) => p.commissioned?.includes(i));
  if (p.stage < def.stages.length || !commissioned || Object.keys(p.commissioning ?? {}).length) return false;
  completeProject(world, def);
  return true;
}

/** The project finished: its bonus paid, into projectsDone; its farm stands from now on (builtProject). */
function completeProject(world: WorldState, def: ProjectDef): void {
  const c = world.career!;
  post(world, c, `${def.name}: the project done`, def.bonus);
  addRep(c, def.port, CONFIG.career.rep.contract * 2);
  c.projectsDone = [...(c.projectsDone ?? []).filter((d) => d !== def.id), def.id];
  delete c.project;
  c.seq += 1;
  sayRadio(world, 'info', `${portName(def.port)} harbour office: ${def.name} is finished and generating, skipper. Fine work from start to finish - ${money(def.bonus)} bonus for the whole job.`);
}

/** The piles being driven: done after CONFIG.career.projectTow.driveS, each a foundation from then on. */
function stepDriving(world: WorldState, def: ProjectDef, p: ProjectProgress): void {
  for (const [id, since] of Object.entries(p.driving ?? {})) {
    if (world.time - since < CONFIG.career.projectTow.driveS) continue;
    delete p.driving![id];
    (p.driven ??= []).push(id);
    world.career!.seq += 1;
    const job = jobById(def, id);
    sayRadio(world, 'info', `${def.name}: jack-up here. ${job && job.kind === 'tow' && job.turbine !== undefined ? `Turbine ${job.turbine + 1}'s` : 'The'} pile is driven to depth, skipper. Foundation in.`);
  }
}

/**
 * The transition pieces (once their barge is handed over): lifted onto the foundations one at
 * a time, each CONFIG.career.projectTow.fitS; the next only onto a pile that's been driven.
 */
function stepFitting(world: WorldState, def: ProjectDef, p: ProjectProgress): void {
  for (const [k, since] of Object.entries(p.fitting ?? {})) {
    if (world.time - since < CONFIG.career.projectTow.fitS) continue;
    delete p.fitting![k];
    (p.fitted ??= []).push(Number(k));
    world.career!.seq += 1;
    sayRadio(world, 'info', `${def.name}: jack-up here. Turbine ${Number(k) + 1}'s transition piece is on and grouted, skipper. Her boat landing's ready.`);
  }
  if (Object.keys(p.fitting ?? {}).length) return;
  const tps = def.stages.flatMap((s) => s.jobs).find((j): j is TowJob => j.kind === 'tow' && j.turbine === undefined);
  if (!tps || !p.done.includes(tps.id)) return;
  // The next foundation driven and still without its piece.
  const piles = def.stages.flatMap((s) => s.jobs).filter((j): j is TowJob => j.kind === 'tow' && j.turbine !== undefined);
  const next = piles.find((j) => p.driven?.includes(j.id) && !p.fitted?.includes(j.turbine!));
  if (next) (p.fitting ??= {})[String(next.turbine)] = world.time;
}

/**
 * A tow (the stage's first not yet handed over): out at the laydown, held on its moorings until
 * a tug makes fast; handed over to the jack-up when she lies slow at its turbine, or (the
 * barge) alongside the jack-up.
 */
function stepTowJob(world: WorldState, def: ProjectDef, p: ProjectProgress, job: TowJob, dt: number): void {
  const cfg = CONFIG.career.projectTow;
  const id = towId(def, job);
  let v = world.vessels[id];
  if (!v) {
    if (!VESSEL_DEFS[job.tow]) return;
    v = createVesselState(id, job.tow);
    placeVessel(v, cfg.laydown.x, 0, cfg.laydown.z, cfg.laydown.headingDeg);
    world.vessels[id] = v;
    p.released = (p.released ?? []).filter((r) => r !== job.id);
    const what = VESSEL_DEFS[job.tow].tow?.name ?? 'the tow';
    sayRadio(world, 'info', `${portName(def.port)} harbour office: ${what} is out at the laydown, south-west of the harbour mouth. A tug's tow, skipper: make fast to her bow and take her out to ${job.turbine !== undefined ? `turbine ${job.turbine + 1}` : 'the jack-up'}.`);
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
  const h = handoverAt(world, def, job);
  if (!h) return;
  const near = Math.hypot(v.position[0] - h.x, v.position[2] - h.z) < h.r;
  const slow = Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) < cfg.handover.speed;
  const hold = (p.hold ??= {});
  hold[job.id] = near && slow ? (hold[job.id] ?? 0) + dt : 0;
  if (hold[job.id] < cfg.handover.holdS) return;
  // The jack-up takes her: the lines cast off, the load lifted off (gone from the water). A
  // monopile is pitched upright and driven (stepDriving); the barge's pieces are lifted on (stepFitting).
  if (Object.values(world.players).some((pl) => pl.aboardVesselId === id)) return;
  castOffKey(world, vesselKey(id));
  delete world.vessels[id];
  delete hold[job.id];
  if (job.turbine !== undefined) {
    (p.driving ??= {})[job.id] = world.time;
    finishJob(world, def, p, job, `${job.name.replace(/ to .*/, '')} handed over to the jack-up`);
  } else finishJob(world, def, p, job, `${job.name.replace(/ to .*/, '')} alongside the jack-up`);
}

/**
 * A supply run: its loads on the office's quay (as many as are still wanted and not on their
 * way); brought alongside the jack-up and held there slow, her crane takes what's aboard.
 */
function stepSupply(world: WorldState, def: ProjectDef, p: ProjectProgress, job: SupplyJob, port: (typeof PORTS)[number], dt: number): void {
  const cfg = CONFIG.career.projectSupply;
  const got = p.supplied?.[job.id] ?? 0;
  const items = Object.values(world.cargo).filter((c) => isProjectItem(c) && c.to === itemTo(def, job));
  // The quay stocked up to what's still wanted.
  if (got + items.length < job.count) {
    const kind = CONFIG.cargo.kinds.findIndex((k) => k.name === job.cargo);
    const at = kind >= 0 ? freeStackSpot(world, port) : null;
    if (at) {
      const id = `cargo-${++world.cargoSeq}`;
      world.cargo[id] = { id, kind, mass: CONFIG.cargo.kinds[kind].mass, from: PROJECT_FROM, to: itemTo(def, job), at: { ground: at, yaw: 0 } };
    }
  }
  const ju = jackUpAt(world);
  if (!ju) return;
  // A boat alongside her, slow, with some of the loads aboard.
  const hold = (p.hold ??= {});
  const boat = playerBoats(world).find((v) => Math.hypot(v.position[0] - ju.x, v.position[2] - ju.z) < cfg.radius && Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) < cfg.speed && items.some((c) => 'vessel' in c.at && c.at.vessel === v.id));
  hold[job.id] = boat ? (hold[job.id] ?? 0) + dt : 0;
  if (!boat || hold[job.id] < cfg.holdS) return;
  delete hold[job.id];
  const taken = items.filter((c) => 'vessel' in c.at && c.at.vessel === boat.id);
  for (const c of taken) delete world.cargo[c.id];
  const now = got + taken.length;
  (p.supplied ??= {})[job.id] = now;
  world.career!.seq += 1;
  if (now >= job.count) finishJob(world, def, p, job, `${job.name} taken aboard`);
  else sayRadio(world, 'info', `${def.name}: jack-up here. ${taken.length} aboard, thank you skipper: ${job.count - now} more to come.`);
}

/**
 * Guard duty, and the installation ship's work it guards: the turbine she's on goes up while a
 * players' boat stands by her and no ship is inside the zone; ships sent for the works now and
 * then; met, each is called on the VHF and alters away; in the zone, a strike.
 */
function stepGuard(world: WorldState, def: ProjectDef, p: ProjectProgress, job: GuardJob, dt: number): void {
  const inst = installAt(world);
  const g = CONFIG.career.projectGuard;
  if (!inst) {
    // Every turbine up: paid, less the strikes.
    const strikes = p.strikes ?? 0;
    const pay = Math.max(g.minPay, job.pay - strikes * g.strike);
    finishJob(world, def, p, job, `${job.name}: turbines up${strikes ? `, ${strikes} ship${strikes > 1 ? 's' : ''} in the zone` : ', not a ship in the zone'}`, pay);
    return;
  }
  const boats = playerBoats(world);
  const guarded = boats.some((v) => Math.hypot(v.position[0] - inst.x, v.position[2] - inst.z) < g.standBy);
  if (guarded !== !!p.guarded) {
    p.guarded = guarded;
    world.career!.seq += 1;
    sayRadio(world, 'info', guarded ? `${def.name}: installation ship here. Guard boat on station, thank you skipper: we're lifting. Keep the traffic off us.` : `${def.name}: installation ship here. No guard boat on station: we can't lift with traffic about. Stand by within ${g.standBy} m of us.`);
  }
  const ships = world.traffic?.ships ?? [];
  // Ships bound for the works: met by a guard boat (called up, she alters away), or into the zone (a strike).
  for (const s of ships) {
    if (s.bound !== def.id) continue;
    const met = boats.some((v) => Math.hypot(v.position[0] - s.x, v.position[2] - s.z) < g.hail);
    const inZone = Math.hypot(s.x - inst.x, s.z - inst.z) < g.zone;
    if (!met && !inZone) continue;
    turnAway(s, inst.x, inst.z);
    if (met && !inZone) {
      p.warned = (p.warned ?? 0) + 1;
      sayRadio(world, 'info', `${SHIP_NAMES[s.type]} ${s.name}: guard boat, understood. Altering away to clear the ${def.name.replace(' wind farm', '')} works.`);
    } else {
      p.strikes = (p.strikes ?? 0) + 1;
      sayRadio(world, 'info', `${def.name}: installation ship here. ${s.name} is inside the zone - all stop! ${s.name}, ${s.name}, alter away from us now. Guard boat, where were you?`);
    }
    world.career!.seq += 1;
  }
  // A ship sent for the works now and then, one at a time, while there's a guard to meet her.
  const seq = world.traffic?.seq ?? 0;
  if (p.shipAt === undefined) p.shipAt = world.time + g.every[0];
  if (guarded && world.time >= p.shipAt && !ships.some((s) => s.bound === def.id)) {
    spawnShipFor(world, inst.x, inst.z, g.from, def.id);
    p.shipAt = world.time + g.every[0] + (g.every[1] - g.every[0]) * frac(seq * 0.618034 + 0.17);
  }
  // The work: on while guarded and the zone's clear.
  const clear = !ships.some((s) => Math.hypot(s.x - inst.x, s.z - inst.z) < g.zone);
  if (!guarded || !clear) return;
  const k = String(inst.turbine);
  const e = (p.erect ??= {});
  const c = CONFIG.career.projectInstall;
  const before = (e[k] ?? 0) / c.erectS;
  e[k] = (e[k] ?? 0) + dt;
  const now = e[k] / c.erectS;
  const n = inst.turbine + 1;
  if (before === 0) sayRadio(world, 'info', `${def.name}: installation ship here. Lifting turbine ${n}'s tower.`);
  else if (before < c.nacelleAt && now >= c.nacelleAt) sayRadio(world, 'info', `${def.name}: installation ship here. Turbine ${n}'s tower is up and bolted. Nacelle next.`);
  else if (before < c.rotorAt && now >= c.rotorAt) sayRadio(world, 'info', `${def.name}: installation ship here. Nacelle on. Lifting turbine ${n}'s rotor.`);
  if (now < 1) return;
  delete e[k];
  (p.erected ??= []).push(inst.turbine);
  world.career!.seq += 1;
  sayRadio(world, 'info', `${def.name}: installation ship here. Turbine ${n}'s rotor is on: she's up. Fitters wanted aboard her.`);
}

const frac = (x: number) => x - Math.floor(x);

/** A ship bound for the works turned away: whichever of 70 degrees either way passes further from (x, z). */
function turnAway(s: Ship, x: number, z: number): void {
  let best = s.course;
  let far = -1;
  for (const dev of [70, -70]) {
    const c = s.course + (dev * Math.PI) / 180;
    // How far off (x, z) that course passes (or how far she is now, if it opens from it).
    const dx = x - s.x;
    const dz = z - s.z;
    const along = dx * Math.sin(c) - dz * Math.cos(c);
    const miss = along <= 0 ? Math.hypot(dx, dz) : Math.abs(dx * Math.cos(c) + dz * Math.sin(c));
    if (miss > far) [best, far] = [Math.atan2(Math.sin(c), Math.cos(c)), miss];
  }
  s.want = best;
  delete s.bound;
}

/** The project's farm in the list of wind farms (world/windFarm.ts allFarms): after the map's. */
const PROJECT_FARM = () => WIND_FARMS.length;

/**
 * Fitters for a turbine that's up: a crew transfer called (when the transfer quay's free), and
 * the job done (paid by the project) when they're all up on its platform.
 */
function stepFitters(world: WorldState, def: ProjectDef, p: ProjectProgress, job: TransferJobDef): void {
  if (!p.erected?.includes(job.turbine)) return;
  const key = itemTo(def, job);
  const tj = world.transfer?.job;
  if (tj?.project === key) {
    if (!tj.done) return;
    finishJob(world, def, p, job, `${job.name}: all ${tj.techs.length} up`);
    // Commissioning engineers up: the turbine's commissioned in a while (stepCommissioning).
    if (job.commission && !p.commissioned?.includes(job.turbine)) (p.commissioning ??= {})[String(job.turbine)] = world.time;
    return;
  }
  if (tj && !tj.done) return;
  raiseTransfer(world, PROJECT_FARM(), job.turbine, job.techs, key);
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

/**
 * Debug: the project put at the start of stage `n`, as if every stage before it had been done
 * (and nothing since): what those stages built standing, nothing paid again. What's about from
 * the stage being left (its items on the quay or aboard, a tow, the fitters' transfer, a ship
 * sent for the works) is cleared away.
 */
function setStage(world: WorldState, def: ProjectDef, n: number): void {
  const c = world.career!;
  const key = `${def.id}:`;
  for (const item of Object.values(world.cargo)) if (isProjectItem(item) && item.to.startsWith(key)) delete world.cargo[item.id];
  for (const s of def.stages)
    for (const j of s.jobs)
      if (j.kind === 'tow' && world.vessels[towId(def, j)]) {
        castOffKey(world, vesselKey(towId(def, j)));
        delete world.vessels[towId(def, j)];
      }
  if (world.transfer?.job?.project?.startsWith(key)) world.transfer.job.done = true;
  if (world.traffic) world.traffic.ships = world.traffic.ships.filter((s) => s.bound !== def.id);
  const before = def.stages.slice(0, n).flatMap((s) => s.jobs);
  const all = def.turbines.map((_, i) => i);
  const next: ProjectProgress = { id: def.id, stage: n, done: before.map((j) => j.id), survey: {} };
  for (const j of before) {
    if (j.kind === 'survey') next.survey[j.id] = Array.from({ length: CONFIG.career.projectSurvey.segments }, (_, k) => k);
    else if (j.kind === 'tow' && j.turbine !== undefined) (next.driven ??= []).push(j.id);
    else if (j.kind === 'tow') next.fitted = all;
    else if (j.kind === 'supply') (next.supplied ??= {})[j.id] = j.count;
    else if (j.kind === 'guard') next.erected = all;
    else if (j.kind === 'transfer' && j.commission) (next.commissioned ??= []).push(j.turbine);
  }
  c.project = next;
  c.seq += 1;
  sayRadio(world, 'info', `${portName(def.port)} harbour office: ${def.name} back to stage ${n + 1}, ${def.stages[n].name.toLowerCase()} (debug).`);
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
  } else if (intent.control === 'careerProjectBack') {
    // Debug: back to the start of the stage before (the first: its start again).
    const a = activeProject(world);
    if (a) setStage(world, a.def, Math.max(0, a.p.stage - 1));
  } else if (intent.control === 'careerProjectStage') {
    // Debug: the stage's jobs done as if worked (paid as usual), and what they build built at
    // once. No project under way: the first not yet done is taken (as if at its office).
    if (!c.project) {
      const def = CONFIG.career.projects.find((d) => !(c.projectsDone ?? []).includes(d.id));
      if (!def || world.voyage) return;
      c.project = { id: def.id, stage: 0, done: [], survey: {} };
      c.seq += 1;
      sayRadio(world, 'info', `${portName(def.port)} harbour office: ${def.name} is yours, skipper (debug). First: ${def.stages[0].name.toLowerCase()}.`);
      return;
    }
    const a = activeProject(world);
    if (!a) return;
    for (const job of a.jobs) if (!a.p.done.includes(job.id)) {
      for (const item of Object.values(world.cargo)) if (isProjectItem(item) && item.to === itemTo(a.def, job)) delete world.cargo[item.id];
      if (job.kind === 'tow') {
        castOffKey(world, vesselKey(towId(a.def, job)));
        delete world.vessels[towId(a.def, job)];
        if (job.turbine !== undefined) (a.p.driven ??= []).push(job.id);
        else a.p.fitted = a.def.turbines.map((_, i) => i);
      }
      if (job.kind === 'guard') {
        a.p.erected = a.def.turbines.map((_, i) => i);
        delete a.p.erect;
      }
      if (job.kind === 'transfer' && world.transfer?.job?.project === itemTo(a.def, job)) world.transfer.job.done = true;
      if (job.kind === 'transfer' && job.commission && !a.p.commissioned?.includes(job.turbine)) (a.p.commissioned ??= []).push(job.turbine);
      const text = job.kind === 'buoy' ? `${job.name} laid on station` : job.kind === 'tow' ? `${job.name.replace(/ to .*/, '')} ${job.turbine !== undefined ? 'driven' : 'lifted on'}` : job.kind === 'supply' ? `${job.name} taken aboard` : job.kind === 'guard' ? 'turbines up' : job.kind === 'transfer' ? `${job.name} put across` : `${job.name} run`;
      finishJob(world, a.def, a.p, job, text);
    }
  }
}
