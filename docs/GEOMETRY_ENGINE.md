# The geometry engine: a critique (October 2026)

The owner asked two things, after the Alaskan 38 and the outboard module:

1. Is there a geometry engine I can use to build vessels quickly from photographs?
2. Does it have what it needs to be an efficient parametric builder in the Shipyard, with more and
   more options added over time? And is there a better way to share designs than the typed code?

**Short answer:** for hulls, yes. For superstructures and interiors, no. The hull side is a real
parametric engine; everything above the deck is a set of special cases that grows by hand. And the
design code is what will most limit how many options can be added.

## What already works

- **The lines plan is the right foundation.** A hull is a handful of curves along her length:
  half-breadth, sheer, keel, stem rake, chine breadth and height, flare, bulwark
  (`src/hulls/loft.ts`). Those are a lines plan's own terms. The game lofts them into stations,
  then floats, trims and trials whatever comes out. The Alaskan's hull went from photographs to a
  floating, trimmed boat quickly this way; only her mass needed tuning.
- **Physics follows the geometry.** Change a curve and her buoyancy, stability, resistance and sea
  trials all follow with no extra work. That is what a parametric builder needs, and it is true now.
- **The modules really are modular.** Engines, steering, deck gear and instruments fit sockets on
  any hull. The outboard module went onto all five Shipyard hulls with no hull-specific code.
- **Shapes made by bending, not rebuilding.** Window rake, the three-facet front and the raked-out
  windows are distortions applied to a plain box (`frontRake`, `facetDz`, `houseFlare`), so they
  combine freely. That technique is worth extending.

## Where it runs out

- **Five points per section.** Each station is keel, chine and deck edge each side
  (`src/vessel/hullForm.ts`). Round bilge, a true second chine, catamarans and forecastles exist in
  the hull study, but the game refuses them. Spray chines and spray rails are drawn but don't count
  in the physics.
- **One house, as one box.** About 18 files assume a single rectangular wheelhouse
  (`layout.wheelhouse`): walking, doors, rain on the glass, cargo space, the fuel filler, engine
  sound inside, hiding detail from outside. The deckhouse, floor levels, floor holes and the deck
  opening are patches on top of it. The Alaskan's two-level house, wings and trunk cabin had no parts
  to build from, so about 600 lines of boxes were drawn by hand (`src/boats/alaskan38/view.ts`).
  Hence, for photographs: hulls are quick, superstructures are slow.
- **The Shipyard builds with one long recipe.** One function of about 1,500 lines
  (`src/shipyard/build.ts buildDesign`) scales one of five base hulls, places every module by
  hand-worked offsets from the house, then patches a copy of the landing craft's recipe socket by
  socket. Every new option touches it in several places, and options bump into each other (the
  faceted front has to shift the breaker panel's place, for example).
- **Interiors aren't parts.** The galley, berths and seats were drawn for one boat.

## The design code

The code (`src/shipyard/design.ts`) was right for its job: typing a design into VR with no server.
But it is what will throttle parameters:

- every choice must be a whole-number step on a fixed scale: no free values, no lists ("a window
  here, another there"), placement only on a 25 cm grid;
- each new option is squeezed in at the top so old codes still read; it is at version 20, and the
  reader carries ten old formats for good;
- the code grows a few characters with each option.

**Better:** make each design a **document**: named parameters and parts, real numbers allowed, a
version number, and a default for anything missing, so adding an option never breaks an old design.
Shared three ways, none needing a server or a new library:

1. **Design together** already links players: send the whole document over it. Also the easiest
   way into VR: design on the desktop, the headset picks it up.
2. **A link**, the document compressed into the address with the browser's own compression: a few
   hundred characters, fine to paste or message, not to type.
3. **Old typed codes** keep reading; new designs don't need them. (A short typed code pointing at a
   stored design would need a server: a paid-service decision for the owner.)

## Suggested order

1. **Design document and link sharing.** Small; unblocks everything else.
2. **A superstructure kit.** Replace "the wheelhouse" with a list of parts: house blocks (length,
   width, height, floor level, front style, window layout, roof overhang) in a row or stacked, a
   trunk cabin, an overhead with wings, later a flybridge. Each part declares its own floor, walls
   and openings; walking, doors and rain read the list. The biggest piece, and the one that makes
   photographs fast.
3. **Richer sections**, at least for the physics: round bilge, a true spray chine, more stations.
   Catamarans after.
4. **Places from parts, not offsets.** Each part offers its own sockets (helm spot, wall panels,
   roof mounts), so modules find their place instead of the Shipyard working it out.
5. **Interior parts.** Berth, settee, galley run, seat, locker, head, each placed on a floor level.

## Photographs, afterwards

With the first three in place: the owner sends profile, plan, bow and stern shots; the hull curves
are fitted (already fast) and superstructure parts picked and sized. The result is a design opened
in the Shipyard and adjusted there with sliders, not a one-off that only code can change. Today a
boat from photographs is either a one-off like the Alaskan, or a rough Shipyard version limited to
five hull types and one box house.

Nothing in this document has been started; it is for the owner to decide on.
