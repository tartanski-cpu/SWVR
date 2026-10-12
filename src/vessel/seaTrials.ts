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
import type { VesselState } from './vesselState';

const DT = 1 / 60;
const KN = 1.943844; // m/s -> knots

export interface SeaTrialResults {
  /** Speed (kn) at lever 25 / 50 / 75 / 100 % ahead, and engine RPM there. */
  speedTable: { lever: number; knots: number; rpm: number }[];
  topSpeedKn: number;
  /** Seconds from rest to 90 % of top speed. */
  timeTo90Pct: number;
  /** Turning at full ahead, helm hard over (m). */
  advance: number;
  transfer: number;
  tacticalDiameter: number;
  steadyTurnDiameter: number;
  turnSpeedKn: number;
  /** Full ahead -> full astern: track reach until stopped (m) and time (s). */
  crashStopDistance: number;
  crashStopTime: number;
  /** Full ahead -> neutral: distance to slow to 1 kn (m). */
  coastDistance: number;
  /** Full astern speed (kn). */
  asternSpeedKn: number;
}

class Trial {
  readonly world: WorldState;
  readonly v: VesselState;
  private readonly q = new THREE.Quaternion();
  private readonly f = new THREE.Vector3();

  constructor() {
    const { world, vesselId } = createWorld(new IdFactory());
    world.environment.waves = []; // calm water
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

  get speed(): number {
    return Math.hypot(this.v.linearVelocity[0], this.v.linearVelocity[2]);
  }

  /** Heading as a continuous angle (rad), bow direction from north, clockwise. */
  heading(): number {
    this.q.fromArray(this.v.orientation);
    this.f.set(0, 0, -1).applyQuaternion(this.q);
    return Math.atan2(this.f.x, -this.f.z);
  }

  startEngine(): void {
    this.send('lever', 0);
    this.send('engineStartStop', 1);
    this.run(3);
  }

  /** Run at a lever setting until speed is steady. */
  settle(lever: number, maxSeconds = 120): void {
    this.send('lever', lever);
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

export function runSeaTrials(): SeaTrialResults {
  // ── Speed table and acceleration ──
  const speedTable: SeaTrialResults['speedTable'] = [];
  for (const lever of [0.25, 0.5, 0.75, 1]) {
    const t = new Trial();
    t.startEngine();
    t.settle(lever);
    speedTable.push({ lever, knots: t.speed * KN, rpm: t.v.engine.rpm });
  }
  const top = speedTable[speedTable.length - 1].knots / KN;

  const acc = new Trial();
  acc.startEngine();
  acc.send('lever', 1);
  let timeTo90Pct = 0;
  acc.run(120, () => {
    timeTo90Pct += DT;
    return acc.speed >= 0.9 * top;
  });

  // ── Turning circle, full ahead, hard to starboard ──
  const turn = new Trial();
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

  // ── Crash stop: full ahead -> full astern ──
  const crash = new Trial();
  crash.startEngine();
  crash.settle(1);
  const cz = crash.v.position[2];
  crash.send('lever', -1);
  let crashStopTime = 0;
  crash.run(120, () => {
    crashStopTime += DT;
    // Stopped when the velocity along the original heading (north, -Z) reverses.
    return crash.v.linearVelocity[2] >= 0;
  });
  const crashStopDistance = -(crash.v.position[2] - cz);

  // ── Coast stop: full ahead -> neutral ──
  const coast = new Trial();
  coast.startEngine();
  coast.settle(1);
  const sz = coast.v.position[2];
  coast.send('lever', 0);
  coast.run(600, () => coast.speed * KN < 1);
  const coastDistance = -(coast.v.position[2] - sz);

  // ── Astern speed ──
  const astern = new Trial();
  astern.startEngine();
  astern.settle(-1);

  return {
    speedTable,
    topSpeedKn: top * KN,
    timeTo90Pct,
    advance,
    transfer,
    tacticalDiameter: tactical,
    steadyTurnDiameter,
    turnSpeedKn,
    crashStopDistance,
    crashStopTime,
    coastDistance,
    asternSpeedKn: astern.speed * KN,
  };
}

export function formatSeaTrials(r: SeaTrialResults, length: number): string {
  const L = (m: number) => `${m.toFixed(0)} m (${(m / length).toFixed(1)} L)`;
  return [
    'SEA TRIALS (calm water)',
    ...r.speedTable.map((s) => `  lever ${(s.lever * 100).toFixed(0).padStart(3)} %: ${s.knots.toFixed(1)} kn @ ${s.rpm.toFixed(0)} rpm`),
    `  0 -> 90 % top speed: ${r.timeTo90Pct.toFixed(1)} s`,
    `  full astern: ${r.asternSpeedKn.toFixed(1)} kn`,
    `  turn (full ahead, hard over): advance ${L(r.advance)}, transfer ${L(r.transfer)}`,
    `    tactical diameter ${L(r.tacticalDiameter)}, steady diameter ${L(r.steadyTurnDiameter)}, speed in turn ${r.turnSpeedKn.toFixed(1)} kn`,
    `  crash stop: ${L(r.crashStopDistance)} in ${r.crashStopTime.toFixed(1)} s`,
    `  coast to 1 kn: ${L(r.coastDistance)}`,
  ].join('\n');
}
