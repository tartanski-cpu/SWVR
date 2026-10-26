/**
 * The dive itself (owner, Oct 2026, stage 4): with the sub in the sea off the dive A-frame, the
 * boat over a wreck site (src/dive/diveSites.ts) and nearly stopped, DIVE on the frame's stand
 * opens the submersible game at that wreck. The two games meet only in the address: the
 * submersible game reads plain fields (Submersible-World src/core/handoff.ts, its spec's
 * "Handoff in"):
 *
 *   ?site=<site id>&depth=<m>&sub=<sub id>&tier=<n>&crew=<n>&return=<url>&session=<id>
 *
 * `site` is the dive site's id (the submersible game builds its wreck, seabed and story from it
 * alone), `depth` the charted depth there, `return` where it sends the crew back when they're
 * recovered (this page as it is), `session` a handoff id issued here (voyage/metaverse.ts's
 * store), so a return can be checked once that game sends results (its milestone M9).
 * Plain functions, no page or scene; the app does the leaving (App.ts goDive).
 */
import { CONFIG } from '../../config';
import { siteLabel, sitesOn, siteWorld, type DiveSite } from '../../dive/diveSites';
import { foundNames } from '../../dive/diveReturn';
import type { VesselState } from '../../vessel/vesselState';
import { DIVE_FRAME, subAt } from './index';
import { diveFrameOf, diveFrameState } from './onBoat';

const KNOT = 1852 / 3600;

/** The site she's over (within its ring), or why she can't dive now, in a few words. */
export function diveReady(v: VesselState, map: string | null): { site: DiveSite } | { why: string } {
  const f = diveFrameOf(v);
  if (!f) return { why: 'She has no dive A-frame' };
  const s = diveFrameState(v) ?? DIVE_FRAME.sim!.init(f.config);
  if (subAt(f.config, s).on !== 'afloat') return { why: 'Put the sub in the sea first: WINCH UP, FRAME OUT, then WINCH DOWN until she floats' };
  const sites = sitesOn(map)
    .map((site) => {
      const at = siteWorld(site);
      return { site, d: at ? Math.hypot(at.x - v.position[0], at.z - v.position[2]) : Infinity };
    })
    .sort((a, b) => a.d - b.d);
  if (!sites.length || !Number.isFinite(sites[0].d)) return { why: 'There are no dive sites in these waters' };
  const near = sites[0];
  if (near.d > CONFIG.dive.radius) return { why: `Not over a wreck: the nearest, ${siteLabel(near.site, foundNames())}, is ${Math.round(near.d)} m off (the dashed rings on the chart)` };
  const kn = Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) / KNOT;
  const max = CONFIG.modules.diveFrame.dive.maxSpeedKn;
  if (kn > max) return { why: `Stop her over the wreck first (under ${max} kn; she's making ${kn.toFixed(1)})` };
  return { site: near.site };
}

/** The submersible game's address for a dive at `site`, coming back to `back`. */
export function diveUrl(site: DiveSite, back: string, session: string): string {
  const c = CONFIG.modules.diveFrame.dive;
  const url = new URL(c.url);
  url.searchParams.set('site', site.id);
  url.searchParams.set('depth', String(site.depthM));
  url.searchParams.set('sub', c.sub);
  url.searchParams.set('tier', String(c.tier));
  url.searchParams.set('crew', '1');
  url.searchParams.set('return', back);
  url.searchParams.set('session', session);
  return url.toString();
}
