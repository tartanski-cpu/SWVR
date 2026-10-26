/**
 * Offshore wind farms (WindFarmDef; owner, Oct 2026: crew transfer to wind farms): where each
 * turbine's boat landing is, and the solid blocks that stand in for the turbine in the
 * collision (archipelago.ts BLOCKS), so a boat stops against what she sees (world/view/
 * windFarmView.ts draws it from the same numbers, CONFIG.windFarm):
 *
 *   the foundation   a square block round the round transition piece (its corners reach just
 *                    past it), up to the platform;
 *   the landing      a block from the transition piece out to the landing tubes' outer face,
 *                    as wide as the tubes, up to their top: a crew boat's bow fender meets
 *                    its face (unfendered steel: the fender's own rubber grips it).
 *
 * Both marked `farm` (solid, but nowhere to tie up: world/berths.ts).
 */
import { CONFIG } from '../config';
import type { BlockDef, WindFarmDef } from './defs';
import { WIND_FARMS } from './archipelago';

/**
 * A construction project's wind farm (career/projects.ts sets it once its transition pieces
 * are on, on the host's tick and the crew's frames): listed after the map's own (allFarms), so
 * its index is WIND_FARMS.length. Its platforms are walked and its landings used for crew
 * transfer like any farm's; its drawing and collision are the project's own.
 */
let projectFarm: WindFarmDef | null = null;
let farmsWith: WindFarmDef[] | null = null;
export function setProjectFarm(f: WindFarmDef | null): void {
  projectFarm = f;
  farmsWith = null;
}

/** Every wind farm: the map's (WIND_FARMS), then a project's if it has one standing. */
export function allFarms(): readonly WindFarmDef[] {
  if (!projectFarm) return WIND_FARMS;
  return (farmsWith ??= [...WIND_FARMS, projectFarm]);
}

/** A turbine's landing direction: the unit vector (world x east, z south) its landing faces out along. */
export function landingAxis(landingDeg: number): { ax: number; az: number } {
  const a = (landingDeg * Math.PI) / 180;
  return { ax: Math.sin(a), az: -Math.cos(a) };
}

/**
 * Its boat landing's outer face: the middle of the face the tubes present (world x, z), how
 * far out from the turbine's centre that is (m), and its half width across.
 */
export function landingFace(t: WindFarmDef['turbines'][number]): { x: number; z: number; out: number; halfWidth: number } {
  const c = CONFIG.windFarm;
  const { ax, az } = landingAxis(t.landingDeg);
  const out = c.tp.radius + c.landing.out + c.landing.tube;
  return { x: t.x + ax * out, z: t.z + az * out, out, halfWidth: c.landing.halfSpacing + c.landing.tube };
}

/** The turbines of a farm in the collision: see above. */
export function windFarmBlocks(f: WindFarmDef): BlockDef[] {
  const c = CONFIG.windFarm;
  return f.turbines.flatMap((t): BlockDef[] => {
    const { ax, az } = landingAxis(t.landingDeg);
    const face = landingFace(t);
    const r = c.tp.radius;
    // From the transition piece's face out to the tubes' outer face.
    const half = (face.out - r * 0.9) / 2;
    const mid = r * 0.9 + half;
    return [
      { kind: 'barge', x: t.x, z: t.z, halfLength: r * 0.9, halfWidth: r * 0.9, yawDeg: t.landingDeg, top: c.platform.y, fendered: false, farm: true },
      { kind: 'barge', x: t.x + ax * mid, z: t.z + az * mid, halfLength: half, halfWidth: face.halfWidth, yawDeg: t.landingDeg, top: c.landing.top, fendered: false, farm: true },
    ];
  });
}

/**
 * A turbine's platform underfoot (crew transfer, stop 2: players step across onto it): its deck
 * height at (x, z) if that's on a platform, between the tower and the rail, else null. Walked
 * as land (world/landWalkArea.ts).
 */
export function platformFloor(x: number, z: number): number | null {
  return platformAt(x, z) ? CONFIG.windFarm.platform.y : null;
}

/** Is (x, z) inside a turbine's tower (and the transition piece under it): never ground to stand on. */
export function inTower(x: number, z: number): boolean {
  const r = CONFIG.windFarm.tower.base + 0.25;
  return allFarms().some((f) => f.turbines.some((t) => Math.hypot(x - t.x, z - t.z) <= r));
}

/** Which turbine's platform (x, z) is on ("farm:turbine"), or null. */
export function platformAt(x: number, z: number): string | null {
  const c = CONFIG.windFarm;
  const farms = allFarms();
  for (let f = 0; f < farms.length; f++)
    for (let i = 0; i < farms[f].turbines.length; i++) {
      const t = farms[f].turbines[i];
      const d = Math.hypot(x - t.x, z - t.z);
      if (d > c.tower.base + 0.25 && d < c.platform.radius - 0.3) return `${f}:${i}`;
    }
  return null;
}

/** Where you step onto a turbine's platform: at the ladder's head, facing the tower (world x, z, yaw as a player's, rad). */
export function platformSpot(farm: number, turbine: number): { x: number; z: number; yaw: number } | null {
  const t = allFarms()[farm]?.turbines[turbine];
  if (!t) return null;
  const c = CONFIG.windFarm;
  const { ax, az } = landingAxis(t.landingDeg);
  const r = (c.tower.base + c.platform.radius) / 2;
  return { x: t.x + ax * r, z: t.z + az * r, yaw: Math.atan2(ax, az) };
}
