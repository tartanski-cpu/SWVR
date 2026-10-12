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
  forward: { codes: ['KeyW', 'ArrowUp'], description: 'Forward' },
  back: { codes: ['KeyS', 'ArrowDown'], description: 'Back' },
  left: { codes: ['KeyA', 'ArrowLeft'], description: 'Left' },
  right: { codes: ['KeyD', 'ArrowRight'], description: 'Right' },
  up: { codes: ['Space'], description: 'Up (free-fly)' },
  down: { codes: ['KeyC'], description: 'Down (free-fly)' },
  fast: { codes: ['ShiftLeft', 'ShiftRight'], description: 'Move faster (hold)' },
  timeEarlier: { codes: ['KeyN'], description: 'Time of day -30 min' },
  timeLater: { codes: ['KeyM'], description: 'Time of day +30 min' },
  toggleOverlay: { codes: ['F3', 'KeyI'], description: 'Debug overlay on/off' },
  toggleProbes: { codes: ['KeyP'], description: 'Wave surface probes on/off' },
  toggleHelp: { codes: ['F1', 'KeyH'], description: 'This help on/off' },
} satisfies Record<string, KeyBinding>;

export type KeyAction = keyof typeof KEYS;
