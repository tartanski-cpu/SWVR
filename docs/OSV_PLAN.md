# The offshore support vessel: plan

The owner's brief (31 Oct 2026): "a much larger class of vessel", an offshore support vessel with
an interior, an engine room and a bigger bridge with several control stations for the cranes on
her deck; a one-off (her hull not configurable in the Shipyard), with much more equipment than
the other boats; "one mega ship to do multiplayer co-op type of missions in": launch a RIB, tie a
line to something, lift things.

Researched by the hull modifications chat (`docs/progress/hulls.md`); the owner's decisions on it
are below. Each milestone names the chat whose files it's in. Shared changes stay small and are
said in that chat's log, as ever (CLAUDE.md, "Working in areas").

## What these ships do

- **Platform supply vessels** (50-100 m) carry deck cargo and liquids to rigs and platforms.
- **Anchor-handling tug supply vessels** add towing and running rigs' anchors over a stern roller, with remote shark jaws and towing pins.
- **Multipurpose (MPSV) and construction support vessels** carry a heave-compensated main crane (100-250 t), an auxiliary crane, ROVs launched over the side or through a moonpool, and dynamic positioning (DP).
- **Emergency response and rescue vessels** stand by platforms with fast rescue craft and daughter craft (launched in up to 3.5 m seas), fire monitors, oil-spill gear and a hospital.
- **Walk-to-work vessels** have a motion-compensated gangway onto turbines.

Their bridges are split in two:
- **forward:** navigation;
- **aft:** looking over the working deck, with DP and joystick seats (usually two, one for the ship and one for the job), and crane and ROV positions.

## The owner's decisions (31 Oct 2026)

- **Type:** multipurpose (MPSV), with rescue craft and towing.
- **Name and place:** End Game, career only, anchored offshore, a RIB in the small harbour to take you to her (below).
- **Size:** about 75 m (the hull study: 75 x 18 m, 5.6 m draught, about 5,000 t).
- **No walk-to-work gangway** (saves triangles and draw calls).
- **Helideck:** a simple one, drawn only for now; to be come back to.
- **Players:** four, no more.
- **No moonpool.** Hull sections can't have holes, and the sea inside the hull isn't masked.
- **ROV:** the existing hand-off to Submersible World first (the dive A-frame's DIVE), not an ROV in this game.
- **Crane loads swing:** a simple pendulum, one hanging weight, not rope physics. This applies to the small deck cranes too, not only hers.
- **Between decks:** whatever is most efficient (below).

## The ship

**Hull and superstructure** (milestone 1, done in the hull study, `src/hulls/designs.ts` `mpsv`):
- a round-bilge steel hull, 75.0 x 18.0 m, 5.6 m draught, about 5,060 t;
- block coefficient 0.68, waterplane coefficient 0.88, KM 8.6 m (GM about 2 m with her weight 6.5 m up);
- a long low working deck aft (1.6 m freeboard, 45 m of it) to a wide transom over her azimuth thrusters;
- a forecastle a deck (2.8 m) higher from 60 % of her length forward;
- a four-tier superstructure on it: three accommodation tiers, then the bridge, with raked windows forward and a full row aft over the deck;
- the helideck on the bridge roof.

**Her gear** (to come, as modules):
- a main offshore crane, about 100 t, heave-compensated, starboard aft;
- an auxiliary crane, about 10 t, to port;
- two fast rescue craft (6 m RIBs) on davits, one each side;
- a tow winch, stern roller, shark jaws and towing pins;
- fire monitors on the superstructure;
- an ROV hangar door and launch frame (the dive A-frame's hand-off).

**Her drive** (to come): diesel-electric, four generator sets, two azimuth thrusters aft, two bow tunnel thrusters, DP.

## Moving between decks: the most efficient way

Real stairs between four or five decks would mean many walkable stair ramps (each a chance of the transverse-stair kind of bug) and geometry to draw. Instead:

- **Inside: a stair-tower door on each deck.** Use it ("Up", "Down", or the deck's name) and you arrive at the door on the next deck, as the engine room's "Go below" moves you below today. The stair tower itself isn't drawn or walked.
- **Outside: ladders** where real ships have them (the forecastle, the bridge wings), as the existing roof ladder.
- **Each space loads on its own** (the engine room's technique, generalised): inside the bridge, the mess or the engine room, the rest of her is hidden, which is what keeps her cheap on the Quest.

## Co-op roles and missions (four players)

**Roles:**
- master / DP operator (aft bridge);
- crane operator (crane chair);
- deck crew (hooks, tag lines, lines, sea fastening);
- rescue-craft coxswain;
- engineer (power plant).

Not every role needs a player: unmanned stations can be left alone, or an AI can take them later.

**Missions**, on the career's construction-project framework (`src/career/projects.ts`), whose jobs any of the players' boats can do:
- supply lift to a platform;
- person overboard with the rescue craft;
- lower a module onto the seabed;
- anchor handling for a rig move;
- platform fire;
- tow a disabled ship;
- oil-spill boom laid with a rescue craft towing its end;
- the ROV dive hand-off.

## Milestones

| # | What | Whose files |
|---|---|---|
| 1 | Her hull, superstructure and helideck; her figures | Hull modifications (done: `mpsv` in the hull study) |
| 2 | Her one-off in the Shipyard (handed over 31 Oct): hull, house and gear fixed; paint and a few equipment choices; career only (above) | Shipyard |
| 3 | "Spaces": the engine room's separate-space technique generalised (bridge, mess and cabins, engine room and its control room), stair-tower doors between decks | Main game |
| 4 | Her bridge: a navigation console forward; aft, two DP and joystick seats and a crane chair per crane; a COMMAND handover so one station has the ship at a time; numbered crane and station bus keys (`crane.1.slew`, ...) | Modular builder (modules), main game (the helm) |
| 5 | Her drive: more than two propulsion units (today port and starboard only), bow tunnel thrusters, DP (joystick, heading hold, position hold, follow a target); her own resistance curve (the game's displacement curve gives her about twice a ship's, tuned on small tugs: 218 kN at 12 kn against about 115 kN) | Main game (shared vessel physics), the owner's call on scope |
| 6 | Offshore cranes: the 100 t crane, heave compensation, load moment, the load's list and trim; the pendulum swing on every crane | Modular builder |
| 7 | Rescue craft on davits (the tender-crane launch, crew aboard before it's lowered); "tie a line": carry a line's end to a bollard or padeye and it becomes a spring line, as the towline (no rope physics) | Modular builder (davits), main game (lines) |
| 8 | Her engine room: diesel-electric, generators, switchboard, power management | Main game |
| 9 | Missions and roles; a job board on her bridge | Main game |

The Quest is watched throughout:
- the 25 m tug already uses 127-153 draw calls on deck (budget about 100-200);
- she'll need her static parts merged, repeated ones instanced and small detail hidden from afar;
- every interior is hidden unless you're in it.

## Where she works (the owner, 31 Oct 2026)

- **Her name: End Game.** She's the career's end-game ship.
- **Career mode only.** She isn't in Voyage, Training or free play, and the Shipyard doesn't hand her out as a design to sail anywhere.
- **Anchored offshore.** She never berths: the game's harbours are too small for her.
- **When you get her, you get a RIB too.** It spawns in the small harbour, ready to take you out to her. (The main game chat is to confirm which harbour the owner means; in the home region, Brannock Pier is the smaller one.)
- How the career gives her to you (bought, earned, a contract's reward) is the main game chat's, with the owner.

## Still open

- How far DP goes (milestone 5).
- How the career gives her to you.
