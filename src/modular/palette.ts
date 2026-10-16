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

/**
 * A colour from a recipe or config: a number (0x3aa04a) or a CSS-style string ('#3aa04a';
 * JSON has no hex numbers). Junk gives `fallback`.
 */
export function colourOf(c: unknown, fallback: number): number {
  if (typeof c === 'number' && Number.isFinite(c)) return c;
  if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) return parseInt(c.slice(1), 16);
  return fallback;
}
