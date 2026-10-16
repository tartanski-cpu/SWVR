# Reference-boat pipeline: proposal

Status: **paused by the owner.** Claude Cowork is doing the photo research and writing the module descriptions; they'll be brought to Claude Code later. No code yet. The owner's brief is `docs/PIPELINE_REFERENCE_BOATS.md`. The contracts it outputs to are in `docs/MODULAR_BOATS.md` (on the `next` branch; that work is at M3a).

This document has four parts:

1. Five things to settle before any code. One of them clashes with a standing rule.
2. The folder layout.
3. The brief schema.
4. The milestones, and how they line up with the modular-boats milestones.

---

## 1. To settle first

### 1.1 "Recognisable" versus "original designs only" (needs your decision)

CLAUDE.md has your standing rule: *boats, gear and places are designed for the game, not copied from real products or commercial designs.* The brief's quality bar asks for the opposite: "someone who knows the boat recognises it", built from named products (Rebel, Damen, Safehaven…).

It matters because the repository and the game are public. A recognisable copy of a named builder's product can raise design-right and trademark questions. The builder's name on a boat makes that worse. I'm not giving legal advice here, only flagging the risk.

Options:

- **A. Study, then design (my recommendation).** References set the type, the proportions, the gear and the handling numbers, the way the hull study already works. Every boat in the game gets its own name. Its details are deliberately our own: house shape, window pattern, sheer line, livery. The bar becomes "recognisable as the type (a 7 m landing craft, a 15 m pilot boat)", not "as the product". The comparison renders still guide proportions.
- **B. Close copies, private only.** Near-replicas are allowed for your own study in the private reference repository (1.2). Only option-A designs go into the game.
- **C. You change the rule.** Your call, but I'd want it written into CLAUDE.md, with what's allowed.

### 1.2 Where reference photos live: a private repository

Gitignored files don't survive here. Every Claude Code cloud session starts from a fresh copy of the repository. Photos that are in `.gitignore` would exist only in the session that downloaded them, and the next session would have none.

**Proposal:** a separate **private** GitHub repository, say `tartanski-cpu/SWVR-reference`, that holds all of `reference/` (photos, specs, briefs and comparison renders).

- Pipeline sessions attach it next to the game repository.
- Nothing from it is ever copied into the game repository. The only things that cross over are our outputs: hull definitions, modules and recipes, under their own names.
- This keeps the "no reference image in the public repo" rule by construction, rather than by `.gitignore` discipline.
- You can upload photos to it from the GitHub web page (drag and drop), with no code.

You'd create the empty private repository yourself (GitHub → New repository → Private); I can't create repositories.

### 1.3 Gathering from websites: this environment can't reach them

This cloud environment's network policy blocks the builder and review sites. My test requests to damen.com and bairdmaritime.com were refused.

Two ways forward:
- **Allow the sites.** Add the domains you use under Allowed domains in the environment's network settings (cloud environment menu → Edit → Network access; see https://code.claude.com/docs/en/cloud-environments#network-access). Then the URL-to-folder helper runs in a session: you paste a URL, and the page text plus a list of image links lands in a new boat folder.
- **By hand.** Save the photos in your browser, and drop them and the spec numbers into the private repository through the GitHub web page. The helper then only makes the folder and a blank `specs.yaml` for you to fill.

I'll build the helper either way. It respects robots.txt and fetches one page at a time; it never crawls.

### 1.4 A YAML reader (dependency: needs your OK)

YAML files need a parser. I suggest the `yaml` package (about 0.7 MB on disk).
- It is a **development-only** dependency, used by the pipeline scripts and never loaded by the game. The game download stays the same size.
- Your rule says to ask before anything over ~100 KB, so I'm asking.
- The alternative is JSON throughout. That needs no dependency, but it's harder to read and correct by hand (no comments, lots of quotes).

### 1.5 Timing against modular boats, and staying out of the other session's way

The pipeline's outputs are the modular contracts. Some of those only start to work at later modular milestones:

| Pipeline stage | Needs (modular milestone) | Can start |
|---|---|---|
| Gather, brief, schema | nothing | now |
| Hull templates, comparison renders | nothing (uses the hull study) | now |
| Shell generator → `HullDefinition` | M6 (hull definition, boat from JSON) | after M6 |
| Catalogue matching | the module list (exists from M2; fuller after M5) | after M5 is sensible |
| Building modules | module contract (M1), deck-gear patterns (M5) | after M5 |
| Reference recipes, sea trials | M6; ideally M7 (the second hull proven) | after M7 |

The other session is driving modular boats on the `next` branch. To stay out of its way:
- The pipeline's code goes in its own folder (`pipeline/`).
- In the hull study (`src/hulls/`) it only adds to what's there.
- Stage 3 onwards happens on `next`, after M6 lands there.

Two smaller points:
- **The catalogue is generated, not kept by hand.** The module catalogue (`modules/index.yaml` in your brief) is written by a script from the module code itself. A hand-kept list would drift from the real modules.
- **First boat:** your brief suggests "the 10 m landing craft". The modular plan already chose the **9 m landing-bow work skiff** from your photo (hull study `landingCraft`) as the second boat, M7. If the pipeline's first boat is that same skiff, its brief and shell feed straight into M7. I'd need that photo again; it was in chat, not saved.

---

## 2. Folder layout

**In the private repository `SWVR-reference`:**

```
boats/
  index.yaml                 every boat: slug, type tags, status per stage (gathered, brief, shell, recipe)
  <slug>/                    e.g. work-skiff-9m  (our own slug, not the product name, under option A)
    README.md                what it is, source URLs, licence notes
    specs.yaml               facts from spec sheets (each with its source)
    photos/                  bow-quarter.jpg, profile.jpg, deck-aft.jpg, wheelhouse.jpg ...
    interiors/               workshop screenshots, kept apart
    page/                    what the gather helper saved (page text, image link list)
    brief.yaml               stage 2: the design brief (you correct this)
    catalogue-gaps.yaml      stage 2, second pass
    compare/                 stage 3: our render beside each photo, same view
catalogue-proposals.yaml     stage 4, clustered across boats
```

**In the game repository** (public, this one):

```
pipeline/                    the tools, run with npm scripts; not part of the game build
  gather.ts                  URL → new boat folder (robots.txt-aware)
  schema.ts                  the brief schema and its validator (plain-English errors)
  templates.ts               hull-form templates: map a brief onto the hull study's loft
  compare.ts                 render a hull at a photo's view; write side-by-side images
  shell.ts                   (stage 3) brief → HullDefinition + sea-trials recipe
  catalogue.ts               (stage 4) list modules from code; match briefs; cluster gaps
  run.ts                     the batch command, stopping for your approval where you asked
src/hulls/                   the hull study: new designs from the pipeline are added here
src/modules/<id>/            (stage 4) new modules, as the modular plan lays out
tests/pipeline/              schema, template and generator tests (no photos needed)
```

The npm commands would be `npm run pipeline:gather <url> <slug>`, `npm run pipeline:check` (validate every brief) and `npm run pipeline -- <slug>` (stages 2–5 for one boat, or for all boats not yet done).

---

## 3. The brief schema

Your example, with five changes to make it machine-checkable while staying hand-editable.

1. **One coordinate rule.** `at: [along, across, up]`:
   - `along`: 0 at the transom, 1 at the stem.
   - `across`: −1 at the port deck edge, 0 on the centreline, +1 at starboard.
   - `up`: 0 at the deck, 1 at the bulwark or rail top. Anything higher (house roof, mast) is given in metres, e.g. `{ up_m: 2.4 }`.

   Your example `[0.85, 0.9, 0.5]` could be read three ways; this makes it one.
2. **Estimates.** A number, or a string starting `~`, e.g. `displacement_t: "~1.6"`. Every number may also name its source: `{ value: 7.0, src: spec }`, `{ value: "~2.4", src: "photo profile.jpg" }`. The validator reports which numbers are still guesses.
3. **Fixed word lists.** `bottom`, `bow`, `stern`, `sheer`, wheelhouse `style` and `position`, and every socket `type` (from the modular `SocketType` list). The equipment `kind`s are a list too. An unknown kind isn't an error: it becomes a **catalogue gap**, which is exactly what stage 4 wants.
4. **Template = a hull-study family.** The hull study already lofts ten original designs. The five templates become five families of those designs, with their parameters exposed:
   - `flat-bottom-landing` (from `landingCraft`);
   - `hard-chine-workboat` (the game's workboat, and the sjark's working proportions);
   - `round-bilge-trawler` (`seiner`, `gillnetter`);
   - `deep-v-pilot` (`pilot`);
   - `catamaran` (`landingCat`, `ctv`).

   `tug` and `pushboat` stay available as two more.
5. **Capacities in the contract's own words.** `capacity: { loadRatingKg: 300 }` or `{ maxPowerKw: 60 }`, not `capacity_t`. Then the shell generator copies them straight into `SocketCapacity`.

A shortened example:

```yaml
id: work-skiff-9m
name: Coastal work skiff        # the in-game name (option A: our own)
type: landing-craft
sources: [specs.yaml, photos/profile.jpg, photos/bow-quarter.jpg]
dimensions:
  loa_m: { value: 9.0, src: spec }
  beam_m: { value: "~2.8", src: "photo profile.jpg" }
  draught_m: "~0.5"
  displacement_t: "~3.2"
hull_form: { template: flat-bottom-landing, bottom: hard-chine, bow: ramp, stern: transom, sheer: straight, freeboard: low }
superstructure:
  wheelhouse: { style: small-cabin, along: [0.25, 0.5], across: centre, windows: { front: 3, side: 2 } }
deck_layout:
  zones: [ { name: foredeck, along: [0.55, 0.95], clear: true } ]
  equipment:
    - { kind: bow-ramp, size: full-width, actuation: hydraulic }
    - { kind: cleat, count: 4 }
    - { kind: deck-crane, size: small, safe_load_kg: "~250", optional: true }   # unknown kind → gap
interior:
  bridge: { displays: [chartplotter-10in], controls: [throttle-single, wheel-small] }
propulsion: { type: inboard-diesel, count: 1, power_kw: "~110", speed_kts_max: "~18" }
sockets_suggested:
  - { type: bow.ramp, at: [1.0, 0, 0] }
  - { type: deck.equipment, at: [0.85, 0.8, 0], capacity: { loadRatingKg: 250 }, tags: [crane] }
  - { type: helm.console, at: [0.42, 0.3, 0] }
notes: Sits bow-down light; foredeck bulwarks; walkaround side decks past the cabin.
```

---

## 4. Milestones

Each one ends with you testing, PROGRESS.md updated, and a stop for your feedback, as you asked. Sizes: S about a session, M two or three, L more.

- **P1, schema, gather and one brief (S–M). Can start now.** The private repository layout, the gather helper, the brief schema and its validator, and one boat's brief written from its photos and specs.
  - *Test:* read the brief and correct it by hand. `npm run pipeline:check` says it's valid and lists which numbers are still estimates.
- **P2, templates and comparison renders (M). Can start now.**
  - The five template families, with their parameters exposed.
  - A renderer that draws a hull at each photo's view (profile, bow quarter) and writes the image beside the photo.
  - *Test:* look at the side-by-side sheet for the first boat and say which template is closest; nudge the brief and see the render follow.
  - Shown on the hull study page (`hulls.html`) only; the game is untouched.
- **P3, the shell generator (L). After modular M6.**
  - Brief → `HullDefinition`: the form, lightship mass from the specs, damping and resistance from the template's table, walk surfaces, the helm, and sockets snapped to the deck.
  - Plus a sea-trials recipe built from existing modules.
  - *Test:* the boat floats with believable trim, runs the sea-trials report (speed, turning, stopping), and is driven from the Debug menu on the `next` address.
- **P4, catalogue matching and proposals (M). After modular M5.**
  - The catalogue listed from code.
  - Gaps per boat, and proposals clustered across boats with the boats that showed each one.
  - *Test:* for three boats, a proposals list with no duplicates of existing modules. You approve or strike each line.
- **P5, building modules (L). After modular M5.** Two or three approved modules, led by the **multi-function display**: a canvas screen with chart, engine, electrical and radar pages, driven only by bus data, and poked to change page.
  - *Test:* each mounts on two different hulls and works with nothing but its socket and the bus.
  - *Quest cost:* one canvas texture per display, redrawn at most a few times a second.
- **P6, reference recipes and the batch (M). After modular M7.** Each processed boat assembled from catalogue modules, then the batch on five boats.
  - *Test:* five playable boats on `next`, each a fair likeness of its type, with a summary of what the catalogue gained.

## What I need from you to start P1

1. Option **A, B or C** for 1.1.
2. Create the private repository (1.2), or tell me to keep references somewhere else.
3. For gathering, either add the site domains to the environment's network settings, or say you'll gather by hand (1.3).
4. **Yes or no** to the `yaml` development dependency (1.4).
5. The first boat: the 9 m work skiff (and its photo again), or the 10 m landing craft from your requirements. If it's the 10 m boat, send its material.
