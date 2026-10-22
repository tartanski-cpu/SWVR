/**
 * Hull 'hull.skiff-3.6': the ship's tender (modular boats M6a), since Oct 2026 a 3.25 m
 * rubber dinghy (owner: smaller, to fit the smaller boats; her id kept for saves and
 * recipes). Her shape and handling come from CONFIG.vessels.skiff (as weighed: her motor,
 * battery and tubes included, as none of her modules declares a mass yet). Sockets: the
 * outboard bracket on her transom, her bow and stern cleats (CONFIG.vessels.skiff.cleats),
 * and her sides, where her tubes go (modules/tubes).
 */
import { CONFIG } from '../config';
import type { HullDefinition } from '../modular/hull';
import { hullDataFrom } from './hullData';

const sk = CONFIG.vessels.skiff;

export const SKIFF_HULL: HullDefinition = {
  id: 'hull.skiff-3.6',
  version: 1,
  name: 'Dinghy, 3.25 m',
  helm: { stand: sk.boardingSpot, yawDeg: 0 },
  ...hullDataFrom(sk),
  fittings: { livery: sk.livery },
  sockets: [
    { id: 'outboard', type: 'transom.mount', transform: { position: sk.outboard.position }, label: 'Transom: the outboard bracket' },
    { id: 'bowCleat', type: 'deck.fitting', transform: { position: sk.cleats.bow }, label: 'Stem head: the bow cleat' },
    { id: 'sternCleat', type: 'deck.fitting', transform: { position: sk.cleats.stern }, label: 'Port quarter: the stern cleat' },
    { id: 'tubes', type: 'hull.side', transform: { position: [0, 0, 0] }, label: 'Her sides: the tubes' },
  ],
};
