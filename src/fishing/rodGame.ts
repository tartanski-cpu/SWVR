import { CONFIG } from '../config';
import { rodBite, rodWait } from './rod';

/**
 * The rod in your hands (owner, Oct 2026): a small game, run by each player's own app from
 * what their hand does each frame (no feedback from the water: the rod's buzz and the float
 * are the tell), with the catch sent to the world as an intent (rod.ts).
 *
 *   idle      the rod in hand, no line out. Press (the trigger, the left button) with the
 *             rod over the water and the boat slow: the float flies out along the rod
 *             (CONFIG.rod.castRange) and lands.
 *   waiting   the float on the water, drifting with it. After its time (rodWait: sooner in
 *             a fishing ground) a fish takes it.
 *   bite      the float dips, the rod buzzes: press within `biteWindow` s to strike, or it's
 *             gone (back to waiting, the float still out).
 *   playing   the fish is on. Hold to reel: the float comes in at `reelRate` (slower while
 *             the fish pulls) and the line's tension rises with the fish's pull; let go and
 *             it rests (the tension falls, the fish takes a little line). The fish runs in
 *             waves (`fightPeriod`). Tension 1 parts the line. The float within `landAt` m
 *             of the rod's tip and the fish is landed: into the bucket.
 *   Letting go of the rod at any point (hung back) winds everything in.
 *
 * Positions are world metres. Deterministic with an injected `rng`, for tests.
 */
export type RodPhase = 'idle' | 'waiting' | 'bite' | 'playing';

export type RodEvent = 'cast' | 'bite' | 'missed' | 'strike' | 'broke' | 'landed' | 'wound';

export interface RodInput {
  /** The rod is in a hand. */
  held: boolean;
  /** The trigger / button went down this frame; is down. */
  pressed: boolean;
  down: boolean;
  /** The rod's tip (world) and which way it points. */
  tip: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
  /** The water's surface height at (x, z). */
  waterAt: (x: number, z: number) => number;
  /** Is (x, z) clear of the boat (off her hull) and over water deep enough? */
  clearWater: (x: number, z: number) => boolean;
  /** Her speed through the water (m/s). */
  boatSpeed: number;
}

export interface RodFish {
  species: string;
  kg: number;
}

export class RodGame {
  phase: RodPhase = 'idle';
  /** The float (world), while a line is out. */
  readonly float = { x: 0, y: 0, z: 0 };
  /** The line's tension, 0..1, while a fish is on. */
  tension = 0;
  /** The fish on, while playing. */
  fish: RodFish | null = null;
  /** How far the float is from the tip in plan (m). */
  distance = 0;
  /** The fish's pull right now, 0..1 (for the rod's bend and buzz). */
  pull = 0;
  /** The last catch (for the notice). */
  landed: RodFish | null = null;
  private waitLeft = 0;
  private biteLeft = 0;
  private fightT = 0;

  constructor(private readonly rng: () => number = Math.random) {}

  /** One frame: what happened, if anything. */
  step(dt: number, inp: RodInput): RodEvent | null {
    const c = CONFIG.rod;
    if (!inp.held) {
      const was = this.phase !== 'idle';
      this.reset();
      return was ? 'wound' : null;
    }
    const tip = inp.tip;
    switch (this.phase) {
      case 'idle': {
        if (!inp.pressed) return null;
        // Cast along the rod, level, as far as it reaches; it has to land on open water.
        const h = Math.hypot(inp.dir.x, inp.dir.z) || 1;
        const fx = tip.x + (inp.dir.x / h) * c.castRange;
        const fz = tip.z + (inp.dir.z / h) * c.castRange;
        if (inp.boatSpeed > c.maxSpeed || !inp.clearWater(fx, fz)) return null;
        this.float.x = fx;
        this.float.z = fz;
        this.float.y = inp.waterAt(fx, fz);
        this.phase = 'waiting';
        this.waitLeft = rodWait(fx, fz, this.rng);
        this.pull = 0;
        return 'cast';
      }
      case 'waiting': {
        this.drift(dt, inp);
        this.waitLeft -= dt;
        if (this.waitLeft > 0) return null;
        this.phase = 'bite';
        this.biteLeft = c.biteWindow;
        this.pull = 0.6;
        return 'bite';
      }
      case 'bite': {
        this.drift(dt, inp);
        if (inp.pressed) {
          this.fish = rodBite(this.float.x, this.float.z, this.rng);
          this.phase = 'playing';
          this.tension = 0.25;
          this.fightT = 0;
          this.distance = this.plan(tip);
          return 'strike';
        }
        this.biteLeft -= dt;
        if (this.biteLeft > 0) return null;
        this.phase = 'waiting';
        this.waitLeft = rodWait(this.float.x, this.float.z, this.rng) * 0.6;
        this.pull = 0;
        return 'missed';
      }
      case 'playing': {
        const f = this.fish!;
        this.fightT += dt;
        // The fish's runs: its pull swings between a quarter and its full (by its weight).
        const full = Math.min(1.2, f.kg * c.pullPerKg + 0.2);
        this.pull = full * (0.25 + 0.75 * 0.5 * (1 + Math.sin((this.fightT / c.fightPeriod) * Math.PI * 2)));
        if (inp.down) {
          this.tension = Math.min(1.5, this.tension + c.tensionUp * this.pull * dt + 0.08 * dt);
          this.distance = Math.max(0, this.distance - c.reelRate * (1 - 0.6 * this.pull) * dt);
        } else {
          this.tension = Math.max(0, this.tension - c.tensionDown * dt);
          this.distance += 0.35 * this.pull * dt;
        }
        if (this.tension >= 1) {
          this.reset();
          return 'broke';
        }
        // The float comes in along the line, on the water.
        this.placeFloat(tip, inp);
        if (this.distance <= c.landAt) {
          this.landed = f;
          this.reset();
          return 'landed';
        }
        return null;
      }
    }
    return null;
  }

  private plan(tip: { x: number; z: number }): number {
    return Math.hypot(this.float.x - tip.x, this.float.z - tip.z);
  }

  /** The float at `distance` from the tip, along the line's bearing, on the water. */
  private placeFloat(tip: { x: number; y: number; z: number }, inp: RodInput): void {
    const d = this.plan(tip) || 1;
    const ux = (this.float.x - tip.x) / d;
    const uz = (this.float.z - tip.z) / d;
    this.float.x = tip.x + ux * this.distance;
    this.float.z = tip.z + uz * this.distance;
    this.float.y = inp.waterAt(this.float.x, this.float.z) - (this.phase === 'playing' ? 0.15 * this.pull : 0);
  }

  /** The float rides the water where it lies (and dips while a fish mouths it). */
  private drift(dt: number, inp: RodInput): void {
    void dt;
    this.float.y = inp.waterAt(this.float.x, this.float.z) - (this.phase === 'bite' ? 0.2 : 0);
  }

  private reset(): void {
    this.phase = 'idle';
    this.fish = null;
    this.tension = 0;
    this.pull = 0;
    this.distance = 0;
  }
}
