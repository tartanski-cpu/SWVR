/**
 * All desktop key bindings in one place.
 *
 * Bindings use `KeyboardEvent.code`, i.e. the *physical* key position, so movement stays
 * on the WASD cluster on any layout (QWERTZ, AZERTY, ...). The on-screen help asks the
 * browser what each physical key is labelled on the user's keyboard (see helpPanel.ts).
 *
 * Debug keys are deliberately letters/F-keys that sit in the same place on QWERTY and
 * QWERTZ - punctuation keys ([ ] ` ...) move around between layouts and need AltGr on
 * German keyboards.
 */
export interface KeyBinding {
  /** Physical keys that trigger the action (any of them). */
  codes: string[];
  /** Shown in the help panel. */
  description: string;
}

export const KEYS = {
  forward: { codes: ['KeyW'], description: 'Forward' },
  back: { codes: ['KeyS'], description: 'Back' },
  left: { codes: ['KeyA'], description: 'Left' },
  right: { codes: ['KeyD'], description: 'Right' },
  leverAhead: { codes: ['ArrowUp'], description: 'Throttle lever ahead' },
  leverAstern: { codes: ['ArrowDown'], description: 'Throttle lever astern' },
  helmPort: { codes: ['ArrowLeft'], description: 'Wheel to port' },
  helmStarboard: { codes: ['ArrowRight'], description: 'Wheel to starboard' },
  leverNeutral: { codes: ['KeyX'], description: 'Lever to neutral' },
  helmMidships: { codes: ['KeyG'], description: 'Wheel amidships' },
  engine: { codes: ['KeyE'], description: 'Engine start / stop (lever in neutral)' },
  board: { codes: ['KeyB'], description: 'Board the boat / go ashore to the quay' },
  lash: { codes: ['KeyQ'], description: 'Lash / release the cargo under the reticle' },
  jump: { codes: ['Space'], description: 'Jump (ashore, aboard, into the sea); climb out when swimming' },
  seaTrials: { codes: ['KeyT'], description: 'Hydrostatics + sea trials report' },
  seaState: { codes: ['KeyL'], description: 'Weather: next preset (clear / overcast / fog / rain / squall)' },
  flyMode: { codes: ['KeyJ'], description: 'Walk / free-fly camera (debug)' },
  helm: { codes: ['KeyF'], description: 'Take the helm / leave it, by the wheel (then drive with the arrow keys or a game controller)' },
  up: { codes: ['Space'], description: 'Up (free-fly)' },
  down: { codes: ['KeyC'], description: 'Down (free-fly)' },
  crouch: { codes: ['KeyC'], description: 'Crouch / stand up (walking)' },
  fast: { codes: ['ShiftLeft', 'ShiftRight'], description: 'Run / move faster (hold)' },
  timeEarlier: { codes: ['KeyN'], description: 'Time of day -30 min' },
  timeLater: { codes: ['KeyM'], description: 'Time of day +30 min' },
  dropVessel: { codes: ['KeyR'], description: 'Drop the boat from 4 m (test)' },
  heelVessel: { codes: ['KeyK'], description: 'Heel the boat 20° and release (test)' },
  couplingDown: { codes: ['Digit9'], description: 'Motion coupling -10 % (comfort)' },
  couplingUp: { codes: ['Digit0'], description: 'Motion coupling +10 % (100 = rigid)' },
  toggleHydro: { codes: ['F4'], description: 'Buoyancy debug view on/off' },
  talk: { codes: ['KeyV'], description: 'Talk on your handheld VHF (hold): the crew hear you on their radios, a few km off' },
  toggleOverlay: { codes: ['F3', 'KeyI'], description: 'Debug overlay on/off' },
  toggleProbes: { codes: ['KeyP'], description: 'Wave surface probes on/off' },
  toggleHelp: { codes: ['F1', 'KeyH'], description: 'This help on/off' },
  binoculars: { codes: ['KeyZ'], description: 'Binoculars: look through them (hold; or the right mouse button)' },
  hangGear: { codes: ['KeyU'], description: 'Hang the extinguisher or torch back on its bracket' },
  menu: { codes: ['KeyO'], description: 'Menu (voyage, boat, cargo, office, crew, settings)' },
  timber: { codes: ['Enter'], description: 'Voyage, when offered: go ashore to the timber camp, or sell the logs at the merchant' },
  wave: { codes: ['KeyY'], description: 'Wave (hold): your arm up over your head, for the crew to see (in the water too)' },
} satisfies Record<string, KeyBinding>;

export type KeyAction = keyof typeof KEYS;
