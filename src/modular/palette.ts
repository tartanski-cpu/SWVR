/**
 * The shared paint colours (modular boats, Part C). Modules colour their fixed parts from
 * this list, so the parts can all be merged into a boat's few shared meshes (vertex
 * colours on one material): forty switch housings, one draw call.
 *
 * Starts with the bridge's dark fittings; grows as modules are converted (M3+).
 */
export const PALETTE = {
  /** Bases, housings and quadrants of bridge controls. */
  fittingDark: 0x2a2f33,
  /** Console and pedestal paint. */
  console: 0x3c4248,
  /** Ahead / go marks. */
  markGreen: 0x2f8f3a,
  /** Astern / stop marks. */
  markRed: 0xa8402a,
  /** Bright metal: handles, rods. */
  metal: 0xb8bcc0,
} as const;

export type PaletteColour = keyof typeof PALETTE;
