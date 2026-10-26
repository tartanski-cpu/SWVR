# Workboat World × Timber: the shared contract

The owner's spec, 23 Oct 2026, section 2. The same file goes in both repositories (SWVR and BigTImberVR). Neither game imports code from the other: they only meet in the address bar, at two moments:

- **Out:** Workboat World → Timber, when the player anchors in a marked bay and chooses to go ashore.
- **Back:** Timber → Workboat World, when the player returns to the boat, with logs or without.

Version 1 is single-player. In a multiplayer Voyage, the handoff happens only when you're alone (solo, or hosting with no crew aboard).

**Changed by the owner (25 Oct 2026): the logs on the beach, no barge.** Coming back with logs, Workboat World lays them on the site's beach, at the beach delivery zone, side by side and each pointing out to sea. The player tows them off one at a time (a line on a log, pulled off the beach, towed across) and sells each to the timber merchant. Rafting them together is for later. Timber no longer shows a barge: the logs stay stacked in its staked area until the player goes back to the boat. The envelope is unchanged: `barge_ready` keeps its name (see below), so every version of either game still understands the other.

**Changed by the owner (23 Oct 2026): no prompt.** Anchoring in the hotspot (anchor set, under 0.5 kn, inside the radius, 3 s) goes straight to Timber, on desktop and in VR. Coming back anchored in the bay doesn't send the player straight back: the anchor has to be weighed and let go again.

**In VR, both ways:** neither game should end its VR session before navigating; just fade and navigate. Where the browser supports WebXR navigation, the next page gets a `sessiongranted` event on `navigator.xr` and can start its immersive session with no button press.
- three.js's `VRButton` already does this if the event comes before the button is made. Workboat World also catches one that comes after (`src/app/xrSession.ts`: on `sessiongranted`, wait 0.6 s, then press the button if not already in VR).
- The button also uses `navigator.xr.offerSession` where the browser has it: the Quest browser then offers "Enter VR" in its own interface, one tap.
- Where neither is available, the player presses Enter VR on the new page.

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
| `status` | Timber | `none`, or `barge_ready`: there are logs to collect. The name is the first version's, when they came on a barge; it stays so that every version of both games understands it. |
| `cargo.logs` | Timber | Number of logs to collect when `status` is `barge_ready`. Workboat lays up to 40 on the beach; more is capped at 40. Timber sends at most 40 a trip and keeps the rest for the next. |

## Rules

- Encode with base64url, no padding, of the compact JSON string (UTF-8). Decode defensively: a malformed `mv` means ignore it and start normally.
- Both games strip `mv` from the address bar with `history.replaceState` immediately after reading it, so a refresh never replays a handoff.
- Workboat keeps lists of issued and consumed `id` values in localStorage (`swvr.mv.issued`, `swvr.mv.consumed`). A returning envelope whose `id` is already consumed, or was never issued, spawns nothing.
- Timber must not change `boat`, `pos`, `time`, `site`, `id` or `return`. It only sets `from`, `status` and `cargo`.
- Each game saves its own full state locally before navigating away. The envelope is a message, not a save file.

## Site registry

Coordinates are real-world WGS84, so the coast pipeline places them the same in both games.

| Site id | Name | Hotspot centre (lat, lon) | Hotspot radius | Beach delivery zone (lat, lon) | Barge spawn (lat, lon; unused since 25 Oct 2026) | Timber URL |
|---|---|---|---|---|---|---|
| `loch-timber-1` | Ardentrive, Kerrera | 56.4117° N, 5.50156° W | 60 m | 56.41237° N, 5.50156° W | 56.41178° N, 5.50078° W | https://tartanski-cpu.github.io/BigTImberVR/ |

- The hotspot lies in about 5 m of water in Ardantrive Bay, with land to the north and west.
- The beach is the head of the bay, about 75 m north of the hotspot's centre. Workboat World lays the logs there; Timber puts its staked area on its own dry ground nearest that point.
- The barge spawn is in 4-5 m of water, about 70 m off the beach and 50 m east of the hotspot's centre, clear of where you'd anchor. Since the logs go on the beach it's no longer used; it stays in the table for a later barge or raft.

Adding a second site later means adding one row here and one scene in Timber. In Workboat World it's one entry in `src/voyage/metaverse.ts` `SITES`, plus its map's geography in `MAP_GEO` if it's on a new map.

## Testing either side alone

Workboat World publishes a page for making and reading envelopes, `tools/mv-encode.html`: at https://tartanski-cpu.github.io/SWVR/next/tools/mv-encode.html now, and at /SWVR/tools/mv-encode.html once `next` goes to the live game.
- **Make the outbound link:** a Timber address with a `from: workboat` envelope, to test Timber's linked mode.
- **Make the return link:** a Workboat World address with a `from: timber` envelope (status, logs). Its tick-box first issues the id in that browser, so Workboat World accepts the return once. Opening it a second time spawns nothing.
- **Read an envelope:** paste an `mv` value or a whole address.

## In Workboat World (for reference)

- `src/voyage/metaverse.ts`: the envelope, the site registry, and lat/lon to the map's metres (the coast pipeline's own projection).
- `src/voyage/timber.ts`: the anchoring trigger, the logs laid on the beach (`logsFromCamp`) and their sale at the merchant (`stepTimberLogs`); a barge saved before 25 Oct 2026 still comes back and sells.
- `src/salvage/salvage.ts`: the logs themselves (salvage logs marked `timber`: pulled off the beach and towed like washed-up timber).
- `src/voyage/timberView.ts`: a barge's logs on deck, and the bay's buoy.
- `src/app/App.ts`: the handoff out and the return.
- Settings: `CONFIG.voyage.timber`.
