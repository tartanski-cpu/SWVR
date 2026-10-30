/**
 * Training mode's exercise engine (docs/TRAINING.md section 5): the first-voyage tutorial's
 * pattern (career/tutorial.ts) made general. An exercise (exercises.ts) puts the boat in
 * place and sets the wind, then has steps, each a plain check on the world, announced once
 * over the VHF and ticked on the duty board; while it runs, faults are counted against the
 * limits in CONFIG.training. It ends "passed" or "try again", with the reason and the few
 * numbers that matter: an examiner's verdict, not a score.
 *
 * Plain JSON on WorldState.training, stepped by the host in stepWorld and driven by intents
 * (trainingStart, trainingRetry, trainingRestart, trainingAbort), so crew and an instructor
 * see the same in their snapshots. Nothing here touches Three.js, the DOM, VR or the desktop.
 * Everything is timed on world.time.
 */
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import { homeVessel, type WorldState } from '../core/world';
import { sayRadio } from '../rescue/rescue';
import type { VesselState } from '../vessel/vesselState';
import { EXERCISES, exerciseById, KN, speedKn, type Ctx } from './exercises';

export interface TrainingFault {
  /** Seconds into the attempt. */
  t: number;
  kind: string;
  /** 1 or 2: counted; 3: the run is failed there and then. */
  weight: number;
  text: string;
}

/** The card at the end of an attempt: passed or try again, why, and the numbers that matter. */
export interface TrainingResult {
  id: string;
  name: string;
  attempt: number;
  passed: boolean;
  reason: string;
  numbers: [string, string][];
  faults: TrainingFault[];
  /** The faults' weights added up (the badges, M3, are given on it). */
  total: number;
  /** World time it ended. */
  t: number;
}

export interface TrainingState {
  /** The exercise running (exercises.ts id), or null between exercises. */
  id: string | null;
  /** Which attempt this is (1 or 2: CONFIG.training.attempts). */
  attempt: number;
  /** The step being worked on (index into its steps). */
  step: number;
  /** The current step has been announced. */
  said: boolean;
  /** World time this attempt began, and the current step. */
  startedAt: number;
  stepAt: number;
  faults: TrainingFault[];
  /** When each kind of fault was last counted (world time): CONFIG.training.faultGapS. */
  lastFault: Record<string, number>;
  /** The exercise's own measurements this attempt (exercises.ts). */
  data: Record<string, number>;
  /** The last attempt's card. */
  result: TrainingResult | null;
  /** The exercises passed this session. */
  passed: string[];
  /** Bumped on every change worth redrawing (the menu, the board). */
  seq: number;
  /**
   * The instructor's lines waiting to go out over the VHF, and when the last one will have
   * been spoken (world time): the VHF holds one message, which the page speaks aloud, so each
   * waits for the one before (CONFIG.training.voiceCharsPerS).
   */
  queue: string[];
  quietUntil: number;
}

export function createTraining(): TrainingState {
  return { id: null, attempt: 1, step: 0, said: false, startedAt: 0, stepAt: 0, faults: [], lastFault: {}, data: {}, result: null, passed: [], seq: 0, queue: [], quietUntil: 0 };
}

const TRAINING_INTENTS = ['trainingStart', 'trainingRetry', 'trainingRestart', 'trainingAbort'];

export function isTrainingIntent(control: string): boolean {
  return TRAINING_INTENTS.includes(control);
}

/**
 * trainingStart (ref: the exercise's id) begins its first attempt; trainingRetry the next
 * attempt after a "try again" (the first again once both are used); trainingRestart the
 * attempt running, from the beginning, not counted (going round again is never a fault);
 * trainingAbort stops it, no verdict.
 */
export function applyTrainingIntent(world: WorldState, intent: Intent): void {
  const t = world.training;
  const v = homeVessel(world);
  if (!t || !v) return;
  switch (intent.control) {
    case 'trainingStart':
      if (intent.ref && exerciseById(intent.ref)) begin(world, t, v, intent.ref, 1);
      break;
    case 'trainingRetry': {
      const r = t.result;
      if (!r || t.id) break;
      begin(world, t, v, r.id, !r.passed && r.attempt < CONFIG.training.attempts ? r.attempt + 1 : 1);
      break;
    }
    case 'trainingRestart':
      if (t.id) begin(world, t, v, t.id, t.attempt);
      break;
    case 'trainingAbort':
      if (t.id) {
        t.queue = [];
        voice(world, t, 'Exercise stopped. Pick another, or the same again, when you are ready.');
        t.id = null;
        t.seq += 1;
      }
      break;
  }
}

/** An attempt from the beginning: the boat in place, the wind set, the first step to come. */
function begin(world: WorldState, t: TrainingState, v: VesselState, id: string, attempt: number): void {
  const ex = exerciseById(id)!;
  // Nothing else calls while you practise.
  world.quietCalls = true;
  ex.setup(world, v);
  Object.assign(t, { id, attempt, step: 0, said: false, startedAt: world.time, stepAt: world.time, faults: [], lastFault: {}, data: {}, result: null, queue: [], quietUntil: 0 });
  t.seq += 1;
  voice(world, t, `${ex.code} ${ex.name}, attempt ${attempt} of ${CONFIG.training.attempts}. ${ex.brief}`);
}

/** A line for the VHF, in its turn (TrainingState.queue). */
function voice(world: WorldState, t: TrainingState, text: string): void {
  t.queue.push(text);
  speakNext(world, t);
}

/** The next waiting line, once the last has been spoken. */
function speakNext(world: WorldState, t: TrainingState): boolean {
  if (!t.queue.length || world.time < t.quietUntil) return false;
  say(world, t, t.queue.shift()!);
  return true;
}

function say(world: WorldState, t: TrainingState, text: string): void {
  sayRadio(world, 'info', text);
  t.quietUntil = world.time + CONFIG.training.voicePauseS + text.length / CONFIG.training.voiceCharsPerS;
}

/** Nothing being said or waiting to be. */
const quiet = (world: WorldState, t: TrainingState) => !t.queue.length && world.time >= t.quietUntil;

/** One tick (host): announce the step, watch for faults, check the step, move on, judge at the end. */
export function stepTraining(world: WorldState): void {
  const t = world.training;
  const v = homeVessel(world);
  if (t) speakNext(world, t);
  if (!t?.id || !v) return;
  const ex = exerciseById(t.id);
  if (!ex) {
    t.id = null;
    return;
  }
  const c: Ctx = { world, v, t, d: t.data };
  const step = ex.steps[t.step];
  // The faults, from the moment the boat is hers (the brief too): the exercise's own, then the speed and the knocks.
  const own = ex.watch?.(c);
  if (own) fault(world, t, own.kind, own.weight, own.text);
  if (t.id) commonFaults(world, t, v, ex.capKn ?? CONFIG.training.harbourKn);
  if (!t.id) return;
  if (world.time - t.startedAt > ex.limitS) {
    finish(world, t, ex.code, ex.name, false, `Out of time: ${Math.round(ex.limitS / 60)} minutes is plenty for this one`, ex.numbers(c));
    return;
  }
  if (!t.said) {
    // Each step is called once the words before it are out (its `enter` then: "Stop her!" starts the measuring as it's said).
    if (!quiet(world, t)) return;
    t.said = true;
    t.stepAt = world.time;
    step.enter?.(c);
    say(world, t, step.say);
    t.seq += 1;
    return;
  }
  if (!step.done(c)) return;
  t.step += 1;
  t.said = false;
  t.seq += 1;
  if (t.step < ex.steps.length) return;
  const verdict = ex.verdict(c);
  // A run with faults can still pass (the RYA's words: a fault is not necessarily a fail);
  // only a fail-weight fault (it ended the run there and then) or the exercise's own test fails it.
  finish(world, t, ex.code, ex.name, verdict.passed, verdict.reason, ex.numbers(c));
}

/** The speed over the harbour's limit (or the exercise's) and the knocks, as faults. */
function commonFaults(world: WorldState, t: TrainingState, v: VesselState, capKn: number): void {
  const cfg = CONFIG.training;
  // (Judged as shown, to a tenth: 3.04 kn is 3.0, not over 3.)
  const kn = Math.round(speedKn(v) * 10) / 10;
  if (kn > capKn) fault(world, t, 'speed', cfg.weights.speed, `Over ${capKn} kn (${kn.toFixed(1)} kn)`);
  const knock = v.contact.impact / KN;
  t.data.maxKnock = Math.max(t.data.maxKnock ?? 0, knock);
  if (knock > cfg.knock.failKn) fault(world, t, 'knock', cfg.weights.fail, `A hard knock: ${knock.toFixed(1)} kn into the quay`);
  else if (knock > cfg.knock.faultKn) fault(world, t, 'knock', cfg.weights.knock, `A knock: ${knock.toFixed(1)} kn`);
}

/** Count a fault (once per kind per CONFIG.training.faultGapS); a fail-weight one ends the run. */
function fault(world: WorldState, t: TrainingState, kind: string, weight: number, text: string): void {
  const last = t.lastFault[kind];
  if (weight < CONFIG.training.weights.fail && last !== undefined && world.time - last < CONFIG.training.faultGapS) return;
  t.lastFault[kind] = world.time;
  t.faults.push({ t: Math.round(world.time - t.startedAt), kind, weight, text });
  t.seq += 1;
  const ex = t.id ? exerciseById(t.id) : undefined;
  if (weight >= CONFIG.training.weights.fail && ex) {
    finish(world, t, ex.code, ex.name, false, text, ex.numbers({ world, v: homeVessel(world)!, t, d: t.data }));
  } else if (quiet(world, t)) say(world, t, `Fault: ${text}.`); // (else on the card only: no talking over a line)
}

function finish(world: WorldState, t: TrainingState, code: string, name: string, passed: boolean, reason: string, numbers: [string, string][]): void {
  const id = t.id!;
  const total = t.faults.reduce((s, f) => s + f.weight, 0);
  t.result = { id, name: `${code} ${name}`, attempt: t.attempt, passed, reason, numbers, faults: [...t.faults], total, t: world.time };
  if (passed && !t.passed.includes(id)) t.passed.push(id);
  t.id = null;
  t.seq += 1;
  const more = !passed && t.attempt < CONFIG.training.attempts;
  t.queue = [];
  voice(world, t, passed ? `Passed: ${code} ${name}. ${reason}.` : `Try again: ${reason}.${more ? ' Your second attempt when you are ready (Training tab).' : ' Practise it, then start it again.'}`);
}

/** The duty board's entry while an exercise runs (duties/duties.ts): its steps, ticked as done. */
export function trainingDuty(world: WorldState): { key: string; title: string; steps: { text: string; done: boolean }[] } | null {
  const t = world.training;
  const ex = t?.id ? exerciseById(t.id) : undefined;
  if (!t || !ex) return null;
  return {
    key: `${ex.id}-${t.attempt}-${t.startedAt}`,
    title: `${ex.code} ${ex.name} (attempt ${t.attempt} of ${CONFIG.training.attempts})`,
    steps: ex.steps.map((s, i) => ({ text: s.text, done: i < t.step })),
  };
}

/** For the menu: what's running and the step, or null. */
export function trainingLine(world: WorldState): string | null {
  const t = world.training;
  const ex = t?.id ? exerciseById(t.id) : undefined;
  if (!t || !ex) return null;
  return `${ex.code} ${ex.name}, attempt ${t.attempt}: ${ex.steps[Math.min(t.step, ex.steps.length - 1)].text}`;
}

export { EXERCISES };
