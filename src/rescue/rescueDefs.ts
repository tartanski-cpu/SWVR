/**
 * Rescue definitions: what can happen on a cargo run. Add or tweak entries here; the
 * tunables shared by all rescues (chance, distances, timings) are in CONFIG.rescue.
 *
 * Radio text placeholders, filled in when the call goes out:
 *   {bearing}  bearing of the incident from the boat (°T, three digits)
 *   {range}    range in nautical miles
 *   {count}    number of targets
 */
export interface RescueDef {
  id: string;
  /** Relative likelihood when a rescue is rolled. */
  weight: number;
  /** What's in the water. */
  target: 'person' | 'crates';
  /** How many (inclusive range). */
  count: [number, number];
  /** Radius of the search area shown on the chart (m). */
  searchRadius: number;
  /** The distress call. */
  call: string;
  /** Closing message once everything is aboard ({harbour} = where to land them). */
  done: string;
  /** People only: once they're all ashore ({harbour} = where they were landed). */
  landed?: string;
}

export const RESCUE_DEFS: RescueDef[] = [
  {
    id: 'manOverboard',
    weight: 1,
    target: 'person',
    count: [1, 1],
    searchRadius: 120,
    call: 'MAYDAY RELAY. Man overboard from a yacht, one person in the water in a lifejacket, bearing {bearing}, {range} miles from you. Any vessel able to assist, respond.',
    done: 'Good work, skipper. Please land the survivor at {harbour}.',
    landed: 'Coastguard: the survivor is safely ashore at {harbour} and in good hands. Thank you, skipper. Fine seamanship.',
  },
  {
    id: 'lostCargo',
    weight: 1,
    target: 'crates',
    count: [2, 3],
    searchRadius: 150,
    call: 'PAN-PAN. A coaster has lost {count} crates of deck cargo overboard, bearing {bearing}, {range} miles from you. A hazard to navigation. Can you recover them?',
    done: 'Thanks, skipper. Land the crates at any harbour.',
  },
];
