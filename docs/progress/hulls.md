# Progress: Hull modifications

The running record for this area's chat: the hull study: the lines-plan hull generator and type designs. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/hulls/`, `hulls.html`.
- **Its tests while working:** `npm run typecheck` (the hull study has no tests of its own yet), then `npm run test:shipyard`, which builds hulls from it. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/hulls/ (branch `preview/hulls`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

### Two hulls in the game's physics: catamarans float, roll and are drawn (owner; step 1 of 3)

- **The owner** said go ahead with the two-hull physics, the first of the three steps to sail the fast catamaran (entry below). The main game chat was told first: the vessel physics is shared code.
- **How a catamaran is held** (`vessel/hullForm.ts`, `Station.demihull`, `HullForm.catamaran`). `hullFormFromDesign` now takes a hull-study catamaran (it refused one before). Each station is one ten-point section across both demihulls and the bridge deck, the tunnel under the wet deck a notch in it, in this order:
  - port outer deck edge;
  - port outer chine;
  - port keel;
  - port inner chine;
  - the wet deck's two corners;
  - starboard inner chine;
  - starboard keel;
  - starboard outer chine;
  - starboard outer deck edge.

  Where a demihull's keel rises above the wet deck at the bow, the notch closes up to it.
  - **Why this works without special cases:** the buoyancy, the hydrostatics, the contacts and the wetted surface already clip any section at the water. So both hulls float, and a wet deck driven under adds its buoyancy (and its push up), as a real one does.
  - **What `Station.demihull` records:** each demihull's own half-breadths and its offset, for what goes by one hull's width.
- **The physics** (`physics/vesselPhysics.ts`; each change touches only a catamaran):
  - the heave damping's waterplane strip, and the planing lift's waterplane, use her two hulls' width, not the full width across her tunnel (`wetHalf`);
  - the side force (sway, yaw and turning) counts two keels.
- **Stability** (`vessel/hydrostatics.ts`, `uprightHydrostatics`): a catamaran's waterplane is two strips, each with its second moment about her centreline (the parallel-axis term that makes her stiff), not one strip across the tunnel.
- **Boat against boat** (`physics/vesselContact.ts`): samples her outer deck edges and chines by the first two and last two points of her section, which a catamaran's polygon still has.
- **Drawing** (`view/hullMesh.ts`):
  - each demihull's panels face away from its own centreline, and the wet deck's underside faces down;
  - her inner topsides and wet deck take the topsides colour;
  - her transom is cut into triangles that leave the tunnel open, and the bridge deck's front across her bow is closed the same way;
  - the bulwarks stand on her outer deck edges.
- **Monohulls are untouched:** every change applies only to a catamaran, and all twelve golden runs hold to a millionth.
- **Measured, the standard work cat in the game's physics** (her CG at 60 % of her depth, the landing craft's handling numbers):
  - she settles on her lines within 0.02 mm;
  - the game's KM is 12.28 m against the hull study's 12.20 m;
  - her displacement is 9.07 against 8.82 m³ (the game's stations are upright sections);
  - her roll period is **1.4 s**, against 2.5 s for the 9 m landing-craft monohull: very stiff, as asked.
- **The hull study viewer** (`hulls.html`, `src/hulls/viewer.ts`) has **As the game draws her**: any design as the game builds and draws it, from the game's own stations (bare: bulwark, no house). A round-bilge design says the game can't take it yet. The view stays put when it's switched.
- **Still to come:**
  - **Step 2:** a fast cat's resistance and planing lift (the game's curve is a monohull's), and her roll damping and comfort. Her snappy 1.4 s roll wants some tuning: a real one's added inertia makes it nearer 2 to 3 s.
  - **Step 3:** the Shipyard hull type (the Shipyard chat), which should know:
    - its own waterplane measure (`waterlineHalf` in the build's hydrostatics) is a monohull's;
    - a design's scaling should scale the spacing and the wet deck too;
    - she wants twin engines, one in each hull.
  - **Not done:** walking on her bridge deck (it's the deck, so it should just work) and a wet-deck slam (it pushes up through its buoyancy and the heave damping only).
- **Tests:** `tests/hulls/catPhysics.test.ts` (5 new):
  - ten-point, symmetric stations with the deck the full width;
  - her volume and KM as the hull study's;
  - the wet deck adds only the hulls' width below it and the full width above;
  - afloat she settles on her lines and rolls back in under 2.5 s, under three quarters of a monohull's period;
  - her drawing leaves the tunnel open at the transom.

  Typecheck, all of `npm test` (1394) and the build pass.
- **Checked:** the viewer in headless Chromium, her as the game draws her: Bow ¾, Stern ¾ (the tunnel open), from underneath (the wet deck and inner sides); the pilot boat (a monohull) as the game draws her; the round-bilge tug's note; no page errors. **Not checked:** the Quest; her in the game itself (that needs the Shipyard type, step 3).
- **Shared changes:**
  - `src/vessel/hullForm.ts` (catamaran stations), `src/vessel/physics/vesselPhysics.ts` (the strip and the keels), `src/vessel/hydrostatics.ts` (the catamaran waterplane), `src/vessel/physics/vesselContact.ts` (sample points by position in the section), `src/vessel/view/hullMesh.ts` (a catamaran's panels, ends and bulwarks): each change applies only to a catamaran;
  - `tests/hulls/catPhysics.test.ts` (new);
  - `README.md` (the viewer's new button).

### The preview addresses switched on (owner's go-ahead)

- **The owner** said go ahead with the publishing workflow, so the preview addresses work.
- **Shared change:** the three workflow files from `next` (`pages.yml`, `next.yml`, `check.yml`) copied onto the game's branch (`claude/admiring-dirac-v9wwih`, commit fc6d867). Nothing else moved: the game's own code is unchanged, rebuilt and republished as it was.
- **Checked:** the publishing run succeeded, and these addresses answer:
  - the game, and `/next/`;
  - `/preview/hulls/` (its `build.json` reads HULLS d1bdf30), `/preview/shipyard/`, `/preview/modules/`.

  `/preview/map/` waits for the map chat's first push to `preview/map`.

### A fast catamaran workboat: the lines, and what's needed to sail her (owner; started)

- **The owner asked** for a catamaran workboat as the next hull type:
  - a wider working platform for cranes and the like;
  - the wheelhouse forward or aft;
  - stiffer in roll than a monohull, so her seakeeping differs;
  - fast: 25 to 28 knots on all sizes with the engines we have.
- **The lines** (`src/hulls/designs.ts`, `workCat`, "Fast catamaran workboat"; in the viewer, `hulls.html`). An original design: an aluminium work cat 12.5 m x 5.6 m, 0.62 m draught, 9.0 t.
  - **Demihulls:** two slim ones, 1.6 m wide at the deck, their centres 4.0 m apart (`catamaran.spacing`). Hard chine and semi-planing, with a flat, nearly level run aft for planing lift. The chine is low aft and rises to a fine, raked, deep-vee entry.
  - **Demihull coefficients:** LWL/b 8.4 at the waterline; Cb 0.46, Cp 0.72, Cm 0.63, Cwp 0.81. The LCB is 1.63 m aft of amidships (14 % of LWL), as a planing hull wants.
  - **Bridge deck:** the wet deck 0.9 m above the DWL (`catamaran.tunnel`; 8 % of LWL), and a flat deck the full 5.6 m wide.
  - **House and bulwarks:** the wheelhouse forward of amidships (3.1 m long) leaves about 6.7 m x 5.4 m of open working deck aft. Low 0.6 m bulwarks.
- **Her numbers at the Shipyard's sizes** (length, beam and depth each x0.8 / x1 / x1.175, with the hull spacing and wet deck scaled):

  | Size | LOA x B x T | Displacement | KM | GM (KG at 0.6 D, a guess) | Roll period (rigid body, k = 0.37 B) |
  |---|---|---|---|---|---|
  | smallest | 10.0 x 4.5 x 0.50 m | 4.6 t | 9.8 m | 8.5 m | 1.1 s |
  | standard | 12.5 x 5.6 x 0.62 m | 9.0 t | 12.2 m | 10.6 m | 1.3 s |
  | largest | 14.7 x 6.6 x 0.73 m | 14.7 t | 14.3 m | 12.5 m | 1.4 s |

  - **Roll:** KM is over three times a monohull's of her size, so she's very stiff: a short, snappy roll, quick back to level and uncomfortable in a beam sea. With the hulls' added inertia, a real one's period would be nearer 2 to 3 s.
- **Speed: can she make 25-28 kn on the engines we have?** This is an estimate, not the game's physics. It assumes a resistance-to-weight ratio of 0.11 for a slim semi-planing cat at volumetric Froude numbers 2.6 to 3.6 (appendages and air included), and a propulsive efficiency of 0.55 with 0.97 for the shafts:

  | Size | Power for 25 kn | Power for 28 kn | Fits that do it |
  |---|---|---|---|
  | smallest (4.6 t) | 120 kW | 135 kW | twin 150 kW (to spare) |
  | standard (9.0 t) | 235 kW | 265 kW | twin 150 kW (only just), twin 280 kW |
  | largest (14.7 t) | 380 kW | 425 kW | twin 280 kW, twin 400 kW |

  - **Twin 280 kW makes 25-28 kn at every size.** Twin 400 kW would push the smaller ones well over 30 kn.
  - **Only light:** she does this as designed. Load the deck (crates, a crane and its lift) and she's slower: 2 t aboard the standard boat needs about 300-320 kW.
  - **Always twin:** a catamaran has an engine in each hull, so a single engine isn't sensible for her.
  - **No slow diesels:** the 450 and 750 kW slow-revving diesels are far too heavy for her (2.2 and 4.8 t each).
- **What it takes to sail her in the game** (not started: these are other areas' or shared code):
  1. **Two hulls in the game's physics** (shared code, `src/vessel/`: the main game chat's or the owner's call). The game's hull stations are one five-point section each; `vessel/hullForm.ts` refuses a design with a second hull. Each station needs two sections, and with them:
     - buoyancy and its centre;
     - the hydrostatics checks;
     - the hull mesh, the walk area and the deck across the bridge deck;
     - contacts;
     - a wet-deck slam when the tunnel meets a wave.
  2. **A fast cat's resistance and planing lift** (shared vessel physics). The game's resistance curve is a monohull's; a slim demihull's wave hump is lower and earlier. It needs tuning so the Shipyard's own sea trials give the 25-28 kn above. Her roll damping and comfort want tuning too (stiff roll).
  3. **The Shipyard hull type** (the Shipyard chat):
     - the cat as a hull type;
     - the wheelhouse forward or aft (the house-position slider);
     - always twin engines, one in each hull;
     - the deck gear placed across the wide deck;
     - her design code.
- **Tests:** `tests/hulls/workCat.test.ts` (3 new):
  - a catamaran with LWL/b over 7.5, a wide deck and the wet deck over 7 % of LWL;
  - 8-10 t at standard size and 4-16 t across the sizes, with the LCB well aft;
  - KM over 8 m, more than three times the landing craft's.

  The typecheck, all of `npm run test:shipyard` and all of `npm test` pass.
- **Checked:** the hull study viewer in headless Chromium: Bow ¾, Stern ¾ (the tunnel between the hulls), Plan, with the lines on; no page errors. **Not checked:** the Quest (the viewer only).
- **Shared changes:**
  - `tests/hulls/workCat.test.ts` (new; the hull study's first tests);
  - `README.md`: the hull study line, now thirteen types.

