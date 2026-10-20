import { CONFIG } from '../config';

/**
 * The line-throwing gun (owner, Oct 2026): a tug's hand tool for passing a hawser to a ship
 * her boat hook can't reach. Run by each player's own app from what their hand does (like
 * the rod: fishing/rodGame.ts); the result (the towline made fast) goes to the world as the
 * ordinary towMake intent, flagged as by the gun so the line may be made fast at the gun's
 * range, not the hook's.
 *
 *   ready     in hand, loaded. A press fires: the rocket leaves the muzzle at CONFIG.lineGun
 *             .speed along the gun, flying under gravity, trailing the messenger line.
 *   flying    each frame it moves on; passing within `hitRadius` of a tow target's bow eye
 *             (a ship's, a boat's, a piece of debris) it lands there: attached. (Aimed
 *             within `aimDeg` of an eye inside `range` m, it's a hit from the start: a
 *             rocket is not a thing to be precise with in VR.) Into the water (below the
 *             surface) or past its range: a miss, a splash, `reloadS` s to load again.
 *   hauling   the ship's crew have the messenger: they haul the hawser over on it for
 *             `haulS` s (the view shows the line going across), then it's fast: 'made'.
 *   Hanging the gun back winds the messenger in (a miss, or hauling undone).
 *
 * World metres. Deterministic: no randomness.
 */
export type GunPhase = 'ready' | 'flying' | 'hauling' | 'reloading';

export type GunEvent = 'fired' | 'attached' | 'missed' | 'made' | 'wound';

export interface GunTarget {
  key: string;
  pos: { x: number; y: number; z: number };
}

export interface GunInput {
  held: boolean;
  pressed: boolean;
  /** The muzzle (world) and where the gun points. */
  tip: { x: number; y: number; z: number };
  dir: { x: number; y: number; z: number };
  /** The tow targets' bow eyes (world) she may pass a line to. */
  targets: readonly GunTarget[];
  waterAt: (x: number, z: number) => number;
}

export class LineGun {
  phase: GunPhase = 'ready';
  /** The rocket (world) and its velocity while flying. */
  readonly rocket = { x: 0, y: 0, z: 0 };
  private readonly vel = { x: 0, y: 0, z: 0 };
  private flown = 0;
  /** The target the messenger is on (attached / hauling). */
  target: GunTarget | null = null;
  /** Hauling: how far across the hawser is, 0..1. */
  haul = 0;
  private timer = 0;

  step(dt: number, inp: GunInput): GunEvent | null {
    const c = CONFIG.lineGun;
    if (!inp.held) {
      const was = this.phase === 'flying' || this.phase === 'hauling';
      this.reset();
      return was ? 'wound' : null;
    }
    switch (this.phase) {
      case 'ready': {
        if (!inp.pressed) return null;
        const d = inp.dir;
        const n = Math.hypot(d.x, d.y, d.z) || 1;
        this.rocket.x = inp.tip.x;
        this.rocket.y = inp.tip.y;
        this.rocket.z = inp.tip.z;
        this.vel.x = (d.x / n) * c.speed;
        this.vel.y = (d.y / n) * c.speed;
        this.vel.z = (d.z / n) * c.speed;
        this.flown = 0;
        this.phase = 'flying';
        // Aimed at an eye within range: it's going to land there.
        const aimed = this.aimedAt(inp);
        if (aimed) return this.attach(aimed);
        return 'fired';
      }
      case 'flying': {
        this.vel.y -= CONFIG.ocean.gravity * dt;
        this.rocket.x += this.vel.x * dt;
        this.rocket.y += this.vel.y * dt;
        this.rocket.z += this.vel.z * dt;
        this.flown += Math.hypot(this.vel.x, this.vel.y, this.vel.z) * dt;
        for (const t of inp.targets) {
          if (Math.hypot(t.pos.x - this.rocket.x, t.pos.y - this.rocket.y, t.pos.z - this.rocket.z) < c.hitRadius) return this.attach(t);
        }
        if (this.rocket.y < inp.waterAt(this.rocket.x, this.rocket.z) || this.flown > c.range * 1.3) {
          this.phase = 'reloading';
          this.timer = c.reloadS;
          return 'missed';
        }
        return null;
      }
      case 'hauling': {
        this.timer -= dt;
        this.haul = 1 - Math.max(0, this.timer) / c.haulS;
        if (this.timer > 0) return null;
        const key = this.target!.key;
        this.reset();
        this.madeKey = key;
        return 'made';
      }
      case 'reloading': {
        this.timer -= dt;
        if (this.timer <= 0) this.phase = 'ready';
        return null;
      }
    }
    return null;
  }

  /** After 'made': which target the hawser is fast to. */
  madeKey: string | null = null;

  /** An eye the gun is aimed at: within `aimDeg` of the muzzle's line, inside its range, the nearest. */
  private aimedAt(inp: GunInput): GunTarget | null {
    const c = CONFIG.lineGun;
    const d = inp.dir;
    const n = Math.hypot(d.x, d.y, d.z) || 1;
    const cosMax = Math.cos((c.aimDeg * Math.PI) / 180);
    let best: GunTarget | null = null;
    let bestDist = Infinity;
    for (const t of inp.targets) {
      const ox = t.pos.x - inp.tip.x;
      const oy = t.pos.y - inp.tip.y;
      const oz = t.pos.z - inp.tip.z;
      const dist = Math.hypot(ox, oy, oz);
      if (dist > c.range || dist < 1e-3) continue;
      const cos = (ox * d.x + oy * d.y + oz * d.z) / (dist * n);
      if (cos >= cosMax && dist < bestDist) {
        best = t;
        bestDist = dist;
      }
    }
    return best;
  }

  private attach(t: GunTarget): GunEvent {
    this.target = t;
    this.phase = 'hauling';
    this.timer = CONFIG.lineGun.haulS;
    this.haul = 0;
    return 'attached';
  }

  private reset(): void {
    this.phase = 'ready';
    this.target = null;
    this.haul = 0;
    this.timer = 0;
  }
}
