# Progress: Hull modifications

The running record for this area's chat: the hull study: the lines-plan hull generator and type designs. From 23 Oct 2026 each area keeps its own log here, so the chats don't all edit one file (see CLAUDE.md, "Working in areas"). The shared decisions, the roadmap and the history before that date stay in `PROGRESS.md`.

- **This area's files:** `src/hulls/`, `hulls.html`.
- **Its tests while working:** `npm run typecheck` (the hull study has no tests of its own yet), then `npm run test:shipyard`, which builds hulls from it. Run `npm test` (everything) before moving work on to `next`.
- **Its address to try:** https://tartanski-cpu.github.io/SWVR/preview/hulls/ (branch `preview/hulls`).

Newest entry first. Each change set: what changed and why, the config keys, the tests, and what was and wasn't checked.

## Changes

### The foiling ferry's helm, physics side: FOIL / HULL, three ride heights, her flight in her state (owner)

- **The owner** (through the main game chat, 28 Oct): a FOIL / HULL switch, three ride heights on one knob (no trim control), a flight display and sound; "hull chat does physics". The switch, knob, display and sound are the main game chat's, once the Shipyard has her.
- **Read from her state** (`VesselControls`, shared `vessel/vesselState.ts`):
  - `foilMode`: 1 (or unset) FOIL, her flight computer flies her; 0 HULL, it keeps her down on her hulls at any speed, asking her foils for only `landShare` (0.3) of her weight and holding her level. Switched while flying, she comes down gently (the test: level within 4 deg, never faster than 1.5 m/s);
  - `foilRide`: 0 low, 1 normal (or unset), 2 high: her forward foil `CONFIG.foils.rideSteps` (+0.2 / 0 / -0.2 m) deeper or shallower than her design's 0.8 m; her keels about 0.4, 0.6 or 0.8 m clear.
  - Bus keys `foils.mode` (a switch, default FOIL) and `foils.ride` (0..2, integer, default 1), writer 'module', only on a boat with foils (`modular/busKeys.ts`; `docs/BUS_KEYS.md` regenerated).
- **Her flight in her state** (`VesselState.foil`, set each tick for a boat with foils): `engaged` (0..1, 0 in HULL), `flaps` (each panel's, deg), `clear` (0..1, how far her hulls are out of the water: 1 - her hull's immersion). In her state so a crew's game, which gets snapshots, sees it too (`foilTelemetry` is the host's alone).
- **Checked:** typecheck, all tests; `tests/foils.test.ts` adds: HULL keeps her on her hulls at full power; the three ride heights fly at their three depths (within 6 cm); HULL while flying brings her down gently and level.
- **Shared changes:** `vessel/vesselState.ts` (`foilMode`, `foilRide`, `foil`), `vessel/physics/foils.ts` (reads them, returns her summary), `vesselPhysics.ts` (writes `state.foil`), `config/vessels.ts` (`foils.rideSteps`), `modular/busKeys.ts` (`foils.mode`, `foils.ride`), `docs/BUS_KEYS.md`.

### Hydrofoils in the physics; the foiling electric ferry, her hull and foils (owner)

- **On `next`** (28 Oct, the owner's word): merged with `origin/next`; typecheck and all 1740 tests pass. Handed over: her house, drive and Shipyard one-off to the Shipyard chat; her helm and flight controls to the main game chat.
- **The owner:** a small foiling electric ferry, from photographs of one: 12 m, 30 passengers, 25 kn; "does the physics engine support foiling?" (it didn't) and "do the foil physics here". Our own design of the type, not the real vessel's.
- **Her hull** (`designs.ts`, `foilFerry`): a catamaran, 12.0 x 4.5 m, two deep-V hulls 3.3 m apart under a bridge deck 0.95 m up, 8.8 t with her 30 passengers aboard (about 6.3 t light, a battery of about 1.5 t, 2.6 t of people and luggage), 0.76 m on her hulls, KM 7.5 m.
- **Her foils** (`foilFerry.foils`, game axes): a main foil 3.9 m span x 0.42 m chord, in two halves, 1.3 m forward of amidships between two struts on her hulls' centrelines (it carries about 70 % of her weight); an aft foil 2.4 x 0.38 m, 5.4 m aft, on the centreline strut from her wet deck that carries her motor pod. 2.2 m under her waterline on her hulls; she flies her forward foil 0.8 m deep, her keels about 0.6 m clear. Take-off about 15.5 kn. Drawn in the hull study (`src/hulls/foilsMesh.ts`).
- **Hydrofoils in the physics** (shared, new `src/vessel/physics/foils.ts`, `VesselDef.foils`, `CONFIG.foils` in `config/vessels.ts`, called from `stepVessel`). Each foil panel is a wing at a point on her, through the physics port (the flow and depth machinery modules use):
  - its angle of attack from her speed, heave, pitch, roll and the waves' orbital motion; lift CL = 2 pi AR/(AR + 2) alpha (the forward foil's halves one wing), stalling at 12 deg; drag cd0 0.008 plus induced (e 0.9); lift lost near the surface, none once it breaks through;
  - each strut: drag on its wetted length, a side force against sideslip (a low aspect-ratio foil), its pod's drag;
  - her hull's resistance, damping and added mass already fade as she lifts clear (they go by immersion), so flying needs nothing more of the hull physics.
  - **Her flight computer** (stateless, each tick): the lift each panel should give, then the flap angle (+-12 deg) that gives it: the forward foil holds her ride height (its error capped at 0.2 m so she climbs steadily, easing off if her bow rises), its halves her roll (banked into turns, 0.7 of a coordinated turn's angle), the aft foil her trim. It takes over from 80 % of take-off speed. Heeled past 12 deg (a sea beyond her) it brings her down onto her hulls, still holding her level.
- **How she flies** (tests, a thrust at her pod standing in for her drive): on her hulls below about 12 kn; with about 11 kN or more she climbs over the hump onto her foils, her bow never more than about 3.5 deg up; **25 kn level at her ride depth on 4.7 kN, about 110 kW at the game's 0.55 propulsive efficiency** (2 x 90 kW or so of motor gets her over the hump); banks about 2 deg into a 2 deg/s turn, holding her height; rides the game's usual sea (crests to about 0.8 m) with no foil near breaking the surface (heel under 3 deg); in twice that sea she struggles and comes down onto her hulls now and then, as a 12 m foiler would; lands level (pitch within 1.2 deg) when her power comes off.
- **Tuning found on the way:** the forward foil's halves each given their own aspect ratio doubled their induced drag (fixed: one wing); the first take-off leapt 20 deg bow-up (the height error was uncapped); a too-small aft foil let her bow rise on landing (enlarged, its incidence matched); she leaned out of turns, her struts' side force deep under her rolling her outward (a stiffer roll gain, 12).
- **A physics fix found by her** (shared, `src/vessel/physics/sectionClip.ts`): a near-zero sliver of a hull section cut by the water could give a centroid hundreds of metres off her (its area cancelling where its moments didn't); a heeled catamaran in a steep sea hit one, and its lateral drag there spun her up in a tick until the numbers ran away. A centroid is now kept within its piece's bounds: no change for any proper section (the golden runs hold), a sliver does nothing.
- **To come:** her house and drive (electric pods), into the Shipyard as a one-off (the Shipyard chat), and her helm and flight controls in the game (the main game chat).
- **Checked:** typecheck, all tests; `tests/foils.test.ts` (flying level at 25 kn and its power, hullborne below take-off with flaps level, a gentle climb onto her foils, banking into a turn, the usual sea, landing level, the clipping fix), `tests/hulls/foilFerry.test.ts` (her hull and foil layout); screenshots of both views with her foils.
- **Shared changes:** new `src/vessel/physics/foils.ts`; `vesselPhysics.ts` (calls it for a boat with foils), `vesselDef.ts` (`foils?`), `config/vessels.ts` (`foils`), `sectionClip.ts` (the centroid kept in bounds).

### The solar catamaran redrawn after a design review; a catamaran's centre bow (owner)

- **On `next`** (27 Oct, the owner's word): merged with `origin/next`; typecheck and all 1663 tests pass. Step 2 (the Shipyard one-off) is with the Shipyard chat.
- **The owner** asked for a naval architect's review of her before step 2, then: make the changes, and "a wave piercing centre half hull would help, no?". Yes: it adds reserve buoyancy under the forward bridge deck just as the bows pierce a wave, so the forward wet deck slams less and the deck front doesn't dive into the back of a sea. Its keel is kept clear of calm water, so it costs nothing on solar power.
- **Her new lines** (`designs.ts`, `solarCat`): 16.0 x 5.2 m, hulls 0.545 m wide at the waterline 4.63 m apart, 10.7 t (the Shipyard's estimate again: 4.77 t of foam and plywood structure, her electric outfit as before), **0.86 m draught** (was 1.2), KM 8.8 m.
  - **Wet deck 1.0 m** over her waterline (was 0.75: about 0.06 L, for coastal water), her deck raised with it (1.45 m aft, 1.9 m at her bow).
  - **Sections:** near-upright sides down to a chine 0.6 m under her waterline, a moderate V (about 40 deg deadrise) below. Wetted surface **57.4 m2 (was 73.6, -22 %)**. A correction to the review's suggestion: with her beam held at 0.54 m, rounder sections (a half-ellipse) would save about 14 %, the moderate V more. So a single chine moved down does it, no two-chine bilge needed.
  - **Flare forward:** the chine narrows and rises in her forward third, her topsides flaring out over it, more freeboard there.
  - **Centre bow** (`catamaran.centreBow`: `drop`, `halfWidth`): a V half hull on her centreline from 62 % of her length to her stem, 1.8 m wide at the wet deck, its keel 0.5 m over her waterline at its lowest.
  - **Easily driven** (the game's catamaran resistance, cautious for hulls this slim; 0.55 propulsive efficiency): 2 kW 4.2 kn, 5 kW 5.7, 10 kW 6.9, 20 kW 8.4, 40 kW 10.0, 80 kW 11.8 (about 0.3-0.4 kn better than her first lines).
- **A catamaran's centre bow in the game** (shared, `vessel/hullForm.ts`, `vessel/view/hullMesh.ts`): her stations take three more points between the wet deck's corners (its sides' tops and its keel; thirteen in all, the port half's points still 0 to 4, as the Shipyard reads them), so her buoyancy, contacts and drawing all have it; the drawing's catamaran rules now go by the outline's length, not fixed indices. The hull study draws it too (`loft.ts` `centreBowDrop`). The fast catamaran, without one, is unchanged.
- **Checked:** typecheck, all tests; `tests/hulls/solarCat.test.ts` (her size, hull width, wet deck 1.0 m, weight and draught, KM; the centre bow clear of calm water and adding buoyancy when a wave reaches her wet deck; the game's volume, wetted surface under 60 m2, about 7 kn on 10 kW); screenshots from ahead and under her bows, both views.
- **Shared changes:** `src/vessel/hullForm.ts` (the centre bow's points), `src/vessel/view/hullMesh.ts` (catamaran edges by the outline's length).

### The solar catamaran, step 1: her hull, at the Shipyard's weight for her (owner)

- **The owner:** a new one-off to try solar and battery power, from renders and a scale model of a 16 m solar power cat (5.2 m overall, 0.54 m hulls), being built of foam and plywood, light; her weight unknown, so "use our shipyard algorithm to test it". Variable-angle solar panels on her sides. Our own lines of her size and type, not the real boat's.
- **Her weight, the Shipyard's way** (measured with the Shipyard's build on her lines as a catamaran hull type, in a scratch test):
  - as the fast cat is built (aluminium, twin diesels, a small wheelhouse): 18.1 t;
  - foam and plywood, at 16 kg/m2 of hull and 9 of house (against aluminium's 35 and 18, framing and bulkheads in): 11.7 t, her hull structure 4.75 t;
  - her electric outfit in place of the diesels, shafting and fuel (-3.35 t): two motors and pods +0.3 t, a 100 kWh battery +0.7 t, about 70 m2 of panels with frames and hinges +0.8 t, her long house in place of the small wheelhouse +0.85 t, no bulwarks or fenders -0.4 t: **about 10.7 t**.
- **Her lines** (`designs.ts`, `solarCat`): two hulls 4.62 m apart, 16.0 x 5.2 m overall, each 0.54 m wide at the waterline (L/b 28), 1.2 m draught, 10.8 t (Cb 0.53 a hull, Cp 0.83; KM 8.4 m). Near-upright sides to a chine just under her waterline, a deep V below; knife bows nearly plumb; square transoms for her pods; a flat bridge deck the full width, its underside 0.75 m over her waterline.
- **Easily driven:** on the game's catamaran resistance (tuned on the fast cat, so cautious for hulls this slim) and its propulsive efficiency, 2 kW at her motors makes 3.9 kn, 5 kW 5.3, 10 kW 6.6, 20 kW 8.0, 40 kW 9.7, 80 kW 11.4.
- **The hull study viewer's lines overlay** now draws a catamaran's lines on each hull (it drew one phantom hull on her centreline, the fast cat's too).
- **To come** (the plan agreed with the owner): into the Shipyard as a fixed one-off (the Shipyard chat), her tilting solar wings and foredeck rack (a mechanism: the modular builder chat), solar and battery power (the main game chat and the Shipyard), and her tender garaged between her hulls aft.
- **Checked:** typecheck, all tests; `tests/hulls/solarCat.test.ts` (her size, hull width and slenderness, wet deck, weight and draught, KM, the game's volume against her lines, 6-7.5 kn on 10 kW); screenshots of both views.
- **Shared changes:** none.

### The harbour tug, step 2: her fendering (owner)

- **Her fendering** (`src/hulls/fendering.ts`, her design's `fendering`), heavy black rubber as on harbour tugs, built on the game's own stations for her so it sits on her hull as the game draws it:
  - **side belts:** a D-fender (half-round, 0.3 m) just under her deck edge, `t` 0.05 to 0.88, and a smaller one (0.22 m) 0.65 m below it along her parallel body. 11.1 m over them (the real tug: 11.2 m);
  - **stern:** a cylinder fender (0.4 m) across her transom and round its rounded corners, to where her belts take over;
  - **bow:** a cylinder fender (0.4 m) round the top of her bow, shoulder to shoulder, and under it a row of block fenders (0.3 m wide, 6 cm apart, 0.3 m thick, 1.3 m deep) down towards her waterline, for pushing ships, the first on her stem.
  - About 1,800 triangles (her hull is about 2,300), one mesh (to merge with her hull in the game): first drawn at 3,000, cut to 1,800 by fewer facets round each tube (8 round a cylinder, 4 round a belt), with no visible difference.
- **Her sections upright** (`rake` 0): the game draws them so, and her fendering, built on the game's stations, then sits on the study's drawing of her too. Her stem's rake is her forefoot's profile.
- **Drawn only, in the hull study** (both views): her contacts with quays and ships, and her place in the game, come when she goes into the Shipyard (step 3). There the geometry can join the `hull.guard` module (the modular builder's) with probes like the strake's.
- **Checked:** typecheck, all tests; the harbour tug's test: 11.0 to 11.4 m over her fenders, centred, round her ends by under a metre, all above her waterline, under 2,000 triangles (the first stern cylinder ran too far up her quarters and stood 11.7 m wide: stopped at her transom's corners). Screenshots from the bow and stern quarters, ahead and astern.
- **Shared changes:** none.

### The harbour tug, step 1: her hull (owner)

- **The owner:** a larger harbour tug, a one-off complete design, from photographs (and models) of a 25 m azimuth stern drive (ASD) harbour tug and her data sheet: 25.0 x 11.2 m, 5.35 m draught to her pods, 2 x 1850 kW, 70 t bollard pull, 12.2 kn. Hull only for now; her drives (a new propeller and control system), house and fendering come later. Our own lines of her size and type, not the real tug's.
- **Her lines** (`designs.ts`, `harbourTug`): 25.0 x 10.5 m over her hull (11.2 m over her fenders, to come), 3.3 m draught, 494 t (Cb 0.59, Cp 0.69, Cm 0.86, Cwp 0.93; KM 5.8 m above her keel: GM about 2 m with her weight 3.8 m up).
  - **Plan:** a parallel midbody, a wide stern rounded at its corners, a blunt bow rounded in plan for pushing ships.
  - **Profile:** a strong sheer from 1.5 m amidships to 3.05 m at her bow; deep forward (3.3 m), her bottom rising aft in a long run to a transom 0.5 m under the water, room under it for her two drive pods (to about 5.3 m, as the real tug's).
  - **Sections:** a round bilge drawn as two chines close together (`section.bilge`), more flare forward.
- **A round bilge in the game** (`vessel/hullForm.ts`, shared): the game's stations are five points (keel, chine, deck edge each side). Using the bilge's lower point as the chine would have made her waterline about 7 % narrower (about a fifth off her stability), the upper one about 10 % of her volume. Her chine is now one point on her side line, below the bilge's upper point, placed so each section keeps the bilge's area (`bilgeChine`): her waterline breadth and her volume her lines' (the game's stations float 492 m3 against the study's 482: the study's sections are a little raked). Both bilge points are drawn (`Station.bilge`, `hullMesh.ts`).
- **Her bottom painted to her waterline** (`HullDesign.bootTop`, 0.05 m): a ship's boot top, not her chine (her bilge is under water). The paint line in the drawing is now general (`hullMesh.ts paintedTri`): each face of her sides, bottom and transom is cut along the line, her bottom's colour below and her topsides' above. This replaces the special case the plumb bows had (their tests still pass).
- **Checked:** typecheck, all tests; `tests/hulls/harbourTug.test.ts` (her size, fullness, stiffness, profile, the game's volume and waterline breadth against her lines, floating level, her paint at her waterline); screenshots of the hull study and "As the game draws her" from the bow, side, stern, ahead, astern and under water.
- **Shared changes:** `src/vessel/hullForm.ts` (`Station.bilge`, `bilgeChine`), `src/vessel/view/hullMesh.ts` (the bilge drawn; the paint line cut generally). Nothing changes for a hull without a bilge or a paint line.

### Plumb and straight bows drawn whole, with a forefoot radius; the catamaran takes the bow choice (owner)

- **The owner:** the straight-raked or plumb bow left missing facets on some hull forms; a plumb bow should be straight down, then a nice radius at the bottom. On the pilot boat, the gillnetter and the catamaran (and the trawler, which has the bow choice too); not the tug.
- **The missing facets:** the drawing turns each face of her sides and bottom to look outward by checking it against a point on her centreline halfway down her side. In a fine plumb bow a high topsides face, close to that point and leaning forward, read as facing in and was turned round, so it couldn't be seen from outside: a hole. Found on the pilot boat's plumb bow (every size) and the gillnetter's first rake step when narrow. Now each side and bottom face is checked against her centreline (a demihull's, on the catamaran) at its own height, wherever it leans out sideways (`vessel/view/hullMesh.ts`, `tri`'s `axisX`). A test builds the four bowed types at every bow step, four sizes, with and without more sheer, and finds no side or bottom face turned in (it fails on the old code).
- **The plumb bow's shape** (`shipyard/parts/catalog.ts bowKeel`): a stem raked no more than `CONFIG.shipyard.bow.straightUpTo` (12.5 deg: plumb and the first step) is now straight from the stem head, rounded into the keel by a circular forefoot radius, `forefootRadius` (0.3) x the stem's height from keel to stem head: about 0.7 m on the 14 m pilot boat, 0.55 m on the gillnetter. Before, a plumb stem met the keel at a sharp corner. More rake keeps the full curved stem the owner chose earlier.
- **Stations round the radius:** 25 stations put at most one in a 0.7 m radius, so it read as a corner. A station at the radius's foot and `radiusStations` (1) halfway round it, by its angle (`HullDesign.extraStations`, `hulls/loft.ts`), only on these straight-stemmed bows (plus one where a 12.5 deg stem meets the radius): 27 or 28 stations instead of 25. The owner, watching: keep it cheap, the forefoot is under water, no need for a fine radius. Measured: each station is about 85 triangles on her hull (her sides, deck, bulwarks and rails follow the stations); with 3 round the arc the pilot boat's hull went from 2119 to 2463 triangles, with 1 it's 2291 (+8 %). None for the more raked bows.
- **Her paint line straight to her stem** (owner, from screenshots of the gillnetter and the catamaran: "fix the vertex painting so the line is straight like the pilot boat"). Her bottom paint ran up to her chine, and on the gillnetter, the trawler and the catamaran the chine is measured from the keel as cut, so it sweeps up the stem with the forefoot in the last metre, and the paint went with it. Her shape is unchanged; her paint line is now her chine as it would run on the uncut keel (the pilot boat's chines already run that way): `HullDesign.paintKeel` (`hulls/loft.ts`, set by `scaledStudy` where the chines aren't run on), `Station.paintY` (`vessel/hullForm.ts`, where it's under her chine), and the drawing splits her bottom panels there, her topsides' colour above (`hullMesh.ts`). Where her keel rises through the line in her forefoot's last bay, the bottom paint stops where they cross. The game's own boats, the tug and the landing craft have no paint line of their own: unchanged. A test: no bottom paint forward of a tenth of her length from the stem more than 2 % of her length above her chine there (the gillnetter's went 0.46 m above it before, on a 9.75 m hull).
- **The catamaran takes the bow choice** (she had her own bows): plumb as she comes, as most work cats. Her bow rake handle sits at her starboard hull's stem (`shipyard/handles.ts`). Shipyard trials, defaults (twin 400 kW): plumb 29.5 kn (was 29.7 on her own bows), 25 deg 29.1 kn.
- **Speeds otherwise unchanged:** pilot boat plumb 36.2 kn (36.1), gillnetter 11.4 kn (11.4), trawler plumb 10.6 kn (10.4).
- **Checked:** typecheck, all 1451 tests (with 3 radius stations; with 1, the typecheck, the hull tests and all the Shipyard tests again); Shipyard screenshots of the pilot boat, gillnetter, trawler and catamaran, plumb and 12.5 deg, from the side and from under the bow quarter: no holes, the stem straight with a rounded forefoot.
- **Shared changes:** `src/vessel/view/hullMesh.ts` (which way her side faces look; every boat's drawing, the hull faces otherwise as before; her paint line split), `src/vessel/hullForm.ts` (`Station.paintY`). In the Shipyard's files (told the Shipyard chat): `shipyard/parts/catalog.ts` (`bowKeel`'s straight stem and radius, its extra stations; `paintKeel` in `scaledStudy`; the catamaran's bow choice), `shipyard/handles.ts` (the bow handle on the catamaran), `config/shipyard.ts` (`CONFIG.shipyard.bow`), and the two Shipyard tests that expected the catamaran to have no bow choice (`tests/shipyard/build.test.ts`, `handles.test.ts`).

### (From the modular-builder chat) The stern trawler's sheer a little less

At the owner's word ("slightly less shear by default"), in the modular builder's chat: `designs.ts`, `sternTrawler`'s sheer now 2.1 m at the stem and 1.25 m at 70 % of her length (was 2.45 and 1.35); aft unchanged. The Shipyard's Sheer still adds more. Its tests (`sternTrawler.test.ts`) pass: no warnings, level on her lines.

### The catamaran redrawn for her real weight; a displacement hull's resistance; publishing runs finish (owner)

- **On `next`** (23 Oct, the owner's go-ahead): merged with `origin/next`; typecheck, all 1415 tests and the build pass. The Shipyard chat now wires the displacement curve in, re-measures the tug and trawler, and checks the catamaran's weight (its engine power limit, `CONFIG.shipyard.maxKwPerTonne`, is on `preview/shipyard`).
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

