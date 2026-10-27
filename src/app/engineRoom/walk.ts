/**
 * Walking in the engine room (plan.ts): its floor plates, inside its sides and bulkheads, round
 * her engines (each a solid block from her bottom to its top). The boat's own walk area is put
 * back when you climb out (App).
 */
import type { WalkArea } from '../../vessel/layout';
import type { EngineRoomPlan } from './plan';
import type { Solid } from './tug/layout';

/** How close to a side, a bulkhead or an engine your body goes (m). */
const BODY = 0.25;

/** @param solids more blocks on the floor to walk round (the tug's machinery, tug/layout.ts) */
export function roomWalkArea(p: EngineRoomPlan, solids: Solid[] = []): WalkArea {
  const inSolid = (x: number, y: number, z: number, m: number) => solids.some((s) => x > s.x0 - m && x < s.x1 + m && z > s.z0 - m && z < s.z1 + m && y < s.y1);
  const inRoom = (x: number, z: number, m: number) => Math.abs(x) <= p.halfWidth - m && z >= p.z0 + m && z <= p.z1 - m;
  const inEngine = (x: number, y: number, z: number, m: number) =>
    p.engines.some((e) => Math.abs(x - e.x) < e.size[1] / 2 + m && z > e.flangeZ - e.size[0] - m && z < e.flangeZ + m && y < e.flangeY + e.size[2]);
  return {
    floorsAt: (x, z) => (inRoom(x, z, 0) ? [p.sole] : []),
    walkable: (x, z, y) => inRoom(x, z, BODY) && Math.abs(y - p.sole) < 0.5 && !inEngine(x, p.sole + 0.1, z, BODY) && !inSolid(x, p.sole + 0.1, z, BODY),
    ladderAt: () => null,
    insideSolid: (x, y, z) => inEngine(x, y, z, 0) || inSolid(x, y, z, 0),
    inBounds: (x, z) => inRoom(x, z, BODY),
  };
}
