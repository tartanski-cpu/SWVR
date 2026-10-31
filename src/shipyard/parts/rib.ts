/**
 * The RIB's own parts (owner, 31 Oct 2026: "take the existing rib ... and turn it into a
 * parametric boat"; DESIGN_HULLS 'RIB', `open`): her tubes and her console, sized for her.
 *
 *   tubes    the crane RIB's (CONFIG.modules.tubes.rib) grown with her: their radius and
 *            inset with her depth factor (a 12 m RIB's tubes are about 0.7 m across), how
 *            far they run past her transom with her length; her colour (TUBE_PAINTS).
 *   console  the jockey console and leaning post (modules/ribConsole), laid out from her
 *            helm's box (house.ts: `front` its forward end): the console's body from it,
 *            `postGap` aft of that the leaning post (CONFIG.shipyard.rib.console).
 */
import { CONFIG } from '../../config';
import type { TubesConfig } from '../../modules/tubes';
import type { RibConsoleConfig } from '../../modules/ribConsole';
import type { ShipDesign } from '../design';
import { TUBE_PAINTS } from './catalog';

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Her tubes, for her size (hull.ts `size`: her length and depth factors). */
export function ribTubes(size: { L: number; D: number }, d: Pick<ShipDesign, 'tubeColour'>): TubesConfig {
  const t = CONFIG.modules.tubes.rib;
  return { ...t, radius: r2(t.radius * size.D), inset: r2(t.inset * size.D), aft: r2(t.aft * Math.sqrt(size.L)), colour: TUBE_PAINTS[d.tubeColour ?? 0] ?? t.colour };
}

/** Her console and leaning post (boat axes), from her helm's box: its forward end `front`, the deck there `deckY`. */
export function ribConsole(front: number, deckAt: (z: number) => number, colour?: number): RibConsoleConfig & { colour?: number } {
  const c = CONFIG.shipyard.rib.console;
  const base = CONFIG.vessels.rib.console;
  const aft = front + c.depth;
  const postFront = aft + c.postGap;
  const postAft = postFront + c.postDepth;
  // (The crane RIB's leaning post stands 0.92 m over her deck: hers the same.)
  const postTop = base.post.top - CONFIG.vessels.rib.hull.deckYAft;
  return {
    halfWidth: c.halfWidth,
    front: r2(front),
    aft: r2(aft),
    top: r2(deckAt((front + aft) / 2) + c.top),
    screen: base.screen,
    post: { halfWidth: base.post.halfWidth, front: r2(postFront), aft: r2(postAft), top: r2(deckAt((postFront + postAft) / 2) + postTop) },
    ...(colour !== undefined ? { colour } : {}),
  };
}
