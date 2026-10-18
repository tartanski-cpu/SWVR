import { gearOf } from '../boats/sims';
import type { VesselState } from './vesselState';

/**
 * Her fuel tank's size (L): her design's (the diesel's fuel config), or the boatyard's bigger
 * tank when she has it (`engine.tankL`, set by the career: career.ts stepCareer). Everything
 * that reads the tank (the gauge, filling up, the hose, the low-fuel lamp) asks this.
 */
export function fuelTankL(v: Pick<VesselState, 'defId' | 'engine'>): number {
  return v.engine.tankL ?? gearOf(v, 'diesel')?.engine.fuel.tankL ?? 0;
}
