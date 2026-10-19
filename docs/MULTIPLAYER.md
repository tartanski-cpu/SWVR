# Multiplayer

Co-op crew on one shared boat, peer-to-peer: one player hosts, the others join with a 5-digit game code. Version 1 lives on the `multiplayer` branch.

## How to play

1. **Host:** open the menu (Y in VR, O on desktop) → **Crew** tab → **Host a game**. The status line shows the game code, e.g. `Hosting, code 48213: 1 aboard`.
2. **Join:** on the other headset or browser, **Crew** tab → type the code on the keypad → **Join**. You join aboard the host's boat, wherever she is. If she isn't the boat you're in (a Shipyard design, the landing craft, or the workboat fitted out otherwise by the host's career), your game starts again in her and joins again by itself, in a few seconds; in VR, enter VR again.
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
- **The host's boat:** `world.build` says how she was built: her Shipyard code if she's a design, and the workboat's equipment she was fitted out without (career upgrade ids). On the welcome the crew compare it with their own boat (App `sameBoatAsHost`); if it differs, the page reloads with `?design=` (or `?boat=`), `?fit=` (what's fitted) and `?join=CODE`, builds her, and joins again. `join` and its `fit` are taken off the address once read, so a later reload is your own game again.
- **The crew copy every part of the snapshot** but their own player (the pots and the fuel hoses were missed when the parts were listed one by one).
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

### Voice

- **The calls:** a WebRTC audio call between each pair of players, through the same PeerJS peer as the game (four players: three calls each). Of each pair, the one whose network id sorts first calls (`net/voice.ts shouldCall`), the other answers. The host gives each player their network id (`PlayerState.peerId`; the host's own is the room id), so everyone knows whom to call from the snapshots.
- **The microphone:** asked for once you're in a game and the sound is on, with echo cancellation and noise suppression. Refused or missing: you send silence and still hear everyone. Mute in Menu → Crew.
- **How a voice is heard** (`voiceRoute`, `CONFIG.voice`): proximity from their head (full to 2 m, nothing past 22 m), always; and while their handheld's talk button is held (`avatar.radio.tx`, in the pose), through your radio within 5 km: band-passed, overdriven, no direction, a squelch at each end, hiss near the edge. A radio that's transmitting hears nobody.
- **Off by default** (`userSettings.voiceChat`, Menu → Crew → Voice chat): off, no microphone, no calls answered or made, no radio.
- **The handset:** `player/radioHandset.ts` (VR high on the left shoulder: grip, trigger; desktop V); others see it on your shoulder or in your hand.

## Code

| File | What |
|---|---|
| `net/protocol.ts` | Message types, rates |
| `net/transport.ts` | `PeerHostTransport` / `PeerClientTransport` (PeerJS), `LoopbackHost` (in memory, JSON round trip, for tests) |
| `net/hostSession.ts` | Accepts players, queues their intents, writes their poses, broadcasts snapshots |
| `net/clientSession.ts` | Snapshot buffer, host clock, interpolation brackets |
| `net/avatarView.ts` | Remote players: an upper-body figure (head, torso, elbowed arms, gloved hands turned as the real ones are) |
| `net/avatarOutfits.ts` | Their working clothes: a random look per player, picked by the host when they join |
| `app/App.ts` | `hostGame`, `joinGame`, `connectClient`, `leaveGame`, `followHost` (client frame), `updateNetPose` |
| `net/voice.ts` | Voice: the calls, proximity and radio sound |
| `player/radioHandset.ts` | The handheld VHF |
| `ui/mainMenu.ts` | **Crew** tab with keypad, voice status and mute |

Tests: `tests/net.test.ts` (loopback host and client: welcome, intents stamped and validated, poses, snapshots, interpolation, disconnects). The broker can't be reached from the build sandbox, so the PeerJS path itself is tested on real devices.

## Not yet

- **Several boats** (not wanted for now): the world and views already handle many vessels; it needs spawning a second boat and the bridge, audio and menu following "the boat I'm aboard" instead of the one test boat.
- **Voice through walls and hills:** the radio's range ignores the land (the owner: forget the hills), and proximity voice isn't muffled by the wheelhouse.
- **Host migration:** if the host leaves, the game ends for everyone.
- **TURN relay** for networks where direct connections fail (a paid or self-hosted service; ask first).
