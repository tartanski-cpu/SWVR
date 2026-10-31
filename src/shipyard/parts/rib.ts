/**
 * The RIB's own parts (owner, 31 Oct 2026: "take the existing rib ... and turn it into a
 * parametric boat"; DESIGN_HULLS 'RIB', `open`): her tubes and her console, sized for her.
 *
 *   tubes    the crane RIB's (CONFIG.modules.tubes.rib) grown with her: their radius and
 *            inset with her depth factor (a 12 m RIB's tubes are about 0.7 m across), how
 *            far they run past her transom with her length; her colour (TUBE_PAINTS).
 *   console  her console and leaning post (modules/ribConsole; design.ribConsole: the
 *            jockey console, a T-top or a wide console, CONFIG.shipyard.rib.consoles), laid
 *            out from her helm's box (house.ts: `front` its forward end): the console's body
 *            from it, `postGap` aft of that the leaning post; the T-top's frame or the wide
 *            console's hardtop over both.
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

/** One of her consoles (CONFIG.shipyard.rib.consoles), its half width as built (`halfWidth`: the wide one's, from her beam). */
export type RibConsoleSpec = (typeof CONFIG.shipyard.rib.consoles)[number];

/**
 * Her console's kind (design.ribConsole): the one chosen if she's long enough for it (its
 * `minLength`), else the biggest she is (said in `warnings`).
 */
export function ribConsoleKind(d: Pick<ShipDesign, 'ribConsole'>, lengthM: number, warnings?: string[]): number {
  const all = CONFIG.shipyard.rib.consoles;
  const want = Math.max(0, Math.min(all.length - 1, d.ribConsole ?? 0));
  let k = want;
  while (k > 0 && lengthM < all[k].minLength - 1e-6) k--;
  const named = (i: number) => (i === 1 ? 'T-top' : all[i].name.toLowerCase());
  if (k < want) warnings?.push(`A ${named(want)} console needs her ${all[want].minLength} m long or more: ${k ? `a ${named(k)} console` : 'the jockey console'} on her at ${lengthM.toFixed(1)} m.`);
  return k;
}

/** Whether she has a console with a dash of instruments (the T-top's and the wide one's: a wheelhouse helm's). */
export const ribInstruments = (kind: number) => kind > 0;

/** Her console and leaning post (boat axes), from her helm's box: its forward end `front`, the deck there `deckY`; `kind` (ribConsoleKind) and its half width as built. */
export function ribConsole(front: number, deckAt: (z: number) => number, colour?: number, kind = 0, halfWidth?: number): RibConsoleConfig & { colour?: number } {
  const c = CONFIG.shipyard.rib.consoles[kind];
  const base = CONFIG.vessels.rib.console;
  const hw = halfWidth ?? c.halfWidth;
  const aft = front + c.depth;
  const postFront = aft + c.postGap;
  const postAft = postFront + c.postDepth;
  // (The crane RIB's leaning post stands 0.92 m over her deck: hers the same.)
  const postTop = base.post.top - CONFIG.vessels.rib.hull.deckYAft;
  // The T-top's canopy or the wide console's hardtop: over the console and the leaning post,
  // on four legs (at the console's forward corners and the post's aft ones).
  const roof = c.roof
    ? {
        front: r2(front - c.roof.fwd),
        aft: r2(postAft + c.roof.aft),
        top: r2(deckAt((front + postAft) / 2) + c.roof.height),
        halfWidth: r2(c.roof.halfWidth ?? hw + (c.roof.overhang ?? 0)),
        thick: c.roof.thick,
      }
    : undefined;
  return {
    halfWidth: r2(hw),
    front: r2(front),
    aft: r2(aft),
    top: r2(deckAt((front + aft) / 2) + c.top),
    screen: { ...base.screen, height: c.screen },
    post: { halfWidth: r2(Math.min(c.postHalfWidth, hw + 0.1)), front: r2(postFront), aft: r2(postAft), top: r2(deckAt((postFront + postAft) / 2) + postTop) },
    ...(roof ? { roof } : {}),
    ...(colour !== undefined ? { colour } : {}),
  };
}
