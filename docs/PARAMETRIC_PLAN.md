# Parametric boats: the plan (owner, October 2026)

From the critique in [`GEOMETRY_ENGINE.md`](GEOMETRY_ENGINE.md). The goal: design many kinds of
vessel in the Shipyard by parameters, add options freely over time, and turn the owner's
photographs into Shipyard designs (not one-off code). Each milestone goes to `next` for the owner to
try before the next starts. Sizes: S a day or so, M a few days, L a week or more.

The order matters: each one makes the next cheaper.

## P1. The design document (S-M): done, awaiting owner test

**Why first:** the typed code holds only whole-number steps on fixed scales, every new option is
squeezed into it, and every place a design travels (the game's address, crew joining a host,
favourites, Try her together) carries that code. Until a design can travel as a document, no
option can be a free value or a list.

**What it is:** a design as named fields with a format name and version:
`{ "format": "swvr.design", "v": 1, "name": "...", "design": { "hull": 3, ... } }`.

- **No backwards compatibility** (owner, Oct 2026: "if all of the older ships I've made in the
  Shipyard break, it doesn't matter"). A field a document lacks is today's starting design's; codes
  from before version 10 (shorter than 17 characters) no longer open, and their nine old readers are
  gone. This holds for the whole plan: each milestone may change the format freely.
- **Reading is forgiving and says so:** an unknown field (from a newer Shipyard) is skipped with a
  warning; a value off its scale is brought onto it with a warning; nothing throws.
- **A design token** is what travels wherever a code travels today: her short code while one can
  hold her, else `doc.` and the document, compacted (only fields that differ from "as before") and
  written in URL-safe characters. Every reader takes either, so the day a design can't be coded
  (P2's free values), nothing else needs to change.
- **Sharing:** the Shipyard gets **Copy link** (her document in the address: paste it in a message;
  it opens the Shipyard on her, with her name), **Save file** and **Open file** (a small `.json`
  file: the format a design made from photographs will come in). The typed code stays for VR, and
  every old code and link still opens.

**Done when:** every code reader and writer goes through the document (game start, crew joining,
favourites, the Shipyard's address, open box and Try her together, stored projects and Design
together); link, file and code round-trip every design; tests and the full suite pass; the owner
can copy a link, open it on another machine, save and open a file.

## P2. The superstructure kit (L, in three stops)

**Why:** one rectangular wheelhouse is assumed in about 18 places, so every other shape is a patch.

- **P2a, houses as a list (M): done.** the layout's single `wheelhouse` becomes a list of house parts
  (length, width, height, floor level, front style, window layout, roof overhang), each with its
  own floor, walls and openings. Walking, doors, rain on the glass, cargo room, hiding detail and
  the sound inside read the list. Today's boats become one-part lists and must come out identical
  (tests compare them). No visible change.
- **P2b, more than one house in the Shipyard (M):** a pilothouse and a saloon in a row, or a
  pilothouse raised on a deckhouse; the step between floors made automatically; a cockpit
  overhead with wings; the eyebrow's two-colour roof. The design document carries the list (the
  first thing the code couldn't).
  - **First stop, done (awaiting owner test): a saloon aft of the wheelhouse.** The house runs on
    aft under one roof (one house with its floor at two heights, as the Alaskan's is built, so
    walking, doors, rain, sound and cargo needed nothing new), the saloon's floor level or one to
    three steps down, the treads made automatically. Two plain choices in the code (version 23),
    so no list was needed yet: the list comes with the first design that has houses apart.
  - **Second stop, done (awaiting owner test): the saloon's own, lower roof, and the eyebrow.**
    The saloon's roof one to three 0.2 m steps below the wheelhouse's, a step in the roofline at
    the wheelhouse's aft end, its windows coming down with it (`wheelhouse.saloonRoof`,
    `houseRoofAt`); and the roof's top in a second colour, a panel set in from its edges.
    Two more plain choices in the code (version 25).
  - **Third stop, done (awaiting owner test): a cockpit overhead with wings.** The house's aft
    roof carried on aft over the working deck (`design.overhead`, up to 4 m), on a curved wing
    each side; fitted round the deck gear, walked under, its weight and price counted
    (`layout.overhead`, `wingCurveY`). Not in the short code: she travels as a link or file.
  - **Still to come:** a pilothouse raised on a walkable deckhouse (today's deckhouse is solid).
- **P2c, a trunk cabin with a cabin below (M):** the deckhouse becomes a walkable trunk cabin, the
  deck cut away beneath it, a fore cabin and a companionway (the layout fields from the Alaskan:
  floor holes, extra floors, hollows, the deck opening).

## P3. Richer sections (M)

Round bilge, a true spray chine and more stations in the physics, not only drawn; a sixth base
hull, the expedition / sport-fishing hull from the Alaskan's lines, with deadrise, sheer and flare
sliders. Catamarans after, if wanted.

## P4. Places from parts (M)

Each house part and hull feature offers its own sockets (the helm spot, wall panels, roof mounts,
the transom), so modules find their place instead of the Shipyard working out offsets. This is
also when the Shipyard's one long build function is broken up by part.

**A first piece of it, done early (owner, Oct 2026, during P2a):** the engine is placed from her
layout. Her shaft line (shipyard/machinery.ts) puts the engine; the game draws it there (the
Shipyard's own engine model), carries its weight there, and cuts the engine hatch and engine space
over it, in the deck or the cabin floor, clear of her deck gear. The fake engine box under the
wheelhouse is gone from Shipyard boats (the built-in workboat and landing craft keep theirs).
What's left for P4: the hatch, dipstick and oil can as places the engine module offers, not
offsets build.ts works out.

## P5. Interior parts (M)

Berth, settee, galley run, seat, locker, head with a door: placed on a floor level, each a
furniture part with its footprint for walking.

## P6. Photographs to designs (S each time, once P1 to P3 are in)

The owner sends profile, plan, bow and stern photographs; the hull's curves are fitted and the
superstructure parts chosen and sized; the result is a design file he opens in the Shipyard and
adjusts there. The Alaskan 38 is redone this way as the first test, and compared with her one-off.

## Not in this plan

A server to hold designs under a short code (it would need hosting: a paid-service decision), and
the mobile and free-sail games (separate owner decisions).
