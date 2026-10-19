# What the Alaskan 38 asks of the Shipyard's library

The Alaskan 38 was built as a **one-off** (October 2026): her hull lines, her superstructure and
her interior are her own geometry (`src/boats/alaskan38/`), and only her working parts are the
game's modules. The owner asked, once she was built, what **parametric shapes** the Shipyard's
library would need so that a boat of this kind could be designed there, by sliders and
choices, like the workboats, tugs and landing craft it builds today.

This is that list. It is written from what her one-off code had to do by hand. For each item:
what she has, what the Shipyard has now, what a library version would be, and roughly how big a
job it is (S: a day or so; M: a few days; L: a week or more, with the owner's eye on it).

Where a piece was built in a general way already, so the library could pick it up as it stands,
it says so. Several were: the one-off was built to leave as little as possible behind as
one-off code.

## 1. The hull

### 1.1 A deep-vee planing hull with a flared, raked bow (M)

- **She has:** a lines plan in the hull study's form (`alaskan38/design.ts`): hard chine, deadrise
  from about 18° at the transom to a deep vee forward, a stem raked about 25°, a strong sheer
  from low freeboard aft to a high flared bow, the keel sweeping up to a forefoot.
- **The Shipyard has:** five base hulls (landing craft, gillnetter, workboat, pilot boat, small
  tug), each scaled in length, beam and depth, and a stem rake slider (plumb to 50°) that
  reshapes the bow. It can't change deadrise, sheer or flare.
- **Library version:** a sixth base hull, **expedition / sport-fishing**, from her lines
  (`DESIGN_HULLS`), with the existing length, beam, depth and bow sliders. That alone gets most
  of the way. Beyond it, three new hull sliders would make this family parametric rather than
  one more fixed hull: **deadrise at the transom** (flat to deep), **sheer** (how much the deck
  rises forward) and **flare at the bow** (upright to flared). Each is a scaling of one curve in
  the lines plan (`section.chineHeight`, `sheer`, `section.flare`), so the hull study's
  `loft()` does the work; the Shipyard's hydrostatics, trials and warnings already run on
  whatever stations it is given.

### 1.2 Spray rails (S)

- **She has:** two rails along the topsides at set shares of the way from the chine to the deck
  edge, carried round the stem, drawn as bars between stations.
- **Library version:** a hull choice, **spray rails: none / one / two**, drawn the same way for
  any base hull (the code is already general: it reads only the stations). Worth adding a
  little **lift** in the physics for planing hulls when it comes: spray rails are what keep a
  deep vee dry and let it ride higher, and the Shipyard's trials would show it.

### 1.3 Outboards on a bracket (L)

- **She has:** twin outboards drawn on a welded bracket off the transom with a swim platform and
  rail, **driven by the inboard diesel module** placed at the propellers and steered by the
  rudder module standing in their lower units. Her thrust and handling are right; the drawn
  engines are not the module.
- **The Shipyard has:** inboard engines only (four packages, single or twin, with the shaft laid
  from the propeller at a set angle), and the skiff's electric outboard module.
- **Library version:** an **outboard engine module** (`propulsion.outboard`): a petrol engine
  whose propeller, gearcase and steering are one unit, so it fits a new socket type
  (`transom.outboard` or `bracket.outboard`) and **steers by turning**, with no rudder module.
  Its physics is the diesel module's engine model with a petrol torque curve, a higher rev
  range and a gear in the lower unit, plus the thrust vectoring the skiff's outboard already
  has. Trim (tilting the leg) could come later. Its view is her outboard geometry, made a
  module view. With it, a **bracket** becomes a hull option (**transom: plain / bracket with
  platform**): a buoyant box the hydrostatics count (it moves the centre of buoyancy aft and
  adds waterplane), carrying one to three outboard sockets. The Shipyard's engine step then
  offers **inboard / outboard** and sizes the bracket to the engines chosen.

## 2. The superstructure

### 2.1 Two roof levels: a raised pilothouse and a lower saloon (M)

- **She has:** a pilothouse standing high forward with its own eyebrow roof, and the saloon's
  roof lower, running aft from the pilothouse's aft wall; the pilothouse aft wall above the
  saloon roof carries a band of aft-facing glass. Walked as one house box with **floor
  levels** (`WheelhouseLayout.levels`, new with her: the walk area's floor height is a function
  of position along the house).
- **The Shipyard has:** one house with one floor height and one roof.
- **Library version:** a **two-part house**: the pilothouse (length, headroom, floor height)
  and the saloon (length, headroom, floor height) in a row, each with the existing roof
  options, the step between their floors made automatically (a tread every 0.31 m). The
  layout fields exist (`levels`, the roof drawn per part); the Shipyard's `build.ts` would
  place two boxes instead of one and the walk area needs nothing new. The console stays in
  the pilothouse; module places follow the part they belong to.

### 2.2 The roof carried aft over the cockpit on wings (S)

- **She has:** the saloon roof carried aft over the cockpit to the hull's full width, on a
  curved wing each side (the house side swept from the deck up to the roof's aft edge), with
  grab handles.
- **Library version:** a house choice, **cockpit overhead: none / short / long**, drawn as her
  code draws it (its length and the wing's foot are two numbers already in config:
  `house.overhead`). Walkable deck under it; nothing walked on top of it unless the owner
  wants the tender there (see 4.2).

### 2.3 The eyebrow: a roof slab in its own colour with a visor (S)

- **She has:** each roof a tan slab with a light-grey top set in from the edge, reaching
  forward over the raked front glass.
- **The Shipyard has:** a roof slab with a visor, its thickness and edge rake, and a roof
  colour choice. It is nearly there: the missing piece is the **inset top in a second
  colour** (the eyebrow effect), one more paint choice.

### 2.4 The three-facet, reverse-raked front (done)

- **She has:** it. **The Shipyard has:** it (`facets`, `windowRake`). Her front is built from the
  same `frontRake` and `facetDz` shears as the Shipyard's, so the rain glass and wipers fit.

### 2.5 A sliding door in the pilothouse side (S)

- **She has:** one drawn shut, to starboard.
- **The Shipyard has:** a sliding side door to **port** (the game's side door is a port one).
- **Library version:** let the side door choose its side, and make it a door (the game's
  `WheelhouseDoor` with a `side` parameter; the walk area already takes `sideDoor.z0/z1` and
  would take a side).

### 2.6 Side windows in sections, sliding panes (S)

- **She has:** the glass band split by mullions into the pilothouse's pane and the saloon's two.
- **Library version:** a window layout choice per house part: **one pane / two / three**, with
  a sliding middle pane drawn as a frame inside the band. Drawing only.

### 2.7 Tinted glass (S)

- **She has:** her glass as a second see-through mesh, tinted (`glass.colour`, `opacity`).
- **The Shipyard has:** open window frames (no glass).
- **Library version:** a choice, **glass: clear (open frames) / tinted**, the tinted glass her
  mesh. One more draw call per boat; worth checking on the Quest at night before offering it.

### 2.8 A trunk cabin on the foredeck with a cabin below (M)

- **She has:** a trunk cabin following the deck edge, set in to leave side decks, tapering
  forward, with a glass hatch; the deck cut away under it (`layout.deckOpening`, new) and
  the fore cabin open up into it. Her trunk top is walkable.
- **The Shipyard has:** a deckhouse under and forward of the wheelhouse (`dhLength`,
  `dhHeight`, `dhWidth`, `dhRake`): a solid box, not walked on, with nothing under it.
- **Library version:** make the deckhouse a **trunk cabin** option: its top walkable, the deck
  cut away beneath it, and a **fore cabin** below (see 3.2). The deckhouse already has the
  length, height, width (set in or full width) and front rake sliders; the inset and the
  taper forward would be two more.

## 3. The interior

### 3.1 The helm to one side with a companionway beside it (M)

- **She has:** the console module's dash to starboard on a console body her code draws, and to
  port an opening in the pilothouse floor (`floorHoles`, new) with three treads down forward
  under the dash (`extraFloors`, new) into the fore cabin.
- **The Shipyard has:** the console across the full width of the house.
- **Library version:** a helm choice, **console: across / to starboard / to port**, the console
  module placed and sized accordingly (its socket's capacity is already how wide it may be),
  the body drawn for that span; and with a fore cabin (3.2), the **companionway** on the other
  side, its treads made from the floor-to-sole drop (one per 0.31 m). The layout pieces exist.

### 3.2 A fore cabin: sole, V-berth, locker, lining (M)

- **She has:** a sole at the design waterline, in two pieces as the hull's vee comes up under it
  forward; a V-berth platform and cushions following the hull; a hanging locker; a lining
  turned to face inward (the hull's inside is drawn one-sided, so a cabin needs its own
  inner skin); open space declared (`hollows`, new) so your head isn't "inside the boat".
- **Library version:** a **cabin below** option under the trunk cabin, sized from the hull: the
  sole where the vee allows a given width, the berth forward of a given station, headroom
  read from the trunk's height and warned about in the brief (as the engine's fit is). The
  lining and berth builders read only the hull's deck edge and the trunk's sizes, so they
  carry over. A **head compartment** (a box with a door, to one side) is the obvious next
  piece and wasn't built.

### 3.3 A galley and a dinette (S)

- **She has:** a counter along the saloon's starboard side (sink, tap, stove, fridge door) and an
  L of settees round the **chart-table module**, which is her dinette table; the duty board
  and whiteboard on her walls.
- **The Shipyard has:** the chart table as a choice on the port wall, the boards in the
  advanced package.
- **Library version:** two saloon choices, **galley: none / starboard / port** and **dinette:
  none / port / starboard** (the dinette bringing the chart table as its table). Drawing
  only; the chart table's footprint already keeps the walk area clear of it.

### 3.4 Ceiling linings (S)

- **She has:** a light lining under each roof, set in from the walls. **Library version:** draw
  it for every house (the roof slab's underside is the roof's colour today).

## 4. Deck gear and fittings

### 4.1 The radar dome and rod rack (S)

- **She has:** both drawn on the roof. **Library version:** roof-mount modules (`roof.mount`
  sockets exist for the searchlight and horn): a **radar dome** (drawing, and later a radar
  screen in the console if the owner wants one) and a **rod rack** (drawing). Placeable like
  the searchlight is.

### 4.2 The tender on the overhead with its crane (M)

- **She has:** nothing on the overhead yet. The boat carries her tender there under a cover,
  with a cooler, launched by a small crane.
- **The Shipyard has:** the skiff in a cradle with her crane, on the foredeck or aft deck.
- **Library version:** let the skiff's cradle and crane be placed **on the cockpit overhead**:
  the cradle socket at roof height, the crane's column on the roof edge, the overhead made
  walkable for the launch (an extra floor), with a ladder or steps up from the cockpit. The
  modules exist; it is a placing problem, and a check that the roof is long enough.

### 4.3 Grab handles, roof grab rails, a bow rail (S)

- **She has:** all three drawn from a few numbers. **Library version:** the **bow rail** as a
  choice against the existing bulwark rails (a rail standing on a low bulwark forward), the
  roof grab rails with the overhead (2.2), the wing handles with the wings.

### 4.4 A swim platform with steps and a transom gate (S, with 1.3)

- **She has:** on the bracket. **Library version:** comes with the bracket option; on a boat
  without one, a bolt-on platform at the transom is the same drawing at a different height.

### 4.5 An anchor roller at the stem (S)

- **She has:** a plain roller drawn at the stem. **The Shipyard has:** the anchor and windlass
  module at the bow roller. They should be the same fitting: give the module her roller's look
  on a flared bow.

## 5. What the game itself gained from her (already general)

These were built for her but as plain layout fields any boat can use, so the Shipyard can
start using them without new drawing code:

| Field | What it does |
|---|---|
| `wheelhouse.shell: 'oneOff'` | The hull mesh draws only the console body (or nothing); the boat's own builder draws the house. |
| `wheelhouse.levels` | The house floor on more than one level along it; walked, with the door, inside test and interior detail reading the level there. |
| `wheelhouse.floorHoles` | Openings in the house floor (a companionway): not walked. |
| `layout.extraFloors` | Level rectangles of floor anywhere (treads, a sole, a trunk top), walked like any floor. |
| `layout.hollows` | Boxes of open space below decks, so your head is in the open there. |
| `layout.deckOpening` | The deck cut away forward of the house, set in from the edge (a cabin under a trunk cabin). |
| `boats/oneOffViews.ts` | A table of boats whose geometry is their own, by vessel id: one place to add the next one-off. |

## 6. A suggested order

1. **Spray rails, the eyebrow's inset top, ceilings, the bow rail** (all S, drawing only): quick
   wins that make every Shipyard boat look more finished.
2. **The expedition hull as a sixth base hull** (M): she becomes a Shipyard choice at once,
   with the inboard engines she can already take.
3. **The two-part house and the cockpit overhead** (M + S): the shape that makes this kind of
   boat recognisable.
4. **The trunk cabin with a fore cabin and the companionway** (M + M): the interior that makes
   her a boat you live on.
5. **The outboard module and the bracket** (L): the biggest piece, and the one that changes
   the physics; best done when the owner wants outboards on other boats too.
6. **The tender on the overhead, the radar and rod rack, the galley and dinette** (M, S, S).

Nothing on this list needs the simulation to know about drawing, and nothing needs a new
physics body except the bracket's buoyancy (which the stations' hydrostatics can take as more
stations) and the outboard's thrust (which the skiff's outboard already models).
