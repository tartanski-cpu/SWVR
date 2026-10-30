/**
 * Training mode's recording (docs/TRAINING.md section 6, milestone 2): each attempt at an
 * exercise is recorded by the host's page (it has the 60 Hz world) as three streams.
 *
 *   samples    `hz` times a second, one fixed row of numbers (FIELDS): her pose and motion,
 *              her controls and machinery, the trainee's place. Enough for the chart review
 *              now and for a rendered replay later (M7) without changing the form.
 *   keyframes  the whole world as JSON every `keyframeS` seconds (weather, lines, the
 *              exercise's state): what a replay starts from.
 *   events     on the attempt's own clock: start, each step done, faults, touches, lines
 *              ashore and let go, the horn, the instructor's lines, the verdict.
 *
 * Samples and not inputs: replaying the trainee's controls through the simulation would drift
 * as the physics changes from build to build, so old runs would go wrong within seconds.
 * The recording lives outside the world state (it would be resent to the crew 20 times a
 * second as it grew) and outside localStorage (shared with the career saves): the page keeps
 * it in IndexedDB (runStore.ts). LAYOUT says which form a run is in, so later builds still
 * read old ones. Plain data and pure functions: no DOM, no Three.js.
 */
import { CONFIG } from '../config';
import { homeVessel, type WorldState } from '../core/world';
import { EXERCISES, exerciseById, heading, KN } from './exercises';
import type { TrainingResult } from './training';

/** The recording's form. Raise it (and read the old one too) if FIELDS or the file change. */
export const LAYOUT = 1;

/** One sample's numbers, in order. Engine: 0 off, 1 cranking, 2 running; moor: 0 free, 1 docking, 2 moored; anchor: 0 stowed, 1 paying, 2 set, 3 weighing, 4 hanging. */
export const FIELDS = [
  't', 'x', 'y', 'z', 'qx', 'qy', 'qz', 'qw', 'vx', 'vy', 'vz', 'wx', 'wy', 'wz',
  'lever', 'lever2', 'helm', 'rudder', 'thrust', 'rpm', 'gear', 'engine',
  'lights', 'horn', 'fenders', 'moor', 'anchor', 'knock',
  'px', 'py', 'pz', 'pyaw', 'aboard',
] as const;
export type Field = (typeof FIELDS)[number];
const F = Object.fromEntries(FIELDS.map((f, i) => [f, i])) as Record<Field, number>;
const N = FIELDS.length;

export interface RunEvent {
  /** Seconds into the attempt. */
  t: number;
  kind: 'start' | 'step' | 'fault' | 'touch' | 'line' | 'horn' | 'radio' | 'result';
  text: string;
  /** A fault's weight (3: it failed the run). */
  weight?: number;
  /** Where she was (world m). */
  x: number;
  z: number;
}

export interface RunHeader {
  layout: number;
  /** Unique, and sorts by when it was recorded. */
  id: string;
  exercise: string;
  /** "H8 Alongside, wind off". */
  name: string;
  attempt: number;
  boat: string;
  /** When it began (ISO, the wall clock: for the list only). */
  date: string;
  hz: number;
  fields: string[];
  /** Seconds. */
  duration: number;
  /** Passed, try again, or null (stopped or started again: no verdict). */
  passed: boolean | null;
  reason: string;
  total: number;
  numbers: [string, string][];
}

export interface Run {
  header: RunHeader;
  /** FIELDS per row, rows in time order. */
  samples: Float32Array;
  events: RunEvent[];
  keyframes: { t: number; world: string }[];
}

const ENGINE = { off: 0, cranking: 1, running: 2 } as const;
const MOOR = { free: 0, docking: 1, moored: 2 } as const;
const ANCHOR = { stowed: 0, paying: 1, set: 2, weighing: 3, hanging: 4 } as const;

interface Building {
  header: RunHeader;
  rows: number[];
  events: RunEvent[];
  keyframes: { t: number; world: string }[];
  startedAt: number;
  lastSample: number;
  lastKey: number;
  step: number;
  faults: number;
  radio: number;
  moor: number;
  horn: boolean;
  lastTouch: number;
}

/**
 * Watches the world's training state each tick (host) and records each attempt from its start
 * to its end: a verdict, Stop, or Start again (each ends the run, the last two without a verdict).
 * `onRun` gets each finished run.
 */
export class Recorder {
  private b: Building | null = null;

  constructor(
    private readonly onRun: (run: Run) => void,
    /** The wall clock, for the run's date and id (tests pass their own). */
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Recording now? */
  get recording(): boolean {
    return !!this.b;
  }

  /** After each simulation tick. */
  tick(world: WorldState): void {
    const t = world.training;
    if (!t) return;
    const b = this.b;
    // What this attempt did this tick (its last step or a failing fault come in the tick it ends).
    if (b && t.startedAt === b.startedAt) this.changes(world);
    // Ended: a verdict for this attempt, Stop, or a new attempt (Start again, another exercise).
    if (b && (t.id === null || t.startedAt !== b.startedAt)) {
      const r = t.result && t.result.t >= b.startedAt ? t.result : null;
      this.finish(world, r, r ? null : t.id ? 'Started again before the end' : 'Stopped before the end');
    }
    if (!this.b && t.id) this.begin(world);
    if (this.b) this.record(world);
  }

  private begin(world: WorldState): void {
    const t = world.training!;
    const ex = exerciseById(t.id!)!;
    const v = homeVessel(world);
    const wall = this.now();
    this.b = {
      header: {
        layout: LAYOUT,
        id: `${wall.toString(36)}-${ex.id}-${t.attempt}`,
        exercise: ex.id,
        name: `${ex.code} ${ex.name}`,
        attempt: t.attempt,
        boat: v?.defId ?? '',
        date: new Date(wall).toISOString(),
        hz: CONFIG.training.record.hz,
        fields: [...FIELDS],
        duration: 0,
        passed: null,
        reason: '',
        total: 0,
        numbers: [],
      },
      rows: [],
      events: [],
      keyframes: [],
      startedAt: t.startedAt,
      lastSample: -Infinity,
      lastKey: -Infinity,
      step: 0,
      faults: 0,
      radio: world.rescue?.radio?.id ?? 0,
      moor: v ? MOOR[v.mooring.phase] : 0,
      horn: false,
      lastTouch: -Infinity,
    };
    this.event(world, 'start', `${ex.code} ${ex.name}, attempt ${t.attempt}`);
  }

  private event(world: WorldState, kind: RunEvent['kind'], text: string, weight?: number): void {
    const b = this.b!;
    const v = homeVessel(world);
    b.events.push({ t: round(world.time - b.startedAt), kind, text, ...(weight !== undefined ? { weight } : {}), x: round(v?.position[0] ?? 0), z: round(v?.position[2] ?? 0) });
  }

  /** The events, from what changed since the last tick. */
  private changes(world: WorldState): void {
    const b = this.b!;
    const t = world.training!;
    const v = homeVessel(world);
    const cfg = CONFIG.training.record;
    if (t.step > b.step) {
      const ex = exerciseById(b.header.exercise);
      for (let i = b.step; i < t.step; i++) this.event(world, 'step', `Done: ${ex?.steps[i]?.text ?? `step ${i + 1}`}`);
      b.step = t.step;
    }
    while (b.faults < t.faults.length) {
      const f = t.faults[b.faults++];
      this.event(world, 'fault', f.text, f.weight);
    }
    const radio = world.rescue?.radio;
    if (radio && radio.id !== b.radio) {
      b.radio = radio.id;
      this.event(world, 'radio', radio.text);
    }
    if (v) {
      const moor = MOOR[v.mooring.phase];
      if (moor !== b.moor) {
        this.event(world, 'line', moor === 0 ? 'Lines let go' : moor === 1 ? 'A line ashore' : 'Made fast');
        b.moor = moor;
      }
      const horn = v.controls.horn > 0.5;
      if (horn && !b.horn) this.event(world, 'horn', 'Horn');
      b.horn = horn;
      const knock = v.contact.impact / KN;
      if (knock > cfg.touchKn && world.time - b.lastTouch > cfg.touchGapS) {
        b.lastTouch = world.time;
        this.event(world, 'touch', `A touch at ${knock.toFixed(2)} kn`);
      }
    }
  }

  private record(world: WorldState): void {
    const b = this.b!;
    const t = world.training!;
    const v = homeVessel(world);
    const at = world.time - b.startedAt;
    const cfg = CONFIG.training.record;
    // A sample row, `hz` a second.
    if (v && at - b.lastSample >= 1 / cfg.hz - 1e-6) {
      b.lastSample = at;
      const p = Object.values(world.players).find((x) => x.id === t.by) ?? Object.values(world.players).find((x) => x.aboardVesselId === v.id) ?? Object.values(world.players)[0];
      const row = new Array<number>(N).fill(0);
      row[F.t] = at;
      [row[F.x], row[F.y], row[F.z]] = v.position;
      [row[F.qx], row[F.qy], row[F.qz], row[F.qw]] = v.orientation;
      [row[F.vx], row[F.vy], row[F.vz]] = v.linearVelocity;
      [row[F.wx], row[F.wy], row[F.wz]] = v.angularVelocity;
      row[F.lever] = v.controls.lever;
      row[F.lever2] = v.controls.lever2 ?? v.controls.lever;
      row[F.helm] = v.controls.helm;
      row[F.rudder] = v.rudder;
      row[F.thrust] = v.thrust;
      row[F.rpm] = v.engine.rpm;
      row[F.gear] = v.engine.gear;
      row[F.engine] = ENGINE[v.engine.phase];
      row[F.lights] = v.controls.navLights;
      row[F.horn] = v.controls.horn;
      row[F.fenders] = v.controls.fenders;
      row[F.moor] = MOOR[v.mooring.phase];
      row[F.anchor] = ANCHOR[v.anchor.phase];
      row[F.knock] = v.contact.impact / KN;
      if (p) {
        [row[F.px], row[F.py], row[F.pz]] = p.position;
        row[F.pyaw] = p.yaw;
        row[F.aboard] = p.aboardVesselId === v.id ? 1 : 0;
      }
      b.rows.push(...row);
    }
    if (at - b.lastKey >= cfg.keyframeS) {
      b.lastKey = at;
      b.keyframes.push({ t: round(at), world: JSON.stringify(world) });
    }
  }

  private finish(world: WorldState, r: TrainingResult | null, why: string | null): void {
    const b = this.b!;
    this.b = null;
    const h = b.header;
    h.duration = round((r ? r.t : world.time) - b.startedAt);
    if (r) {
      h.passed = r.passed;
      h.reason = r.reason;
      h.total = r.total;
      h.numbers = r.numbers;
      b.events.push({ t: h.duration, kind: 'result', text: `${r.passed ? 'Passed' : 'Try again'}: ${r.reason}`, x: b.events.at(-1)?.x ?? 0, z: b.events.at(-1)?.z ?? 0 });
    } else h.reason = why ?? '';
    this.onRun({ header: h, samples: Float32Array.from(b.rows), events: b.events, keyframes: b.keyframes });
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

/** How many samples a run has. */
export function sampleCount(run: Run): number {
  return Math.floor(run.samples.length / run.header.fields.length);
}

/** The run at `t` s: each field interpolated between the two samples either side (a step field, the nearer). */
export function sampleAt(run: Run, t: number): Record<Field, number> {
  const n = sampleCount(run);
  const out = {} as Record<Field, number>;
  if (!n) {
    for (const f of FIELDS) out[f] = 0;
    return out;
  }
  const s = run.samples;
  // The rows are evenly spaced in time, near enough: find by time, then step to it.
  let i = Math.max(0, Math.min(n - 1, Math.floor(t * run.header.hz)));
  while (i > 0 && s[i * N] > t) i--;
  while (i < n - 1 && s[(i + 1) * N] <= t) i++;
  const j = Math.min(n - 1, i + 1);
  const t0 = s[i * N];
  const t1 = s[j * N];
  const k = j === i || t1 <= t0 ? 0 : Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  const STEP: Field[] = ['gear', 'engine', 'lights', 'horn', 'fenders', 'moor', 'anchor', 'aboard'];
  FIELDS.forEach((f, c) => {
    const a = s[i * N + c];
    const z = s[j * N + c];
    out[f] = STEP.includes(f) ? (k < 0.5 ? a : z) : a + (z - a) * k;
  });
  return out;
}

/** Her heading (deg) from a sample's orientation. */
export function sampleHeading(r: Record<Field, number>): number {
  return heading({ orientation: [r.qx, r.qy, r.qz, r.qw] } as never);
}

// ── The file: a run downloaded or loaded (gzipped JSON, the samples as base64) ──

export const FILE_FORMAT = 'swvr-training-run';

interface RunFile {
  format: string;
  header: RunHeader;
  events: RunEvent[];
  keyframes: { t: number; world: string }[];
  samples: string;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** A run as a gzipped file's bytes. */
export async function encodeRun(run: Run): Promise<Uint8Array> {
  const file: RunFile = { format: FILE_FORMAT, header: run.header, events: run.events, keyframes: run.keyframes, samples: toBase64(new Uint8Array(run.samples.buffer, run.samples.byteOffset, run.samples.byteLength)) };
  return pipe(new TextEncoder().encode(JSON.stringify(file)), new CompressionStream('gzip'));
}

/** A file's bytes back to a run; throws with a plain reason if it isn't one this build can read. */
export async function decodeRun(bytes: Uint8Array): Promise<Run> {
  let text: string;
  try {
    text = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip')));
  } catch {
    throw new Error('not a training recording (it is not a gzipped file)');
  }
  const f = JSON.parse(text) as Partial<RunFile>;
  if (f.format !== FILE_FORMAT || !f.header || !f.samples) throw new Error('not a training recording');
  if (f.header.layout > LAYOUT) throw new Error('recorded by a newer version of the game: update this page');
  const raw = fromBase64(f.samples);
  const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  return { header: f.header, samples: Float32Array.from(samples), events: f.events ?? [], keyframes: f.keyframes ?? [] };
}

/** A file name for a run: "swvr-training-H8-2026-10-30-1042-a1.json.gz". */
export function runFileName(h: RunHeader): string {
  const ex = EXERCISES.find((e) => e.id === h.exercise);
  const d = h.date.slice(0, 16).replace('T', '-').replace(':', '');
  return `swvr-training-${ex?.code ?? h.exercise}-${d}-a${h.attempt}.json.gz`;
}
