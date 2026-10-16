# Multiplayer

Co-op crew on one shared boat, peer-to-peer: one player hosts, the others join with a 5-digit game code. Version 1 lives on the `multiplayer` branch.

## How to play

1. **Host:** open the menu (Y in VR, O on desktop) → **Crew** tab → **Host a game**. The status line shows the game code, e.g. `Hosting, code 48213: 1 aboard`.
2. **Join:** on the other headset or browser, **Crew** tab → type the code on the keypad → **Join**. You join aboard the workboat, wherever she is.
3. **Leave:** **Leave game** (or **Stop hosting**). Everyone carries on alone from where things were. If the host leaves, the crew get "The host left" and continue solo.

Everyone can use every control. **Levers, the wheel and the searchlight joystick have one owner at a time:** the first hand on it keeps it until it lets go. If a crew-mate has it, the control glows red when you reach for it and your grip gets a firm bump instead of grabbing. Buttons and switches anyone can press.

**Names:** Crew tab → **Your name** → **Change** cycles through Skipper, Mate, Bosun and so on (typing in VR is awkward). Your name shows on a tag over your head and can be changed mid-game.

**Cargo together:** anyone can pick up, carry, set down and lash cargo. A crate in someone's hands shows in their avatar's hands, and nobody else can take it until they set it down. If a player leaves while carrying something, it's set down where they stood.

## Design

**Host-authoritative peer-to-peer** over WebRTC data channels, using [PeerJS](https://peerjs.com/) (about 100 KB, approved by the owner).

- **The host's browser runs the simulation** exactly as in single player: `stepWorld()` at 60 Hz. Clients don't simulate.
- **No server of ours.** The free public PeerJS broker (`0.peerjs.com`) only introduces the two browsers. After that the game data flows directly between them. The room code `48213` is registered with the broker as the peer id `swvr-room-48213`.
- **Why not a dedicated server** (the earlier recommendation): it needs a paid always-on host. P2P costs nothing, and for co-op the host being the authority is fine.
- **Limits:** if the host's network blocks WebRTC (some corporate or carrier-grade NAT), peers can't connect without a TURN relay. PeerJS's free tier tries STUN only. Home Wi-Fi works.

### Messages (`net/protocol.ts`)

```
client -> host   hello     { name }                 on connect
host -> client   welcome   { playerId, world }      your player id + the whole world
client -> host   intents   { intents }              boat, environment, cargo intents
client -> host   pose      { pose }                 20 Hz: feet, head, hands (and VR hands' orientation)
host -> client   snapshot  { world }                20 Hz: the whole WorldState
```

- **Snapshots** are the full `WorldState` as JSON, about 2.6 KB. At 20 Hz that's about 50 KB/s per client. Deltas can come later if it ever matters.
- **Intents** arrive at the host stamped with the sender's player id; a client can't act as another player.
- **Poses** are client-authoritative. Each player walks, climbs and boards locally with no latency and sends where they are, in the frame of what they're aboard (vessel-local on deck). Trusting them is fine for co-op.

### The moving frame

Everything a player sends is in the frame they stand in: on deck, that's the vessel's body frame. A crew-mate standing at the wheel is a fixed vessel-local position, so they ride the boat exactly with no jitter however much she rolls. Avatars (`net/avatarView.ts`) are parented to the vessel's scene node and eased toward each 20 Hz update.

### Client rendering and time

- The client keeps the last 8 snapshots and renders **0.12 s behind** the newest, blending the boat's pose between the two snapshots around that time (`ClientSession.bracket`, `VesselView.setPoseBetween`).
- **Host clock:** each snapshot carries the host's sim time. The client tracks `hostTime − localTime`, snapping down to faster samples and drifting up slowly, so jitter doesn't make the render clock jump.
- **Waves** are a pure function of world time and the wave components in the snapshot, so the client draws the same sea at its render time. The boat and the water agree.
- **Everything else** (controls, engine, fuel, cargo, docking, anchor, lights, time of day, other players) comes straight from the newest snapshot. Gauges, sounds and effects read it as in single player.

### Control ownership

`VesselState.holds` maps a grab control's channel to the player holding it. A local grab sends `hold` = 1 (ref = channel), letting go sends 0. The simulation grants a hold only if it's free, and ignores lever/helm/spot intents from anyone but the holder. If two players grab within one round trip, the host's order decides: the loser's interaction system sees the hold belongs to someone else, lets go and bumps the controller. A player who leaves releases everything they held.

### Latency feel

- **Your hand on a control:** instant. A held control shows the hand's position, not the state.
- **The boat's response:** about 0.12 s plus the network round trip. A 12 m displacement boat responds over seconds, so you can't feel it. Client-side prediction isn't worth its complexity here.
- **Walking:** local and instant.

## Code

| File | What |
|---|---|
| `net/protocol.ts` | Message types, rates |
| `net/transport.ts` | `PeerHostTransport` / `PeerClientTransport` (PeerJS), `LoopbackHost` (in memory, JSON round trip, for tests) |
| `net/hostSession.ts` | Accepts players, queues their intents, writes their poses, broadcasts snapshots |
| `net/clientSession.ts` | Snapshot buffer, host clock, interpolation brackets |
| `net/avatarView.ts` | Remote players: head with visor, gloved hands turned as the real ones are, body |
| `app/App.ts` | `hostGame`, `joinGame`, `connectClient`, `leaveGame`, `followHost` (client frame), `updateNetPose` |
| `ui/mainMenu.ts` | **Crew** tab with keypad |

Tests: `tests/net.test.ts` (loopback host and client: welcome, intents stamped and validated, poses, snapshots, interpolation, disconnects). The broker can't be reached from the build sandbox, so the PeerJS path itself is tested on real devices.

## Not yet

- **Several boats** (not wanted for now): the world and views already handle many vessels; it needs spawning a second boat and the bridge, audio and menu following "the boat I'm aboard" instead of the one test boat.
- **Voice chat** (WebRTC can carry audio on the same connection). Not wanted for now.
- **Host migration:** if the host leaves, the game ends for everyone.
- **TURN relay** for networks where direct connections fail (a paid or self-hosted service; ask first).
