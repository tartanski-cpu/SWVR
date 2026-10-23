# Metaverse handoff: the shared contract

The owner's spec, "Workboat World × Timber: Metaverse Handoff Spec" (23 Oct 2026), section 2. This file is identical in both repositories: `tartanski-cpu/SWVR` (Workboat World) and `tartanski-cpu/BigTImberVR` (Big Timber, the spec's "Timber"). Change it in both or neither.

In Voyages mode, anchoring in a marked bay hands the player off to Big Timber. Cutting and delivering enough logs there spawns a barge, and returning to the boat brings that barge back as towed cargo to sell. The two games stay separate web apps in separate repositories and touch at two moments only: the handoff out and the handoff back. Each passes one envelope in the URL. Neither game imports code from the other, and each reads only the fields it needs.

Version 1 is single-player: the player leaves and returns alone; other crew in a multiplayer Voyages session see the boat stay anchored.

## The envelope

State crosses the boundary as one JSON envelope, base64url-encoded, in a single URL query parameter named `mv`.

```json
{
  "v": 1,
  "id": "8f3a9c",
  "from": "workboat",
  "site": "loch-timber-1",
  "return": "https://tartanski-cpu.github.io/SWVR/voyage.html?map=oban",
  "boat": { "id": "starter-6m", "name": "Kelpie" },
  "pos": { "lat": 56.4117, "lon": -5.50156, "hdg": 240 },
  "time": { "hour": 14.5 },
  "status": "none",
  "cargo": { "logs": 0 }
}
```

| Field | Set by | Meaning |
| --- | --- | --- |
| `v` | both | Contract version. Reject anything other than 1 and fall back to normal play. |
| `id` | Workboat | Random 6-character handoff id. Timber echoes it back unchanged; Workboat uses it to consume each return exactly once. |
| `from` | both | `workboat` on the way out, `timber` on the way back. |
| `site` | Workboat | Which hotspot triggered the handoff. Timber uses it to pick the scene. |
| `return` | Workboat | Absolute URL Timber navigates back to, with `mv` appended. |
| `boat`, `pos`, `time` | Workboat | Echoed back by Timber. Timber may use `time.hour` for its own lighting. |
| `status` | Timber | `none` or `barge_ready`. |
| `cargo.logs` | Timber | Number of logs on the barge when `status` is `barge_ready`. |

## Rules

- Encode with base64url (no padding) of the compact JSON string. Decode defensively: a malformed `mv` means ignore it and start normally.
- Both games strip `mv` from the address bar with `history.replaceState` immediately after reading it, so a refresh never replays a handoff.
- Workboat keeps lists of issued and consumed `id` values in its own storage. A returning envelope whose `id` is already consumed, or was never issued, spawns nothing.
- Timber must not change `boat`, `pos`, `time`, `site`, `id` or `return`. It only sets `from`, `status` and `cargo`.
- Each game saves its own full state locally before navigating away. The envelope is a message, not a save file.

## Site registry

Coordinates are real-world WGS84 (decimal degrees, west negative), so each game's own coast or terrain pipeline places them in its world. Both pipelines use a flat local grid about a centre point (equirectangular), and both are accurate to well under a metre across a bay.

| Site id | Name | Hotspot centre (lat, lon) | Hotspot radius | Beach delivery zone (lat, lon) | Barge spawn (lat, lon) | Timber URL |
| --- | --- | --- | --- | --- | --- | --- |
| `loch-timber-1` | Ardentrive, Kerrera | 56.41170, -5.50156 | 60 m | 56.41258, -5.50170 | 56.41184, -5.50219 | https://tartanski-cpu.github.io/BigTImberVR/ |

Adding a second site later means adding one row here and one scene in Timber; nothing else changes.

### How the row was worked out (from Big Timber's Ardentrive terrain, `src/world/kerrera.json`)

- **Hotspot centre:** the middle of the water in the bay just south of Ardentrive Farm (the bay is about 150 to 190 m across, opening to the south, with a point of land on its east side between it and the Sound of Kerrera). In Timber's game metres (x east, z south of its map centre at 56.4129, -5.50146): x -6, z 133.
- **Beach delivery zone:** a 20 m by 10 m rectangle, its long side along the shore (which runs east-west here), on the gentle slope at the head of the bay, 0.5 to 2.5 m above the water. Timber's game metres: centre x -15, z 36, from x -25 to -5 and z 31 to 41. The fellable stand is just uphill of it, 20 to 40 m north.
- **Barge spawn:** about 85 m offshore from the beach zone, toward the west side of the bay in about 5 m of water (Timber's game metres x -45, z 118). It lies 42 m from the hotspot centre, inside the anchorage, so the anchored boat is close by for the tow line. Workboat should move it clear if the boat is anchored within about 20 m of it.
- The water depths in Timber's terrain are made up (its heights come from Copernicus, which has none under the sea), so Timber's depths are only for looks. Workboat World's Oban map has real depths (EMODnet) for the same water.

## Where the two codebases differ from the spec's assumptions

Found while filling in this contract. None of them changes the envelope or the rules above.

- **Both games are on the same origin.** Both are served from `https://tartanski-cpu.github.io`, so they share one browser storage (localStorage). The URL handoff is still the right design: it is what the later iframe and one-app stages keep. But it means each game's storage keys must be its own:
  - Workboat World's are `swvr.*`, so the issued and consumed id lists are `swvr.mv.issued` and `swvr.mv.consumed`, not `mv.issued` and `mv.consumed`.
  - Big Timber's are `bigtimber.*`, so its save is `bigtimber.save.v1`, not `timber.save.v1`.
  - Workboat World's work-in-progress address (`/SWVR/next/`) shares the same storage as its main game too.
- **Voyages mode** is Workboat World's `voyage.html?map=<id>`, not `?mode=voyages`. Ardentrive is inside the Oban and Lorn map (`voyage.html?map=oban`, Kerrera to Connel), whose region the coast pipeline made with the same kind of projection. So the `return` URL is the Voyages page and map the player left from, built at the moment of leaving.
- **Big Timber picks its place before its code loads** (`src/world/maps.ts`): the menu's choice, or `?map=`. In linked mode the `site` decides the place (`loch-timber-1` is Ardentrive, Kerrera), before the menu.
- **Big Timber is multiplayer** (peer to peer). Linked mode is solo in version 1, like the boat game's side.

## Testing

Each repository can test its half alone with a hand-made `mv`. Each adds `tools/mv-encode.html` (or a console snippet) that encodes and decodes envelopes. The cases are in the owner's spec, "Test plan and edge cases". The known soft spots accepted for version 1: the envelope is unsigned (a player can edit their own URL, for example `cargo.logs` to 999), and clearing Workboat World's storage between leaving and returning loses the issued id, so the barge never spawns.
