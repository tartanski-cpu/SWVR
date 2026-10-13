# Multiplayer: design notes

Nothing here is implemented. This document records how co-op would be added on top of the MVP's structure, so the work can start without rethinking the architecture.

## Recommendation

Use a **host-authoritative simulation over WebSockets**, with a small Node server running the same `stepWorld()` the browser runs today.

- **Why it's cheap here:** `src/core`, `src/vessel/physics`, `src/ocean/waves.ts` and the environment state import no DOM or Three.js code. `tests/simulation.test.ts` already runs the sim headless in Node.
- **Why server-authoritative rather than peer-to-peer:** one source of truth for boat physics, no NAT traversal, and no player's browser has to be the host. Co-op players are trusted, so we need authority for consistency, not anti-cheat.
- **The cost:** a small always-on server (about 1 vCPU per few sessions). That's a **paid service**, so it's the owner's call before any of this starts. A WebRTC data channel could later sit behind the same message interface.

## What already fits

| MVP rule | Why it matters for networking |
|---|---|
| Input → `Intent` → `stepWorld` → `WorldState` → views | Remote clients just send intents. Nothing in input code changes state directly. |
| `WorldState` is plain JSON with string ids | Snapshots serialize as-is. No class instances or scene objects to strip. |
| Fixed 60 Hz tick, views interpolate between ticks | The server ticks at 60 Hz; clients render from interpolated snapshots, as they do today with local ticks. |
| The local player is `world.players[localPlayerId]` | A second player is just another entry. Nothing assumes a singleton. |
| Controls emit **absolute** values (`lever = 0.6`, not "+0.1") | Intents are idempotent: a lost or duplicated message can't drift a control. |
| Held controls ignore state while a local hand holds them | The holder sees their own lever with zero latency. Everyone else sees the authoritative value. |
| Player positions are in the vessel frame they're aboard | A player standing on a rolling deck is a few bytes of vessel-local position. No world-space jitter. |

## Messages

```
client → server   { type: 'hello', name }                       → server assigns playerId
client → server   { type: 'intents', tick, intents: Intent[] }   (sent each frame there are any)
client → server   { type: 'pose', position, yaw, aboardVesselId, head?, hands? }  (~20 Hz)
server → client   { type: 'welcome', playerId, world: WorldState }
server → client   { type: 'snapshot', tick, vessels, environment, players }    (~20 Hz)
```

- **Snapshots.** Vessel state is small: pose, velocities, engine, rudder, controls. That's roughly 300 bytes per boat as JSON, so full snapshots at 20 Hz are fine for a handful of boats. Deltas or a binary encoding can come later if the archipelago gets busy.
- **Wave time.** Waves are a pure function of `world.time`, so clients only need the server tick to draw the same sea. There's no ocean state to sync.

## Changes per module

- **`core/simulation.ts`:** no change. The server calls `stepWorld(world, intentsSinceLastTick, dt)`.
- **`core/ids.ts`:** only the server mints ids (`IdFactory` already notes this). Clients receive theirs in `welcome`.
- **`app/App.ts`:**
  - Online, replace the local `FixedStepLoop` and `stepWorld` with a `NetSession`. It sends intents and keeps the last two snapshots.
  - `VesselView.snapshot()` / `update(alpha)` then interpolate between server snapshots about 100 ms behind, instead of between local ticks.
  - Offline play keeps today's path.
- **Player bodies (`player/locomotion.ts`, `playerState.ts`):** locomotion stays **client-authoritative**. Each client moves its own player locally, exactly as now, and sends `pose`. The server copies it into `world.players` and rebroadcasts. Boarding (`board` intent) stays an intent, because it changes which frame positions are in.
- **Remote avatars (new `player/avatarView.ts`):** a simple head and two hands, parented to the vessel root they're aboard, posed from the vessel-local data. They ride the boat with no extra smoothing.
- **Controls (`controls/*`):**
  - Add an owner per grab control (`heldBy: playerId | null` in `VesselState.controls`) so two people can't fight over the lever.
  - The server grants the first grab intent; others see the control locked (haptic bump, no movement).
  - The wheel can allow two holders from the same player only, as now.
- **Audio and effects:** no change. They already read vessel state, which now comes from snapshots.

## Latency feel

- **Your own controls:** instant, because the held-control rule shows the hand's value locally.
- **Your own boat's response:** arrives with about 100 ms interpolation delay plus round trip. A 12 m displacement boat responds over seconds, so this delay is far below what you can feel. Client-side prediction of vessel physics is **not** worth its complexity for slow boats.
- **Walking:** local and instant (client-authoritative).

## Suggested order of work

1. A headless Node server: `stepWorld` loop, WebSocket broadcast, intents in, plus a debug client that just prints snapshots.
2. A client `NetSession` with snapshot interpolation. Two browser tabs drive the same boat.
3. Remote avatars and `pose` messages.
4. Control ownership.
5. Hosting, after the owner approves a provider.
