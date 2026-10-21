/**
 * The fleet (owner, Oct 2026: "eat our own dog food"): the game's own boats, each designed in
 * the Shipyard and kept here as her design file (fleet/*.json, the Shipyard's own format:
 * open one in the Shipyard's Projects to see or change her). Each is a vessel type of her
 * own (her id below), built from her design by the Shipyard's builder (shipyard/build.ts)
 * when the game loads, as a design started from a link is.
 *
 * One of each hull type, kitted out for her work, and the beginner boat:
 *   lander       the fast landing craft: a 9 m planing vee with a square platform on top
 *                and a bow ramp, a 400 kW V8 (~30 kn), searchlight, strake and fenders;
 *   fishingBoat  the gillnetter, built to carry load: 280 kW (~10 kn), her open foredeck to
 *                work pots over, a rod rack, searchlight, strake and fenders;
 *   pilotBoat    the owner's own design "Pilot boat 11.2 m" (Oct 2026): the deep-V pilot boat
 *                (or a rescue or patrol boat) at 11.2 m in aluminium, a faceted hull with
 *                sheer, twin 400 kW V8s on pod drives with the helm
 *                joystick (~36 kn), searchlight and fire monitor on the roof, chart table,
 *                side door, stern roller, rod rack, two life rings; strake and fenders kept
 *                from before (owner: both, as standard; the file had none); her fore cabin
 *                and raised foredeck left out (the pilot boat hull has no raised foredeck,
 *                and the cabin below needs one, or a deckhouse forward: the Shipyard's own
 *                warning);
 *   smallTug     the small tug: the slow tug diesel in a Kort nozzle, tow winch and stern
 *                roller, fire monitor and searchlight, tyres along her sides;
 *   starterBoat  the beginner boat, a new career's (CONFIG.career.boat): the owner's own
 *                design "Gillnetter 7.8 m" (Oct 2026): the gillnetter at her smallest, the
 *                cheapest engine (150 kW straight six) on a stern drive, a stern roller to
 *                tow from, rails, basic controls; no fenders, no life ring, no skiff (owner:
 *                never; at an anchorage you swim the goods ashore). The yard adds the
 *                searchlight and fire monitor to her design (CONFIG.career.upgrades `design`;
 *                library.ts setStarterKit).
 * Each but the beginner boat has the helm assist panel (autopilot, dock, auto start).
 * (Their ids live on in saves and multiplayer: never rename.)
 */
import { readDoc } from '../shipyard/designDoc';
import type { ShipDesign } from '../shipyard/design';
import lander from './fleet/lander.json';
import fishingBoat from './fleet/fishingBoat.json';
import pilotBoat from './fleet/pilotBoat.json';
import smallTug from './fleet/smallTug.json';
import starterBoat from './fleet/starterBoat.json';

export interface FleetBoat {
  /** Her vessel type's id. */
  id: string;
  /** Her name, from her design file. */
  name: string;
  design: ShipDesign;
}

const FILES = { lander, fishingBoat, pilotBoat, smallTug, starterBoat };

export const FLEET: FleetBoat[] = Object.entries(FILES).map(([id, file]) => {
  const read = readDoc(file);
  if ('error' in read) throw new Error(`Fleet boat '${id}': ${read.error}`);
  if (read.warnings.length) throw new Error(`Fleet boat '${id}': ${read.warnings.join('; ')}`);
  return { id, name: read.name, design: read.design };
});

/** The fleet's vessel type ids. */
export const FLEET_IDS = ['lander', 'fishingBoat', 'pilotBoat', 'smallTug', 'starterBoat'] as const;
