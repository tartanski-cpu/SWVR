/**
 * Hull study designs: twelve workboat types, small to large, monohull and catamaran. Each is
 * an original design that takes its proportions and character from the type (no real
 * boat's lines are copied). Numbers are metres; see loft.ts for what each curve means.
 * Draught is set by the keel curve: the design waterline is y = 0.
 *
 * The owner's shortlist for the platform (`shortlist: true`, listed first): the sjark netter,
 * the catamaran landing craft, the pilot boat, the harbour tug, the limit seiner and the crew
 * transfer catamaran. The other four stay as references.
 *
 * Proportions came from the type's usual range, read off builders' and trade-press figures:
 *   - Nordic sjark: ~11 x 4.4 m, wheelhouse forward, working deck aft, high flared bow.
 *   - Bristol Bay gillnetter: 32 ft limit, very beamy (B ~ 4.6-4.9 m), shallow (jets),
 *     the house right aft or raised so the net reel runs under it.
 *   - Coastal work skiff (landing bow): from an owner's reference photo of a ~9 m aluminium
 *     outboard work skiff: raked square bow, hard chine, near-straight sheer, cabin aft of
 *     amidships with walkaround side decks, open foredeck inside bulwarks.
 *   - Catamaran landing craft ("landing cat"): ~15 m x 4.6 m, twin hulls, bow ramp, house aft.
 *   - Pilot / crew boat: deep-V hard chine, spray chine, raked stem, fine entry.
 *   - Compact harbour tug: L/B about 2.2-2.4, B/T about 2.7-2.9, raised forecastle.
 *   - Alaskan limit seiner: 58 ft (17.7 m) with a 26 ft (7.9 m) beam and 13 ft depth,
 *     deep hard-chine hull, house forward, big aft working deck.
 *   - Inland pushboat: ~20 x 7 m, square bow with push knees, raised wheelhouse for
 *     the view over the barges, flat bottom.
 *   - Wind-farm crew transfer catamaran: ~24 x 8 m, draught 1.5-2 m, slim demihulls,
 *     the house amidships on the bridge deck.
 *   - Multicat: ~26 x 11.5 m, draught 2.4 m, rectangular pontoon hull, house aft,
 *     open foredeck for the cranes.
 *   - Small push tug (owner's reference render of a small tug, Oct 2026): ~13 x 5.4 m, L/B
 *     about 2.4, hard chine, a high square push bow with a rubber push fender, the bottom
 *     sweeping up to it; low aft deck, house forward of amidships, twin screws.
 *   - Fast catamaran workboat (owner, Oct 2026: a wide working platform for cranes, the
 *     house forward or aft, stiff in roll, 25-28 kn): ~12.5 x 6.0 m, semi-planing hard-chine
 *     demihulls, aluminium; drawn to float on her lines at the Shipyard's weight for her
 *     (~15 t), the wet deck 1.25 m up so it stays well clear at every size.
 *   - Stern trawler (owner, Oct 2026, from a 24 m trawler's general arrangement: "so we can
 *     eventually build something like this"): ~20 x 7 m, L/B about 2.9, B/T about 2.5; a
 *     hard-chine steel hull (the game's stations take one chine), deep with a drag aft (more draught aft than forward) for a big
 *     slow propeller in a nozzle, a high flared bow with a strong sheer and a whaleback
 *     forward, the wheelhouse forward of amidships and a long working deck aft for the net
 *     drum, the trawl winches and the gantry over the stern.
 */
import type { HullDesign } from './loft';

export const DESIGNS: HullDesign[] = [
  {
    id: 'sjark',
    shortlist: true,
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
    id: 'landingCat',
    shortlist: true,
    name: 'Catamaran landing craft',
    blurb: 'Alaskan-style aluminium "landing cat": two slim planing demihulls under a wide bridge deck, a square bow for the ramp, a clear foredeck for cargo, the house aft across the full beam. 15.0 x 5.6 m, draught 0.8 m.',
    length: 15.0,
    catamaran: { spacing: 3.6, tunnel: 0.55 },
    halfBeam: [
      [0, 0.95],
      [0.5, 1.0],
      [0.9, 0.95],
      [0.97, 0.8],
      [1, 0.7],
    ],
    sheer: [
      [0, 1.35],
      [0.6, 1.35],
      [1, 1.6],
    ],
    keel: [
      [0, -0.8],
      [0.6, -0.8],
      [0.85, -0.5],
      [1, 0.6],
    ],
    rake: [
      [0, 0.0],
      [0.8, 0],
      [1, -0.6],
    ],
    section: {
      chineBeam: [
        [0, 0.92],
        [1, 0.9],
      ],
      chineHeight: [
        [0, 0.28],
        [0.7, 0.28],
        [1, 0.55],
      ],
      flare: [
        [0, 0.0],
        [1, 0.05],
      ],
    },
    bulwark: [
      [0, 0.0],
      [0.3, 0.0],
      [0.36, 0.95],
      [1, 0.95],
    ],
    wheelhouse: { z0: 7.3, z1: 4.2, halfWidth: 2.7, height: 2.2, frontRake: 0.2, sill: 1.0, head: 1.9, panesFront: 5, panesSide: 3, panesBack: 2 },
    colours: { topsides: 0xb8bec2, bulwark: 0xb8bec2, bottom: 0x4a5055, boot: 0x4a5055, house: 0xe4e7e8, deck: 0x80878c },
  },
  {
    id: 'pilot',
    shortlist: true,
    name: 'Pilot / crew boat',
    blurb: 'Fast hard-chine pilot boat: deep-V forward easing aft, a spray chine, a well-raked stem with a fine entry, the house amidships with forward-raked windows and a low aft cockpit. 14.0 x 4.5 m, draught 1.1 m.',
    length: 14.0,
    halfBeam: [
      [0, 1.9],
      [0.3, 2.2],
      [0.55, 2.25],
      [0.8, 1.7],
      [0.95, 0.7],
      [1, 0],
    ],
    // A modest sheer (owner, Oct 2026: it rose 0.8 m from amidships to the stem, too much):
    // 0.5 m forward of amidships, fair, most of it in the last fifth.
    sheer: [
      [0, 1.1],
      [0.5, 1.25],
      [0.8, 1.45],
      [1, 1.75],
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
  {
    id: 'tug',
    shortlist: true,
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
    id: 'seiner',
    shortlist: true,
    name: 'Limit seiner (58 ft type)',
    blurb: 'Alaskan-style limit seiner: deep hard-chine steel hull, very beamy for its length, a long deckhouse forward with the wheelhouse on top, and a big open working deck aft inside high bulwarks. 17.7 x 7.9 m, draught 2.6 m.',
    length: 17.7,
    halfBeam: [
      [0, 3.3],
      [0.25, 3.9],
      [0.5, 3.95],
      [0.75, 3.4],
      [0.92, 1.8],
      [1, 0],
    ],
    sheer: [
      [0, 1.4],
      [0.4, 1.5],
      [0.7, 1.9],
      [1, 2.9],
    ],
    keel: [
      [0, -2.0],
      [0.3, -2.6],
      [0.65, -2.5],
      [0.88, -1.6],
      [1, 0.5],
    ],
    rake: [
      [0, 0.2],
      [0.6, 0],
      [1, -0.45],
    ],
    section: {
      chineBeam: [
        [0, 0.8],
        [0.5, 0.85],
        [1, 0.3],
      ],
      chineHeight: [
        [0, 0.3],
        [0.5, 0.32],
        [1, 0.5],
      ],
      flare: [
        [0, 0.02],
        [0.6, 0.05],
        [1, 0.45],
      ],
    },
    bulwark: [
      [0, 1.1],
      [0.5, 1.1],
      [0.7, 0.9],
      [1, 0.8],
    ],
    // The lower deckhouse (galley, bunks) with the wheelhouse set back on top of it.
    houses: [
      { z0: 0.5, z1: -5.5, halfWidth: 3.0, height: 2.3, frontRake: 0.1, sill: 1.1, head: 1.7, panesFront: 0, panesSide: 4, panesBack: 0, overhang: 0.05 },
      { z0: -0.5, z1: -4.2, halfWidth: 2.4, height: 2.2, frontRake: 0.35, sill: 0.9, head: 1.85, panesFront: 5, panesSide: 3, panesBack: 3, overhang: 0.25, above: 2.3 },
    ],
    colours: { topsides: 0x1c3550, bulwark: 0x1c3550, bottom: 0x8c2a22, boot: 0xe8e4d8, house: 0xf1f0ea, deck: 0x5f6a62 },
  },
  {
    id: 'ctv',
    shortlist: true,
    name: 'Crew transfer catamaran',
    blurb: 'Wind-farm crew transfer vessel: two slim, deep demihulls with fine raked bows under a high bridge deck, a long low house amidships with the wheelhouse forward, an open working deck aft and a fendered bow for pushing onto turbine ladders. 24.0 x 8.0 m, draught 1.6 m.',
    length: 24.0,
    catamaran: { spacing: 5.4, tunnel: 1.1 },
    halfBeam: [
      [0, 1.1],
      [0.3, 1.3],
      [0.6, 1.3],
      [0.85, 0.9],
      [0.96, 0.4],
      [1, 0],
    ],
    sheer: [
      [0, 2.3],
      [0.5, 2.4],
      [1, 3.1],
    ],
    keel: [
      [0, -1.4],
      [0.3, -1.6],
      [0.7, -1.5],
      [0.92, -0.6],
      [1, 1.2],
    ],
    rake: [
      [0, 0.1],
      [0.6, 0],
      [1, -0.55],
    ],
    section: {
      chineBeam: [
        [0, 0.85],
        [0.5, 0.85],
        [1, 0.5],
      ],
      chineHeight: [
        [0, 0.25],
        [0.5, 0.3],
        [1, 0.5],
      ],
      round: 2,
      flare: [
        [0, 0.02],
        [1, 0.1],
      ],
    },
    bulwark: [
      [0, 0.9],
      [0.75, 0.9],
      [1, 0.5],
    ],
    houses: [
      { z0: 2.5, z1: -7.5, halfWidth: 3.6, height: 2.5, frontRake: 0.4, sill: 1.0, head: 1.9, panesFront: 6, panesSide: 6, panesBack: 2, overhang: 0.2 },
      { z0: -2.0, z1: -6.5, halfWidth: 2.6, height: 2.3, frontRake: 0.45, sill: 0.8, head: 1.9, panesFront: 5, panesSide: 3, panesBack: 2, overhang: 0.3, above: 2.5 },
    ],
    colours: { topsides: 0xe8e6df, bulwark: 0xe8e6df, bottom: 0x1f2a30, boot: 0xd9622b, house: 0xf4f4f0, deck: 0x6c7673 },
  },
  {
    id: 'gillnetter',
    name: 'Bay gillnetter (bowpicker type)',
    blurb: 'Alaskan-style bowpicker: hard chine, very beamy and shallow for its length (jet drives), a flat open foredeck for the net reel, and the house right aft on a raised trunk. 9.75 x 4.6 m, draught 0.6 m.',
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
    name: 'Coastal work skiff (landing bow)',
    blurb: 'Aluminium planing work skiff: a raked square landing bow for running up on beaches, hard chine with moderate deadrise, a near-straight sheer, a cabin aft of amidships with narrow walkaround side decks, an open foredeck inside bulwarks and a short cockpit aft (outboards on a transom bracket come as a module). 9.0 x 2.8 m, draught 0.45 m.',
    length: 9.0,
    halfBeam: [
      [0, 1.32],
      [0.5, 1.4],
      [0.85, 1.36],
      [1, 1.05],
    ],
    sheer: [
      [0, 0.95],
      [0.5, 1.0],
      [1, 1.3],
    ],
    keel: [
      [0, -0.45],
      [0.55, -0.48],
      [0.8, -0.35],
      [1, 0.12],
    ],
    rake: [
      [0, 0.05],
      [0.75, 0],
      [1, -0.95],
    ],
    section: {
      chineBeam: [
        [0, 0.93],
        [0.7, 0.93],
        [1, 0.95],
      ],
      chineHeight: [
        [0, 0.12],
        [0.6, 0.14],
        [1, 0.05],
      ],
      flare: [
        [0, 0.03],
        [1, 0.03],
      ],
    },
    bulwark: [
      [0, 0.32],
      [0.45, 0.32],
      [0.52, 0.6],
      [1, 0.62],
    ],
    // Cabin from about 18 % to 48 % of the length from the transom; 0.3 m side decks each side.
    wheelhouse: { z0: 2.85, z1: 0.2, halfWidth: 1.05, height: 1.95, frontRake: 0.05, sill: 1.0, head: 1.65, panesFront: 3, panesSide: 2, panesBack: 1, overhang: 0.22 },
    colours: { topsides: 0xb9bec2, bulwark: 0xb9bec2, bottom: 0x2f3438, boot: 0x2f3438, house: 0xc9cdcf, deck: 0x8a9096, roof: 0xd3d6d8, bulwarkIn: 0xaab0b4 },
  },
  {
    id: 'pushboat',
    name: 'Inland pushboat',
    blurb: 'River pushboat: flat-bottomed box hull with a square bow for the push knees and a bluff raked stern over the propellers, a two-tier house with the wheelhouse raised to see over the barges. 20.0 x 7.0 m, draught 1.6 m.',
    length: 20.0,
    halfBeam: [
      [0, 3.4],
      [0.1, 3.5],
      [0.9, 3.5],
      [1, 3.45],
    ],
    sheer: [
      [0, 1.3],
      [1, 1.4],
    ],
    keel: [
      [0, -0.4],
      [0.15, -1.6],
      [0.85, -1.6],
      [1, -1.4],
    ],
    rake: [
      [0, 0.9],
      [0.2, 0],
      [0.9, 0],
      [1, -0.08],
    ],
    section: {
      chineBeam: [
        [0, 0.9],
        [1, 0.96],
      ],
      chineHeight: [
        [0, 0.15],
        [1, 0.08],
      ],
      flare: [
        [0, 0],
        [1, 0],
      ],
    },
    bulwark: [
      [0, 0.0],
      [1, 0.0],
    ],
    houses: [
      { z0: 7.0, z1: -6.5, halfWidth: 3.0, height: 2.4, sill: 1.1, head: 1.8, panesFront: 3, panesSide: 5, panesBack: 2, overhang: 0.1 },
      { z0: 1.5, z1: -3.5, halfWidth: 2.2, height: 2.4, sill: 1.0, head: 1.9, panesFront: 4, panesSide: 3, panesBack: 3, overhang: 0.1, above: 2.4 },
      { z0: -0.4, z1: -3.2, halfWidth: 1.7, height: 2.3, frontRake: 0.25, sill: 0.8, head: 1.95, panesFront: 4, panesSide: 3, panesBack: 3, overhang: 0.3, above: 4.8 },
    ],
    colours: { topsides: 0x7a1f1a, bulwark: 0x7a1f1a, bottom: 0x2a2a2a, boot: 0x2a2a2a, house: 0xf3efe2, deck: 0x6b6f6a, roof: 0x9aa09a },
  },
  {
    id: 'multicat',
    name: 'Multicat workboat',
    blurb: 'Shallow-draught multipurpose workboat: a rectangular pontoon hull with a raked, slightly rounded bow, a big open foredeck for the cranes and anchor gear, the house aft over the engine room, low bulwarks. 26.0 x 11.5 m, draught 2.4 m.',
    length: 26.0,
    halfBeam: [
      [0, 5.5],
      [0.1, 5.75],
      [0.85, 5.75],
      [0.95, 5.4],
      [1, 4.6],
    ],
    sheer: [
      [0, 1.1],
      [0.7, 1.15],
      [1, 1.6],
    ],
    keel: [
      [0, -2.4],
      [0.8, -2.4],
      [0.92, -1.6],
      [1, 0.4],
    ],
    rake: [
      [0, 0.2],
      [0.2, 0],
      [0.85, 0],
      [1, -0.45],
    ],
    section: {
      chineBeam: [
        [0, 0.9],
        [0.9, 0.92],
        [1, 0.8],
      ],
      chineHeight: [
        [0, 0.15],
        [0.85, 0.12],
        [1, 0.55],
      ],
      round: 1,
      flare: [
        [0, 0],
        [1, 0.05],
      ],
    },
    bulwark: [
      [0, 0.0],
      [0.22, 0.0],
      [0.26, 0.5],
      [1, 0.6],
    ],
    houses: [
      { z0: 11.5, z1: 5.0, halfWidth: 4.6, height: 2.6, sill: 1.1, head: 1.9, panesFront: 4, panesSide: 3, panesBack: 2, overhang: 0.1 },
      { z0: 10.0, z1: 6.0, halfWidth: 2.6, height: 2.5, frontRake: 0.4, sill: 0.8, head: 2.0, panesFront: 5, panesSide: 3, panesBack: 3, overhang: 0.35, above: 2.6 },
    ],
    colours: { topsides: 0xd9622b, bulwark: 0xd9622b, bottom: 0x2a2a2a, boot: 0x2a2a2a, house: 0xf3efe2, deck: 0x5e6660, roof: 0x9aa09a },
  },
  {
    id: 'pushTug',
    name: 'Small push tug',
    blurb: 'Small steel tug for harbour and push work: short, beamy and deep (L/B 2.4), hard chine, a strong sheer up to a high square push bow, its flat bow plate faced with a thick rubber push fender; the bottom sweeps up to the plate in a spoon. A low aft deck for towing, the house forward of amidships, twin propellers in a raised run aft. 13.0 x 5.4 m, draught 1.65 m.',
    length: 13.0,
    // Full almost to the bow, which ends square: a push plate about two thirds of her beam.
    halfBeam: [
      [0, 2.45],
      [0.25, 2.7],
      [0.6, 2.7],
      [0.82, 2.4],
      [0.95, 1.95],
      [1, 1.75],
    ],
    // Low aft (the towing deck), a strong sheer up to the bow.
    sheer: [
      [0, 0.95],
      [0.4, 1.0],
      [0.7, 1.3],
      [1, 2.0],
    ],
    // A raised run aft over the propellers, full depth amidships, and the bottom sweeping up
    // in a spoon to the foot of the push plate, just above the waterline.
    keel: [
      [0, -1.0],
      [0.12, -1.35],
      [0.3, -1.65],
      [0.62, -1.65],
      [0.8, -1.25],
      [0.92, -0.45],
      [1, 0.35],
    ],
    rake: [
      [0, 0.1],
      [0.85, 0],
      [1, -0.08],
    ],
    section: {
      chineBeam: [
        [0, 0.88],
        [0.5, 0.9],
        [0.85, 0.86],
        [1, 0.9],
      ],
      chineHeight: [
        [0, 0.3],
        [0.5, 0.22],
        [0.85, 0.25],
        [1, 0.25],
      ],
      flare: [
        [0, 0.02],
        [0.6, 0.03],
        [1, 0.08],
      ],
    },
    // Higher bulwarks on the foredeck, round the push bow.
    bulwark: [
      [0, 0.75],
      [0.55, 0.75],
      [0.62, 1.0],
      [1, 1.0],
    ],
    wheelhouse: { z0: 1.0, z1: -2.0, halfWidth: 1.7, height: 2.2, frontRake: 0.25, sill: 1.0, head: 1.9, panesFront: 3, panesSide: 2, panesBack: 2, overhang: 0.25 },
    colours: { topsides: 0x6d6a66, bulwark: 0xd8352c, bottom: 0x25272a, boot: 0xd8352c, house: 0xf1f1ee, deck: 0x5d6a5e, roof: 0xd8352c },
  },
  {
    id: 'sternTrawler',
    name: 'Stern trawler (20 m type)',
    blurb: 'North Sea-style stern trawler: a hard-chine steel hull (as many small steel trawlers are built), deep, with a drag aft for a big propeller in a nozzle; a high flared bow with a strong sheer under a whaleback; the wheelhouse forward of amidships and a long working deck aft for the net drum, the trawl winches and the gantry. 20.0 x 7.0 m, draught 2.8 m aft.',
    length: 20.0,
    // Full amidships and well aft (a wide working deck to the transom), a fine entry.
    halfBeam: [
      [0, 3.05],
      [0.25, 3.45],
      [0.55, 3.5],
      [0.78, 3.05],
      [0.93, 1.6],
      [1, 0],
    ],
    // A low working deck aft, rising in a sheer to the bow (owner, Oct 2026: a little less
    // than the first 2.45 m at the stem; the Shipyard's Sheer adds more).
    sheer: [
      [0, 0.95],
      [0.4, 1.0],
      [0.7, 1.25],
      [1, 2.1],
    ],
    // A drag aft: deepest under the propeller, the keel rising forward to the forefoot and stem.
    keel: [
      [0, -2.2],
      [0.1, -2.8],
      [0.35, -2.7],
      [0.65, -2.35],
      [0.88, -1.6],
      [1, 0.4],
    ],
    rake: [
      [0, 0.15],
      [0.6, 0],
      [1, -0.5],
    ],
    // Hard chine (the game's stations take one chine): a full section, the chine well out
    // and low amidships, near-upright sides, flaring forward.
    section: {
      chineBeam: [
        [0, 0.82],
        [0.5, 0.88],
        [1, 0.35],
      ],
      chineHeight: [
        [0, 0.38],
        [0.5, 0.32],
        [1, 0.5],
      ],
      flare: [
        [0, 0.03],
        [0.6, 0.06],
        [1, 0.5],
      ],
    },
    bulwark: [
      [0, 1.1],
      [0.6, 1.1],
      [0.75, 1.0],
      [1, 1.0],
    ],
    forecastle: { from: 0.72, raise: 1.4 },
    wheelhouse: { z0: -1.0, z1: -5.2, halfWidth: 2.4, height: 2.3, frontRake: 0.3, sill: 1.0, head: 1.9, panesFront: 5, panesSide: 3, panesBack: 3, overhang: 0.25, above: 1.4 },
    colours: { topsides: 0x2f5a3a, bulwark: 0x2f5a3a, bottom: 0x8c2a22, boot: 0xe8e4d8, house: 0xf1f0ea, deck: 0x5f6a62 },
  },
  {
    id: 'workCat',
    name: 'Fast catamaran workboat',
    blurb: 'Fast aluminium workboat catamaran: two hard-chine demihulls, semi-planing with a flat run aft and fine raked bows, under a wide flat bridge deck with a high wet deck. A wide working deck for cranes and cargo, very stiff in roll; the wheelhouse forward here (it can go aft). Drawn to float on her lines at the Shipyard\'s weight for her (about 15 t), her wet deck well clear of the water at every size; 25 to 30 kn on twin engines. 12.5 x 6.0 m, draught 0.83 m.',
    length: 12.5,
    // Each demihull: 1.9 m wide at the deck, its centre 2.05 m off hers (6.0 m overall). The wet
    // deck 1.25 m up: at the Shipyard's smallest (10 m, heavier for her size: her engines, house
    // and outfit don't shrink with her) it's still over 0.8 m clear of the water.
    catamaran: { spacing: 4.1, tunnel: 1.25 },
    halfBeam: [
      [0, 0.92],
      [0.4, 0.95],
      [0.7, 0.88],
      [0.9, 0.55],
      [1, 0.07],
    ],
    sheer: [
      [0, 1.9],
      [0.5, 1.95],
      [1, 2.35],
    ],
    // A straight, nearly level run aft for planing lift; the forefoot rising to a fine bow.
    keel: [
      [0, -0.68],
      [0.4, -0.83],
      [0.7, -0.79],
      [0.9, -0.37],
      [1, 1.0],
    ],
    rake: [
      [0, 0.05],
      [0.7, 0],
      [1, -0.6],
    ],
    section: {
      // A hard chine low aft (a moderate vee for planing), rising to a deep vee entry.
      chineBeam: [
        [0, 0.82],
        [0.5, 0.78],
        [1, 0.35],
      ],
      chineHeight: [
        [0, 0.19],
        [0.5, 0.21],
        [1, 0.45],
      ],
      flare: [
        [0, 0.04],
        [1, 0.15],
      ],
    },
    bulwark: [
      [0, 0.6],
      [1, 0.6],
    ],
    // The wheelhouse forward of amidships, the working deck aft (the Shipyard lets it go aft).
    wheelhouse: { z0: -0.5, z1: -3.6, halfWidth: 2.3, height: 2.2, frontRake: 0.35, sill: 1.0, head: 1.9, panesFront: 4, panesSide: 3, panesBack: 2, overhang: 0.25 },
    colours: { topsides: 0xd9622b, bulwark: 0xd9622b, bottom: 0x2a2f33, boot: 0xeeeeea, house: 0xf2f2ee, deck: 0x5e6660, roof: 0xd3d6d8 },
  },  {
    // A larger harbour tug (owner, Oct 2026, from photographs and the particulars of a 25 m
    // azimuth stern drive harbour tug; our own lines, of her size and type): hull only for now,
    // her drives, controls and house to come.
    id: 'harbourTug',
    name: 'Harbour tug (ASD, 25 m type)',
    blurb: 'Azimuth stern drive harbour tug: very full and beamy (L/B 2.4 on her hull, 2.2 over her fenders), a round bilge, a blunt rounded bow for pushing ships under a strong sheer and high bulwarks round the foredeck (a bow winch tows over it), deep forward with the bottom rising aft in a long flat run to a shallow, wide stern with rounded corners, room under it for her two drive pods. A low working deck aft. 25.0 x 10.5 m (11.2 m over her fenders), draught 3.3 m (her pods to about 5.3 m).',
    length: 25.0,
    // Full: a parallel midbody, a wide stern rounded at its corners, a blunt bow rounded in plan.
    halfBeam: [
      [0, 3.8],
      [0.03, 4.45],
      [0.08, 4.95],
      [0.16, 5.25],
      [0.6, 5.25],
      [0.72, 5.15],
      [0.82, 4.85],
      [0.9, 4.3],
      [0.95, 3.55],
      [0.98, 2.6],
      [0.995, 1.4],
      [1, 0],
    ],
    // A low working deck aft, a strong sheer up to her bow.
    sheer: [
      [0, 1.55],
      [0.3, 1.45],
      [0.5, 1.5],
      [0.7, 1.85],
      [0.88, 2.5],
      [1, 3.05],
    ],
    // Deep forward and amidships, the bottom rising aft in a long run to a shallow transom (her
    // drive pods hang under it), a rounded forefoot up to her stem.
    keel: [
      [0, -0.5],
      [0.1, -1.0],
      [0.25, -2.0],
      [0.4, -2.8],
      [0.55, -3.25],
      [0.6, -3.3],
      [0.85, -3.3],
      [0.93, -2.9],
      [0.975, -1.9],
      [1, 0.0],
    ],
    rake: [
      [0, 0.05],
      [0.8, 0],
      [1, -0.1],
    ],
    // A round bilge, drawn as two chines close together: its lower corner on a nearly flat
    // bottom, its upper corner under her near-upright sides.
    section: {
      bilge: true,
      chineBeam: [
        [0, 0.85],
        [0.3, 0.72],
        [0.6, 0.68],
        [0.85, 0.55],
        [1, 0.35],
      ],
      chineHeight: [
        [0, 0.12],
        [0.3, 0.08],
        [0.6, 0.08],
        [0.85, 0.12],
        [1, 0.3],
      ],
      chine2Beam: [
        [0, 0.97],
        [0.3, 0.95],
        [0.6, 0.95],
        [0.85, 0.8],
        [1, 0.55],
      ],
      chine2Height: [
        [0, 0.35],
        [0.3, 0.3],
        [0.6, 0.3],
        [0.85, 0.35],
        [1, 0.5],
      ],
    },
    // Bulwarks all round, higher round the foredeck.
    bulwark: [
      [0, 0.9],
      [0.55, 0.9],
      [0.65, 1.1],
      [1, 1.1],
    ],
    // Her bottom paint to her waterline (a ship's boot top), not her bilge.
    bootTop: 0.05,
    colours: { topsides: 0x2e3b47, bulwark: 0x2e3b47, bottom: 0x7a2c24, boot: 0x1f2124, house: 0xeceeea, deck: 0x6b6f68, roof: 0xd8352c },
  },
];
