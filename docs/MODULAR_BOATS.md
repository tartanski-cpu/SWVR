# Modular boats: plan

Status: **agreed; M1 under way.**

**Owner's decisions:**
- **The landing craft** is the 9 m landing-bow work skiff from the owner's photo (hull study `landingCraft`): a flattish single hull with a **single inboard** diesel, kept simple.
  - This removes the catamaran items from the contracts: no demihull stations, no twin propulsors.
  - Several engine bays stay possible in the socket design, but nothing is built for them yet.
- **Saves stay as today:** only hull damage and engine wear carry over between sessions.
- **Order:**
  1. Prove the modular system on the existing workboat.
  2. Then on the landing craft.
  3. Only then add new parts.

  Electric drive, shore power, generator, solar and hybrid (old M4b and M4c) move after M7.
- The simulation/view split (2.1), the mechanism library (2.8) and instanced switches (2.10) went ahead as proposed, with no objection.

The aim, in the owner's words: rebuild the boat as an assembly of reusable modules on a hull, so that a new boat is mostly a hull model plus a recipe, not new code. The first result is invisible. The starter workboat is assembled from a recipe at runtime and looks and plays exactly as it does in v1.0. The proof comes afterwards: the landing craft costs almost no new logic.

This document has six parts:

1. How the boat is built today, and what is hard-coded to it.
2. Where the brief and the code disagree, with my recommendation for each.
3. The contracts (the brief's Part A) as TypeScript interfaces.
4. Every current control, instrument and mechanism, and the module it becomes.
5. The milestone plan, with test steps.
6. Questions for the owner.

Code words in this document: a *module* is a self-contained part (a lever, an engine, a crane). A *socket* is a named mounting point. The *bus* is the per-boat list of named values that modules read and write. A *recipe* is the boat's parts list in JSON. *Sim* means the simulation, which runs on the host only. *View* means the drawing, which runs on every player's machine.

---

## 1. How the boat is built today

### The pieces

| Layer | Where | What it holds |
|---|---|---|
| Tunables and layout | `src/config.ts`, `vessels.workboat` (about 820 lines) | Hull parameters, mass, damping, resistance, engine, propeller, rudder, and **the absolute position of every control, light and piece of gear** in vessel axes. |
| Static definition | `src/vessel/vesselDef.ts` | `VesselDef`: the config plus derived values (stations, inertia, wetted surface). About 30 optional equipment fields (`bridge?`, `anchor?`, `towWinch?`, `tenderCrane?`...). `WorkboatDef` / `isWorkboat()` / `asWorkboat()` mean "has *all* of the workboat's equipment". `VESSEL_DEFS` is a fixed registry: workboat, skiff, derelict, logRaft, barge. |
| Live state | `src/vessel/vesselState.ts` | `VesselState`: pose and velocities, `controls` (27 named fields), `engine` (19 fields), `anchor`, `mooring`, `electrics` (master, selector, two batteries, volts, amps, 7 breakers), `tender`, `bilge`, `damage`, `holds`. It is plain JSON. |
| Intents | `src/vessel/vesselControl.ts` `applyVesselIntent` | One big `switch` of about 50 control names. Each case clamps its value and writes one field of `VesselState`. |
| Simulation | `src/core/simulation.ts` `stepWorld` | Per vessel: `stepVessel` (hydrostatics, then the engine, propeller and rudder *inside* the rigid-body step, then anchor and mooring forces), then `stepElectrics`, `stepBilge`, `stepOil`, `stepWear`. Then the world systems: tow (including the winch), fishing (including the A-frame), fire (including the monitor), rescue, crane, duties, career, tutorial. |
| Hull drawing | `src/vessel/view/hullMesh.ts` | One merged mesh from the 17 stations plus the layout block: bulwarks, rails, wheelhouse, roof, ladder, console body. |
| Bridge | `src/controls/bridge.ts` `Bridge` | About 40 controls, created **one by one** from `def.bridge` positions, with `if (def.fireMonitor)` / `if (def.fishing)` / `if (def.towWinch)` blocks. It also builds the engine under the floor hatch, the swim ladder and the winch drum. The controls' fixed parts are baked into one mesh, and the labels into another. |
| Lights and effects | `src/vessel/view/vesselEffects.ts` | Nav lights, cabin light, deck lights, searchlight, smoke, anchor chain and mooring lines, built only if `isWorkboat(def)` (all or nothing). |
| App wiring | `src/app/App.ts` (2400 lines) | Builds the bridge, whiteboard, duty board, chart table, wind sock, crane views and tillers for **the one test vessel** (`testVesselId`). Each frame it feeds them state and computes outputs (winch drum turning, hatch open, leaf folded, wheelhouse shut for sound). |
| Walking | `src/vessel/layout.ts` | Walk area from the hull and layout, with the chart table, engine hatch, crane cradle, winch and A-frame feet hard-coded as obstacles. |
| Saves | `app/careerSession.ts`, `career.ts` | Only the hull `damage` and engine `wear` are saved (with the career). Battery charge is saved only if `drainBetweenSessions` is on (it's off). Fuel, oil, breakers and switch positions start fresh every session. |
| Multiplayer | `src/net/*` | The host sends the **whole `WorldState`** 20 times a second. Nothing about a boat's definition is sent: both sides build from their own `VESSEL_DEFS`. On joining, the client checks that the vessel ids match. |

### What is hard-coded to the workboat

- **Placement.** Every control, lamp and fitting has an absolute position in `vessels.workboat` (e.g. the lever at `[0.45, 2.16, -1.15]`). Nothing is placed relative to a console or a mount.
- **One own boat.** App keeps one `testVesselId` and one `testDef = asWorkboat(...)`, which throws if the boat lacks any workboat equipment. About 20 singletons in App (bridge, chart table, boards, wind sock, binoculars, towline post, trawl view, sounds) assume that one boat. Twelve world systems find "our boat" as *the first vessel that `isWorkboat`* (tow, fishing, fire, rescue, salvage, duties, forecast, tutorial, career, traffic, host join).
- **Plain channels mean the workboat.** A bridge control sends `'lever'` and App routes it to `testVesselId`. A second bridge would drive the first boat. The skiff works around this with `'<vesselId>:helm'`.
- **The intent switch** knows every control name, its range and its field.
- **Electrics** are a fixed list of seven breakers (`BREAKERS`), with `loadAmps()` summing a fixed list of loads by name.
- **Systems reach across.** The tow code reads the winch buttons and hydraulics. The fishing code reads the A-frame geometry. The duties and tutorial read breakers and the engine. Rescue reads the gear positions and "propeller in gear". The instruments read the anchor and depth.
- **Walk-area obstacles** for the furniture and deck gear are hard-coded in `layout.ts`.
- **The engine is inside the hull's physics step.** Thrust depends on the speed through the water and how deep the propeller is, and the forces act at the shaft and rudder. The same goes for the anchor chain and the mooring lines.
- **"Workboat" is all or nothing.** The physics runs the inboard engine, anchor and mooring only `if (isWorkboat(def))`, and `isWorkboat` checks 14 pieces of equipment, the whiteboard and searchlight among them. A boat without a whiteboard would lose her engine.
- **The breaker names are spread around.** `isPowered(v, 'radio')` alone appears in five mission files. `loadAmps()` reads 13 switches from eight different pieces of equipment.
- **The simulation writes switches.** The trawl moves the TRAWL switch to follow the net, and the crane writes the skiff's throttle, motor and gear when she's hoisted. One machine writing another's control is exactly what modules must not do.
- **One drum, two jobs.** The tow winch's drum also takes the trawl warps. App works out whether it should turn from the tow *and* the fishing state, and the drum's geometry is drawn in `bridge.ts` and worked out again in `tow.ts`.
- **"Propeller turning" means the inboard's gear.** The rescue rule reads `engine.gear`, so a survivor would climb aboard into the skiff's turning outboard. A generic `propulsion.gear` fixes this for free.
- **Duty texts name physical places** ("FIRE PUMP (console, right of the wheel)"). With modules, these come from the control's own label and where it's mounted.

**What already helps:**
- Controls already speak in absolute values through `emit(channel, value)` and draw from state in `sync()`. That is the intent/state split the brief asks for.
- Controls are already built at their own origin and then positioned, so a socket transform drops straight in.
- Static parts are already baked into merged meshes.
- The world is already plain JSON, so module state can live in it and be saved and synced for free.
- The skiff and the three tows already show "different boats, same physics".
- The skiff's electric outboard and battery are a working electric drive to generalise.

**What is not there:** the brief mentions "the existing mechanism system (joints, drums, wires) from the deck machinery requirements". **There is no such library in the code.** The crane solves its two arms inline in its view, the winch drum is a rotating group, the A-frame is static, and the ropes are drawn three different ways. Section 2 covers this.

---

## 2. Where the brief and the code disagree (recommendations)

These are the points where building the brief literally would be unwise or would break something. Each one says what I recommend and why.

### 2.1 A module has two halves: simulation and view

The brief's `ModuleInstance` holds meshes *and* `tick()` *and* `serialize()` together. In this game that breaks three things:
- **Multiplayer.** Only the host simulates; crew draw snapshots. A crew machine must build the meshes but never run `tick`.
- **Tests and sea trials** run the simulation headless, with no scene. They must be able to tick an engine without building a lever.
- **Saves and sync.** The world is plain JSON and is sent whole. Module state that lives inside a class instance would need `serialize()` on every snapshot, 20 times a second.

**Recommendation:** one `ModuleDefinition` with a `sim` half and a `view` half.
- The sim half is a set of plain functions over plain state. Its state lives in `VesselState.modules[socketPath]`, so it is saved and synced like everything else, and `serialize/restore` aren't needed. `migrate` stays.
- The view half builds the meshes and controls, and reads the bus each frame.

A module may have only one half: a pure control has no sim, and a fuel tank has no view.

### 2.2 The bus is polled, not notified

The brief asks for change notifications. Every view today *samples* state each frame, and the instruments already redraw only when what they show has changed. Callbacks would fire in an order that depends on module order, and they don't survive a snapshot on a crew machine (the whole world is replaced 20 times a second).

**Recommendation:**
- No callbacks.
- Views read the bus each frame (it's a property lookup).
- Anything expensive keeps a "last seen" key, as the instruments do now.
- A small `BusWatcher` says when any of a view's keys has changed by a visible amount.

### 2.3 Modules get a physics port, not just the bus

The engine, rudder, anchor, mooring lines, towline and trawl all push on the hull *during* the rigid-body step. They need the speed through the water at their point and how deep they are, and they return a force at a point. That can't go through the bus a tick late without changing the handling.

**Recommendation:**
- Propulsion and other force-producing modules implement `physics(port, state, dt)`. The hull integrator calls it at the same moment it calls `stepEngineAndPropeller` now.
- The port gives water velocity and immersion at a socket point, and takes forces at points.
- This keeps the numbers identical, and it means a later twin-engine boat would just be two modules in two engine bays.

### 2.4 Ports: a module's connections are named, and the recipe can rewire them

A rev counter reads `propulsion.rpm`. On a twin-engine boat there are two. A generic lever might drive the throttle on one boat and a crane slew on another.

**Recommendation:**
- Each module declares named **ports** with a default bus key (the rev counter's `rpm` port defaults to `propulsion.rpm`).
- A recipe can rebind a port: `"bind": { "rpm": "propulsion.port.rpm" }`.
- With one engine you write nothing.
- This is the brief's "a module only reads and writes the bus", made reusable.

### 2.5 The energy network is a service, and modules declare their role

The brief's source / store / load roles fit well.

**Recommendation:**
- Each module *declares* its role, for example `{ role: 'load', circuit: 'instruments', kw: (bus) => ... }`.
- One energy-network service (part of the assembler, not a module) sums them each tick. It applies load priorities when power is short, charges and discharges the stores, and writes `power.*`, `battery.*` and `circuit.<name>.live` to the bus.
- Modules still never see each other.

**One naval-architecture point to agree on.** Real electric and hybrid boats have a high-voltage propulsion bank (48–800 V) and a separate 12/24 V house system fed through a DC-DC converter. I suggest the network allows more than one bank, with a DC-DC converter module between them.
- The diesel workboat has only the 12 V house bank, so it behaves exactly as now.
- Internally the 12 V model keeps its amps and volts, so the voltmeter reads the same. The bus carries kW and kWh as the brief asks.

### 2.6 The hull's lightship mass must make room for module masses

Today the workboat is 18.3 t with the CG over the LCB, chosen so she floats on her DWL. If batteries, engines and tanks start adding their own mass on top, she sinks and trims.

**Recommendation:**
- The hull carries the *lightship* mass and CG excluding modules that declare a mass.
- For the starter boat, only the modules that matter for handling declare one (engine, batteries; fuel stays out, as today).
- The hull's figure is reduced so the **total mass, CG and inertia are unchanged**, with a test that checks it.
- A heavier battery boat is then honestly heavier and slower.

### 2.7 Sockets carry the hull's dimensions where a module spans the hull

Some modules can't be "built relative to a point":
- the A-frame's legs land on the quarters;
- the cleats sit on the bulwark top;
- the fenders hang on the topsides;
- the rail LEDs follow the bulwark.

**Recommendation:**
- The module's build context gives **read-only hull queries**: half-beam and deck height at z, bulwark top, transom, stem.
- Sockets may carry a span (the A-frame's foot spacing comes from the `stern.gantry` socket).
- This is the hull, not another module, so the rule holds.

### 2.8 The mechanism library doesn't exist yet

**Recommendation:** extract a small one during the deck-gear milestone, from code that already works:
- the crane's two-arm solver (law of cosines);
- a rotating drum;
- one shared way to draw a line or rope: a sagging catenary-like curve, used by the towline, mooring lines, crane wire and the future shore-power cable.

It is a library, not a module, as the brief says. It adds no physics bodies or ropes: the lines stay drawn curves.

### 2.9 Interlocks: a readable string, checked when the recipe loads

The brief's `"when": "aframe.position > 0.1"` is readable, which matters for hand-written JSON.

**Recommendation:**
- Keep that form.
- A tiny parser turns it into a structured rule when the recipe loads, and checks that the key exists and the types match.
- Two effects:
  - **limit a bus key**: `engine.maxThrottle` to 0.2;
  - **disable a control**: `control:dipstick`. A disabled control can't be touched, and pressing it gives the existing warning and buzz.

What exists today, sorted:

| Today | Kind | Becomes |
|---|---|---|
| Start only in neutral | Inside the engine | Stays in the engine module (config `startOnlyInNeutral`). |
| Deck machinery needs engine running + DECK HYD | Power | A *need*: crane, winch and net drum need `hydraulic`; the PTO pump provides it. |
| Fire jet needs pump on + engine running | Power | A *need* on the fire monitor. |
| Dipstick and oil can only with the hatch open | Between modules | **Recipe interlock**: `hatch.engine.open < 0.5` blocks `control:dipstick`, `control:oilCan`. |
| Chart drawing only with the leaf unfolded | Inside the module | Stays in the chart-table module. |
| Skiff's tiller and remote disabled while she's covered in the cradle | Between vessels | **Skiff recipe interlock** on `tender.phase`. |
| Survivors won't climb aboard with the prop turning | World rule | The rescue system reads `propulsion.gear`. |

The brief's two examples are new:
- The crane can't hit the A-frame on today's boat: the crane is forward and the A-frame is aft.
- The ramp rule belongs to the landing craft's recipe.

### 2.10 Moving parts: the target needs instanced switches

Today the bridge has about 35 separately drawn moving controls: every toggle bat, button cap, breaker, key and joystick is its own draw call. They are hidden from outside the wheelhouse to save cost. "Under ~15 moving parts on the bridge" is reachable only by **instancing**:
- all toggle bats are one `InstancedMesh`;
- all button caps another;
- all breaker bats another.

Each control owns one instance slot, and its hit test uses the invisible proxy it already keeps. This changes `Toggle`, `Button` and friends internally, with no visible difference. I recommend it, and the milestones measure it.

**As built in M3b** (`modular/sharedParts.ts`): a module hands the assembler its control's own moving mesh (`ctx.share(toggle.batMesh, 'toggleBat')`). The mesh is hidden but kept, so the control still moves it and the pointer still hits it; each frame its place, colour and glow are copied to its instance (uploaded only on change). The glow (hover, a lit button) needs a per-instance emissive, which three doesn't have, so the shared material adds one in its shader. The breaker bats are toggle bats like any other. The lamps stay their own panels' instanced meshes (already one draw each). Controls not yet modules (the trawl and winch buttons, the door buttons) keep their own meshes until they are converted.

**One deviation from Part C:** the six dash screens already share **one** canvas atlas (one texture, one draw call), which is better than "one texture each". I'll keep the shared atlas: each display module paints its own region of it.

### 2.11 Which bus keys are saved

The brief says "the bus is the save unit". Saving the whole bus would change the game: today fuel, oil, battery and breakers start fresh each session.

**Recommendation:** each registry key carries a `persist` flag. In the invisible refactor the flags reproduce today exactly (damage, wear, and the battery only with `drainBetweenSessions`). Saving more is then a one-word change per key, when the owner wants it.

### 2.12 "Modules never import each other": checked by a test, not a lint tool

There is no ESLint in the project, and adding it is a large dev dependency. A vitest test can read the import lines under `src/modules/` and fail if one module imports another module's folder. It has no new dependency and runs with `npm test`, so the Pages build enforces it too.

### 2.13 The landing craft (decided: the monohull skiff, one inboard)

The hull study has two:
- the **Catamaran landing craft** (15 m, shortlisted);
- the **Coastal work skiff with a landing bow** (9 m, drawn from your photo).

The catamaran needs two things the game's physics doesn't have:
- stations made of **two demihull sections** (strip theory clips one polygon per station today);
- **two propulsors** (one engine today).

**Decided:** the monohull landing-bow skiff with one inboard diesel, which needs neither.

One thing to know: her design is a planing hull, and the game has no planing lift (agreed at the start: displacement physics). In the game she'll run as a semi-displacement boat, with the same levelled-off wave resistance the workboat has past hull speed. Her top speed will be set by her engine against that curve. She won't climb onto the plane.

Either way, the new hull should come from the hull study's lofting (`src/hulls/loft.ts`): the same sections make the mesh and the physics stations, as they do now. The workboat keeps her current hull generator, so her shape and handling don't move by a millimetre.

### 2.14 Not in the game, so not converted

From the brief's catalogue:
- No **rotary switch** and no **radar display**: radar was replaced by AIS on the plotter; the "radar" upgrade adds echoes there.
- No **generator, solar panels or shore power**.

The convert-only milestones won't create them. Generator, solar and shore power are new features, covered in M9 and M10, after the proof.

---

## 3. The contracts (Part A)

**As built in M1:** the files in `src/modular/` are the source of truth; the listings below are the design, cut down. Writing them changed a few details:
- the bus has a `BusWatcher` instead of `changedAt` (2.2);
- each key says who writes it (`writer`: a module, the boat's own motion, or not-yet-converted code), so the recipe check knows what is "always there" during the rebuild;
- a socket's unit limit is `maxUnits` (not a `slots` table);
- a hull carried `legacyDef` until M6b, standing on today's vessel definition (since 6b it holds its own `fittings`), and `provides` (her wiring);
- no demihulls (the owner chose the monohull landing craft).

Five files in `src/modular/`, plus the bus key registry, which the brief asks to keep in one file:

```
src/modular/bus.ts       the Bus interface and the key registry types
src/modular/busKeys.ts   THE registry: every key, its type, unit, range, who writes it
src/modular/socket.ts    sockets and transforms
src/modular/module.ts    module definitions (sim half, view half, ports, power roles)
src/modular/hull.ts      hull definitions
src/modular/recipe.ts    recipes, interlocks, the validator
```

Below are the interfaces, cut to what matters. Comments marked **Differs** explain where they depart from the brief or from today's code.

### 3.1 Bus (`bus.ts`, `busKeys.ts`)

```ts
/** A value on the bus. Enums are strings from a fixed list. */
export type BusValue = number | boolean | string;

/**
 * One entry in the registry (busKeys.ts). The registry is the single list of every named
 * value a boat carries, with its unit, so a recipe can be checked at load: every port a
 * module reads must be written by something (a module, the hull or a control).
 */
export interface BusKeySpec {
  /** Namespaced name: 'throttle.demand', 'propulsion.rpm', 'circuit.instruments.live'. */
  key: string;
  type: 'number' | 'boolean' | 'enum';
  /** Unit in words for numbers: 'rpm', 'deg', 'kW', 'kWh', 'V', 'A', 'kn', '°C', 'L', '0..1'. */
  unit?: string;
  /** Allowed range; values written from an intent are clamped to it (replaces the switch). */
  range?: [number, number];
  /** Snap to whole numbers (switch positions, gear). */
  integer?: boolean;
  values?: readonly string[];
  /** 'intent': set by players through controls (validated, may be held); 'state': set by the sim only. */
  kind: 'intent' | 'state';
  default: BusValue;
  /** Grab-control ownership group (today's holds: 'lever', 'helm', 'spotPan', 'monPan'). */
  hold?: string;
  /** Kept between sessions (see 2.11). */
  persist?: boolean;
  /** An intent key the named module's sim may also set (a switch that follows its machine). */
  followedBy?: string;
  /** Old names that still resolve (e.g. 'engine.rpm' for 'propulsion.rpm'). Never removed. */
  aliases?: readonly string[];
  /** One plain sentence for the debug viewer and the generated key table. */
  doc: string;
}

/**
 * A boat's bus. Differs from the brief: no change callbacks (see 2.2); readers poll.
 * Writes from the sim only; players change 'intent' keys through the intent path.
 */
export interface BusReader {
  get(key: BusKey): BusValue;
  num(key: BusKey): number;
  /** Does this boat carry this key at all? */
  has(key: BusKey): boolean;
}
export interface Bus extends BusReader {
  set(key: BusKey, value: BusValue): void;
}
```

**Storage, in two steps, so the game stays playable:**
1. **Facade (M1–M4).** Each registry key maps onto today's `VesselState` field, e.g. `throttle.demand` ↔ `controls.lever`. Snapshots, saves and every existing reader are untouched.
2. **Flat record (M6).** Once nothing reads the old fields directly, storage moves to `VesselState.bus: Record<string, BusValue>`. The old field names become aliases, and old saves migrate.

`BusKey` is a TypeScript type generated from the registry, so a misspelt key is a compile error.

**Switches that follow the machine.** The TRAWL switch flips itself when the net is fully out or in. A key may say `followedBy: 'trawl'`: the sim may write that intent key back, and only that module may. The crane writing the skiff's controls becomes the skiff's own outboard reading `tender.phase` and switching itself off.

**Intents get simpler.** A control's `emit(channel, value)` names a bus key. `applyVesselIntent` looks the key up, checks the hold, clamps to the range and writes it. Only actions that need the world stay as named intents: cleats (berths), crane (the tender), refuel (the berth), teleports and debug.

### 3.2 Socket (`socket.ts`)

```ts
export type SocketType =
  | 'helm.console' | 'panel.slot' | 'panel.breaker'
  | 'deck.equipment' | 'stern.gantry' | 'bow.ramp' | 'roof.mount' | 'hull.light'
  | 'engine.bay' | 'deck.panel' | 'shore.inlet' | 'cabin.furniture'
  // Added (each has something today that needs it):
  | 'cabin.overhead'   // under the wheelhouse roof: VHF, chartplotter, overhead panel, cabin lamp
  | 'wall.panel'       // a wall mount: battery master and selector, door buttons
  | 'deck.fitting'     // small deck gear: cleats, fender basket, life-ring station, boat-hook clips, swim ladder
  | 'bow.windlass'     // anchor windlass and hawse
  | 'tender.cradle'    // where a ship's boat stows (the skiff)
  | 'window.wiper';    // one per wiped windscreen pane

/** Position (m) and rotation (deg, applied Y then X then Z) relative to the parent. */
export interface Transform {
  position: [number, number, number];
  rotationDeg?: [number, number, number];
}

/**
 * What the hull (or a parent module) allows on this socket.
 * Differs from the brief: named limits, not one number, because an engine bay limits power
 * AND mass AND size, and a crane socket has a load rating.
 */
export interface SocketCapacity {
  maxPowerKw?: number;
  maxMassKg?: number;
  /** Box the module must fit in (m, socket axes). */
  size?: [number, number, number];
  /** Safe working load (kg) for lifting gear. */
  loadRatingKg?: number;
  /** How many units (battery banks...) of one module it takes. */
  maxUnits?: number;
}

export interface Socket {
  /** Unique among its siblings; a full path joins parents: 'helm/slot3'. */
  id: string;
  type: SocketType;
  /** Relative to the hull, or to the module that exposes it (nesting). */
  transform: Transform;
  capacity?: SocketCapacity;
  /** 'inboard', 'outboard', 'port', 'slew:-120..120', 'propeller:[0,-0.5,4.9]'. */
  tags?: readonly string[];
  /** Hull geometry the module needs here (2.7): e.g. the A-frame's foot spacing. */
  span?: number;
}

/** Can this module go on this socket? A readable reason if not. */
export function fits(def: ModuleDefinition, socket: Socket, config: unknown): { ok: true } | { ok: false; why: string };
```

### 3.3 Module (`module.ts`)

```ts
/**
 * Differs from the brief (2.1): one definition, a SIM half (host only, headless, plain
 * state in VesselState.modules) and a VIEW half (every client: meshes and controls).
 * No serialize/restore: the state is plain JSON already. migrate() stays.
 */
export interface ModuleDefinition<Config = unknown, State = unknown> {
  /** Stable forever: 'control.throttle-lever'. Renaming = add an alias. */
  id: string;
  aliases?: readonly string[];
  /** Bump on a breaking change to State; migrate() brings old saves forward. */
  version: number;
  fits: readonly SocketType[];
  /** Default config; a recipe overrides any part of it (lever travel, crane speeds...). */
  defaults: Config;
  validateConfig?(c: Config): string[];
  /** Named connections to the bus with default keys; a recipe may rebind them (2.4). */
  ports: Record<string, PortSpec>;
  needs(c: Config): Requirement[];
  provides(c: Config): Provision[];
  /** Mass, CG (socket axes), size and power for the capacity check and the boat's mass (2.6). */
  physical?(c: Config): { massKg?: number; cg?: [number, number, number]; size?: [number, number, number]; powerKw?: number };
  /** Its role in the energy network (2.5). */
  power?(c: Config): PowerRole[];
  /** Sockets this module offers its own children (a console's slots, a mast's light). */
  sockets?(c: Config): Socket[];
  sim?: ModuleSim<Config, State>;
  view?: ModuleView<Config, State>;
  migrate?(old: unknown, fromVersion: number): State;
}

export interface PortSpec {
  dir: 'read' | 'write';
  /** Default bus key (generic keys: propulsion.rpm, not engine1.rpm). */
  key: BusKey;
  /** Read ports: false = may be left unconnected (a lamp that shows nothing). */
  required?: boolean;
}

export type Requirement =
  | { port: string }                               // the port's key must be written by someone
  | { power: 'electrical'; circuit?: string }      // e.g. the Instruments breaker
  | { power: 'hydraulic' }
  | { power: 'pto' }                               // the engine's power take-off turning (the fire pump)
  | { fuel: 'diesel' };
export type Provision =
  | { port: string }
  | { power: 'electrical' | 'hydraulic' | 'pto' }
  | { circuit: string }
  | { fuel: 'diesel' };

export type PowerRole =
  | { role: 'source'; bank?: string; kw: (bus: BusReader) => number }            // alternator, genset, solar, shore
  | { role: 'store'; bank: string; kWh: number; maxChargeKw: number; maxDischargeKw: number; nominalV: number }
  | { role: 'load'; bank?: string; circuit?: string; priority: number; kw: (bus: BusReader) => number };

/** Host-only, headless. Pure functions of (bus, own state, dt): same idiom as today's step* functions. */
export interface ModuleSim<Config, State> {
  init(c: Config): State;
  /** Fixed tick, after intents, alongside today's stepElectrics/stepBilge. */
  tick(ctx: SimContext<Config>, s: State, dt: number): void;
  /** Inside the hull's rigid-body step, for anything that pushes on the hull (2.3). */
  physics?(port: PhysicsPort, ctx: SimContext<Config>, s: State, dt: number): void;
}
export interface SimContext<Config> {
  config: Config;
  socket: Socket;
  /** Reads and writes through this module's ports (rebinding is invisible to the module). */
  io: PortIO;
  /** Read-only world facts a module may need: water depth, sun, wind, time. Never other modules. */
  env: EnvironmentReader;
}
export interface PhysicsPort {
  /** Water velocity relative to the hull at a point (socket axes) and how deep that point is. */
  flowAt(local: [number, number, number]): { u: number; v: number; w: number; depth: number };
  addForce(local: [number, number, number], force: [number, number, number]): void;
}

/** Every client. Builds once at assembly; updates each frame from the bus. */
export interface ModuleView<Config, State> {
  build(ctx: ViewContext<Config>): ModuleViewInstance<State>;
}
export interface ViewContext<Config> {
  config: Config;
  socket: Socket;
  /** Hull queries for modules that span the hull (2.7). */
  hull: HullQueries;
  /** The shared palette (Part C): colours for merged parts, shared materials. */
  palette: Palette;
  /** Ask for an instance of a shared moving part (toggle bat, button cap...): Part C. */
  instance(part: SharedPartKind): InstanceHandle;
  /** A region of the shared display atlas. */
  display(widthPx: number, heightPx: number): DisplayRegion;
  audio: ModuleAudio;
}
export interface ModuleViewInstance<State> {
  /** Merged into the boat's shared meshes per material at load (Part C). */
  staticParts: THREE.BufferGeometry[];
  /** Kept separate: these cost draw calls, and the overlay counts them. */
  movingParts: THREE.Object3D[];
  /** The existing Control components (Lever, Toggle, Button, Wheel, Joystick...). */
  controls: Control[];
  /** Solid for walking and cargo (chart table, winch, A-frame feet); may depend on state. */
  footprints?(read: BusReader): Footprint[];
  update(read: BusReader, s: State | undefined, dt: number, viewer: ViewerInfo): void;
  dispose?(): void;
}
```

### 3.4 Hull (`hull.ts`)

```ts
/**
 * The bespoke, sculpted part: shape, handling numbers, walkable surfaces, sockets. No
 * behaviour beyond floating. Doors and hatches belong to the shape; their open/shut is a
 * bus key, worked by ordinary button modules.
 */
export interface HullDefinition {
  id: string;           // 'hull.workboat-12m'
  version: number;
  /** Where the stations come from: today's chine generator (the workboat, unchanged), or the hull study's loft. */
  form: { kind: 'chine'; params: HullParams } | { kind: 'loft'; design: HullDesign };
  /** Lightship: WITHOUT modules that declare their own mass (2.6). */
  lightship: { massKg: number; cg: [number, number, number]; gyradius: { roll: number; pitch: number; yaw: number } };
  addedMass: AddedMass;
  damping: Damping;
  resistance: Resistance;
  windage: Windage;
  /** Rudder blades (shape, sized to the hull), each turned by a bus key. */
  rudders?: { position: [number, number, number]; area: number; liftSlope: number; stallDeg: number; maxAngleDeg: number; angleKey: BusKey }[];
  /** Deck, wheelhouse floor, roof, ladders, steps; solids for walls and the console. */
  layout: HullLayout;
  /** Where you stand at the helm and face (boarding spot). */
  helm: { stand: [number, number, number]; yawDeg: number };
  /** Doors, hatches, windows that are part of the shape, each with its bus key. */
  features: HullFeature[];
  sockets: Socket[];
  livery: Livery;
  /** Procedural from the form (now) or a glTF from Blender (later). */
  mesh?: { kind: 'procedural' } | { kind: 'gltf'; url: string };
}

/** Read-only geometry for modules (2.7). */
export interface HullQueries {
  halfBeam(z: number): number;
  deckY(z: number): number;
  bulwarkTop(z: number): number;
  transom: number;
  stem: number;
}
```

### 3.5 Recipe (`recipe.ts`)

```ts
/** Plain data, loadable from JSON; hand-written now, the shipyard writes it later. */
export interface Recipe {
  id: string;            // 'vessel.starter-workboat'
  version: number;
  name: string;          // what players see
  hull: string;          // 'hull.workboat-12m'
  modules: Mount[];
  interlocks?: InterlockSpec[];
  /** Order loads are shed when power is short (2.5): lowest first. */
  loadPriority?: Record<string, number>;
}

export interface Mount {
  socket: string;                       // a socket id on the hull or on the parent module
  module: string;                       // a module id (or alias)
  config?: Record<string, unknown>;     // overrides of the module's defaults
  bind?: Record<string, BusKey>;        // port rebinding (2.4)
  modules?: Mount[];                    // children on this module's own sockets
}

export interface InterlockSpec {
  /** 'hatch.engine.open < 0.5', 'aframe.position > 0.1 && crane.slewing'. Parsed at load (2.9). */
  when: string;
  /** Limit a bus key... */
  limit?: { key: BusKey; to: number | [number, number] };
  /** ...or disable controls. */
  disable?: string[];                  // 'control:dipstick'
  /** Shown with the warning buzz when someone tries. */
  message?: string;
}

/**
 * Checks a recipe in milliseconds, before anything is built. Every problem, each in one
 * plain sentence with its path:
 *   "helm/slot3: instrument.rpm reads propulsion.rpm, but nothing on this boat writes it"
 *   "engineBay: engine.diesel-600 is 600 kW; this bay takes up to 450 kW"
 *   "foredeck.1: deck.crane-small does not fit a 'roof.mount' socket"
 *   "interlock 2: unknown key 'ramp.stat' (did you mean 'ramp.state'?)"
 */
export function validateRecipe(r: Recipe, lib: { hulls: HullLibrary; modules: ModuleLibrary; keys: KeyRegistry }): string[];
```

**The assembler.** `src/modular/assemble.ts` isn't a contract, but everything flows through it:
- `assembleSim(recipe)` produces the derived `VesselDef` (stations, mass, inertia) plus the mounted module list.
- `assembleView(recipe)` builds the meshes:
  - it merges every module's static parts into the boat's shared meshes per palette material;
  - it creates the shared instanced meshes;
  - it hands the controls to the interaction system.

**Save shape** (Part D):

```json
{ "recipe": { "...": "full recipe JSON for a player-built boat, or" },
  "recipeId": "vessel.starter-workboat", "recipeVersion": 3,
  "bus": { "only keys marked persist": 0 },
  "modules": { "engineBay": { "version": 1, "state": {} } } }
```

**Multiplayer:**
- The host sends the recipes in the `welcome` message, and again in a small `recipe` message if a new one appears mid-game. Built-in recipes go by id.
- The join check compares recipe ids and versions instead of vessel ids.
- Snapshots don't change: the bus and module state are inside `VesselState`.

### 3.6 Tests written before any conversion (M1)

| Test | Checks |
|---|---|
| Registry | Every key has a type, unit (numbers) and doc. Ranges are sane. No duplicate names or aliases. Every alias resolves. |
| Sockets | Type matching. Capacity (power, mass, size, load rating, slot counts) with readable refusals. Nested socket paths. |
| Recipes | A valid recipe passes. Each kind of error gives its sentence: unknown module, wrong socket type, unmet read port, over capacity, missing circuit, bad interlock key or type, duplicate socket use. |
| Ports | Rebinding changes what a module reads. Two engines with bound keys validate; unbound, they conflict. |
| Interlock parser | Comparisons, `&&`, enum strings, numbers. Rejects junk with a position. |
| State round trip | `JSON.parse(JSON.stringify(...))` of the bus and module state equals the original. `migrate` from an old version. |
| Import boundary | No file under `src/modules/<a>/` imports from `src/modules/<b>/` (2.12). |
| Golden runs | See M1: the old boat's behaviour is recorded once; every later milestone must reproduce it. |

---

## 4. Every current part, as a module

The bus keys named here are first proposals. M1 writes them into the registry, with today's field each one stands for.

### Controls on the bridge (convert, then mount in console slots)

| Today | Module | Socket | Ports (default key) |
|---|---|---|---|
| Throttle/gear lever, its pedestal | `control.throttle-lever` | `panel.slot` on the console | writes `throttle.demand` (−1..1; today `controls.lever`; hold `lever`) |
| Wheel | `control.wheel` | `panel.slot` | writes `helm.demand` (−1..1; `controls.helm`; hold `helm`) |
| HEAT, START (hold) | `control.push-button` ×2 (momentary) | `panel.slot` | writes `ignition.heat`, `ignition.start` |
| Ignition key | `control.key-switch` | `panel.slot` | writes `ignition.key` (today `engine.key`) |
| Horn button | `control.push-button` (momentary) | `panel.slot` | writes `horn.sound` |
| NAV LIGHTS, ANCHOR, CABIN (3-way), SPOT, WIPERS, FIRE PUMP, TRAWL switches | `control.toggle` (2- or 3-way, colour, label in config) | `panel.slot` | each writes its key: `lights.nav`, `anchor.letGo`, `lights.cabin`, `searchlight.on`, `wipers.on`, `firePump.on`, `trawl.shoot` |
| Searchlight joystick, fire-monitor joystick | `control.joystick` (2-axis rate control) | `panel.slot` (pedestal in config) | writes `searchlight.pan/tilt` or `monitor.pan/tilt` by binding (hold group) |
| SKIFF CRANE button | `control.push-button` (pulse) | `panel.slot` | writes `crane.cycle` (the tender's crane; see the deck-gear note) |
| Labels, group plates, the dash body, the pedestals | part of `console.standard` | `helm.console` | none (static) |
| Start-up card | `furniture.placard` (text in config) | `panel.slot` | none |
| Binoculars on the dash | `gear.binoculars` | `panel.slot` | none (a hand tool) |

### Instruments

| Today | Module | Reads |
|---|---|---|
| Speed / depth / anchor screen | `instrument.speed-log` | `nav.speedKts`, `nav.depthUnderKeel`, `anchor.phase`, `anchor.chainOut`, `anchor.dragging` |
| Heading tape | `instrument.heading` | `nav.heading` |
| RPM dial with gear and load | `instrument.rpm` | `propulsion.rpm`, `propulsion.gear`, `propulsion.load`, `propulsion.state` |
| Rudder indicator | `instrument.rudder-angle` | `rudder.angle`, `helm.demand` |
| Engine monitor (temps, fuel, alarms) | `instrument.engine-monitor` | `engine.coolantC`, `engine.oilC`, `fuel.litres`, `fuel.flowLph`, `alarm.highTemp`, `alarm.lowFuel` |
| NAV / WIND overhead | `instrument.nav-wind` | `nav.lat/lon/sog/cog/heading`, `env.windTrue*` (environment reader) |
| Warning lamps (OIL, CHARGE, GLOW, NEUTRAL, BILGE) | `instrument.warning-lamp` ×5 (one instanced part) | one key each: `engine.oilPressureLow`, `electrical.notCharging`, `ignition.glowLamp`, `propulsion.neutral`, `bilge.alarm` |
| Voltmeter | `instrument.voltmeter` | `electrical.busVoltage` |
| Breaker lamps | part of `panel.breakers` | `circuit.<name>.live` |
| Chartplotter (overhead) | `instrument.chartplotter` | `nav.*`, and world data (ports, search area, AIS) through the environment reader |
| VHF set and handset | `radio.vhf` | `circuit.radio.live`; the world's radio traffic (read-only) |
| FM radio (display, power, tune) | `radio.fm` (with its own two controls) | writes `fm.on`, `fm.station` |
| Wind sock | `instrument.wind-sock` (`roof.mount`) | apparent wind (environment) |

All six screens keep **one shared atlas** (2.10): each instrument module asks for a region.

### Panels

| Today | Module |
|---|---|
| Helm console with the dash and pedestals | `console.standard`: nested `panel.slot` sockets in config, so a different boat lays out its own bridge as a sub-recipe. |
| Overhead switch panel | `console.overhead` (`cabin.overhead`): slots for the deck-flood, rail-light and FM controls. |
| Breaker panel and voltmeter | `panel.breakers`, config `circuits: [...]` (today's seven), a slot for the voltmeter. Writes `breaker.<name>`. |
| Battery master, battery selector | `electrical.battery-master`, `electrical.battery-selector` (`wall.panel`). |

### Electrical and power

| Today | Module | Role |
|---|---|---|
| Two 100 Ah batteries | `electrical.battery-bank` (config `banks: 2`, `ah: 100`, `nominalV: 12`) | store |
| Alternator (60 A) | part of the diesel propulsion module | source |
| Every load in `electrics.loads` | declared by its own module (instruments by the instrument modules, horn by the horn...) | load |
| Starter, glow plugs | part of the diesel module | load |
| Nav lights (four lamps) | `light.nav` ×4 (`hull.light`: masthead on the mast, sidelights, stern), config `kind` and arc | load on `navLights` |
| Deck floods ×2 | `light.flood` ×2 (`roof.mount`) | load on `deckLights` |
| Rail LED strips | `light.rail-strip` (follows the bulwark through hull queries) | load |
| Cabin lamp (off / white / red) | `light.cabin` (`cabin.overhead`) | load |
| Chart lamp | part of `furniture.chart-table` | load |
| Wipers and rain glass | `electrical.wipers` (`window.wiper` sockets; the wet-glass shader stays with the hull's windscreen) | load on `instruments` |
| Bilge pump (float switch) | `pump.bilge` (`engine.bay`) | load on `bilge` |
| Horn | `signal.horn` (`roof.mount`) | load |
| Deck hydraulics (PTO pump, clutch) | `hydraulics.pto-pump` (`engine.bay`), needs propulsion running and the `hydraulics` circuit | provides `hydraulic` |
| Shore-power inlet, solar panels, generator, DC-DC | **new** (M9, M10): `shore.inlet`, `power.solar`, `power.genset`, `power.dcdc` | source / load |

### Propulsion and machinery

| Today | Module |
|---|---|
| Diesel, gearbox, propeller, ignition, coolant and oil temperatures, oil level, wear, exhaust smoke, engine sound, the engine model under the hatch | `propulsion.diesel-inboard` (`engine.bay`, tag `inboard`). The engine's data moves from `vessels.workboat.engine` and `propeller` into its config. It writes `propulsion.*`, `engine.*`, `fuel.flow`. Its dipstick and oil can are its own controls. |
| Fuel tank (900 L) | `fuel.tank` (`engine.bay`), a store the engine and the future generator draw from |
| Rudder and mechanical steering | The blade is the hull's (shape). `steering.mechanical` (rate `null`) or `steering.hydraulic` (a rate) turns `helm.demand` into `rudder.angle`. |
| Skiff's electric outboard, tiller, gear lever, battery gauge, power button | `propulsion.electric-outboard`, `control.tiller`, `control.gear-selector`: the skiff's recipe |
| Electric inboard motor | **new** `propulsion.electric-inboard` (M9), the same `throttle.demand` → `propulsion.*` |

### Furniture

| Today | Module |
|---|---|
| Chart table (drop leaf, gate leg, chart, pencil, eraser, pen holder, lamp and switch) | `furniture.chart-table` (`cabin.furniture`). Its footprint follows `chartTable.leafOpen`. |
| Duty board | `furniture.duty-board` |
| Crew whiteboard | `furniture.whiteboard` |
| Start-up card | `furniture.placard` |

### Deck gear

| Today | Module | Socket |
|---|---|---|
| Tender crane, cradle, tarpaulin, the crane's control box | `deck.tender-crane` (load rating 400 kg) plus `deck.tender-cradle` | `deck.equipment` + `tender.cradle` |
| Skiff's crane remote | `control.push-button` in the skiff's recipe, bound to the crane intent (between vessels, see below) | skiff `panel.slot` |
| A-frame (legs, braces, blocks) with the PAY OUT / HAUL box | `deck.a-frame` (`stern.gantry`, span from the socket), exposing two `panel.slot` sockets for its buttons | `stern.gantry` |
| Trawl net, warps, floats | `fishing.trawl` (reads `trawl.shoot`, `net.out/in`; its drag acts through the physics port at the A-frame's blocks, which the A-frame publishes as `aframe.blockL/R`) | `deck.equipment` |
| Tow winch, drum, HEAVE IN / PAY OUT | `deck.tow-winch` (drum from the mechanism library). It publishes `winch.drumSpeed`, which the view turns from. The trawl asks for the drum through the bus (`winch.netDemand`), not by reading the tow. | `deck.equipment` |
| Stern roller in the transom notch | `deck.stern-roller` (publishes `tow.leadPoint`) | `stern.gantry` |
| Anchor, chain, windlass | `deck.anchor-windlass` (physics port for the chain) | `bow.windlass` |
| Searchlight | `deck.searchlight` | `roof.mount` |
| Fire monitor | `deck.fire-monitor` (needs the engine running and 12 V, as today; not DECK HYD; stabilised in config) | `roof.mount` |
| Mast | `mount.mast`, exposing a `hull.light` for the masthead light | `roof.mount` |
| Mooring cleats ×4 | `deck.cleat` ×4 (each publishes its line point) | `deck.fitting` |
| Fender basket and fenders | `deck.fenders` (hang positions from hull queries) | `deck.fitting` |
| Swim ladder | `deck.swim-ladder` | `deck.fitting` |
| Life ring, line and cleat | `rescue.life-ring-station` | `deck.fitting` |
| Boat hook and clips | `rescue.boat-hook-rack` | `deck.fitting` |

### What stays with the hull

These are part of the hull, not modules:
- the hull, bulwarks, rails, wheelhouse shell, window band and roof;
- the ladder to the roof;
- the aft door (`door.aft.open`) and its two push buttons, which are button modules on `wall.panel` sockets;
- the engine-room hatch (`hatch.engine.open`) and its lifting ring;
- the stern notch;
- the exhaust outlet point;
- the windscreen panes.

### What stays a world system (not modules), now reading the bus

Cargo, rescue, tow jobs, fire jobs, salvage, fishing jobs, duties, career, tutorial, traffic and weather. Two changes:
- **Finding "our boat".** They stop finding it as "the first `isWorkboat`" and use the player's boat (a world field, `world.homeVesselId`).
- **Asking what a boat can do.** They ask by provision: "has a tow point", "has a trawl", "has a fire monitor", "has a life ring". They stop testing `def.towWinch` and `def.fishing`.

**Between vessels.** The tender relationship (the skiff stowed in the workboat's cradle) is between two vessels, so it stays a world relationship (`TenderState`) that the crane module and the skiff's recipe both read.

---

## 5. Milestones

The rule throughout: **the game is playable and deployable after every milestone**, the old construction keeps working beside the new one until it is replaced, and each step is small enough to test in one sitting. At each stop I'll:
- give VR and desktop test steps;
- update PROGRESS.md and the README where players would notice;
- report draw calls, moving parts and the golden-run comparison;
- wait for your feedback.

Sizes: S is about a session, M two or three, L more.

### M1: contracts and the safety net (M). Nothing visible. **Done; see PROGRESS for the results.**

- The five contract files and the bus registry, with the tests in 3.6.
- The registry's first pass covers every `VesselState` field used by controls and displays. It works as a **facade over today's state** (3.1), so nothing else changes.
- The recipe loader (`parseRecipe`), the mount walker and the validator. The assembler itself comes with its first module in M2.
- **Golden runs.** Scripted sessions on today's boat, recorded once as test fixtures:
  - cold start by the card;
  - full ahead and a hard turn;
  - crash stop;
  - dock at Calder Haven;
  - anchor in Selkie Bay;
  - crane launch and recover;
  - make fast and tow the barge;
  - shoot and haul the trawl;
  - fire monitor on target;
  - battery drain with lights on;
  - under way in a moderate sea;
  - the skiff on her outboard.

  Each later milestone must reproduce them (to rounding). This is how "plays exactly the same" is proven, not just felt.
- **Baseline measurements** in headless Chromium: draw calls and moving parts at four fixed viewpoints (helm, chart table, aft deck forward, aft deck aft), day and night. They go in PROGRESS as the numbers to beat.
- **Debug overlay:** a line with the boat's drawn parts (and how many are in the wheelhouse). The module list joins it in M2, when there is a module to list.
- **Test:** play as usual for a few minutes in VR and on desktop. Nothing should be different.

### M2: one module end to end, the throttle lever (S). **Done; see PROGRESS.**

- The hull definition stub `hull.workboat-12m` gets one `panel.slot` socket at the lever's position, and the recipe `vessel.starter-workboat.json` gets one mount.
- The assembler mounts `control.throttle-lever`. The Bridge skips its own lever. The lever writes `throttle.demand` through the bus; the hold still works.
- The overlay lists the module and its moving parts.
- **Test:**
  - VR: drive out of Calder Haven. Check the lever's feel, the neutral detent, and astern and ahead.
  - Two players: the second can't take the lever while the first holds it.
  - Desktop: drag the lever.
  - Automated: the lever's bus value round-trips through save and load; golden runs equal; draw calls equal.

### M3: the bridge as modules (L, in three stops). **Done; see PROGRESS.**

- **3a, console and helm. Done; see PROGRESS.**
  - `console.standard` with nested slots, then the wheel, buttons, key, toggles, joysticks, lamps and placard.
  - The six screens as instrument modules on the shared atlas.
  - Moved: the binoculars are a tool the App hands to the player, not a bridge part; they stay as they are until the deck gear (M5). The shared instanced parts move to 3b, where they pay off: most of the bridge's toggles are on the overhead panel and the breaker panel.
  - **Test:** a cold start by the card; every switch; searchlight and monitor joysticks; the screens at night. Draw calls at the helm not up; moving parts counted.
- **3b, power controls. Done; see PROGRESS.**
  - The overhead panel, `panel.breakers` with the voltmeter, the battery master and selector, and the lamps.
  - Shared instanced parts for toggle bats, button caps and lamps (2.10), across the console, the overhead panel and the breakers.
  - Still the *views and controls* only: the electrical simulation stays as it is until M4.
  - **Test:** master off and on, every breaker and its lamp, the voltmeter dip on cranking, the deck lights and FM.
- **3c, the rest of the wheelhouse. Done; see PROGRESS.**
  - VHF and handset, chartplotter, chart table (with its footprint), duty board, whiteboard, the door buttons, and the engine hatch with the dipstick and oil can.
  - The first **recipe interlock**: hatch shut blocks the dipstick and oil can.
  - As built: modules whose contents come from the world, not the boat (the VHF's calls, the chartplotter's chart, the duty board's tasks, the whiteboard's notes, the chart table's pencil), hand the app an `api` it feeds, found by module id; the module never reaches out. The engine's look and the oil can's shelf stay with the Bridge until the engine is a module (M4). The chart table declares its footprint; the walk area still reads the vessel config's table until M6, and a test keeps the two equal.
  - **Test:** answer a call, draw on the chart, fold the leaf and walk past it, open the hatch and check the oil, post a note on the whiteboard.

### M4a: propulsion and the energy network as modules, diesel only (L). Nothing visible. **Done; see PROGRESS.**

- The energy-network service.
- Modules:
  - `electrical.battery-bank`;
  - the loads, declared by their modules;
  - circuits and breakers in the sim;
  - `hydraulics.pto-pump`;
  - `fuel.tank`;
  - `propulsion.diesel-inboard` (ignition, thermal, oil, wear, alternator, smoke, sound), using the physics port;
  - steering;
  - the bilge pump, lights and horn.
- Keys `engine.*` become `propulsion.*` with aliases.
- The registry documents every key. A generated table goes in `docs/` and is checked by a test, so it can't go stale.
- **Test:**
  - The full diesel cold start, including a flat battery 1 and the selector.
  - The overheat chain with the pump-failure fault.
  - Running dry.
  - Deck hydraulics need the engine and DECK HYD.
  - Sea trials and golden runs equal.
- **As built:**
  - The simulation side of the assembler (`modular/simAssembly.ts`) builds each boat type's machinery from her recipe; each boat gets a runtime bound to her state. Each tick: modules that push on the hull (the diesel, then the rudder) inside the rigid-body step through the physics port; then the energy network; then the hull's leak; then the modules' upkeep; then the hull's damage.
  - Power roles are in amps for the 12 V house system (the model always was); kW banks and DC-DC converters wait for electric drive (M9).
  - The steering gear is in the rudder module (`steering.rudder`). The lights, horn and wiper motor are one generic module (`electrical.consumer`) mounted eight times, their draw in the recipe.
  - Until M6 a converted machine keeps its state where VesselState did (`legacyState`), so saves and snapshots are unchanged; and some numbers are still read from the vessel config by code that isn't a module yet (isPowered's battery cutoff, the quick start's engine data, the windlass's draw). Tests keep each pair equal.
  - Deck hydraulic pressure is still worked out on demand by the old rule (the machines ask mid-tick); the PTO pump module declares its draw and that the boat has hydraulics.

### M5: deck gear as modules (L, two stops). **Done; see PROGRESS.**

- The mechanism library (2.8): the arm solver, drum and line drawing, extracted from today's code. (Done with 5a: `src/mechanisms/`.)
- **5a. Done; see PROGRESS.**
  - crane and cradle;
  - tow winch and stern roller;
  - A-frame and trawl;
  - anchor windlass.

  World systems ask for provisions ("has a tow point"), not `def.towWinch`.
  - **As built:**
    - Provisions of **gear**: a module's `gear(config, hull)` gives the facts about what it provides (the tow point's position, the winch's lead, the A-frame's blocks, the crane's geometry and path, the anchor's hawse and chain), worked out from the hull. `gearOf(boat, kind)` finds them, from the first module on her that gives that kind. Gear can be needed too (the trawl needs a trawl gantry).
    - Deck gear draws in the boat's own axes (`view.frame: 'boat'`): it stands where the hull puts it (the transom, the deck line), so its socket's point only says where it is.
    - The anchor's pull goes through a new physics-port hook, `mooring`, run after the hull's contacts near land, where the anchor always was. The chain is still drawn by the app in the world (it lies on the seabed), from the gear's hawse.
    - The cradle is part of the crane module. The skiff the crane carries is handed to it by the app (`api.attach`), with her buttons, remote and tarpaulin: a recipe can't know which boat that is.
    - The net in the water is drawn by the app (it lies astern); the trawl module itself draws nothing.
    - Deck buttons share their own instanced cap mesh (`deckButtonCap`), which isn't hidden with the wheelhouse's small parts.
- **5b. Done; see PROGRESS.**
  - searchlight, fire monitor and mast;
  - cleats, fenders, swim ladder, life-ring station and boat-hook rack.

  The walk-area obstacles come from module footprints.
  - **As built:**
    - Footprints are declared on the module definition (`footprints(config, hull)`), not only on the view: cargo placement is simulated and needs them headless. Boxes and discs in the boat's axes, with an optional foot height; a footprint blocks floors from a step below its foot up to its top. The chart table's leaf, which moves with the bus, keeps its view-side footprint.
    - Four `deck.cleat` modules each give a `bowCleat` or `sternCleat` (the station and the line's height); the mooring lines act at those. A boat moors only with both.
    - The fire monitor's gauge sits on the console but is the monitor's own (drawn in the boat's axes, like the crane's console button).
    - The mast offers the `masthead` socket; the navigation lights' consumer is mounted there. The wind sock is the mast's (the app feeds it the weather through its `api`).
    - The life ring and the boat hook are drawn by the rescue gear view (they leave the boat); their station and rack modules give only where they're stowed and made fast.
    - The searchlight's old control names (`spotPan`) are clamped to the lamp's gear; its bus keys keep their registry ranges.
- **Test:**
  - Launch and recover the skiff.
  - Tow the barge in on the winch.
  - Shoot and haul the trawl by switch and by hand.
  - Anchor and weigh.
  - The fire monitor on a shore fire.
  - Dock with the cleats; throw the ring; hook a crate.
  - All the sounds as before: hydraulics, anchor, winch.

### M6: the hull definition, and the boat entirely from JSON (L)

- `hull.workboat-12m` holds:
  - the form (today's chine generator, unchanged);
  - lightship mass (2.6), damping, resistance, windage, rudder;
  - layout and walk surfaces, the helm position;
  - doors, hatches, windows, sockets, livery.
- The workboat is assembled entirely from `vessel.starter-workboat.json`. The skiff and the three tows become recipes too: a tow is a hull with no modules.
- `VESSEL_DEFS` is filled from recipes. `WorkboatDef`, `asWorkboat`, the hand-built `Bridge` and the `isWorkboat` lookups are **deleted**. App's singletons become per-vessel. The bus moves to its flat record (3.1).
- **Saves:** the new save shape, with a migration so old careers keep their boat's damage and wear.
- **Multiplayer:** recipes in `welcome`; the join check compares recipe ids and versions.
- **Test:**
  - Side-by-side screenshots of old and new from the four viewpoints (pixel difference reported).
  - Golden runs equal; frame rate and draw calls equal or better.
  - Load an old career; join a game from a second browser.
- **In four stops** (6b was split in two when it was reached, so each stop stays small enough to test):
  - **6a. Done; see PROGRESS.** The hulls hold their form, lightship, handling, layout, cargo deck, helm and spawn; every boat (the workboat, the skiff, the three tows) is built from her recipe; the engine and batteries declare their mass and the lightship makes room for them (2.6). The skiff's outboard is a module.
    - **As built:** the hulls' numbers stay in `CONFIG.vessels` (the tunables' home) and the hull files take them from there. The rudder blade stays in the rudder module (`steering.rudder`), not the hull: it was converted that way in M4a and moves with the steering gear. Livery waits for the shipyard (M8). The vessel registry is built lazily: the boats' library registers the builder when it loads (src/main.ts and the tests' setup load it first), because the modules import the registry.
  - **6b. Done; see PROGRESS.** `world.homeVesselId` (the world's systems find the player's boat by it); `WorkboatDef`, `asWorkboat` and `isWorkboat` deleted; every machinery setting read from the module that owns it (new gear kinds `diesel`, `rudder`, `outboard`, `batteries`, `bilgePump`, `chartTable`, `midCleat`); what's built into a hull (lights, exhaust outlet, rescue places, the bridge's fit-out, a tow's look) in the hull's `fittings`; `legacyDef` dropped.
    - **As built:** a hull with a wheelhouse is a type of its own (`WheelhouseDef`, a fact of her shape): the Bridge, the wheelhouse interior and the app's wheelhouse views take one until 6c. The light and exhaust views are built only where the boat has them. The quick-start and battery-drain switches are session settings and stay in `CONFIG.vessels.workboat.electrics`.
  - **6c. Done; see PROGRESS.** The hand-built `Bridge` is gone: every boat with modules has a boat view (`app/boatView.ts`) built from her recipe, with the parts of her hull that move (the doors and the gate) and the rain on the glass where she has a wheelhouse. The lights are modules that draw themselves (`light.navigation`, `light.cabin`, `light.flood`, `light.rail`); the engine under the hatch is the diesel module's view; the skiff's tiller is a module (`control.tiller`) on her outboard's own socket. The app keeps one boat view per vessel and sends each control's intents to its own boat (`Control.route`).
    - **As built:** a module's view gets the scene each frame (how dark it is, where the viewer is: `ViewFrame`) for the lights. A module drawn in the boat's axes now sits at her origin even under a positioned parent (the tiller under the outboard). The skiff's painter cleat on her stem stays the app's, added to her boat view. Smoke, the anchor chain and the mooring lines stay world effects (`VesselEffects`).
  - **6d:** the bus's flat record; the new save shape with a migration (`next` gets its own save keys first); recipes in multiplayer's `welcome`, the join check by recipe ids and versions.

### M7: the proof, the landing craft (M)

- **Order changed (owner, after 6c):** M7 comes before 6d (saves, the flat bus record, recipes in multiplayer), which the landing craft doesn't need to prove the builder. In two stops:
  - **7a. Done; see PROGRESS.** Her hull lofted from the study's design into the game's stations, her hull definition and recipe reusing the workboat's modules, a Debug-menu start in her, and the shared-code leaks she turned up fixed (the ledger in PROGRESS).
    - **As built:** the game's stations are upright with one chine a side, so the study's raked bow is set upright at its deck edge (her deck runs 10.2 m; the rake goes into the run of the bottom up to the bow, out of the water). One bulwark height (0.5 m). The workboat's livery (M8). Her machinery's settings are in her recipe JSON; her hull's numbers in `CONFIG.vessels.landingCraft`.
  - **7b:** the bow ramp module and its interlock; beach her at Selkie and walk off.

- A new hull from the hull study's `landingCraft` design (9 m, square landing bow, cabin aft of amidships), lofted into physics stations, with its own numbers and sockets. A single inboard diesel in her one engine bay: the workboat's engine module with a smaller engine and propeller in its config.
- A recipe reusing the console, controls, instruments, engine(s), electrics, furniture and searchlight.
- **One new module:** `deck.bow-ramp` (lower and raise on a hydraulic or electric drive, `ramp.state`). The recipe interlock: `ramp.state != 'lockedUp'` limits `throttle.max` to 0.2.
- **The test of the architecture:** the second boat is a hull, a JSON file and one module. Anything more is a leak, and I'll stop and fix it in the shared code rather than work around it.
- **Test:** choose the landing craft (Debug menu, or a yard if M8 is done). Start her, drive her, run her up the Selkie beach with the ramp down, and walk off.

### M8: the shipyard (M)

- At a harbour with a yard, a VR-friendly panel shows the boat's sockets. Empty ones glow.
- Each socket lists the modules that fit, with a thumbnail rendered once from the module itself.
- Select to mount. The validator runs, and a refusal says why in one sentence.
- The result is saved as your boat's recipe.
- It adds no logic to any module.
- **Test:** swap the engine for a bigger one within the bay's rating, and try one over it (refused, with the reason). Add a second searchlight on an empty roof mount. Save, reload, and join from a second browser.

**After the proof (owner's order: existing boat, then landing craft, then new parts):**

### M9 (after M7, owner's order): electric drive and shore power (L). The first new parts.

- New modules:
  - `propulsion.electric-inboard`: silent, instant torque, strong reverse braking;
  - a propulsion battery bank in kWh, and a DC-DC to the 12 V house bank (2.5);
  - `shore.inlet`;
  - new instruments: a power meter (kW in and out) and a state-of-charge and range gauge (`battery.rangeEstimateNm`).
- A shore-power pedestal at Calder Haven. Its cable is a drawn line (the mechanism library's), not a physics rope. Grab it at the pedestal, plug it into the inlet, and she charges at the pedestal's rate. Leave with it plugged in and it pulls out with a bang and a warning. Duty-board tasks: "Connect shore power" and "Disconnect shore power".
- Start-up: master, key, READY lamp, go.
- **A recipe variant `vessel.starter-workboat-electric`** chosen in the Debug menu. It must need **no code changes outside the new modules**; that is the test of the architecture.
- **Test:**
  - Switch to electric in the Debug menu: she's silent, with instant torque.
  - Watch the range fall at speed and recover at the quay on shore power.
  - Pull away plugged in.
  - Switch back to diesel: everything as before.

### M10: generator, hybrid, solar (M)

- `power.genset`: a small diesel in an engine bay that starts and stops, charges at a set kW, burns fuel, makes noise, and auto-starts below a state of charge.
- `power.solar` on `roof.mount` or `deck.panel`: output = rating × sun factor from the existing sun elevation, cloud and rain.
- The hybrid recipe: silent on battery, and you hear the genset cut in.
- Load shedding by priority (lights and comforts first, propulsion last).

---

## 6. Questions (answered)

1. Landing craft: the 9 m landing-bow work skiff, a single hull, with a single inboard. See the decisions at the top.
2. Simulation and view halves: no objection; going ahead.
3. Saves: unchanged (damage and wear only).
4. New power features: after the proof on both boats (M9, M10).
5. Mechanism library and instanced switches: no objection; going ahead.
