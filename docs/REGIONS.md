# Regions: growing the world

Status: **agreed with the owner (Oct 2026); milestones 1 to 3 done, awaiting the owner's test.** The running record is PROGRESS.md "Regions".

The owner's brief, in short: grow the world by adding **regions** round home, each with its own geography, weather, fish, goods and towing jobs, reached by a short passage across open water, all still running in the browser on the Quest. The design intent, what a region defines, the tidal races as current zones, the four regions and the technical rules are the owner's; the decisions and the plan below are what was agreed in the session that started the work.

## Design intent (owner)

1. **Home stays exactly as it is.** It becomes region `home`; it only gains neighbours and a landmark visible from the next region.
2. **A crossing is a proper passage:** the gap between neighbouring regions' nearest islands is about the current map's diagonal (3 km), open water with weather to think about.
3. **On a clear day you can see where you're going:** every region has a tall landmark visible from its neighbours' edges. In fog you're on compass, log and the paper chart.
4. **Every region shares one spine:** a sheltered harbour with facilities, an exposed pier workable only in the right weather, and an anchorage. On top of that, its own character.
5. **Every region has a reason to go:** a repair yard, cheaper fuel, a species, a buyer paying more, a part for an upgrade.
6. **No tide model.** Tidal races are current zones with a simple cycle; the fun is deciding whether your boat can punch through.

## What a region is

A region is **data, never code of its own**: one file in `src/world/regions/` holding a `RegionDef` (`src/world/defs.ts`): its footprint (`bounds`), landmarks, islands, cuts, flats, breakwaters, quays and piers, buildings, sea marks, wrecks, lights, shelter zones, ports, berths, slipways, lamps, port floods, potting and fishing grounds, fog banks. The brief's other layers are added to `RegionDef` by the milestones that use them: the drawing theme and weather profile, fish species and goods, job templates, current zones.

`src/world/archipelago.ts` joins every region's lists into the flat lists the rest of the game reads (`ISLANDS`, `PORTS`, ...), home's first. Nothing else needs to know which region a thing is in; `regionAt(x, z)` (`src/world/regions/index.ts`) answers when something does.

## Decisions

- **All regions' data is always live** (terrain, harbours, charts, jobs), so the host can simulate a crew member's skiff in another region and the charts know the whole world. Only the **drawing** is streamed per client by the viewer's position: full meshes inside a load distance, a cheap silhouette (landmark hill, island outline) beyond it, built once in a worker and kept. Three regions at first, five at most.
- **Budget:** two resident regions may cost at most ~30 % more than today's scene (about 160k triangles, 65k of them land). New regions go leaner on trees; measured on the headset with the perf overlay.
- **One sky.** The weather profile in force is that of the region the host's own boat is in; the director's next pick uses the new weights when you cross. Katabatic gusts and the Mistral event are new preset kinds a region's profile can reach.
- **The exposed pier's weather window is not a rule:** a pier with no shelter zone, facing the prevailing sea, punishes you through the contact physics and hull damage. The chart and forecast state the window.
- **Anchorages:** bottom type scales the anchor's holding; shelter zones get an optional open arc, so a bay sheltered from all but the south is calm until the sea comes from the south.
- **Current zones are oriented rectangles** (centre, length along the set, width, set direction), not free polygons: the ocean shader tests them exactly the same way the physics does; a polygon would need a lookup texture. They go in as the shelter zones did: one list, read on the CPU (the water velocity at each hull station: the vessel physics already works against it) and in the ocean shader (standing waves, whirl patches, foam). One shared drift helper for everything that floats.
- **The race clock is the game clock,** and time flows by default (owner): a six game-hour cycle, slack around dawn and dusk; the Voyage tab can still freeze time.
- **The fast boat is a Shipyard boat** (the yard builds boats to 33 kn). The starter workboat (13 kn) cannot pass the 9 kn race at peak; it can from about two-thirds of the way to slack.
- **New mechanics come after each region's first version:** recovering a mooring block with the crane, carrying a passenger, an escort job, fish-farm cages, stern-to mooring, log booms. Each region is built first with the jobs that reuse what exists.
- **Layout:** home at the origin; the Sounds 3 km north, beyond Tarran and the Skerry (home's northern islands; Rona and Eilean Dubh are its southern ones); the Fjord north-east and the Narrows north-west of the Sounds, one more gap out; the Calanques two gaps due south of home, beyond Rona and Eilean Dubh. The water colour, sky and haze change across a line mid-passage to the Calanques.
- **Saves stay compatible** between the game and /next/: new ports, goods and species are additive. A milestone that must change a format gives `next` its own keys first.
- **Seeing far:** the camera's far plane goes out to about 12 km, scene fog follows the weather's visibility, and landmarks and lights get cull distances from their height and the day's visibility (not horizon maths).

## Milestones

1. **Region framework, no visible change** (done): home becomes `home`; the region list, bounds and `regionAt`; every consumer generic; fog banks and fishing grounds into the region file; the menu's port rows and teleport for any number of ports; tests.
2. **Seeing far, and streaming** (done): far plane, visibility-driven fog and cull distances, landmark silhouettes, worker-built meshes, load and unload by distance, the debug map and teleport, the budget measured; the Sounds as a stub with only its landmark hill to prove it.
3. **Current zones** (done): the race mechanic, surface effects, sound, knock points, chart symbol and forecast line, debug set-to-peak and set-to-slack; the trial race Sruth Tarsk in the sound on the crossing to the Sounds.
4. **The Sounds:** the full region with spine, repair yard, two races, cliff inlet with leading line, directional shelter, species, goods, jobs; the per-port economy and job templates every later region uses; the archipelago sheet and the detail sheet; the forecast per crossing.
5. **The Fjord:** narrow entrance, katabatic gusts, cheap fuel, the fish farm, the first new mechanics.
6. **The Narrows:** the 12 kn race with the pinnacle, the buoyed dog-leg, wrecks, log booms, the night escort.
7. **The Calanques:** Mediterranean theme, the strait with eddies, inlets, the Mistral event, the chandlery, stern-to mooring, the busiest traffic.
8. **Polish and balance:** every region resident in turn on the headset within budget, chart and forecast complete, each region's reason to go actually pulling.

After each milestone: stop, headset and desktop test steps, PROGRESS.md, push to `next`, wait for the owner.
