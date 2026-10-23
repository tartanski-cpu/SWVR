# Progress: Hull modifications

The running record for this area's chat: the hull study: the lines-plan hull generator and type designs. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/hulls/`, `hulls.html`.
- **Its tests while working:** `npm run typecheck` (the hull study has no tests of its own yet), then `npm run test:shipyard`, which builds hulls from it. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/hulls/ (branch `preview/hulls`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

### The catamaran redrawn for her real weight; a displacement hull's resistance; publishing runs finish (owner)

- **The owner** said fix the catamaran hulls; for the tug, two big engines don't fit a small tug and the displacement speed should be respected where possible; and go ahead with the publishing fix.
- **Why the catamaran needed redrawing:** the Shipyard chat's step 3 (on `preview/shipyard`) weighs her heavier than her lines floated, and I measured its build. At 12.5 m she weighed 13.7 t on lines for 9.3 t: draught 0.80 m against 0.62, and her wet deck only 0.72 m clear. At 10 m she weighed 10.1 t on lines for 4.8 t, her wet deck **0.41 m** clear. Her engines, house and outfit don't shrink with her, so the small sizes are heavy for their lines.
- **The new lines** (`designs.ts`, `workCat`): 12.5 x 6.0 m, 0.83 m draught, 14.6 t at the DWL (Cb 0.48, Cp 0.73, Cm 0.65, Cwp 0.82; KM 9.7 m).
  - **Demihulls:** fuller and deeper, 1.9 m wide at the deck, their centres 4.1 m apart.
  - **Wet deck and deck:** the wet deck 1.25 m up (10 % of LWL), the deck raised to match (sheer 1.9 m aft, 2.35 m at the bow).
  - **The wheelhouse** 4.6 m wide in the study.
  - **How the size was chosen:** measured in the Shipyard preview's own build, she floats on her lines at its weight for her, and her wet deck is clear at every size.

    | Size | Shipyard weight | Draught | Wet deck clear | Twin 280 kW | Twin 400 kW |
    |---|---|---|---|---|---|
    | 10 m | 10.9 t | 0.84 m | 0.83 m | **26.6 kn** | (31 kn) |
    | 12.5 m | 15.0 t | 0.84 m | 1.24 m | 24.9 kn | **29.6 kn** |
    | 14.7 m | 22.8 t | 0.90 m | 1.75 m | 19.3 kn | 24.7 kn |

    Speeds are the Shipyard's sea trials, gearbox matched.
  - **Tried and dropped:** a lower wet deck and deck (0.73 m clear at 10 m) was slower at every size; the chines came down with the deck and filled her out. A longer forward waterline gained nothing.
  - **Still short:** the 14.7 m boat makes 24.7 kn on twin 400 kW, just under 25, because the Shipyard weighs her at 23-24 t. I've asked the Shipyard chat to check its aluminium weight figure against real work cats (a 15 m one is nearer 15-18 t light).
- **A displacement hull's resistance** (new `vessel/displacementHull.ts`, `displacementResistance(lwl, y)`; settings `CONFIG.displacementHull.resistance` in `src/config/vessels.ts`: formFactor 0.25, waveA 1.0, waveB 6, waveKnee 0.35, waveCap 2.0, asternFactor 3.6).
  - **What was wrong:** every Shipyard design used the landing craft's planing curve, whose wave resistance levels off at 0.115 of her weight, so enough power drove a heavy displacement hull through the hump.
  - **The new curve** keeps climbing past hull speed: about 0.1 of her weight at Fn 0.45, 0.2 at 0.5 and 0.5 at 0.6.
  - **Measured on the Shipyard's boats** (sea trials):

    | Boat | Before | After |
    |---|---|---|
    | Tug, twin 750 kW | **18.0 kn** | **10.4 kn** |
    | Tug, 450 kW | 8.8 kn | 8.5 kn |
    | Tug, twin 450 kW | 10.9 kn | 9.5 kn |
    | Tug, twin 400 kW | 10.9 kn | 9.5 kn |
    | Trawler, 750 kW | 10.5 kn | 10.3 kn |
    | Trawler, 450 kW | 9.2 kn | 9.3 kn |

    Bollard pull is unchanged.
  - **Not wired in yet:** the Shipyard chat makes its displacement hulls take it (a line in its build). The owner's other point, that two 750 kW engines don't fit a small tug, is its engine-room check, and I've passed it on.
- **Publishing** (`.github/workflows/pages.yml`, on the game's branch and on `next`): `cancel-in-progress: false`. A started publish now finishes. With several chats pushing, cancelling the one in progress at every push had held the site back about half an hour. GitHub keeps one waiting run, the newest, which builds every branch as it then is.
- **Tests:**
  - `tests/displacementHull.test.ts` (3 new): the twin-750 tug held near Fn 0.5, where the planing curve gave over 3 kn more; a tug's ordinary engine near her hull speed and the trawler at 9.5-12 kn; each step past hull speed costing more.
  - `tests/hulls/workCat.test.ts` and `catPhysics.test.ts` updated to the new lines: about 15 t, wet deck 10 % of LWL, roll period about 2.2 s, 25 kn and over on twin 280 kW at 10 m and twin 400 kW at 12.5 m, about 24 kn at 14.7 m.
  - All of `npm test` (1415), the typecheck and the build pass. The Shipyard preview's own tests pass with the new lines too.
- **Checked:** the viewer in headless Chromium (the study's drawing, and as the game draws her). **Not checked:** the Quest.
- **Shared changes:**
  - `src/vessel/displacementHull.ts` (new);
  - `src/config/vessels.ts` (`CONFIG.displacementHull`);
  - `.github/workflows/pages.yml` (publishing);
  - `tests/displacementHull.test.ts` (new).

### On next: the fast catamaran's lines, two hulls in the physics, her handling (owner approved)

- **The owner** said merge steps 1 and 2 into `next`, which moves the hull study's fast catamaran workboat, the two-hull physics (step 1) and her handling (step 2) to `next` (/SWVR/next/), with the preview-addresses log entry.
- `origin/next` was merged in first, and all of `npm test`, the typecheck and the build pass. Step 3 (the Shipyard hull type) is the Shipyard chat's: what it needs is in the step 2 entry below.

### A catamaran's handling: resistance, roll inertia and damping, no banking (owner; step 2 of 3)

- **The owner** said go ahead with step 2, the fast cat's handling in the shared vessel physics.
- **Correction to the first entry's speed estimate:** I took resistance as 0.11 of her weight, which was optimistic. Real 12 m aluminium work cats need about 40-50 kW per tonne at the shaft for 25-28 kn. The game's own curve was already close to that, R/W 0.21 at 25 kn. Its overall propulsive efficiency, from the landing craft's trial (26.9 kn on 400 kW), is about 0.55 of shaft power.
- **Her handling** (new `vessel/catamaran.ts`, `catamaranHandling(form, lwl, y)`; settings `CONFIG.catamaran` in `src/config/vessels.ts`): what a boat built on a catamaran hull takes, rather than a monohull's numbers.
  - **Resistance** (`CONFIG.catamaran.resistance`: formFactor 0.25, waveA 0.65, waveB 0.55, waveKnee 0.35, waveCap 0.09, asternFactor 3.0). Slim demihulls (LWL/b about 8) make a smaller wave hump than a beamy planing monohull, a little later. The form factor carries the two hulls' interference. At Fn 0.5 her resistance is under 0.8 of the landing craft's curve on the same hull.
  - **Roll added inertia** (`heaveAddedMass` 0.8; `rollGyradius` 0.37 of her beam). As she rolls, her hulls heave in opposite directions, so each one's added mass in heave acts half the spacing out. That adds 0.8 x mass x (spacing/2)^2: 0.73 of her rigid-body roll inertia at standard size.
- **The physics** (`physics/vesselPhysics.ts`; catamarans only):
  - **Heave damping at each hull:** each hull's heave is damped at its own centreline, against the water's vertical motion there. Rolling, one hull goes down as the other comes up, so her hulls' damping damps her roll, as a real cat's does. Her heave and pitch damping are as before.
  - **No banking:** the planing turn models (the vee bottom's banking and leaning into a turn) are off for a catamaran. Two slim hulls don't bank on a vee; she stays near level.
- **What she does now** (standard size, the game's physics):

  | | Before step 2 | After |
  |---|---|---|
  | Roll period | 1.4 s | **1.8 s** |
  | Heel left 3 s after letting go of 5° | (not measured) | **under 2 %** |

  The landing craft monohull: a 2.5 s roll period, and about 7 % of the heel left after 3 s.
- **Top speed, light,** where her resistance's power meets 0.55 of the engines':

  | Size | Weight | Twin 150 kW | Twin 280 kW | Twin 400 kW | Shaft power for 25 kn |
  |---|---|---|---|---|---|
  | smallest (10 m) | 4.8 t | **28.4 kn** | 37 kn | 43 kn | 48 kW/t |
  | standard (12.5 m) | 9.3 t | 22 kn | **29.9 kn** | 35 kn | 42 kW/t |
  | largest (14.7 m) | 15.1 t | 17 kn | 24.6 kn | **29.6 kn** | 38 kW/t |

  - **Every size makes 25-28 kn and a bit over, light, on its right twin.** Deck cargo takes some off: 2 t on the standard boat brings twin 280 kW down to about 27 kn.
  - **The Shipyard's own trials will have the last word:** her propellers and gearbox are matched there (step 3).
- **Monohulls are untouched:** every change is for a catamaran, and the golden runs hold to a millionth.
- **Tests** (`tests/hulls/catPhysics.test.ts`, now 6 tests in the file):
  - afloat with her handling, her roll period is 1.6 s to 0.85 of a monohull's, and under 5 % of her heel is left 3 s on (less than the monohull's);
  - she's fast: over 25 and under 32 kn light at every size on its twin, 35-50 kW/t for 25 kn at standard size, and a smaller hump than the monohull curve.

  Typecheck, all of `npm test` (1404) and the build pass.
- **Not checked:** the Quest; her in the game itself (the Shipyard type, step 3); a wet-deck slam (still only its buoyancy and the heave damping).
- **For step 3, the Shipyard chat:**
  - build a catamaran design's handling with `catamaranHandling(form, lwl, y)`: its `resistance`, `rollGyradius` for her roll inertia, and `addedRoll` for her added roll inertia;
  - give her no planing turn model (the physics leaves it off for a catamaran anyway);
  - always twin engines, one in each hull;
  - its own waterplane measure is a monohull's;
  - scale the hull spacing and the wet deck with her beam and depth.
- **Shared changes:**
  - `src/vessel/catamaran.ts` (new);
  - `src/config/vessels.ts` (`CONFIG.catamaran`);
  - `src/vessel/physics/vesselPhysics.ts` (a catamaran's heave damping at each hull; no planing turn models for a catamaran).

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

