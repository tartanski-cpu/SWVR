# Workboat World × Submersible World: dive sites (draft)

**Status: draft, 25 Oct 2026.** Written by Workboat World's main game chat for the Submersible World chat to read, confirm or change. The same file is meant to go in both repositories (SWVR and Submersible-World), as `docs/metaverse-contract.md` does for Timber. Only the site table is in use so far: the sites are on Workboat World's charts. The launch and the return below are a proposal, not built on either side.

The owner's plan (25 Oct 2026): a submersible launched off the back of a dive support ship in Workboat World goes into Submersible World, a new web page, with missions to search wrecks and retrieve things with a small ROV that can go inside. Workboat World marks where the wrecks are, some shallow, some mid, some deep; Submersible World builds each wreck and its missions from the site's id.

## Site registry

Bands: **shallow** under 20 m, **mid** 20 m to under 40 m, **deep** 40 m and more. Depths are the charted depth at the site's middle, as Workboat World's seabed has it there (its tests hold each within a few metres). Each site's area on the charts is a ring of 50 m radius round its middle.

The Oban sites are real places on the real coast, by WGS84 latitude and longitude (the coast pipeline places them the same in both games, as Timber's site). The career sites are on Workboat World's own made-up archipelago, so they're in its metres (x east, z south); they have no real position. The wrecks are invented ships.

| Site id | Map | Name | Where | Depth | Band | The wreck | Near |
|---|---|---|---|---|---|---|---|
| `oban-lorn-trader` | Oban | Lorn Trader | 56.4375° N, 5.4990° W | 54 m | deep | Steel coaster, 60 m, upright, her masts gone | North-west of Maiden Island: the map's deepest water |
| `oban-gylen` | Oban | Gylen wreck | 56.37866° N, 5.53406° W | 40 m | deep | Wooden sailing ship, 34 m: timbers and ballast stones, her cannon scattered | Under Gylen Castle, south Kerrera |
| `oban-morven-lass` | Oban | Morven Lass | 56.41463° N, 5.55377° W | 28 m | mid | Fishing boat, 20 m, on her keel, wheelhouse intact | Off Slatrach Bay, west Kerrera (Firth of Lorn side) |
| `oban-sound-spirit` | Oban | Sound Spirit | 56.42667° N, 5.50236° W | 13 m | shallow | Cargo puffer, 20 m, on her keel, hold open | North end of Kerrera, mouth of the Sound |
| `oban-selene` | Oban | Selene | 56.45797° N, 5.43614° W | 12 m | shallow | Motor yacht, 18 m, on her side | Off Dunstaffnage, below the castle |
| `career-margaret-ann` | Career | Margaret Ann | x 60, z 470 | 8 m | shallow | Coaster, 30 m, on her side, upper side awash | The wreck west of Calder Haven (already drawn in the game, above water) |
| `career-ellen-rose` | Career | Ellen Rose | x −750, z 750 | 27 m | mid | Steam drifter, 24 m, upright on sand, funnel fallen | Off Brannock |
| `career-sgarbh` | Career | Sgarbh | x −1200, z −1600 | 40 m | deep | Cargo steamer, 52 m, broken in two, bow on its side | North of Eilean Garbh |

Adding a site later: one row here, one entry in `src/dive/diveSites.ts` `DIVE_SITES` in Workboat World, and its scene in Submersible World.

## The launch (built, 26 Oct 2026)

Workboat World now launches into Submersible World by the address Submersible World already reads (its `src/core/handoff.ts`, its spec's "Handoff in"), not the envelope proposed below:

`https://tartanski-cpu.github.io/Submersible-World/?site=<site id>&depth=<m>&sub=work3&tier=3&crew=1&return=<url>&session=<id>`

- When: the sub launched off the dive A-frame (`deck.dive-frame`, on the fleet's Dive support vessel or a Shipyard boat big enough) and afloat, the ship inside a site's ring (`CONFIG.dive.radius`) making under 0.5 kn, and DIVE pressed on the frame's stand. Alone, or hosting with no crew aboard (as Timber).
- `site`: the site id from the table above; `depth`: its charted depth (Submersible World clamps it to its own 15 to 80 m, so the three shallow wrecks, 8 to 13 m, dive at 15 m).
- `return`: the Workboat page as it was (the career, or the Voyage map); Workboat World saves its own state first. Back there the sub is on her cradle again.
- `session`: a 6-character handoff id, issued in Workboat World's store (`swvr.mv.issued`, as Timber's), so a return carrying it can be checked once and only once.
- Code: `src/modules/diveFrame/launch.ts` (`diveReady`, `diveUrl`), `App.ts` `goDive`. Settings `CONFIG.modules.diveFrame.dive`.

## The return (proposal)

Not built on either side yet (Submersible World's milestone M9). The proposal stands: the same mechanism as Timber (`docs/metaverse-contract.md`): one JSON envelope, base64url (no padding) of its compact JSON, in a URL query parameter `mv`, with the same rules (strip it from the address on reading, ids issued and consumed once, each game saves its own state before navigating, `v: 1`, unknown fields ignored).

- **Out** (Workboat → Submersible): the dive support ship stopped over a site (inside its ring, under about 0.5 kn) and the submersible launched off her stern. `from: "workboat"`, `site` (the id above), `return`, `boat`, `pos`, `time`, as Timber's.
- **Back** (Submersible → Workboat): `from: "submersible"`, `status` `"none"` or `"recovered"`, and what was brought up, for Workboat World to put on the ship's deck and pay for, e.g. `"cargo": { "items": [ { "kind": "bell", "name": "Lorn Trader's bell" } ] }`. The kinds and their prices are to agree.

Open questions for the Submersible World chat:
1. Which wreck kinds and sizes it can build, and whether the table's descriptions suit it.
2. What its missions bring back, so Workboat World can carry and pay for them.
3. Whether the career sites (no real position) are wanted, or only real-coast ones.
4. ~~The Submersible World address to navigate to.~~ Its live address, with the fields above.

## In Workboat World (for reference)

- `src/dive/diveSites.ts`: the registry, a site's place in the world (`siteWorld`), the sites on a map (`sitesOn`).
- `src/nav/chartPlotter.ts`, `src/nav/paperChart.ts`: drawn on the charts.
- `tests/diveSites.test.ts`: the depths and bands.
- Settings: `CONFIG.dive`.
