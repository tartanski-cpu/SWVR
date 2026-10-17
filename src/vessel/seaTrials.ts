/**
 * Automated calm-water sea trials, run headless on the real simulation (same stepWorld,
 * same intents as a player would send). Used by `npm run trials`, by the tests, and by
 * the in-game debug key so handling changes are measured rather than guessed.
 */
import * as THREE from 'three';
import { IdFactory } from '../core/ids';
import type { Intent } from '../core/intents';
import { stepWorld } from '../core/simulation';
import { createWorld, type WorldState } from '../core/world';
import { placeVessel } from './vesselControl';
import { gearOf } from '../boats/sims';
import { VESSEL_DEFS } from './vesselDef';
import type { VesselState } from './vesselState';

const DT = 1 / 60;
const KN = 1.943844; // m/s -> knots

export interface SeaTrialResults {
  vesselDefId: string;
  /** Speed (kn) at lever 25 / 50 / 75 / 100 % ahead, and engine RPM there. */
  speedTable: { lever: number; knots: number; rpm: number; fuelLph: number; rangeNm: number }[];
  topSpeedKn: number;
  /** Seconds from rest to 90 % of top speed. */
  timeTo90Pct: number;
  /** Turning at full ahead, helm hard over (m). */
  advance: number;
  transfer: number;
  tacticalDiameter: number;
  steadyTurnDiameter: number;
  turnSpeedKn: number;
  /** Helm response ("bite"): seconds from putting the helm hard over to 10° / 30° heading change, at half and full ahead. */
  helmResponse: { lever: number; to10: number; to30: number }[];
  /** Full ahead -> full astern: track reach until stopped (m) and time (s). */
  crashStopDistance: number;
  crashStopTime: number;
  /** Full ahead -> neutral: distance to slow to 1 kn (m). */
  coastDistance: number;
  /** Full astern speed (kn). */
  asternSpeedKn: number;
  /** Bollard pull: moored, full ahead / full astern - net pull (kN, = T(1-t)) and engine RPM. */
  bollard: { aheadKN: number; aheadRpm: number; asternKN: number; asternRpm: number };
  /** Free-decay tests in calm water (the "inclining-style" experiments). */
  motions: MotionTrials;
}

export interface MotionTrials {
  /** Natural periods (s) from free decay. */
  heavePeriod: number;
  pitchPeriod: number;
  rollPeriod: number;
  /** Released from 10° heel: successive peak heel angles (deg, magnitude). */
  rollPeaks: number[];
  /** Roll damping as a fraction of critical, from the logarithmic decrement. */
  rollDampingRatio: number;
  /** Static heel (deg) from a transverse heeling moment, and the GM it implies. */
  inclining: { momentKNm: number; heelDeg: number; impliedGM: number };
}

class Trial {
  readonly world: WorldState;
  readonly v: VesselState;
  private readonly q = new THREE.Quaternion();
  private readonly f = new THREE.Vector3();

  constructor(defId: string) {
    const { world, vesselId } = createWorld(new IdFactory(), defId);
    world.environment.waves = []; // calm water
    world.geography = 'openSea'; // deep water everywhere: the trials are about the hull
    this.world = world;
    this.v = world.vessels[vesselId];
    placeVessel(this.v, 0, 0, 0, 0); // heading north (-Z)
  }

  send(control: string, value: number): void {
    const intent: Intent = { playerId: 'trials', targetId: this.v.id, control, value };
    stepWorld(this.world, [intent], DT);
  }

  run(seconds: number, each?: () => boolean | void): void {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) {
      stepWorld(this.world, [], DT);
      if (each?.() === true) return;
    }
  }

  heel(): number {
    this.q.fromArray(this.v.orientation);
    this.f.set(1, 0, 0).applyQuaternion(this.q);
    return (-Math.asin(this.f.y) * 180) / Math.PI;
  }

  trim(): number {
    this.q.fromArray(this.v.orientation);
    this.f.set(0, 0, -1).applyQuaternion(this.q);
    return (-Math.asin(this.f.y) * 180) / Math.PI;
  }

  get speed(): number {
    return Math.hypot(this.v.linearVelocity[0], this.v.linearVelocity[2]);
  }

  /** Heading as a continuous angle (rad), bow direction from north, clockwise. */
  heading(): number {
    this.q.fromArray(this.v.orientation);
    this.f.set(0, 0, -1).applyQuaternion(this.q);
    return Math.atan2(this.f.x, -this.f.z);
  }

  /** Start the diesel, or switch the electric outboard on. */
  startEngine(): void {
    if (gearOf(this.v, 'outboard')) {
      if (!this.v.controls.obOn) this.send('obPower', 1);
      return;
    }
    this.throttle(0);
    this.send('engineStartStop', 1);
    this.run(3);
  }

  /**
   * Throttle -1 (full astern) .. +1 (full ahead): the workboat's lever, or the outboard's
   * gear lever and twist grip.
   */
  throttle(value: number): void {
    if (!gearOf(this.v, 'outboard')) {
      this.send('lever', value);
      return;
    }
    const gear = Math.sign(value);
    if (gear !== this.v.controls.obGear) this.send('obGear', gear);
    this.send('lever', Math.abs(value));
  }

  /** Run at a lever setting until speed is steady. */
  settle(lever: number, maxSeconds = 120): void {
    this.throttle(lever);
    let last = -1;
    let t = 0;
    this.run(maxSeconds, () => {
      t += DT;
      if (t % 5 < DT) {
        if (Math.abs(this.speed - last) < 0.005) return true;
        last = this.speed;
      }
    });
  }
}

/** Period (s) from the zero crossings of a decaying signal sampled every DT. */
function periodOf(series: number[]): number {
  const c: number[] = [];
  for (let i = 1; i < series.length; i++) if (series[i - 1] > 0 !== series[i] > 0) c.push(i * DT);
  if (c.length < 3) return NaN;
  const use = c.slice(0, Math.min(c.length, 6));
  return (2 * (use[use.length - 1] - use[0])) / (use.length - 1);
}

function peaksOf(series: number[]): number[] {
  const p: number[] = [];
  for (let i = 1; i < series.length - 1; i++) {
    const a = Math.abs(series[i]);
    if (a > Math.abs(series[i - 1]) && a >= Math.abs(series[i + 1]) && a > 0.05) p.push(a);
  }
  return p;
}

/** Free-decay heave, pitch and roll, and a static inclining test, in calm water. */
export function runMotionTrials(defId: string): MotionTrials {
  const decay = (setup: (t: Trial) => void, read: (t: Trial) => number, seconds: number): number[] => {
    const t = new Trial(defId);
    t.run(20); // settle at rest
    const rest = read(t);
    setup(t);
    const out: number[] = [];
    t.run(seconds, () => void out.push(read(t) - rest));
    return out;
  };
  const heave = decay(
    (t) => (t.v.position[1] += 0.3),
    (t) => t.v.position[1],
    10,
  );
  const pitch = decay(
    (t) => placeVessel(t.v, t.v.position[0], t.v.position[1], t.v.position[2], 0, 0, 3),
    (t) => t.trim(),
    10,
  );
  const roll = decay(
    (t) => placeVessel(t.v, t.v.position[0], t.v.position[1], t.v.position[2], 0, 10),
    (t) => t.heel(),
    25,
  );
  // Roll peaks alternate sides every half cycle; damping ratio from the full-cycle decrement.
  const rollPeaks = peaksOf(roll).slice(0, 8);
  let zeta = NaN;
  if (rollPeaks.length >= 3) {
    const delta = Math.log(rollPeaks[0] / rollPeaks[2]);
    zeta = delta / Math.sqrt(4 * Math.PI * Math.PI + delta * delta);
  }

  // Inclining experiment: apply a known transverse heeling moment and read the heel.
  // In the real test you shift a weight w by distance d: moment = w*g*d, GM = w*d / (Δ tan φ).
  const def = VESSEL_DEFS[defId];
  const momentKNm = 0.02 * def.mass * 9.81 * 0.5 / 1000; // ~2 % of displacement shifted 0.5 m
  const inc = new Trial(defId);
  inc.run(10);
  const steps = Math.round(40 / DT);
  for (let i = 0; i < steps; i++) {
    // Couple about the vessel's longitudinal axis (roll), applied as a body-axis torque.
    const q = new THREE.Quaternion().fromArray(inc.v.orientation);
    const axis = new THREE.Vector3(0, 0, -1).applyQuaternion(q); // +moment heels to starboard
    const w = inc.v.angularVelocity;
    const I = def.inertia[2] * (1 + def.addedAngular[2]);
    const dw = (momentKNm * 1000 * DT) / I;
    inc.v.angularVelocity = [w[0] + axis.x * dw, w[1] + axis.y * dw, w[2] + axis.z * dw];
    stepWorld(inc.world, [], DT);
  }
  const heelDeg = inc.heel();
  const impliedGM = (momentKNm * 1000) / (def.mass * 9.81 * Math.tan((heelDeg * Math.PI) / 180));

  return {
    heavePeriod: periodOf(heave),
    pitchPeriod: periodOf(pitch),
    rollPeriod: periodOf(roll),
    rollPeaks,
    rollDampingRatio: zeta,
    inclining: { momentKNm, heelDeg, impliedGM },
  };
}

export function runSeaTrials(defId = 'workboat'): SeaTrialResults {
  // ── Speed table and acceleration ──
  const speedTable: SeaTrialResults['speedTable'] = [];
  for (const lever of [0.25, 0.5, 0.75, 1]) {
    const t = new Trial(defId);
    t.startEngine();
    t.settle(lever);
    const diesel = gearOf(t.v, 'diesel');
    const ob = gearOf(t.v, 'outboard');
    // Range on a full tank, or (electric outboard) on a full battery.
    const hours = diesel ? diesel.engine.fuel.tankL / t.v.engine.fuelFlowLph : ob ? ob.batteryKWh / (ob.powerKw * lever ** 1.5) : 0;
    speedTable.push({ lever, knots: t.speed * KN, rpm: t.v.engine.rpm, fuelLph: t.v.engine.fuelFlowLph, rangeNm: hours * t.speed * KN });
  }
  const top = speedTable[speedTable.length - 1].knots / KN;

  const acc = new Trial(defId);
  acc.startEngine();
  acc.throttle(1);
  let timeTo90Pct = 0;
  acc.run(120, () => {
    timeTo90Pct += DT;
    return acc.speed >= 0.9 * top;
  });

  // ── Turning circle, full ahead, hard to starboard ──
  const turn = new Trial(defId);
  turn.startEngine();
  turn.settle(1);
  const x0 = turn.v.position[0];
  const z0 = turn.v.position[2];
  const h0 = turn.heading();
  turn.send('helm', 1);
  let advance = 0;
  let transfer = 0;
  let tactical = 0;
  let turned = 0;
  let prevH = h0;
  turn.run(240, () => {
    let dh = turn.heading() - prevH;
    if (dh > Math.PI) dh -= 2 * Math.PI;
    if (dh < -Math.PI) dh += 2 * Math.PI;
    prevH += dh;
    turned = prevH - h0;
    const along = -(turn.v.position[2] - z0); // original heading north
    const across = turn.v.position[0] - x0;
    if (advance === 0 && turned >= Math.PI / 2) {
      advance = along;
      transfer = across;
    }
    if (turned >= Math.PI) {
      tactical = across;
      return true;
    }
  });
  turn.run(60); // into the steady turn
  const yawRate = Math.abs(turn.v.angularVelocity[1]);
  const steadyTurnDiameter = (2 * turn.speed) / Math.max(yawRate, 1e-6);
  const turnSpeedKn = turn.speed * KN;

  // ── Helm response: hard over from a steady straight course; time to 10° and 30° ──
  const helmResponse = [0.5, 1].map((lever) => {
    const t = new Trial(defId);
    t.startEngine();
    t.settle(lever);
    const start = t.heading();
    t.send('helm', 1);
    let time = 0;
    let to10 = 0;
    t.run(30, () => {
      time += DT;
      let dh = Math.abs(t.heading() - start);
      if (dh > Math.PI) dh = 2 * Math.PI - dh;
      if (!to10 && dh >= (10 * Math.PI) / 180) to10 = time;
      return dh >= (30 * Math.PI) / 180;
    });
    return { lever, to10, to30: time };
  });

  // ── Crash stop: full ahead -> full astern ──
  const crash = new Trial(defId);
  crash.startEngine();
  crash.settle(1);
  const cz = crash.v.position[2];
  crash.throttle(-1);
  let crashStopTime = 0;
  crash.run(120, () => {
    crashStopTime += DT;
    // Stopped when the velocity along the original heading (north, -Z) reverses.
    return crash.v.linearVelocity[2] >= 0;
  });
  const crashStopDistance = -(crash.v.position[2] - cz);

  // ── Coast stop: full ahead -> neutral ──
  const coast = new Trial(defId);
  coast.startEngine();
  coast.settle(1);
  const sz = coast.v.position[2];
  coast.throttle(0);
  coast.run(600, () => coast.speed * KN < 1);
  const coastDistance = -(coast.v.position[2] - sz);

  // ── Astern speed ──
  const astern = new Trial(defId);
  astern.startEngine();
  astern.settle(-1);

  // ── Bollard pull: held on station (a towline to a bollard), full ahead then full astern ──
  const bollardAt = (lever: number) => {
    const b = new Trial(defId);
    b.startEngine();
    b.throttle(lever);
    const pos = [...b.v.position] as [number, number, number];
    b.run(25, () => {
      // The towline: hold her horizontally where she is (she may still heave/pitch/roll).
      b.v.position[0] = pos[0];
      b.v.position[2] = pos[2];
      b.v.linearVelocity[0] = 0;
      b.v.linearVelocity[2] = 0;
    });
    return { kN: (Math.abs(b.v.thrust) * (1 - (gearOf(b.v, 'diesel')?.propeller.thrustDeduction ?? 0))) / 1000, rpm: b.v.engine.rpm };
  };
  const bAhead = bollardAt(1);
  const bAstern = bollardAt(-1);

  return {
    vesselDefId: defId,
    bollard: { aheadKN: bAhead.kN, aheadRpm: bAhead.rpm, asternKN: bAstern.kN, asternRpm: bAstern.rpm },
    speedTable,
    topSpeedKn: top * KN,
    timeTo90Pct,
    advance,
    transfer,
    tacticalDiameter: tactical,
    helmResponse,
    steadyTurnDiameter,
    turnSpeedKn,
    crashStopDistance,
    crashStopTime,
    coastDistance,
    asternSpeedKn: astern.speed * KN,
    motions: runMotionTrials(defId),
  };
}

export function formatSeaTrials(r: SeaTrialResults): string {
  const length = VESSEL_DEFS[r.vesselDefId].hull.params.length;
  const L = (m: number) => `${m.toFixed(0)} m (${(m / length).toFixed(1)} L)`;
  const m = r.motions;
  return [
    `SEA TRIALS: ${r.vesselDefId} (calm water)`,
    ...r.speedTable.map(
      (s) =>
        gearOf({ defId: r.vesselDefId }, 'outboard')
          ? `  throttle ${(s.lever * 100).toFixed(0).padStart(3)} %: ${s.knots.toFixed(1)} kn, range ${s.rangeNm.toFixed(1)} nm (full battery)`
          : `  lever ${(s.lever * 100).toFixed(0).padStart(3)} %: ${s.knots.toFixed(1)} kn @ ${s.rpm.toFixed(0)} rpm, ${s.fuelLph.toFixed(1)} L/h, range ${s.rangeNm.toFixed(0)} nm (full tank)`,
    ),
    `  0 -> 90 % top speed: ${r.timeTo90Pct.toFixed(1)} s`,
    `  full astern: ${r.asternSpeedKn.toFixed(1)} kn`,
    `  bollard pull: ahead ${r.bollard.aheadKN.toFixed(1)} kN (${(r.bollard.aheadKN / 9.81).toFixed(2)} t) @ ${r.bollard.aheadRpm.toFixed(0)} rpm, astern ${r.bollard.asternKN.toFixed(1)} kN @ ${r.bollard.asternRpm.toFixed(0)} rpm`,
    `  turn (full ahead, hard over): advance ${L(r.advance)}, transfer ${L(r.transfer)}`,
    `    tactical diameter ${L(r.tacticalDiameter)}, steady diameter ${L(r.steadyTurnDiameter)}, speed in turn ${r.turnSpeedKn.toFixed(1)} kn`,
    ...r.helmResponse.map((h) => `  helm response, lever ${(h.lever * 100).toFixed(0)} %: 10° in ${h.to10.toFixed(1)} s, 30° in ${h.to30.toFixed(1)} s`),
    `  crash stop: ${L(r.crashStopDistance)} in ${r.crashStopTime.toFixed(1)} s`,
    `  coast to 1 kn: ${L(r.coastDistance)}`,
    'MOTIONS (free decay, calm water)',
    `  natural periods: heave ${m.heavePeriod.toFixed(2)} s, pitch ${m.pitchPeriod.toFixed(2)} s, roll ${m.rollPeriod.toFixed(2)} s`,
    `  roll decay from 10°: ${m.rollPeaks.map((p) => p.toFixed(1)).join(', ')}  (damping ${(m.rollDampingRatio * 100).toFixed(0)} % of critical)`,
    `  inclining: ${m.inclining.momentKNm.toFixed(1)} kN·m heeling moment -> ${m.inclining.heelDeg.toFixed(2)}° heel -> GM ${m.inclining.impliedGM.toFixed(2)} m`,
  ].join('\n');
}
