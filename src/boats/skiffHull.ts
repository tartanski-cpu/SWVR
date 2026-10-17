/**
 * Hull 'hull.skiff-3.6': the workboat's ship's boat, a 3.6 m open skiff (modular boats M6a).
 * Her shape and handling come from CONFIG.vessels.skiff (as weighed: her motor and battery
 * included, as none of her modules declares a mass yet). One socket: the outboard bracket
 * on her transom. Her tiller, bow cleat and cargo floor are still the app's until 6c.
 */
import { CONFIG } from '../config';
import type { HullDefinition } from '../modular/hull';
import { hullDataFrom } from './hullData';

const sk = CONFIG.vessels.skiff;

export const SKIFF_HULL: HullDefinition = {
  id: 'hull.skiff-3.6',
  version: 1,
  name: 'Skiff, 3.6 m',
  helm: { stand: sk.boardingSpot, yawDeg: 0 },
  ...hullDataFrom(sk),
  sockets: [{ id: 'outboard', type: 'transom.mount', transform: { position: sk.outboard.position }, label: 'Transom: the outboard bracket' }],
};
