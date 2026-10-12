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
  board: { codes: ['KeyB'], description: 'Board the boat / back to the platform' },
  seaTrials: { codes: ['KeyT'], description: 'Hydrostatics + sea trials report' },
  seaState: { codes: ['KeyL'], description: 'Sea: flat calm / moderate' },
  up: { codes: ['Space'], description: 'Up (free-fly)' },
  down: { codes: ['KeyC'], description: 'Down (free-fly)' },
  fast: { codes: ['ShiftLeft', 'ShiftRight'], description: 'Move faster (hold)' },
  timeEarlier: { codes: ['KeyN'], description: 'Time of day -30 min' },
  timeLater: { codes: ['KeyM'], description: 'Time of day +30 min' },
  dropVessel: { codes: ['KeyR'], description: 'Drop the boat from 4 m (test)' },
  heelVessel: { codes: ['KeyK'], description: 'Heel the boat 20° and release (test)' },
  toggleHydro: { codes: ['KeyV'], description: 'Buoyancy debug view on/off' },
  toggleOverlay: { codes: ['F3', 'KeyI'], description: 'Debug overlay on/off' },
  toggleProbes: { codes: ['KeyP'], description: 'Wave surface probes on/off' },
  toggleHelp: { codes: ['F1', 'KeyH'], description: 'This help on/off' },
} satisfies Record<string, KeyBinding>;

export type KeyAction = keyof typeof KEYS;
