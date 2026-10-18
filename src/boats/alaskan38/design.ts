/**
 * The Alaskan 38 (owner, Oct 2026): a one-off boat built from a video of a custom aluminium
 * expedition / sport-fishing boat of the Alaskan kind, designed afresh for the game in that
 * spirit (not a copy: no name, logo or livery of hers). About 38 ft on deck with twin
 * outboards on a bracket; a raised pilothouse forward over the fore cabin, a saloon with the
 * galley and dinette, and a long open cockpit under a roof extension that carries the tender.
 *
 * Her lines, in the hull study's form (src/hulls/loft.ts; `loft()` turns them into the
 * game's stations). Read off the pictures:
 *   - hard chine, a deep vee forward (about 40 deg of deadrise near the stem) easing to a
 *     moderate vee at the transom (about 18 deg), which is what the hard turn at the chine
 *     and the planing attitude in the running shots say;
 *   - a fine entry and a stem raked about 25 deg, nearly plumb at the forefoot;
 *   - a strong sheer: low freeboard aft for fishing over the side, sweeping up to a high
 *     flared bow;
 *   - two spray rails along the topsides, carried right round the stem (drawn as one-off
 *     geometry, boats/alaskan38/view.ts; the stations stay the game's five points);
 *   - low bulwarks aft, a bow rail forward.
 * 11.6 x 3.8 m; the design waterline is y = 0; draught at the keel about 0.62 m.
 */
import type { HullDesign } from '../../hulls/loft';

export const ALASKAN_38_DESIGN: HullDesign = {
  id: 'alaskan38',
  name: 'Alaskan 38 expedition boat',
  blurb: 'Aluminium hard-chine deep-vee expedition / sport-fishing boat: fine raked stem, strong sheer to a high flared bow, low freeboard aft, twin outboards on a bracket. 11.6 x 3.8 m, draught 0.62 m.',
  length: 11.6,
  halfBeam: [
    [0, 1.72],
    [0.3, 1.9],
    [0.55, 1.9],
    [0.8, 1.55],
    [0.95, 0.68],
    [1, 0],
  ],
  // Low aft (about 0.95 m above the water), rising to a high bow (about 2 m).
  sheer: [
    [0, 0.95],
    [0.45, 1.08],
    [0.75, 1.35],
    [1, 1.98],
  ],
  // The keel: deepest a little aft of amidships, running up through a forefoot to a stem
  // that leaves the water about a metre up.
  keel: [
    [0, -0.5],
    [0.4, -0.62],
    [0.7, -0.5],
    [0.9, -0.15],
    [1, 0.95],
  ],
  rake: [
    [0, 0.08],
    [0.6, 0],
    [1, -0.45],
  ],
  section: {
    // The chine well out at the deck's breadth aft, drawing in forward.
    chineBeam: [
      [0, 0.9],
      [0.5, 0.86],
      [0.85, 0.7],
      [1, 0.5],
    ],
    // Its height above the keel as a share of keel-to-deck depth: the deadrise, 18 deg aft
    // rising to a deep vee forward.
    chineHeight: [
      [0, 0.3],
      [0.5, 0.34],
      [0.85, 0.5],
      [1, 0.66],
    ],
    // Topsides near upright aft, flaring out at the bow.
    flare: [
      [0, 0.02],
      [0.6, 0.03],
      [1, 0.35],
    ],
  },
  // A low bulwark round the cockpit, lower along the house (a bow rail stands forward).
  bulwark: [
    [0, 0.45],
    [0.4, 0.45],
    [0.55, 0.25],
    [1, 0.25],
  ],
  // Dark grey topsides and bottom, light grey deck and house, a tan roof (the eyebrow).
  colours: { topsides: 0x3a3f44, bulwark: 0x3a3f44, bottom: 0x1f2327, boot: 0x1f2327, deck: 0x8a9096, house: 0xc9cdcf, roof: 0xd2b06a, bulwarkIn: 0x8a9096 },
};
