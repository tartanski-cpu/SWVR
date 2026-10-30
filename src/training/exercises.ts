/**
 * Training mode's exercises (docs/TRAINING.md section 3): each puts the boat in place in the
 * training harbour (world/regions/training.ts), sets the wind, then has its steps, its own
 * faults (`watch`, every tick) and its test at the end (`verdict`), with the numbers the card
 * shows. The limits are CONFIG.training's. Milestone 1 has five of Course 1 (Harbour practice).
 *
 * Each brief says which syllabus item it practises; the game is practice modelled on the RYA
 * Powerboat Scheme and the SBF, never a course or a certificate.
 *
 * World axes: +X east, -Z north; a heading is degrees true, 0 north, clockwise.
 */
import { CONFIG } from '../config';
import { moorAtBerth, type WorldState } from '../core/world';
import { setManualWeather } from '../environment/weather';
import { seaScaleFor } from '../world/coastWeather';
import { berthWithId } from '../world/berths';
import { quickStart } from '../vessel/autopilot';
import { placeVessel } from '../vessel/vesselControl';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import type { TrainingState } from './training';

/** One knot in m/s. */
export const KN = 1852 / 3600;

export interface Ctx {
  world: WorldState;
  v: VesselState;
  t: TrainingState;
  /** The attempt's own measurements (TrainingState.data). */
  d: Record<string, number>;
}

export interface StepDef {
  /** The duty board's line. */
  text: string;
  /** What the instructor says over the VHF as it comes up. */
  say: string;
  /** As it comes up (after its words go out): a measurement to start, the boat to put back. */
  enter?(c: Ctx): void;
  done(c: Ctx): boolean;
}

export interface ExerciseDef {
  id: string;
  /** Its number in the plan's course tables (H for Harbour practice). */
  code: string;
  name: string;
  /** The syllabus items it practises (shown on the Training tab). */
  practises: string;
  /** The first words over the VHF. */
  brief: string;
  /** Its speed limit (kn) where it isn't the harbour's (CONFIG.training.harbourKn). */
  capKn?: number;
  /** Time allowed for the attempt (s). */
  limitS: number;
  setup(world: WorldState, v: VesselState): void;
  steps: StepDef[];
  /** Every tick while it runs: measurements, and a fault of its own if there is one. */
  watch?(c: Ctx): { kind: string; weight: number; text: string } | null;
  verdict(c: Ctx): { passed: boolean; reason: string };
  /** The numbers on the card. */
  numbers(c: Ctx): [string, string][];
}

// ── The harbour's places (world/regions/training.ts) ──

/** The quay face's line (z): boats alongside lie 2.5 m north of it. */
const FACE = 200;
/** The stopping lane between the four yellow marks (H5). */
const LANE = { x0: -140, x1: 140, z0: 40, z1: 70 };
/** The dock (H6): inside its walls, and its mouth's line. */
const DOCK = { x0: 62.5, x1: 92.5, mouth: 168 };

// ── Measures ──

/** Her speed over the ground (kn). */
export function speedKn(v: VesselState): number {
  return Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / KN;
}

/** Her heading (deg true). */
export function heading(v: VesselState): number {
  const [qx, qy, qz, qw] = v.orientation;
  return ((Math.atan2(-(2 * (qx * qz + qw * qy)), 1 - 2 * (qx * qx + qy * qy)) * 180) / Math.PI + 360) % 360;
}

/** The smallest turn from heading `b` to `a` (deg, -180..180). */
export function turnFrom(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Her speed along her own heading (kn; negative going astern). */
function aheadKn(v: VesselState): number {
  const h = (heading(v) * Math.PI) / 180;
  return (v.linearVelocity[0] * Math.sin(h) - v.linearVelocity[2] * Math.cos(h)) / KN;
}

const lengthOf = (v: VesselState) => VESSEL_DEFS[v.defId]?.hull.params.length ?? 10;
const inLane = (v: VesselState) => v.position[0] >= LANE.x0 && v.position[0] <= LANE.x1 && v.position[2] >= LANE.z0 && v.position[2] <= LANE.z1;
const stopped = (v: VesselState) => speedKn(v) < CONFIG.training.stoppedKn;
const fmt = (n: number | undefined, unit: string, dp = 1) => (n === undefined || !Number.isFinite(n) ? 'not reached' : `${n.toFixed(dp)}${unit === '°' ? '' : ' '}${unit}`);

// ── Setting up ──

/** Afloat and free at (x, z), stopped, heading `hdg`, the lever in neutral and the wheel amidships. */
function placeFree(v: VesselState, x: number, z: number, hdg: number): void {
  placeVessel(v, x, 0, z, hdg);
  v.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
  ready(v);
}

/** Alongside a named berth, moored, lines fast. */
function placeAt(v: VesselState, berthId: string): void {
  const b = berthWithId(berthId);
  if (b) moorAtBerth(v, b);
  ready(v);
}

/** Anchor up, the controls at rest, the master on and the engine started (it catches in a second or two). */
function ready(v: VesselState): void {
  v.anchor = { phase: 'stowed', x: 0, z: 0, rodeM: 0, tension: 0, dragging: false };
  v.controls.anchor = 0;
  v.controls.lever = 0;
  if (v.controls.lever2 !== undefined) v.controls.lever2 = 0;
  v.controls.helm = 0;
  v.controls.autopilot = 0;
  v.refuelling = false;
  quickStart(v);
}

/** The wind for the exercise (kn, from deg), a flat sea in the harbour, a clear sky; daylight. */
function setWind(world: WorldState, kn: number, from: number): void {
  const env = world.environment;
  const hs = 0.1;
  setManualWeather(env, { wind: kn * KN, windFrom: from, rain: 0, hs }, world.time, seaScaleFor(hs));
  if (env.timeOfDay < 8 || env.timeOfDay > 18) env.timeOfDay = 11;
}

// ── The exercises ──

const cfg = () => CONFIG.training;

/** H4: first cast-off. */
const H4: ExerciseDef = {
  id: 'castOff',
  code: 'H4',
  name: 'First cast-off',
  practises: 'RYA Level 1: steer and control speed; leaving and coming alongside',
  brief: 'You are alongside Berth B, engine running, fenders out. Take her out to the middle of the harbour and back alongside, under four knots all the way.',
  limitS: 900,
  setup(world, v) {
    placeAt(v, 'training-b');
    v.controls.fenders = 1;
    setWind(world, cfg().castOff.windKn, cfg().castOff.windFrom);
  },
  steps: [
    {
      text: 'Let go the bow and stern lines (the cleats)',
      say: 'When she is running, let the lines go: click the cleats on the quay side, fore and aft.',
      done: (c) => c.v.mooring.phase === 'free' && c.v.engine.phase === 'running',
    },
    {
      text: 'Out between the four yellow lane marks, under 4 kn',
      say: 'Now out to the middle of the harbour, between the four yellow marks. Slowly: under four knots.',
      done: (c) => inLane(c.v),
    },
    {
      text: 'Back alongside any berth on the quay: make fast bow and stern',
      say: 'Good. Bring her back alongside the quay, any berth you like, and make fast bow and stern.',
      done: (c) => c.v.mooring.phase === 'moored',
    },
    {
      text: 'Engine off (the key)',
      say: 'Made fast. Shut the engine down: key off.',
      done: (c) => c.v.engine.phase === 'off',
    },
  ],
  watch(c) {
    c.d.topKn = Math.max(c.d.topKn ?? 0, speedKn(c.v));
    return null;
  },
  verdict: () => ({ passed: true, reason: 'Out and back alongside under control' }),
  numbers: (c) => [
    ['Time', fmt((c.world.time - c.t.startedAt) / 60, 'min')],
    ['Top speed', fmt(c.d.topKn, 'kn')],
    ['Biggest knock', fmt(c.d.maxKnock, 'kn', 2)],
  ],
};

/** H5: stop on course. */
const H5: ExerciseDef = {
  id: 'stopOnCourse',
  code: 'H5',
  name: 'Stop on course',
  practises: 'SBF: stopping on course (kursgerechtes Aufstoppen); RYA Level 2: taking way off',
  brief: 'You are at the west end of the stopping lane, heading east. Run down the lane at four knots; when I call stop her, take all the way off her and keep her on her heading. Going astern, her stern walks to port: be ready for it.',
  capKn: cfg().stop.speedKn + 1,
  limitS: 300,
  setup(world, v) {
    placeFree(v, LANE.x0 + 10, (LANE.z0 + LANE.z1) / 2, 90);
    v.controls.fenders = 0;
    setWind(world, 0, 0);
  },
  steps: [
    {
      text: 'East down the lane at about 4 kn',
      say: 'Off you go: east down the lane between the yellow marks, about four knots, and hold her steady.',
      done: (c) => c.d.fastSince !== undefined && c.world.time - c.d.fastSince >= cfg().stop.holdS && c.v.position[0] >= cfg().stop.callX,
    },
    {
      text: 'STOP HER: way off, on her heading, lever back to neutral',
      say: 'Stop her!',
      enter(c) {
        c.d.callX = c.v.position[0];
        c.d.callZ = c.v.position[2];
        c.d.callHdg = heading(c.v);
        c.d.callT = c.world.time;
        c.d.callKn = speedKn(c.v);
      },
      done(c) {
        if (!stopped(c.v) || Math.abs(c.v.controls.lever) > 0.05) return false;
        c.d.stopDist = Math.hypot(c.v.position[0] - c.d.callX, c.v.position[2] - c.d.callZ);
        c.d.stopS = c.world.time - c.d.callT;
        c.d.turned = Math.abs(turnFrom(heading(c.v), c.d.callHdg));
        return true;
      },
    },
  ],
  watch(c) {
    // Up to speed: since when she has been (forgotten if she drops below it).
    if (c.t.step === 0) {
      if (speedKn(c.v) < cfg().stop.minKn) delete c.d.fastSince;
      else c.d.fastSince ??= c.world.time;
    }
    if (c.t.step === 1 && c.t.said) c.d.maxTurned = Math.max(c.d.maxTurned ?? 0, Math.abs(turnFrom(heading(c.v), c.d.callHdg)));
    if (!inLane(c.v)) return { kind: 'lane', weight: cfg().weights.fail, text: 'She left the lane' };
    return null;
  },
  verdict(c) {
    const lim = cfg().stop.headingDeg;
    if ((c.d.maxTurned ?? 0) > lim) return { passed: false, reason: `Her head fell off ${Math.round(c.d.maxTurned)}° while stopping (keep it under ${lim}°)` };
    return { passed: true, reason: `Stopped in ${c.d.stopDist.toFixed(0)} m, within ${Math.round(c.d.maxTurned ?? 0)}° of her heading` };
  },
  numbers: (c) => [
    ['Speed at the call', fmt(c.d.callKn, 'kn')],
    ['Stopping distance', fmt(c.d.stopDist, 'm', 0)],
    ['Time to stop', fmt(c.d.stopS, 's', 0)],
    ['Heading change (most)', fmt(c.d.maxTurned, '°', 0)],
  ],
};

/** H6: turn in the dock. */
const H6: ExerciseDef = {
  id: 'turnInDock',
  code: 'H6',
  name: 'Turn in the dock',
  practises: 'RYA Level 2: turning in a confined area, the wind on the bow; SBF: turning in a confined space (Wenden auf engem Raum)',
  brief: 'You are in the dock, bow in, three of her lengths between the walls, with a breeze from the west. Turn her round to head out north, with the helm hard over and short bursts ahead and astern, and take her out. Under three knots, and stay in the dock until she is round.',
  capKn: cfg().turn.speedKn,
  limitS: 420,
  setup(world, v) {
    placeFree(v, (DOCK.x0 + DOCK.x1) / 2, 184, 180);
    v.controls.fenders = 1;
    setWind(world, cfg().turn.windKn, cfg().turn.windFrom);
  },
  steps: [
    {
      text: `Turn her to head north (within ${cfg().turn.headingDeg}°), inside the dock`,
      say: 'Turn her round. Helm hard over, a short burst ahead, then astern with the helm the other way, and again.',
      done(c) {
        if (Math.abs(turnFrom(heading(c.v), 0)) > cfg().turn.headingDeg || c.v.position[2] < DOCK.mouth) return false;
        c.d.turnS = c.world.time - c.t.startedAt;
        return true;
      },
    },
    {
      text: 'Take her out of the dock',
      say: 'She is round. Take her out of the dock.',
      done: (c) => c.v.position[2] < DOCK.mouth - 15,
    },
  ],
  watch(c) {
    c.d.topKn = Math.max(c.d.topKn ?? 0, speedKn(c.v));
    // Out past the mouth before she is round: the space wasn't enough, or wasn't used.
    if (c.t.step === 0 && c.v.position[2] < DOCK.mouth - 2) return { kind: 'dock', weight: cfg().weights.fail, text: 'She came out of the dock before she was round' };
    return null;
  },
  verdict: (c) => ({ passed: true, reason: `Round in ${Math.round(c.d.turnS)} s without leaving the dock` }),
  numbers: (c) => [
    ['Time to turn', fmt(c.d.turnS, 's', 0)],
    ['Top speed', fmt(c.d.topKn, 'kn')],
    ['Biggest knock', fmt(c.d.maxKnock, 'kn', 2)],
  ],
};

/** H8: alongside, the wind off the quay. */
const H8_BERTH = 'training-b';
const H8: ExerciseDef = {
  id: 'alongsideWindOff',
  code: 'H8',
  name: 'Alongside, wind off',
  practises: 'RYA Level 2: coming alongside, speed and angle of approach; SBF: coming alongside (Anlegen) with rudder and engine only, stopped at the berth out of gear',
  brief: `Bring her alongside Berth B, port side to, heading west. The wind is ${cfg().alongside.windKn} knots off the quay, so come in steeper than you think: 30 to 45 degrees, slow, a touch astern to take the way off, neutral before the first line goes ashore.`,
  limitS: 600,
  setup(world, v) {
    placeFree(v, 35, 140, 250);
    v.controls.fenders = 0;
    setWind(world, cfg().alongside.windKn, cfg().alongside.windFrom);
  },
  steps: [
    {
      text: 'Fenders out',
      say: 'First, fenders out.',
      done: (c) => c.v.controls.fenders > 0,
    },
    {
      text: 'Alongside Berth B, port side to: 30-45° in, slow, then a line ashore',
      say: 'Now in to Berth B, port side to. Slowly. Neutral, then get a line ashore.',
      done: (c) => c.v.mooring.phase !== 'free',
    },
    {
      text: 'Make fast bow and stern',
      say: 'A line is on. Make fast fore and aft.',
      done: (c) => c.v.mooring.phase === 'moored',
    },
  ],
  watch(c) {
    const v = c.v;
    const b = berthWithId(H8_BERTH)!;
    const off = Math.hypot(v.position[0] - b.x, v.position[2] - b.z);
    // Her speed as she comes within one of her lengths of the berth.
    if (c.t.step >= 1 && c.d.approachKn === undefined && off < lengthOf(v)) c.d.approachKn = speedKn(v);
    // Her angle to the quay at the first touch (on her fenders or her hull) near the berth.
    if (c.t.step >= 1 && c.d.angle === undefined && off < 2 * lengthOf(v) && (v.contact.force > 0 || (v.contact.guardForce ?? 0) > 0)) {
      const h = heading(v);
      c.d.angle = Math.min(Math.abs(turnFrom(h, 270)), Math.abs(turnFrom(h, 90)));
      c.d.touchKnock = v.contact.impact / KN;
    }
    // The first line ashore: in gear or not, at which berth.
    if (c.d.lineGear === undefined && v.mooring.phase !== 'free') {
      c.d.lineGear = Math.abs(v.engine.gear);
      c.d.lineAtBerth = v.mooring.berthId === H8_BERTH ? 1 : 0;
    }
    return null;
  },
  verdict(c) {
    const a = cfg().alongside;
    const v = c.v;
    if (v.mooring.berthId !== H8_BERTH) return { passed: false, reason: 'Made fast at another berth: Berth B was asked' };
    if (Math.abs(turnFrom(heading(v), 270)) > 45) return { passed: false, reason: 'Starboard side to: port side to was asked (heading west)' };
    if ((c.d.approachKn ?? 0) > a.approachKn) return { passed: false, reason: `In too fast: ${c.d.approachKn.toFixed(1)} kn one length off (under ${a.approachKn})` };
    if ((c.d.angle ?? 0) > a.angleDeg) return { passed: false, reason: `Too steep at the touch: ${Math.round(c.d.angle)}° (under ${a.angleDeg}°)` };
    if ((c.d.maxKnock ?? 0) > a.knockKn) return { passed: false, reason: `Too hard against the quay: ${c.d.maxKnock.toFixed(2)} kn (under ${a.knockKn})` };
    if (c.d.lineGear) return { passed: false, reason: 'Still in gear when the first line went ashore: neutral first' };
    return { passed: true, reason: `Alongside at ${(c.d.approachKn ?? 0).toFixed(1)} kn, ${Math.round(c.d.angle ?? 0)}° in, out of gear` };
  },
  numbers: (c) => [
    ['Speed one length off', fmt(c.d.approachKn, 'kn')],
    ['Angle at first touch', fmt(c.d.angle, '°', 0)],
    ['Biggest knock', fmt(c.d.maxKnock, 'kn', 2)],
    ['Gear at first line', c.d.lineGear === undefined ? 'no line yet' : c.d.lineGear ? 'in gear' : 'neutral'],
  ],
};

/** H10: leaving the slot, ahead and astern. */
const SLOT = 'training-slot';
/** Clear of the slot: this far out from the quay face (m), past the jetties' ends. */
const clearOf = (v: VesselState) => FACE - 2.5 - cfg().leave.clearLengths * lengthOf(v);
const H10: ExerciseDef = {
  id: 'leaveSlot',
  code: 'H10',
  name: 'Leaving the slot',
  practises: 'RYA Level 2: leaving a berth ahead or astern; SBF: leaving the berth (Ablegen), traffic, space and wind',
  brief: 'You are in the slot, a jetty close ahead and another close astern. Leave her twice: first ahead, bow out, then astern, stern out, touching nothing either time, two of her lengths clear of the quay.',
  limitS: 600,
  setup(world, v) {
    placeAt(v, SLOT);
    v.controls.fenders = 1;
    setWind(world, cfg().leave.windKn, cfg().leave.windFrom);
  },
  steps: [
    {
      text: 'Leave AHEAD: lines off, out bow first, two lengths clear',
      say: 'First time: let go and leave ahead. Plenty of helm, gently, and keep her stern off the jetty astern.',
      done(c) {
        if (c.v.mooring.phase !== 'free' || c.v.position[2] > clearOf(c.v)) return false;
        c.d.aheadKn = aheadKn(c.v);
        return true;
      },
    },
    {
      text: 'Leave ASTERN: lines off, out stern first, two lengths clear',
      say: 'Well clear. I have put her back in the slot for you. Now leave astern: let go, then stern first, out past the jetty.',
      enter(c) {
        const b = berthWithId(SLOT);
        if (b) moorAtBerth(c.v, b);
        c.v.controls.lever = 0;
        c.v.controls.helm = 0;
      },
      done(c) {
        if (c.v.mooring.phase !== 'free' || c.v.position[2] > clearOf(c.v)) return false;
        c.d.asternKn = aheadKn(c.v);
        return true;
      },
    },
  ],
  watch(c) {
    // Her plating touching anything once she's free (a touch on the fenders is not a fault; a
    // knock through them is: CONFIG.training.knock).
    if (c.v.contact.force > 0 && c.v.mooring.phase === 'free') {
      c.d.touches = (c.d.touches ?? 0) + (c.d.touching ? 0 : 1);
      c.d.touching = 1;
      return { kind: 'touch', weight: cfg().weights.knock, text: 'Her hull touched the quay or a jetty' };
    }
    c.d.touching = 0;
    return null;
  },
  verdict(c) {
    if ((c.d.aheadKn ?? 0) <= 0) return { passed: false, reason: 'The first time out was astern: ahead was asked' };
    if ((c.d.asternKn ?? 0) >= 0) return { passed: false, reason: 'The second time out was ahead: astern was asked' };
    if (c.d.touches) return { passed: false, reason: `Her hull touched ${c.d.touches === 1 ? 'once' : `${c.d.touches} times`}` };
    return { passed: true, reason: 'Out ahead and out astern, touching nothing' };
  },
  numbers: (c) => [
    ['Leaving ahead', fmt(c.d.aheadKn, 'kn')],
    ['Leaving astern', fmt(c.d.asternKn === undefined ? undefined : -c.d.asternKn, 'kn')],
    ['Hull touches', String(c.d.touches ?? 0)],
    ['Biggest knock', fmt(c.d.maxKnock, 'kn', 2)],
  ],
};

/** Course 1's exercises in milestone 1, in the order the Training tab lists them. */
export const EXERCISES: readonly ExerciseDef[] = [H4, H5, H6, H8, H10];

export function exerciseById(id: string): ExerciseDef | undefined {
  return EXERCISES.find((e) => e.id === id);
}
