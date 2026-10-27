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

- Controls in the room, as ordinary controls through intents, so multiplayer and holds work:
  - each engine's local stop and emergency stop;
  - the fuel valves, the sea cock;
  - the bilge pump;
  - the dipstick and oil.
- The engine room's sound: loud below, the outside muffled.
- A fade going down and up.
- Measure on the Quest: frame rate below and on deck.
- Then maintenance jobs on the duty board (change a filter, clear a strainer, bleed the fuel), and faults to find.
