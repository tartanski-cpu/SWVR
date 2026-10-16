# Pipeline: Reference Boats → Hulls, Superstructures and Module Catalogue

> The owner's brief for a research side task, saved as given (October 2026). It names `plan-modular-boats.md`; in this repository that plan is `docs/MODULAR_BOATS.md` (on the `next` branch). Claude's reply, with the questions to settle before any code, is `docs/PIPELINE_PROPOSAL.md`.

---

## Purpose

I want a repeatable pipeline that takes **reference material about real boats** (photos, spec sheets, vessel reviews, plus a few game-workshop interior screenshots) and produces two things for the game:

1. **Hull and superstructure shells**: low-poly, flat-shaded hull definitions with sockets, that players and I can plug modules onto. The shell is independent of what goes inside it.
2. **Module catalogue growth**: when the references show equipment we don't have yet (a deck crane of a certain size, a multi-touch bridge display, a bow thruster panel), the pipeline proposes and builds those as new modules in the catalogue, so later boats can reuse them.

A friend does this for a blocky space game by pointing Claude Code at a workshop gallery. Our boats are curved low-poly hulls with real handling numbers, so **real boats are the primary reference** (they come with specifications), and workshop screenshots are used only for interior and wheelhouse layout ideas, which real listings rarely show.

**Before writing code:** read `PROGRESS.md`, `plan-modular-boats.md` (the hull, socket, module and recipe contracts are the output format of this pipeline) and the existing hull and module code. Then propose the folder layout, the brief schema, and the milestones. Wait for my go-ahead. After each milestone, stop, tell me how to test it, update `PROGRESS.md`, and wait for feedback.

## Stage 1: Gather (semi-manual, scripted where possible)

Reference material lives in `reference/boats/<boat-slug>/`:

```
reference/boats/rebel-lander-7m/
  README.md        source URLs, licence notes, what this boat is
  specs.yaml       length, beam, draught, displacement, payload, engines, speed, crew, year, builder
  photos/          exterior and interior images (jpg/png), named by view: bow-quarter.jpg, profile.jpg, deck-aft.jpg, wheelhouse.jpg ...
  interiors/       optional workshop screenshots for cabin/bridge layout inspiration, clearly separated
```

- I'll gather most of this by hand from builder sites, brokerage listings and vessel reviews (Baird Maritime, Damen, Meercat, Safehaven, Macduff, and so on). Write a small helper script that, given a URL, saves the page text and any image URLs into a new boat folder for me to curate, respecting robots.txt, so I can fill a folder in minutes.
- **Licensing:** reference images are for study only and are never shipped with the game or committed to a public repo. Keep `reference/` in `.gitignore` except for `specs.yaml` and `README.md`, which are facts and notes we wrote.
- A `reference/boats/index.yaml` lists boats with type tags (`workboat`, `landing-craft`, `pilot`, `crew-transfer`, `trawler`, `tug`, `rib`) and a "done" status per pipeline stage.

## Stage 2: Describe (Claude Code reads the folder and writes a brief)

For each boat folder, produce `brief.yaml`, a structured design brief with a fixed schema. This is the real asset: it turns pictures into parameters, and it is what the generator works from. Keep it human-readable so I can correct it.

```yaml
id: rebel-lander-7m
type: landing-craft
dimensions: { loa_m: 7.0, beam_m: 2.4, draught_m: 0.2, displacement_t: ~1.6, payload_t: 1.25 }
hull_form:
  bottom: flat            # flat | hard-chine | round-bilge | deep-v | catamaran
  bow: ramp               # ramp | raked | plumb | flared | bulbous
  stern: transom
  sheer: straight         # straight | moderate | pronounced
  freeboard: low
  template: landing-craft-a   # which hand-made hull form template to scale (see Stage 3)
superstructure:
  wheelhouse: { position: aft-offset-stbd, style: open-console | small-cabin | raised-cabin, windows: 5 }
  masts: [collapsible-mast]
deck_layout:
  zones: [ { name: cargo-deck, from_frac: 0.15, to_frac: 0.8, clear: true } ]
  equipment:            # observed gear → candidate modules
    - { kind: bow-ramp, size: full-width, actuation: manual-winch }
    - { kind: winch, count: 2, position: bow-quarters, size: small }
    - { kind: bollard, count: 4 }
    - { kind: davit, size: small, position: stern-port, optional: true }
interior:                # from interior photos or workshop references, if any
  bridge: { displays: [chartplotter-10in, engine-gauges-analog], controls: [throttle-single, wheel-small, trim-switches] }
propulsion: { type: outboard, count: 1, power_kw: 59, speed_kts_max: 25 }
sockets_suggested:       # where the generator should put sockets, in hull-fraction coordinates
  - { type: bow.ramp, at: [0.98, 0.0, 0.3] }
  - { type: deck.equipment, at: [0.85, 0.9, 0.5], capacity_t: 0.3, tags: [winch] }
  - { type: helm.console, at: [0.25, 0.6, 0.9] }
notes: free text observations about character and handling
```

- Claude Code reads the photos directly (it can view images) plus `specs.yaml`, and fills the brief. Where a value is estimated from a photo, mark it `~`. Where specs give it, use the spec.
- **Second pass, catalogue matching:** compare every `deck_layout.equipment` and `interior` item against the current module catalogue (`modules/index.yaml`). Output `catalogue-gaps.yaml` per boat: items that match an existing module (with the module id), items that are a size variant of one (propose a config), and items that need a **new module**.

## Stage 3: Generate shells (hull + superstructure, no modules)

Output per boat: a hull definition that satisfies the Hull contract, as code or data the existing assembler loads.

- **Hull form templates:** photos are good for proportions and bad for curves, so keep a small library of hand-made parametric hull generators (`flat-bottom-landing-craft`, `hard-chine-workboat`, `round-bilge-trawler`, `deep-v-pilot`, `catamaran`), each taking length, beam, draught, freeboard, sheer and bow/stern style. The brief picks and scales a template; Claude Code tunes parameters until a side-by-side render matches the profile and bow-quarter photos. Render those comparison images into `reference/boats/<slug>/compare/` so I can judge the likeness at a glance.
- **Superstructure** is generated from the brief's wheelhouse style and position as a separate mesh group on the hull, with window cut-outs, door openings and the internal walkable floor. Low-poly, flat-shaded, shared material palette.
- **Hull data from the brief:** mass and displacement from specs; buoyancy sample points laid out from the hull form; drag coefficients from a per-template table scaled by the brief; propeller/outboard positions from `propulsion`; walkable surfaces (deck zones, wheelhouse floor, steps) and the helm standing position; sockets from `sockets_suggested`, snapped onto actual deck geometry and given capacities.
- **Nothing inside:** a shell has sockets but no modules. A minimal "sea trials" recipe (standard console, throttle, wheel, compass, one propulsion module matching `propulsion`) is generated alongside so the shell can be floated and driven immediately in the existing sea-trials mode, which is how I'll judge whether it feels right.
- Every shell gets a `README.md` with the comparison renders, the brief values used, and anything the generator couldn't honour.

## Stage 4: Grow the module catalogue

From `catalogue-gaps.yaml` across all processed boats:

- **Cluster gaps** across boats: three boats with "small deck crane ~0.5 t" is one module with a config range, not three modules. Produce `catalogue-proposals.yaml`: proposed module id, which socket type it fits, size/config range, which reference boats showed it, and reference photo crops.
- For each approved proposal, build the module following the module contract: geometry from primitives, controls on its own small station, bus keys registered, `needs`/`provides` declared, static/moving parts split, config schema, a thumbnail rendered once for the shipyard. Mechanisms use the mechanism library.
- **Bridge equipment is a priority family** because it's what makes boats feel distinct inside: analogue gauge clusters, a modern **multi-function display** module (a canvas-texture touchscreen with pages for chart, engine, electrical and radar, driven entirely by bus data, touch via the existing poke interaction), overhead switch panels, a VHF with DSC, a joystick docking control, a thruster panel, an autopilot head. Each is a module on `panel.slot` or `cabin.furniture`.
- I approve proposals before anything is built; I don't want the catalogue to fill with near-duplicates. Keep a `modules/index.yaml` as the catalogue with id, version, family, fits, thumbnail path and a one-line description; the shipyard UI reads it later.

## Stage 5: Assemble reference recipes

For each boat, write a `vessel.<slug>.json` recipe that assembles the shell with catalogue modules to match the reference as closely as the catalogue allows, so the generated boat is immediately playable and I can compare it to the photos. Gaps that aren't yet modules are listed at the top of the recipe as comments.

## Running it as a batch

- A `pipeline` command that runs stages 2–5 for every boat in `index.yaml` not yet marked done, writing outputs and comparison renders, and pausing for my approval between Stage 4 proposals and Stage 4 builds.
- Everything is re-runnable: fix a brief by hand, rerun from Stage 3, and the shell regenerates.
- Rough cost control: process one boat end to end first, then five, then the batch.

## Quality bar

- A shell floats on the existing ocean with believable trim and handles plausibly for its type on the first sea trial, using only the spec numbers.
- Side-by-side comparison renders match the photo silhouette well enough that someone who knows the boat recognises it.
- No reference image ends up in the game or the public repo.
- Generated shells and modules obey the architecture's budgets: static parts merged, moving parts declared, draw calls within limits.
- Any module from this pipeline is portable: it mounts on any hull with a matching socket.

## Milestones

1. **Folder layout, gather helper, brief schema:** create the structure, the URL-to-folder helper, the `brief.yaml` schema with validation, and process one boat by hand (the 10 m landing craft from the landing craft requirements is a good first). *Test: a complete, valid brief for one boat, corrected by me.*
2. **Hull form templates and comparison renders:** the five parametric templates and the render-to-image comparison tool. *Test: template renders beside the photos; I can tell which template matches.*
3. **Shell generator:** brief → hull definition with sockets, superstructure, walkable surfaces, sea-trials recipe. *Test: the first boat floats and drives in sea trials and looks like its photos from the bow quarter.*
4. **Catalogue matching and proposals:** compare briefs to `modules/index.yaml`, produce gaps and clustered proposals. *Test: for three boats, a sensible proposals list with no duplicates of existing modules.*
5. **Module building from proposals:** build two or three approved modules end to end, including the multi-function display. *Test: each mounts on two different hulls and works from bus data alone.*
6. **Reference recipes and batch run:** assemble each processed boat, run the pipeline on five boats. *Test: five playable boats, each recognisable against its reference, with a summary of catalogue growth.*

## Definition of done

I drop a folder of photos and a spec sheet for a boat I like into `reference/boats/`, run the pipeline, approve two proposed modules, and half an hour later I'm standing at the helm of a recognisable low-poly version of that boat in sea trials, with a brand-new multi-function display on the console that every other boat in the game can now also fit.
