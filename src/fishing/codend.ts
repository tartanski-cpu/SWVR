/**
 * Where the trawl's moving parts are as the net comes aboard (owner, Oct 2026: "a more advanced
 * animation when you pull the net in ... pull the fish in the net instead of auto-loading the
 * crates"). Pure geometry in the boat's axes, shared by the simulation (the codend's weight on
 * her, where the catch is emptied) and the drawing (modules/aFrame, fishing/trawlView.ts).
 *
 *   luff     the A-frame swings on its feet, driven by its hydraulic rams: raked aft over the
 *            stern while trawling (0), forward over the deck to bring the codend inboard (1),
 *            through `luffDeg` (CONFIG.vessels.workboat.fishing.aFrame).
 *   codend   the bag at the end of the net, where the fish are. With the warps wound in
 *            (fishing.ts `t` 0) the net comes up the stern (`lift` 0 to 1): the codend from
 *            astern and deep (`astern`, `depth`) up to the surface just astern of the gallows
 *            (`surfaceAft`, by lift `surfaceAt`), up to hang `hang` under the A-frame's middle
 *            block (by `hangAt`), then in over the deck as the A-frame swings (from `hangAt`
 *            to 1). CONFIG.fishing.codend.
 */
import { CONFIG } from '../config';
import type { GearFacts } from '../modular/module';

type V3 = [number, number, number];
type Gantry = GearFacts['trawlGantry'];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How far the A-frame has swung inboard (0 out over the stern, 1 in over the deck) at this much of the lift. */
export function luffOf(lift: number): number {
  return smooth(CONFIG.fishing.codend.hangAt, 1, lift);
}

/** The A-frame's swing (rad): how far forward of its rake aft over the stern it's turned. */
export function luffAngle(luff: number): number {
  return (luff * CONFIG.vessels.workboat.fishing.aFrame.luffDeg * Math.PI) / 180;
}

/** A point on the A-frame (her axes, as drawn raked aft) where it is when swung `luff`: turned about its feet. */
export function luffPoint(af: Gantry, luff: number, p: readonly number[]): V3 {
  const a = luffAngle(luff);
  const dy = p[1] - af.deck;
  const dz = p[2] - af.footZ;
  return [p[0], af.deck + dz * Math.sin(a) + dy * Math.cos(a), af.footZ + dz * Math.cos(a) - dy * Math.sin(a)];
}

/** The middle of the crossbeam, where the codend's lifting block hangs (as drawn, raked aft). */
export function liftBlock(af: Gantry): V3 {
  return [0, af.top - 0.25, af.headZ];
}

const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Where the codend is (its middle, her axes) at this much of the lift (the warps in). */
export function codendAt(af: Gantry, lift: number): V3 {
  const c = CONFIG.fishing.codend;
  const deep: V3 = [0, -c.depth, af.headZ + c.astern];
  const surface: V3 = [0, 0.15, af.headZ + c.surfaceAft];
  const hanging = (luff: number): V3 => {
    const b = luffPoint(af, luff, liftBlock(af));
    return [b[0], b[1] - c.hang, b[2]];
  };
  if (lift <= c.surfaceAt) return lerp3(deep, surface, smooth(0, c.surfaceAt, lift));
  if (lift <= c.hangAt) return lerp3(surface, hanging(0), smooth(c.surfaceAt, c.hangAt, lift));
  return hanging(luffOf(lift));
}

/** How much of the codend's weight hangs on her (0 while it's in the water, 1 clear of it). */
export function codendOutOfWater(lift: number): number {
  const c = CONFIG.fishing.codend;
  return smooth(c.surfaceAt, (c.surfaceAt + c.hangAt) / 2, lift);
}
