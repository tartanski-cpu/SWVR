# Workboat World: what's new, 21 to 23 October 2026

**Covers:** everything on the test build since the 21 October live move, from every chat's work, up to the afternoon of Friday 23 October.

**What's where:** on 23 October all of this moved from the test build (https://tartanski-cpu.github.io/SWVR/next/) to the live game at https://tartanski-cpu.github.io/SWVR/ (the owner's call). Both addresses share one browser storage, so your careers and settings are the same on both.

## Highlights

- **The timber run:** anchor in Ardantrive Bay on Kerrera (Voyage, Oban) and you go ashore to the Big Timber game. Cut logs there, come back to a barge of them on your towline, and sell them at the Oban timber merchant.
- **Live weather on the Voyage maps:** the real wind, sky and sea at the place when you start, from Open-Meteo.
- **Playing together on the water:** every crew-mate in a boat of their own, several towlines on one tow, a voyage planned together at a chart table, and the other boats heard in 3D with their engines, wash and horns.
- **Trawling and fishing gear:** the stern trawler as a sixth hull type, trawl winches and a net drum, the codend swung aboard, an insulated fish hold, crew bunks and a mess.
- **The Shipyard reworked:** it opens on a project, the steps are picture tiles, gear and furniture are placed by pointing, the hull types are cards, there's a section tool, three tiers of instruments (old-school gauges to touchscreens) and a console you can lay out by hand.
- **A fast catamaran** in the hull study, now floating, rolling and drawn in the game's physics.

## Voyage

- **The timber run** (owner's spec with the Timber game).
  - The bay is marked by a buoy and on the chartplotter. Anchoring there takes you ashore with no prompt.
  - You come back still at anchor; a barge with the logs stacked on her deck is on your line (up to 40 logs). A full barge sits deeper and tows heavier.
  - The sale is at Oban's North Pier: £12 a log, into a Voyage account this browser keeps. Barges are saved where they lie.
  - In VR the game goes back into the headset on its own where the browser carries VR between pages.
  - A test page makes handoff links: `/SWVR/tools/mv-encode.html`.
- **Live weather:** wind, gusts, visibility, rain, cloud, and the sea from the marine forecast, held for the session. A notice tells you what it is; it's also in the Voyage tab. No answer from the service: the game's own weather.
- **Voyage planning table** on the start quay: plan waypoints, stops and things to look at together. Every plotter steers for the next point. The table follows the host's Go.
- **Go** to any port from the ports list; harbour boats moored, alongside and at anchor; harbour names from the marinas in the map data.
- **Coast extras:**
  - surf on the shore, what the shore is made of (bow-ramp boats beach on sand), fish farms and the skyline from the map data;
  - ferries on the real routes, and place names on the charts and in the radio's calls;
  - piers built along their real shape (the Clyde rebuilt), and woods without shimmer or a 3D canopy.

## Playing together

- **Your own boat each:** a launch replaces your boat, Go sends your own, joining boards the host's. Berth slots by quay face, and the anchorage when they're full.
- **Multi-boat towing:** a towline per boat, several on one tow. A tug tows from a hook amidships, her wheelhouse kept forward.
- **The others heard:** engines in each boat's own voice, the rush of water, horns, in 3D with the Doppler shift.
- **The Crew tab** in order, host first, with a mute per crew-mate. A two-browser check (`npm run crewcheck`) for testing.
- **Save the boat you're aboard** to your favourites, from VR too. Favourites are listed by name.

## Boats and gear

- **The stern trawler** (Shipyard): trawl winches and a net drum, the codend swung in on the A-frame's rams and emptied on deck, an insulated fish hold, a 750 kW diesel, and her exhaust through the wheelhouse.
- **Tugs:** twin tug diesels, ballast by size, a tiny tug, and a raised foredeck.
- **The fast rescue boat**, a 6 m RIB on a bigger crane. The skiff became a rubber dinghy.
- **Crew accommodation:** two-high bunks, a mess table and a shower.
- **The deck crane** drawn smoothly between simulation ticks.
- **Health:** hurt by cold water, propellers, falls, fire and smoke. Berths heal, and with everyone in a berth you sleep and the hours pass.
- **The yard** sells fenders and a life ring for the beginner boat.

## Shipyard

- **Projects:** it opens on a project, and projects save themselves.
- **Steps:** picture tiles, with the long notes behind i buttons; hull-type cards say what each is made for.
- **Placing things:** gear and furniture are placed and moved by pointing, green where it fits and red where it doesn't. Furniture has a step of its own, placed from above with the roof cut away.
- **The section tool:** a waterline, buttock or station cut, slid anywhere along her.
- **Instruments:** three tiers, from old-school analogue gauges to an advanced touchscreen. Navigation lights in every tier, a ship's clock, TEMP and FUEL lamps.
- **The console:** lay it out by hand (screens on the dash grid, switch groups on the panel), or Automatic. Also a narrow console, a faceted dash, and screens in half and quarter cells.
- **Layout:** key figures against the brief under the steps, a view-size switch, and the right column in folding groups.
- **And more:**
  - the landing craft's wheelhouse offset to port or starboard;
  - foredeck gear clear of the raised foredeck's break;
  - level bulwarks along a full-width deckhouse;
  - the Kort nozzle drawn.

## Fixes and comfort

- **Bollards** along the whole quay; a long boat's lines lead out to the bollards beyond her ends.
- **Lines left behind:** a boat's mooring lines, chain and smoke no longer stay in the world when she goes.
- **No flicker** on the ferries and where quay blocks overlap. You stand on the highest deck where they do.
- **Motion coupling** runs evenly from 0 to 100 %, with a gentle smoothing of bumps for desktop players.
- **The grab camera** held in VR looks where the hand points.
- **Smaller fixes:**
  - the desktop fly camera no longer settles to the floor;
  - harbour boats at anchor swing about their chain;
  - Voyage berths leave room for a whole boat.

## Behind the scenes

- **The code is organised by area** (main game, Shipyard, modules, map, hull study), each chat in its own files and log (`docs/progress/`), with its own preview address: `/SWVR/preview/<area>/`.
- **Publishing** lets a started run finish, so the site doesn't lag when several chats push.
