# Workboat World × Submersible World: dive sites (draft)

**Status: in use, 26 Oct 2026** (the launch built by Workboat World's main game chat; the return built with Submersible World's M9). The same file is in both repositories (SWVR and Submersible-World), as `docs/metaverse-contract.md` is for Timber.

The owner's plan (25 Oct 2026): a submersible launched off the back of a dive support ship in Workboat World goes into Submersible World, a new web page, with missions to search wrecks and retrieve things with a small ROV that can go inside. Workboat World marks where the wrecks are, some shallow, some mid, some deep; Submersible World builds each wreck and its missions from the site's id.

## Site registry

Bands: **shallow** under 20 m, **mid** 20 m to under 40 m, **deep** 40 m and more. Depths are the charted depth at the site's middle, as Workboat World's seabed has it there (its tests hold each within a few metres). Each site's area on the charts is a ring of 50 m radius round its middle.

**The wrecks are generic** (owner, 26 Oct 2026): Workboat World doesn't name or describe them. The site id is the seed: Submersible World's procedural wreck engine makes up the ship, how she lies, her story and her finds from it alone. The charts say "Wreck" and the depth; once a dive identifies her, her name comes back with the results and the charts write it (Workboat World's `swvr.dive.names`).

The Oban sites are real places on the real coast, by WGS84 latitude and longitude. The career sites are on Workboat World's own made-up archipelago, in its metres (x east, z south). The ids carry old working names; they're only seeds.

| Site id | Map | Where | Depth | Band | Near |
|---|---|---|---|---|---|
| `oban-lorn-trader` | Oban | 56.4375° N, 5.4990° W | 54 m | deep | North-west of Maiden Island: the map's deepest water |
| `oban-gylen` | Oban | 56.37866° N, 5.53406° W | 40 m | deep | Under Gylen Castle, south Kerrera |
| `oban-morven-lass` | Oban | 56.41463° N, 5.55377° W | 28 m | mid | Off Slatrach Bay, west Kerrera |
| `oban-sound-spirit` | Oban | 56.42667° N, 5.50236° W | 13 m | shallow | North end of Kerrera, mouth of the Sound |
| `oban-selene` | Oban | 56.45797° N, 5.43614° W | 12 m | shallow | Off Dunstaffnage |
| `career-margaret-ann` | Career | x 60, z 470 | 8 m | shallow | West of Calder Haven, by the wreck drawn above water there (the paper chart marks it once) |
| `career-ellen-rose` | Career | x −750, z 750 | 27 m | mid | Off Brannock |
| `career-sgarbh` | Career | x −1200, z −1600 | 40 m | deep | North of Eilean Garbh |

Submersible World clamps the depth to its own 15 to 80 m, so the three shallow sites dive at 15 m.

Adding a site later: one row here, one entry in Workboat World's `src/dive/diveSites.ts`. Nothing in Submersible World: any id is a seed.

## The launch (built, 26 Oct 2026)

Workboat World now launches into Submersible World by the address Submersible World already reads (its `src/core/handoff.ts`, its spec's "Handoff in"), plain query fields:

`https://tartanski-cpu.github.io/Submersible-World/?site=<site id>&depth=<m>&sub=work3&tier=3&crew=1&return=<url>&session=<id>`

- When: the sub launched off the dive A-frame (`deck.dive-frame`, on the fleet's Dive support vessel or a Shipyard boat big enough) and afloat, the ship inside a site's ring (`CONFIG.dive.radius`) making under 0.5 kn, and DIVE pressed on the frame's stand. Alone, or hosting with no crew aboard (as Timber).
- `site`: the site id from the table above; `depth`: its charted depth (Submersible World clamps it to its own 15 to 80 m, so the three shallow wrecks, 8 to 13 m, dive at 15 m).
- `return`: the Workboat page as it was (the career, or the Voyage map); Workboat World saves its own state first. What she finds back there: see the return, below.
- `session`: a 6-character handoff id, issued in Workboat World's store (`swvr.mv.issued`, as Timber's), so a return carrying it can be checked once and only once.
- Code: `src/modules/diveFrame/launch.ts` (`diveReady`, `diveUrl`), `App.ts` `goDive`. Settings `CONFIG.modules.diveFrame.dive`.

## The return (built, 26 Oct 2026)

The crew call for recovery at the surface by the support ship. Submersible World shows the results for a few seconds (RECOVERY again to go at once), fades out, and goes to the `return` address with one JSON envelope in the query parameter `mv`: base64url (no padding) of its compact UTF-8 JSON, the same mechanism as Timber's. Rules as Timber's: the receiver strips `mv` off the address on reading, the id counts once and only once, each game saves its own state before navigating, `v: 1`, unknown fields ignored.

```
{ "v": 1, "id": "<session>", "from": "submersible", "site": "<site id>", "status": "recovered",
  "items":  [ { "kind": "anchor", "cls": "heavy", "name": "Her bower anchor", "kg": 330 } ],
  "survey": { "pct": 64, "gain": 40, "identified": true, "name": "Brave Light", "namedNow": true },
  "story":  { "clues": 4, "of": 6, "solved": true, "solvedNow": true, "firstTime": true },
  "minutes": 38, "depth": 27 }
```

- `items`: what came up (in the sample basket, on the winch hook, or at the surface under lift bags). `kind` one of bottle, plate, lantern (small), porthole, binnacle, safe (medium), crate, anchor, engine (heavy); `kg` its weight in water.
- `survey`: coverage now (%) and gained this dive; identified, her name, and whether that was this dive.
- `story`: clues found of how many; her cause of loss found; this dive; right at the first filing (the bonus).
- The "this dive" flags are so Workboat World pays once: a site remembers its state between dives (Submersible World's `gameplay/siteSave.ts`, in its own storage keys `wreckrov.site.*`), so a second dive at a site reports only what's new.

In Workboat World (`src/dive/diveReturn.ts`, settings `CONFIG.dive`): the envelope read and bounded, counted against the id issued at the launch; each find a **salvage crate** on the dive ship's deck (cargo kind `Salvage`, as heavy as the find out of the water), sold at its price (`CONFIG.dive.prices`) when she's stopped in any port, or carried ashore; the survey (so much a point of coverage gained, more for naming her) and the finding (more first time) paid at once (`CONFIG.dive.fees`); the sub afloat astern if she's still over the site (a Voyage comes back where she was), to be recovered with the A-frame by hand; on her cradle otherwise (a career comes back in port).

## In Workboat World (for reference)

- `src/dive/diveSites.ts`: the registry, a site's place in the world (`siteWorld`), the sites on a map (`sitesOn`), a site in words (`siteLabel`).
- `src/dive/diveReturn.ts`: the return (read, counted, applied; the salvage sold in port).
- `src/nav/chartPlotter.ts`, `src/nav/paperChart.ts`: drawn on the charts.
- `tests/diveSites.test.ts`: the depths and bands.
- Settings: `CONFIG.dive`.
