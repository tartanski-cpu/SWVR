# The harbour pub: a cosy room to plan the voyage in (plan)

Owner, Oct 2026: "the placement of the co-op voyage planning table is a bit weird in the harbours. I'm now thinking there should be just a button on the side of the harbour ... and then I want the button to take you to a cozy pub where you do this planning. And the cozy pub has some a little bit nicer lighting, maybe some baked lighting and a little bit of atmosphere. Make me a plan for this so I know what it might impact."

This is the plan. Nothing is built yet. The questions at the end are the owner's to answer before it starts.

## Why the table looks odd now

The table is placed by a search for level ground near where you start (`voyage/planTable.ts planTableSpot`). On a coast map that ground can be sloping terrain, the edge of a shingle beach, or a narrow pontoon, and nothing else on the quay belongs with it. The owner's screenshot shows it on a slope between a quay block and a warehouse. A pub moves the table indoors, where its place is fixed and chosen by hand.

## What it would be

1. **A button on the quay** at the harbour where the map starts: a short post with a hanging pub sign and a brass push button. It's small (half a metre square), so it always finds a spot right beside where you start. The same search the table uses, with a far smaller footprint, means no slopes or beaches. Press it (VR trigger or touch, desktop click) and you're in the pub. The Voyage tab gets **Go to the pub** in place of "Go to the table".
2. **The pub is a room of its own, not a building in the town.** The coast maps' buildings are plain blocks with no insides, and making a real one walkable means finding a building the right size at every harbour, cutting a door, and seeing the harbour through its windows. Instead the pub is one hand-made room that only players inside it see. While you're in it, the outside world (the sea, the land, the boats, the sky) isn't drawn for you. You come back out by its door, onto the quay beside the button.
3. **The room** (an original design: a small West Highland harbour inn, not any real pub):
   - low ceiling with dark timber beams, a planked floor, half-panelled walls;
   - a bar along one wall, with its taps, a shelf of bottles, and a couple of stools;
   - a stone fireplace with a fire;
   - two or three small tables with chairs;
   - small deep-set windows, painted with dusk over a harbour;
   - a door back out;
   - **the planning table in the middle**, the same table and keys as now, room for four round it;
   - a few framed pictures on the walls. A possible extra: your Shipyard favourites' pictures framed there.
4. **Baked lighting.** The light is worked out once, when the room is built, and painted into the colours of its surfaces (vertex colours), as the game's parts already carry their colours:
   - warm pools under the lamps over the bar and the tables;
   - the firelight falling off across the floor;
   - corners, under tables and under the bar darker, a simple stand-in for how little light reaches in there;
   - no real-time lights (they're what costs most on the Quest);
   - the fire alone flickers: its flames are a glowing mesh, and the floor and walls nearest it get a gentle warm flicker in their brightness. It's done in the material, so there are no particles and no lamps;
   - the pub is always a cosy evening, whatever the time outside.
5. **Atmosphere, in sound:**
   - the fire crackling;
   - a low murmur of other drinkers (the game's babble voice, which already speaks the radio on the Quest, quietly, several at once);
   - now and then a glass set down;
   - the wind outside, muffled.
   All are made in the browser, as the game's other sounds are: no sound files and no new dependency.

## What it touches

| Part of the game | What changes |
|---|---|
| **Where a player is** (`player/playerState.ts`) | A player gets an "inside" field (in the pub, or not), in the snapshots like the rest. Going in and out are intents to the host, so everyone agrees who's where. |
| **Walking** (`world/landWalkArea.ts`, `player/locomotion.ts`) | The pub has its own walking area: floor, walls, bar, tables, with the same interface as a boat's deck. Inside, you walk on that. |
| **Drawing** (`app/App.ts`) | Inside, the world's scene is hidden and the pub's shown, on desktop and in VR. The world's sky, fog and daylight don't apply. Outside, the pub isn't drawn. Cheaper on the Quest than standing on the quay. |
| **The planning table** (`voyage/planTable.ts`) | Moves into the pub at a fixed place. Its chart, keys, route and boat arrows are unchanged. Its placement search is replaced by the button's, which is smaller. |
| **The plan** (`voyage/plan.ts`) | Nothing changes. "Go to the table" becomes "Go to the pub". |
| **Multiplayer** (`net/`, avatars, voice) | Crew-mates in the pub see each other there. Those outside don't see them standing on the quay. Voice inside is by nearness in the room. The two-browser check (`npm run crewcheck`) gets a pub step: both in, both see the table, both out. |
| **The boats while you're inside** | They carry on as now: the host's world keeps running, moored boats stay moored, the radio's calls still come, shown as a notice. The handheld VHF works inside. A boat left under way with nobody aboard keeps going, as she does now when you step ashore. |
| **Menus** | Voyage tab: Go to the pub. Inside, the menu works as anywhere. |
| **Saves** | None new (the plan's saving is unchanged). |
| **Career** | Untouched: Voyage only to begin with. |
| **Performance** | No new physics bodies, ropes or particle systems. The room is a few merged meshes, a few thousand triangles, one or two draw calls, with no real-time lights. The button post is one small mesh. |
| **Tests** | Going in and out (intents, where you end up), the pub's walking area, nobody inside drawn outside; headless screenshots inside (the light, the fire, the table); the crew check's pub step. |

## How it would be built (milestones)

- **P1, the button and the room:** the post and button on the start quay; going in and out; the room's shell, furniture and planning table; its walking area; the world hidden inside. Plain colours first. Headless screenshots.
- **P2, the light and the fire:** the baked lighting (lamp pools, firelight, dark corners), the fire's glow and flicker, the painted windows. Screenshots by day and by night outside to show it's the same.
- **P3, sound and crew:** the fire, the murmur, the glasses; crew-mates in and out, voice in the room; the crew check's pub step.
- **Later, if wanted:** a pub at every harbour with a quay, not only the start; the Career's home harbour; framed favourites.

## Questions for the owner

1. **One pub at the start harbour, or one at every harbour?** Every harbour is little more work for the button, but each pub would be the same room.
2. **Its look:** a West Highland harbour inn is the suggestion. A name for it, or one made up per map ("The Anchor", "The Lorn Inn" and the like)?
3. **The windows:** painted dusk is cheap. Seeing the real harbour through them means drawing the world outside too, which costs more on the Quest.
4. **Keep a table outside too, or only in the pub?** The suggestion is only in the pub.
