# Engine rooms

The owner, 27 Oct 2026: a detailed engine room you go down into, for performance and polygons. Agreed: **in the same page**, not a separate game like Timber or the submersible. A separate page would take you out of the multiplayer game, stop the boat's simulation on your page, and reload every trip below. In the same page the simulation, multiplayer and VR carry on, and only what's drawn changes. **The harbour tug and the stern trawler first.**

## How it works (milestone 1, the main game chat)

- **Where one fits** (`src/app/engineRoom/plan.ts`, `CONFIG.engineRoom`). This is worked out from her own hull sections, her engine hatch and her installed engines. She needs:
  - to be at least 18 m long;
  - standing headroom of 1.95 m from the floor plates to the underside of her deck;
  - a floor at least 2.2 m wide, and wide enough for her engines with a 0.7 m walkway outboard of each;
  - at least 3 m of length.

  The room grows fore and aft from under the hatch, to 30 % of her length (at most 8 m), keeping 12 % of her length clear of each end. Today that gives the harbour tug (7.5 × 8.8 m), the stern trawler (6 × 2.9 m) and the dive ship, which is on the trawler's hull. Every other boat keeps her hatch over the engine as before.
- **Going below** (`src/app/engineRoom/index.ts`, `player/gangway.ts`):
  - With her engine hatch open, "Go below" shows over it. Below, "Climb up" shows at the ladder's head.
  - While you're below, everything outside is hidden and only the room is drawn (`view.ts`). Your rig, the menus, the marks and any crew-mate in the room with you stay drawn.
  - Her walk area becomes the room's (`walk.ts`), and hers is put back when you climb up.
  - The room's code is its own download, fetched the first time anyone goes below.
- **The room** (`view.ts`), all in her axes and moved with her each frame, so it rolls and pitches as she does:
  - floor plates, lined sides with frames every 0.6 m, deck beams, light fittings, a watertight door forward;
  - her engines, as the boat draws them (`vessel/view/engineModels.ts`), with their shafts;
  - a yellow ladder;
  - a gauge panel per engine on the forward bulkhead: running or stopped, rpm, coolant and oil temperatures, live.

  It's one merged mesh, one canvas panel and two cheap lights: 3–4 draw calls and about 2,000 triangles, against 127–153 draw calls and about 330,000 triangles on deck (measured headless, Oban).

## The harbour tug's, in detail (27 Oct 2026)

Her room is longer (`CONFIG.engineRoom.big`) and drawn in detail by `src/app/engineRoom/tug/`. Her engines are detailed V16s in the same envelope. Around them:
- an engine control room with live screens, a switchboard and brass gauges;
- fire pumps;
- shaft lines turning with her revs;
- generator sets, day tanks and air receivers;
- the bench, pumps and strainers;
- colour-coded pipe runs, and the overhead gear.

It's 5–10 draw calls and about 105,000 triangles while you're below; see `docs/progress/game.md`. The other rooms (the trawler's, the dive ship's) are still the plain milestone 1 room.

**Its look** (28 Oct 2026, `src/app/engineRoom/look.ts`, `CONFIG.engineRoom.look`): every room wears the game's pixel paint (`render/pixelPaint.ts`). The sides and bulkheads are painted steel plating with weld seams, the deckhead perforated insulation cladding, and the floor chequer plate. In the tug's room each kind of surface also wears its tile by its colour (`tug/kit.ts` `PAINT_BY_COLOUR`): painted machinery with oil stains, quilted exhaust lagging, the day tanks' plating, and galvanised ductwork on the duct. The paint has a satin sheen (Phong), and dirt is baked into the colours low down and under the deckhead. The tug is lit by a dim fill and bright lamps, so there are pools of light and shade. Its light fittings glow while the switchboard is live. That costs one more draw call (the diffusers); everything else is on the meshes it had.

## The harbour tug's start-up (27 Oct 2026)

The owner: "the only thing I want for the engine room is a realistic startup procedure". Part 1 (`src/plant/plant.ts`, the controls in `tug/controls.ts`): she comes from port dead ship, and is brought to life below, step by step:
1. 24 V on (battery master);
2. the generator (its fuel valve, START);
3. its breaker on the switchboard (power on, the lights come up);
4. fuel (day tank valves, supply pump);
5. sea water (sea suction valves);
6. pre-lube;
7. starting air (compressor, main air valve);
8. START at each engine's local control stand;
9. the engine control switch to BRIDGE.

Missed steps block her start and say why. Quick start does it all.

Part 2 (27 Oct 2026): a START-UP page on the control room's middle screen ticking the steps off from her state (the next one marked), a checklist card on the wall by the control room door, and the machinery's sounds (the generator running up, the fans, the compressor, the starting air's blast; `audio/plantAudio.ts`).

## The harbour tug's crew area (29 Oct 2026, first draft)

The owner: "a detailed interior for the big tug's crew area, same treatment as the engine room, and it loads as a separate space"; "two decks, if you can make it work". Built on the same system, now spaces rather than one room (`BelowDecks`: the engine room, `'engine'`, and the crew area, `'crew'`, one at a time; their drawings kept per boat and space).

- **Where it fits** (`src/app/engineRoom/crew/plan.ts`, `CONFIG.crewArea`), from her own deckhouse, hull and engine room, so it follows the Shipyard's house:
  - **main deck** inside the deckhouse's walls, a level floor at her highest deck under the house (the deck has sheer), at least 4.5 x 4 m with 2 m headroom;
  - **lower deck** forward of the engine room's forward bulkhead and back from her forepeak, with 2 m headroom under her lowest deck over it and room for two cabins and a corridor;
  - **a stair** between them on her centreline, as steep as a ship's stair may be to fit.
  The harbour tug: main deck 8.5 x 6.6 m, lower deck 6.8 x 7.4 m, a 12-step stair. No other boat has one today.
- **Its layout** (`crew/layout.ts`), plain boxes in her axes for the drawing and the walking:
  - main deck: the lobby aft, the messroom to port, the galley to starboard, the stair between them;
  - lower deck: the corridor across her at the stair's foot; the master's and the crew's cabins aft of it; the washroom and the laundry and store forward of it.
- **Walking** (`crew/walk.ts`): both floors (they overlap in plan: which one is by your height), the stair's treads (a hole in the main floor over them), walls and furniture solid.
- **Its drawing** (`crew/view.ts`), only while you're inside, its code its own download:
  - one merged painted mesh: painted-render linings, cladded deckheads, vinyl, carpet and matting, wood joinery, woven upholstery;
  - one unlit mesh: daylight in the windows, portholes, the ceiling lights, the mirror;
  - one canvas: the door plates, the harbour chart, the muster list;
  - a soft fill and three lamps, moved to the ceiling lights nearest you on your deck.
  4–6 draw calls and about 9,000 triangles inside, against about 70 and 450,000 on her deck (headless). The bunks are BerthRest: lie down to rest.
- **In and out** (`player/gangway.ts`): "Go inside" on her deck aft of the door, "Go outside" by it inside. You come out on deck aft of the door.
- **Not yet:** the view out of the windows (they show daylight); doors you open and shut (they stand open); a way between the lower deck and the engine room; the bridge reached from inside.

## For the Shipyard chat (its files: `src/shipyard/`)

- Show the engine room in the Shipyard: the space from `engineRoomPlan`, in the cutaway or the Engine step, with a line like "Engine room 7.5 × 8.8 m, 2.5 m headroom" or "No engine room: hatch access only".
- Optionally, the room as a design choice: its length, or a bulkhead position, on boats that can take one. It would then be read from the vessel def instead of worked out from the hull: add an `engineRoom` field to the layout, and have `plan.ts` use it when present.

## For the modular builder chat (its files: `src/modules/`)

- Engine room gear as modules on sockets in the room:
  - a generator set;
  - the main switchboard;
  - a fuel day tank with a sight glass;
  - sea chest strainers;
  - bilge pumps and their valve chest;
  - a workbench, gratings, handrails round the engines.
- Keep them cheap: merged static parts, and instanced where repeated.

## Next for the main game (milestone 2)

- Controls in the room, as ordinary controls through intents, so multiplayer and holds work (the tug's start-up has the first: the local stops, the fuel and sea valves):
  - the bilge pump;
  - the dipstick and oil.
- The engine room's sound: loud below, the outside muffled.
- A fade going down and up.
- Measure on the Quest: frame rate below and on deck.
- Then maintenance jobs on the duty board (change a filter, clear a strainer, bleed the fuel), and faults to find.
