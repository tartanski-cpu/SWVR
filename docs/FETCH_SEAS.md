# Short, steep seas in enclosed water: a plan

Owner, 23 Oct 2026: "It was never my intention that [the steep waves] should only be limited to this kind of tidal race. I think in storms ... in some areas of the world, you just get these shorter, rougher waves ... if it's like open water, the waves tend to be longer. And if it's maybe more enclosed, you get this kind of shorter, choppy seas. So maybe you can come up with a plan to implement these in a more natural way."

This is the plan. Nothing is built yet. The questions at the end are the owner's to answer before it starts.

## The idea: fetch

A wind sea grows with the wind's speed and with its **fetch**, the run of open water upwind it has had to build over. The standard model of fetch-limited growth is the JONSWAP relations, the same ones a naval architect uses for a design sea:

- significant height: g·Hs / U² = 0.0016 · (g·F / U²)^½
- peak period: g·Tp / U = 0.286 · (g·F / U²)^⅓

Both are capped at the fully developed sea of that wind (Pierson-Moskowitz). The height grows with the square root of the fetch and the period only with its cube root, so a short-fetch sea is **short and steep**. A long-fetch sea is longer and higher, but gentler for its height:

| A gale, 20 m/s (force 8) | Fetch | Hs | Tp | Wavelength | Steepness Hs/L |
|---|---|---|---|---|---|
| A sea loch, a sound | 3 km | 0.6 m | 2.5 s | 10 m | 1 : 17 |
| A firth (the Clyde off Bute) | 15 km | 1.2 m | 4.2 s | 28 m | 1 : 23 |
| Open sea | 100 km | 3.2 m | 7.9 s | 97 m | 1 : 30 |

Short-fetch seas also come close together: a 10 m boat meets a 2.5 s sea every couple of seconds and can't ride it. That is the rough, slamming chop of the Firth of Lorn in a south-westerly, the thing the owner describes.

Real seas are a wind sea plus **swell**, long waves that grew far away and travelled in. Swell gets into open water and the mouths of firths, but hardly into a loch.

## What the game would do

1. **A fetch map for every map.** For each spot on the water, how far the open water runs to land, for each of 16 directions.
   - For the coast maps it's made once in the coast pipeline, from the same coastline the game already uses: one small file per map, stored alongside the existing map files. The Map chat's part.
   - For the hand-built archipelago it's worked out once as the game loads.
   - A grid of about 100 m cells: plenty, as fetch changes slowly.
2. **The wind sea from the fetch, wherever you are.** For the wind now (speed and direction), each spot's fetch upwind gives its wind sea's height and period by JONSWAP.
   - The game's waves are a fixed set of Gerstner wave trains. A few short wave trains, about 2 to 4.5 s, join them everywhere. This is the race's chop made general.
   - Each spot's sea is shared out among them by its period: a short fetch puts it into the shortest trains, a longer one into the longer trains.
   - The wind sea then shortens and steepens smoothly as you sail from open water into a sound or loch, and it's always as strong as the wind and fetch make it.
3. **The swell from the open sea.** Today's long waves become the swell. Their height at each spot is scaled by how open that spot is toward where they come from: its fetch in that direction. That's full in the open, less in a firth's mouth, little in a loch.
   - It's the same idea as the hand-placed harbour shelter now, worked out from the coast instead of placed by hand.
   - The hand-placed shelter stays for breakwaters and harbours, where the fetch map is too coarse.
4. **The tidal races on top, as now.** Wind against tide still steepens whatever sea is there, by the same factors. The race's own chop becomes the general wind sea.
5. **The same sea for the physics and for drawing.** Both sample the one wave sum, as the races and shelter do now. So she pitches, slams and slows in the short sea as she looks to, and the added resistance in waves needs no change.
6. **Words for it:**
   - the shipping forecast: "a short steep sea in the sounds, a moderate swell outside";
   - the Debug menu: a toggle to compare it with today's sea, and a view of the fetch map;
   - the debug overlay: Hs, Tp and steepness where you are.

## What it touches

| Part | Change |
|---|---|
| `src/ocean/waves.ts` | The per-spot factors (`waveFactors`) take the wind sea's share per short train, and the swell's exposure. The overfalls stay as they are. |
| `src/environment/environmentState.ts`, `weather.ts` | The sea state is the wind and the swell: "sea follows the wind" becomes "the wind sea follows the wind at each spot's fetch". The swell builds and decays slowly, as now. Live weather's marine height goes into the swell. |
| `src/ocean/oceanView.ts`, the ocean shader | The fetch for the wind direction now, as one small texture of the wind sea's height and period at each spot: one texture read per vertex. It's refreshed when the wind shifts more than a sector. |
| A new `src/world/fetch.ts` | The fetch map, read, or worked out for the hand-built map, and looked up. |
| The coast pipeline (Map chat) | A fetch stage, its file in each map's package, and rebuilt maps. |
| Tests | JONSWAP numbers; a loch shorter and steeper than open water in the same wind; swell gone in a loch and full outside; the races unchanged; the crest-loop cap held; a boat slower in a short sea. |

**Cost on the Quest:** about three more wave trains in the sum each vertex makes (there are eight or so now), plus one texture read. No new physics bodies or particles. To be measured on the headset at the first milestone, with the train count a setting.

## Milestones

- **F1, the fetch map.** Made for the archipelago at load and for Oban in the pipeline, with a Debug view of it. Nothing about the sea changes yet.
- **F2, the wind sea.** The short trains everywhere, sized by fetch and wind. The race chop folded into them. The physics and drawing agree. Tune by eye, in a gale, in the Sound of Kerrera and outside it.
- **F3, the swell.** Its exposure from the fetch map; the live weather's marine sea feeds it.
- **F4, words and polish.** The forecast's wording, whitecaps on the steepest seas, and the Debug comparison toggle.
- **Later, if wanted:** shoaling, as waves steepen and break over banks and into shallow bays.

## Questions for the owner

1. **Always, or only in strong winds?** The model gives a short chop in any wind (small in light airs). The suggestion is always, as in life.
2. **How strong?** JONSWAP as it stands, or tuned rougher for the game? The suggestion is to start from the textbook and add a "roughness" setting if it reads too gentle in VR.
3. **The career archipelago too, or the Voyage maps first?** The suggestion is both: the archipelago's fetch is worked out at load.
