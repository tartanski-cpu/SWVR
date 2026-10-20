/**
 * Rescue definitions: what can happen on a cargo run. Add or tweak entries here; the
 * tunables shared by all rescues (chance, distances, timings) are in CONFIG.rescue.
 *
 * Radio text placeholders, filled in when the call goes out:
 *   {bearing}  bearing of the incident from the boat (°T, three digits)
 *   {range}    range in nautical miles
 * In the "plot it yourself" mode (CONFIG.rescue.plotYourself) "bearing {bearing}, {range}
 * miles from you" is replaced by the last known position as latitude and longitude.
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
  /**
   * Something they're in or by (drawn, drifting; rescue.ts Incident.prop): an upturned
   * dinghy they're in the water around; a liferaft they sit in (climb aboard from it); a
   * boat sinking under them (climb aboard from it, or they're in the water once she's gone).
   */
  prop?: 'dinghy' | 'liferaft' | 'sinking';
  /** How far apart the people are (m; unset: CONFIG.rescue.crateSpacing). */
  spread?: [number, number];
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
    // The Sounds (regions): off the skerries; only from a region's job list (weight 0 here).
    id: 'kayaker',
    weight: 0,
    target: 'person',
    count: [1, 1],
    searchRadius: 200,
    call: 'MAYDAY RELAY. A sea kayaker is overdue and was last seen capsized off the skerries, bearing {bearing}, {range} miles from you. One person in the water in a drysuit. Any vessel able to assist, respond.',
    done: 'Well done, skipper, that was a cold one. Please land the kayaker at {harbour}.',
    landed: 'Coastguard: the kayaker is ashore at {harbour}, cold but fine, and asking after the kayak. Thank you, skipper.',
  },
  {
    // A capsized sailing dinghy, her crew in the water round her.
    id: 'dinghy',
    weight: 0.8,
    target: 'person',
    count: [2, 3],
    prop: 'dinghy',
    spread: [3, 9],
    searchRadius: 150,
    call: 'MAYDAY RELAY. A sailing dinghy has capsized with {count} people in the water, bearing {bearing}, {range} miles from you. They are in lifejackets, holding on to the hull. Any vessel able to assist, respond.',
    done: 'Good work, skipper: all {count} of them. Please land them at {harbour}; leave the dinghy, the club will fetch her.',
    landed: 'Coastguard: the dinghy sailors are ashore at {harbour}, cold and grateful. Thank you, skipper.',
  },
  {
    // A liferaft from a boat that went down: come alongside and take them off.
    id: 'liferaft',
    weight: 0.6,
    target: 'person',
    count: [3, 4],
    prop: 'liferaft',
    searchRadius: 220,
    call: 'MAYDAY RELAY. A fishing boat has sunk; her crew of {count} are in a liferaft, bearing {bearing}, {range} miles from you. Any vessel able to assist, respond and take them off.',
    done: 'All {count} off the raft, skipper. Well done. Please land them at {harbour}.',
    landed: 'Coastguard: the crew from the raft are ashore at {harbour}, all well. Thank you, skipper.',
  },
  {
    // A motor boat taking water: get there before she goes down.
    id: 'sinking',
    weight: 0.8,
    target: 'person',
    count: [2, 2],
    prop: 'sinking',
    searchRadius: 150,
    call: 'MAYDAY. MAYDAY. Motor boat taking water fast, {count} persons aboard, bearing {bearing}, {range} miles from you. She will not stay afloat long. Any vessel able to assist, respond at once.',
    done: 'Both off her, skipper, that was close. Please land them at {harbour}.',
    landed: 'Coastguard: the two from the motor boat are ashore at {harbour}. She is gone, but they are not. Thank you, skipper.',
  },
  {
    // A dive party separated from their boat, spread out by the tide.
    id: 'divers',
    weight: 0.5,
    target: 'person',
    count: [3, 3],
    spread: [25, 60],
    searchRadius: 250,
    call: 'MAYDAY RELAY. A dive boat has lost contact with {count} divers on the surface, carried off by the tide, bearing {bearing}, {range} miles from you. They have surface marker buoys. Any vessel able to assist, respond.',
    done: 'All {count} divers aboard, skipper. Please land them at {harbour}.',
    landed: 'Coastguard: the divers are ashore at {harbour} and their boat has been told. Thank you, skipper.',
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
