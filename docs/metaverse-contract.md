# Workboat World × Timber: the shared contract

The owner's spec, 23 Oct 2026, section 2. The same file goes in both repositories (SWVR and BigTImberVR). Neither game imports code from the other: they only meet in the address bar, at two moments:

- **Out:** Workboat World → Timber, when the player anchors in a marked bay and chooses to go ashore.
- **Back:** Timber → Workboat World, when the player returns to the boat, with a barge of logs or without.

Version 1 is single-player. In a multiplayer Voyage, the handoff is offered only when you're alone (solo, or hosting with no crew aboard).

## The envelope

State crosses as one JSON envelope, base64url-encoded (no padding) from its compact JSON, in a single URL query parameter named `mv`. Each game reads only the fields it needs and ignores the rest.

```json
{
  "v": 1,
  "id": "8f3a9c",
  "from": "workboat",
  "site": "loch-timber-1",
  "return": "https://tartanski-cpu.github.io/SWVR/voyage.html?map=oban",
  "boat": { "id": "pilotBoat", "name": "Pilot boat 11.2 m" },
  "pos": { "lat": 56.4117, "lon": -5.50156, "hdg": 240 },
  "time": { "hour": 14.5 },
  "status": "none",
  "cargo": { "logs": 0 }
}
```

| Field | Set by | Meaning |
|---|---|---|
| `v` | both | Contract version. Reject anything other than 1 and fall back to normal play. |
| `id` | Workboat | Random 6-character handoff id. Timber echoes it back unchanged. Workboat uses it to consume each return exactly once. |
| `from` | both | `workboat` on the way out, `timber` on the way back. |
| `site` | Workboat | Which hotspot triggered the handoff. Timber uses it to pick the scene. |
| `return` | Workboat | Absolute URL Timber navigates back to, with `mv` appended (`&mv=...`; the URL already has a query). |
| `boat`, `pos`, `time` | Workboat | Echoed back by Timber. Timber may use `time.hour` (0-24) for its own lighting. `pos` is WGS84 lat/lon and heading (degrees true). |
| `status` | Timber | `none` or `barge_ready`. |
| `cargo.logs` | Timber | Number of logs on the barge when `status` is `barge_ready`. Workboat carries up to 30 on one barge. |

## Rules

- Encode with base64url, no padding, of the compact JSON string (UTF-8). Decode defensively: a malformed `mv` means ignore it and start normally.
- Both games strip `mv` from the address bar with `history.replaceState` immediately after reading it, so a refresh never replays a handoff.
- Workboat keeps lists of issued and consumed `id` values in localStorage (`swvr.mv.issued`, `swvr.mv.consumed`). A returning envelope whose `id` is already consumed, or was never issued, spawns nothing.
- Timber must not change `boat`, `pos`, `time`, `site`, `id` or `return`. It only sets `from`, `status` and `cargo`.
- Each game saves its own full state locally before navigating away. The envelope is a message, not a save file.

## Site registry

Coordinates are real-world WGS84, so the coast pipeline places them the same in both games.

| Site id | Name | Hotspot centre (lat, lon) | Hotspot radius | Beach delivery zone (lat, lon) | Barge spawn (lat, lon) | Timber URL |
|---|---|---|---|---|---|---|
| `loch-timber-1` | Ardentrive, Kerrera | 56.4117° N, 5.50156° W | 60 m | 56.41237° N, 5.50156° W | 56.41178° N, 5.50078° W | https://tartanski-cpu.github.io/BigTImberVR/ |

- The hotspot lies in about 5 m of water in Ardantrive Bay, with land to the north and west.
- The beach is the head of the bay, about 75 m north of the hotspot's centre.
- The barge spawn is in 4-5 m of water, about 70 m off the beach and 50 m east of the hotspot's centre, clear of where you'd anchor.

Adding a second site later means adding one row here and one scene in Timber. In Workboat World it's one entry in `src/voyage/metaverse.ts` `SITES`, plus its map's geography in `MAP_GEO` if it's on a new map.

## In Workboat World (for reference)

- `src/voyage/metaverse.ts`: the envelope, the site registry, and lat/lon to the map's metres (the coast pipeline's own projection).
- `src/voyage/timber.ts`: the anchoring trigger, the log barge and the sale.
- `src/voyage/timberView.ts`: the logs on deck and the bay's buoy.
- `src/app/App.ts`: the handoff out and the return.
- Settings: `CONFIG.voyage.timber`.
