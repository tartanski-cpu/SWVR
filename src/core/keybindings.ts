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
  leverAhead: { codes: ['ArrowUp'], description: 'Throttle lever ahead (at the helm, W too)' },
  leverAstern: { codes: ['ArrowDown'], description: 'Throttle lever astern (at the helm, S too)' },
  helmPort: { codes: ['ArrowLeft'], description: 'Wheel to port' },
  helmStarboard: { codes: ['ArrowRight'], description: 'Wheel to starboard' },
  leverNeutral: { codes: ['KeyX'], description: 'Lever to neutral' },
  // Twin engines worked separately, holding the wheel with the mouse (owner, Oct 2026): a lever
  // each (W / S still work both). Then E, F and R aren't their own keys (engine, helm, drop).
  portAhead: { codes: ['KeyE'], description: 'Twin engines, holding the wheel: port lever ahead' },
  portAstern: { codes: ['KeyD'], description: 'Twin engines, holding the wheel: port lever astern' },
  stbdAhead: { codes: ['KeyR'], description: 'Twin engines, holding the wheel: starboard lever ahead' },
  stbdAstern: { codes: ['KeyF'], description: 'Twin engines, holding the wheel: starboard lever astern' },
  helmMidships: { codes: ['KeyG'], description: 'Wheel amidships' },
  engine: { codes: ['KeyE'], description: 'Engine start / stop (lever in neutral)' },
  board: { codes: ['KeyB'], description: 'Board the boat / go ashore to the quay' },
  lash: { codes: ['KeyQ'], description: 'Lash / release the cargo under the reticle' },
  jump: { codes: ['Space'], description: 'Jump (ashore, aboard, into the sea); climb out when swimming' },
  seaTrials: { codes: ['KeyT'], description: 'Hydrostatics + sea trials report' },
  seaState: { codes: ['KeyL'], description: 'Weather: next preset (clear / overcast / fog / rain / squall)' },
  flyMode: { codes: ['KeyJ'], description: 'Walk / free-fly camera (debug)' },
  helm: { codes: ['KeyF'], description: 'Take the helm / leave it, by the wheel (then W / S the throttle, steer with the wheel; or the arrow keys, or a game controller)' },
  up: { codes: ['Space'], description: 'Up (free-fly)' },
  down: { codes: ['KeyC'], description: 'Down (free-fly)' },
  crouch: { codes: ['KeyC'], description: 'Crouch / stand up (walking)' },
  fast: { codes: ['ShiftLeft', 'ShiftRight'], description: 'Run / move faster (hold)' },
  timeEarlier: { codes: ['F6'], description: 'Time of day -30 min (test)' },
  timeLater: { codes: ['F7'], description: 'Time of day +30 min (test)' },
  planChart: { codes: ['KeyM'], description: 'The planning chart, full screen: wheel to zoom, drag to move it, click to plan a route (M again or Esc closes it)' },
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
  timber: { codes: ['Enter'], description: 'Voyage, when offered: sell the logs at the timber merchant' },
  wave: { codes: ['KeyY'], description: 'Wave (hold): your arm up over your head, for the crew to see (in the water too)' },
} satisfies Record<string, KeyBinding>;

export type KeyAction = keyof typeof KEYS;
