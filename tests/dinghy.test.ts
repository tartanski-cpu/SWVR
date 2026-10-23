/**
 * The skiff as a rubber dinghy (owner, Oct 2026: "make the boat slightly smaller so it fits
 * more easily on the smaller work boats ... turn it into a rubber dinghy"): 10 % smaller,
 * her crane and cradle with her, her tubes drawn with her fixed parts.
 */
import { describe, expect, it } from 'vitest';
import { FLEET } from '../src/boats/fleet';
import { LIBRARY } from '../src/boats/library';
import { CONFIG } from '../src/config';
import { hullQueries } from '../src/modular/hull';
import { buildDesign } from '../src/shipyard/build';
import { VESSEL_DEFS } from '../src/vessel/vesselDef';
import { tubePath } from '../src/modules/tubes';

const fleet = (id: string) => FLEET.find((f) => f.id === id)!.design;
const noRoom = (b: ReturnType<typeof buildDesign>) => b.warnings.some((w) => /skiff's cradle/.test(w));

describe('the dinghy', () => {
  it('is 10 % smaller than the 3.6 m skiff, her crane and cradle with her', () => {
    const sk = CONFIG.vessels.skiff;
    expect(sk.hull.length).toBeCloseTo(3.6 * 0.9, 1);
    expect(sk.hull.beamDeck).toBeCloseTo(1.6 * 0.9, 1);
    const tc = CONFIG.vessels.workboat.tenderCrane;
    expect(tc.cradle.z1 - tc.cradle.z0).toBeCloseTo(3.8 * 0.9, 2);
    expect(tc.cradle.halfWidth).toBeCloseTo(0.9 * 0.9, 2);
  });

  it('fits where the skiff didn\'t: the fishing boat\'s foredeck, the small tug\'s aft deck', () => {
    expect(noRoom(buildDesign({ ...fleet('fishingBoat'), skiff: 1 }))).toBe(false);
    expect(noRoom(buildDesign({ ...fleet('fishingBoat'), skiff: 2 }))).toBe(false);
    expect(noRoom(buildDesign({ ...fleet('smallTug'), skiff: 3 }))).toBe(false);
    expect(noRoom(buildDesign({ ...fleet('smallTug'), skiff: 4 }))).toBe(false);
  });

  it('her tubes: along her deck edges from past her transom, joined over her bow; drawn with her fixed parts (no draw call of their own)', () => {
    const def = VESSEL_DEFS.skiff;
    const hull = hullQueries(def);
    const c = CONFIG.modules.tubes.dinghy;
    const path = tubePath(hull, c);
    expect(path[0].z).toBeCloseTo(hull.transom + c.aft, 6);
    expect(path[path.length - 1].x).toBeCloseTo(-path[0].x, 6);
    const nose = path[(path.length - 1) / 2];
    expect(nose.x).toBe(0);
    expect(nose.z).toBeLessThan(hull.stem + 0.1);
    // The tubes' top is her gunwale (her layout's bulwark).
    expect(def.layout.bulwarkHeight).toBe(c.radius);
    const tubes = LIBRARY.modules.get('hull.tubes')!;
    const built = tubes.view!.build({ config: c, hull } as never);
    expect(built.staticParts.length).toBeGreaterThan(0);
    expect(built.movingParts).toEqual([]);
  });
});
