/**
 * Hull study designs: five workboat types, each an original design that takes its
 * proportions and character from the type (no real boat's lines are copied). Numbers are
 * metres; see loft.ts for what each curve means. Draught is set by the keel curve: the
 * design waterline is y = 0.
 *
 * Proportions came from the type's usual range, read off builders' and trade-press figures:
 *   - Bristol Bay gillnetter: 32 ft limit, very beamy (B ~ 4.6-4.9 m), shallow (jets),
 *     wheelhouse right aft or raised so the net reel runs under it.
 *   - Norwegian sjark: ~11 x 4.4 m, wheelhouse forward, working deck aft, high flared bow.
 *   - Pacific north-west landing craft: flat-bottomed aluminium hull, bow ramp, house aft.
 *   - Compact harbour tug: L/B about 2.2-2.4, B/T about 2.7-2.9, raised forecastle.
 *   - Pilot / crew boat: deep-V hard chine with a spray chine, raked stem, fine entry.
 */
import type { HullDesign } from './loft';

export const DESIGNS: HullDesign[] = [
  {
    id: 'sjark',
    name: 'Nordic coastal netter (sjark type)',
    blurb: 'Norwegian-style small netter: round bilge, a high flared bow with a strong sheer, the wheelhouse forward over the accommodation and a working deck aft. 11.0 x 4.4 m, draught 1.5 m.',
    length: 11.0,
    halfBeam: [
      [0, 1.75],
      [0.25, 2.15],
      [0.5, 2.2],
      [0.75, 1.9],
      [0.92, 1.0],
      [1, 0],
    ],
    sheer: [
      [0, 1.05],
      [0.4, 1.1],
      [0.7, 1.45],
      [1, 2.15],
    ],
    keel: [
      [0, -0.9],
      [0.3, -1.5],
      [0.6, -1.45],
      [0.85, -0.9],
      [1, 0.3],
    ],
    rake: [
      [0, 0.25],
      [0.6, 0],
      [1, -0.5],
    ],
    section: {
      chineBeam: [
        [0, 0.75],
        [0.5, 0.78],
        [1, 0.35],
      ],
      chineHeight: [
        [0, 0.25],
        [0.5, 0.3],
        [1, 0.45],
      ],
      round: 3,
      flare: [
        [0, 0.05],
        [0.6, 0.08],
        [1, 0.5],
      ],
    },
    bulwark: [
      [0, 0.75],
      [0.55, 0.75],
      [0.7, 0.6],
      [1, 0.6],
    ],
    wheelhouse: { z0: 0.6, z1: -2.9, halfWidth: 1.55, height: 2.05, frontRake: 0.25, sill: 0.95, head: 1.75, panesFront: 4, panesSide: 3, panesBack: 2, overhang: 0.15 },
    colours: { topsides: 0xf0ede4, bulwark: 0xf0ede4, bottom: 0x7a2a22, boot: 0x1d3a5c, house: 0xf4f2ea },
  },
  {
    id: 'gillnetter',
    name: 'Bay gillnetter (bowpicker type)',
    blurb: 'Alaskan-style bowpicker: hard chine, very beamy and shallow for its length (jet drives), a flat open foredeck for the net reel, and the house right aft. 9.75 x 4.6 m, draught 0.6 m.',
    length: 9.75,
    halfBeam: [
      [0, 2.25],
      [0.3, 2.3],
      [0.6, 2.25],
      [0.85, 1.6],
      [1, 0],
    ],
    sheer: [
      [0, 1.1],
      [0.5, 1.15],
      [1, 1.55],
    ],
    keel: [
      [0, -0.55],
      [0.5, -0.6],
      [0.8, -0.35],
      [1, 0.45],
    ],
    rake: [
      [0, 0.12],
      [0.6, 0],
      [1, -0.9],
    ],
    section: {
      chineBeam: [
        [0, 0.9],
        [0.6, 0.9],
        [1, 0.55],
      ],
      chineHeight: [
        [0, 0.12],
        [0.5, 0.15],
        [1, 0.45],
      ],
      flare: [
        [0, 0.02],
        [0.7, 0.05],
        [1, 0.35],
      ],
    },
    bulwark: [
      [0, 0.0],
      [0.3, 0.0],
      [0.4, 0.55],
      [1, 0.55],
    ],
    wheelhouse: { z0: 4.6, z1: 2.0, halfWidth: 1.9, height: 2.0, frontRake: 0.2, sill: 1.0, head: 1.75, panesFront: 4, panesSide: 2, panesBack: 2, plinth: 0.9 },
    colours: { topsides: 0xbfc4c8, bulwark: 0xbfc4c8, bottom: 0x3a3f44, boot: 0x3a3f44, house: 0xdfe3e5, deck: 0x8a9096 },
  },
  {
    id: 'landingCraft',
    name: 'Coastal landing craft',
    blurb: 'Pacific north-west style aluminium landing craft: shallow flat-bottomed hull with a single hard chine, a square bow for the ramp, bulwarks round a clear cargo deck, house aft. 12.0 x 4.2 m, draught 0.7 m.',
    length: 12.0,
    halfBeam: [
      [0, 2.05],
      [0.5, 2.1],
      [0.88, 2.0],
      [0.97, 1.75],
      [1, 1.6],
    ],
    sheer: [
      [0, 1.15],
      [0.6, 1.15],
      [1, 1.35],
    ],
    keel: [
      [0, -0.7],
      [0.7, -0.7],
      [0.9, -0.3],
      [1, 0.75],
    ],
    rake: [
      [0, 0.0],
      [0.8, 0],
      [1, -0.55],
    ],
    section: {
      chineBeam: [
        [0, 0.95],
        [1, 0.95],
      ],
      chineHeight: [
        [0, 0.1],
        [0.8, 0.1],
        [1, 0.6],
      ],
      flare: [
        [0, 0.0],
        [1, 0.02],
      ],
    },
    bulwark: [
      [0, 0.0],
      [0.2, 0.0],
      [0.27, 0.9],
      [1, 0.9],
    ],
    wheelhouse: { z0: 5.9, z1: 3.6, halfWidth: 2.0, height: 2.1, frontRake: 0.15, sill: 1.0, head: 1.8, panesFront: 4, panesSide: 2, panesBack: 1, plinth: 0.0 },
    colours: { topsides: 0xa9b0b5, bulwark: 0xa9b0b5, bottom: 0x6e7479, boot: 0x6e7479, house: 0xdde0e2, deck: 0x7e858a },
  },
  {
    id: 'tug',
    name: 'Compact harbour tug',
    blurb: 'Small steel harbour tug: round bilge, deep and beamy (L/B 2.4, B/T 2.7), a raised forecastle with the house on it, low aft towing deck with bulwarks. 15.0 x 6.2 m, draught 2.3 m.',
    length: 15.0,
    halfBeam: [
      [0, 2.3],
      [0.3, 3.0],
      [0.55, 3.1],
      [0.8, 2.6],
      [0.95, 1.2],
      [1, 0],
    ],
    sheer: [
      [0, 1.3],
      [0.45, 1.35],
      [0.52, 1.4],
      [1, 1.9],
    ],
    forecastle: { from: 0.52, raise: 0.9 },
    keel: [
      [0, -1.6],
      [0.35, -2.3],
      [0.7, -2.2],
      [0.92, -1.2],
      [1, 0.6],
    ],
    rake: [
      [0, 0.3],
      [0.6, 0],
      [1, -0.35],
    ],
    section: {
      chineBeam: [
        [0, 0.7],
        [0.5, 0.82],
        [1, 0.3],
      ],
      chineHeight: [
        [0, 0.3],
        [0.5, 0.28],
        [1, 0.5],
      ],
      round: 3,
      flare: [
        [0, -0.02],
        [0.7, 0.02],
        [1, 0.4],
      ],
    },
    bulwark: [
      [0, 0.85],
      [0.5, 0.85],
      [0.53, 0.7],
      [1, 0.7],
    ],
    wheelhouse: { z0: 1.4, z1: -2.2, halfWidth: 1.9, height: 2.3, frontRake: 0.3, sill: 1.0, head: 1.95, panesFront: 5, panesSide: 3, panesBack: 3, overhang: 0.2 },
    colours: { topsides: 0x1f2a30, bulwark: 0x1f2a30, bottom: 0x8c2a22, boot: 0xe8e4d8, house: 0xf1ead6, deck: 0x5d6a5e, roof: 0x8d9790 },
  },
  {
    id: 'pilot',
    name: 'Pilot / crew boat',
    blurb: 'Fast hard-chine pilot boat: deep-V forward easing aft, a spray chine, a well-raked stem with a fine entry, the house amidships with reverse-raked front windows and a low aft cockpit. 14.0 x 4.5 m, draught 1.1 m.',
    length: 14.0,
    halfBeam: [
      [0, 1.9],
      [0.3, 2.2],
      [0.55, 2.25],
      [0.8, 1.7],
      [0.95, 0.7],
      [1, 0],
    ],
    sheer: [
      [0, 1.1],
      [0.5, 1.3],
      [1, 2.1],
    ],
    keel: [
      [0, -0.95],
      [0.4, -1.1],
      [0.75, -0.85],
      [0.92, -0.2],
      [1, 0.9],
    ],
    rake: [
      [0, 0.15],
      [0.6, 0],
      [1, -0.75],
    ],
    section: {
      chineBeam: [
        [0, 0.88],
        [0.5, 0.88],
        [1, 0.5],
      ],
      chineHeight: [
        [0, 0.32],
        [0.5, 0.4],
        [1, 0.62],
      ],
      chine2Beam: [
        [0, 0.95],
        [0.5, 0.96],
        [1, 0.7],
      ],
      chine2Height: [
        [0, 0.6],
        [0.5, 0.62],
        [1, 0.78],
      ],
      flare: [
        [0, 0.0],
        [0.6, 0.02],
        [1, 0.2],
      ],
    },
    bulwark: [
      [0, 0.0],
      [1, 0.0],
    ],
    wheelhouse: { z0: 2.3, z1: -2.4, halfWidth: 1.8, height: 2.1, frontRake: 0.35, sill: 0.9, head: 1.8, panesFront: 5, panesSide: 3, panesBack: 2, overhang: 0.25 },
    colours: { topsides: 0xd9622b, bulwark: 0xd9622b, bottom: 0x1f2a30, boot: 0xe8e4d8, house: 0xf2f2ec, deck: 0x6a7470 },
  },
];
