/**
 * Getting them aboard: the life ring and its line, the boat hook, a survivor climbing over
 * the stern, and the propeller rule. Shared simulation state in WorldState.rescue (ring,
 * hook) and the incident's targets; players' hands act on it through intents.
 *
 *   ring   'stowed' on the wheelhouse | 'held' by a player | 'flying' (thrown: ballistic)
 *          | 'water' (floating, on a line from the quarter cleat). Its line can only be
 *          shortened (reeled in); while it's longer than the ring is far, the ring floats
 *          free; once taut, reeling drags the ring (and whoever holds it) toward the cleat.
 *   person 'floating' -> 'onLine' (grabbed the ring) -> 'climbing' (at the stern, engine in
 *          neutral) -> 'aboard' (sitting on deck, vessel frame).
 *   crate  'floating' -> 'hooked' (follows the hook tip of whoever hooked it) -> lifted
 *          aboard: it becomes an ordinary cargo item in the lifter's hands (destination
 *          'any': recovered cargo can be landed at any harbour).
 *
 * Propeller rule: a survivor on the line near the stern with the engine in gear shouts and
 * swims away until it's in neutral - no failure, just the lesson.
 *
 * A crew-mate overboard (owner request): a player swimming takes the ring when it's in reach
 * (their own game sends `ringGrab`: it moves their body). They ride in it as it's hauled in,
 * and climb out as usual at the boat (or let go: `ringLetGo`). `ring.player` says who's in
 * it; nobody else can take the ring meanwhile. Near the stern with her in gear, they shout.
 */
import { windVector } from '../environment/weather';
import * as THREE from 'three';
import { CONFIG } from '../config';
import { driftVelocity } from '../world/drift';

const driftV = { x: 0, z: 0 };
import type { Intent } from '../core/intents';
import type { Vec3 } from '../core/math';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { hullPlan } from '../vessel/layout';
import { VESSEL_DEFS, type VesselDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { gearOf } from '../boats/sims';
import { quickDeckPoint, stowOnDeck, type CargoItem } from '../cargo/cargo';
import type { RescueState, RescueTarget } from './rescue';
import type { EntityId } from '../core/ids';
import { boatOf, playerBoats } from '../core/launch';

export interface RingState {
  state: 'stowed' | 'held' | 'flying' | 'water';
  holder: string | null;
  /** World position and velocity (flying / water). */
  pos: Vec3;
  vel: Vec3;
  /** Line paid out (m). */
  line: number;
  /** A crew-mate in the water holding it (player id), being hauled in. */
  player?: string | null;
}

export interface HookState {
  holder: string | null;
  /** Laid down on deck (not in its clips): butt position (vessel axes) and the pole's yaw. */
  deck?: [number, number, number, number];
}

/** A short message shouted by a survivor (views show / speak it when the id changes). */
export interface Shout {
  id: number;
  text: string;
}

export function createRing(): RingState {
  return { state: 'stowed', holder: null, pos: [0, 0, 0], vel: [0, 0, 0], line: 0 };
}

const q = new THREE.Quaternion();
const p = new THREE.Vector3();

/** A point in vessel axes -> world. */
export function vesselToWorld(v: VesselState, local: readonly number[], out = new THREE.Vector3()): THREE.Vector3 {
  q.fromArray(v.orientation);
  return out.set(local[0], local[1], local[2]).applyQuaternion(q).add(p.fromArray(v.position));
}

/** A world point -> vessel axes. */
export function worldToVessel(v: VesselState, world: readonly number[], out = new THREE.Vector3()): THREE.Vector3 {
  q.fromArray(v.orientation).invert();
  return out.set(world[0] - v.position[0], world[1] - v.position[1], world[2] - v.position[2]).applyQuaternion(q);
}

/** Horizontal distance from a world point to the vessel's hull side (0 inside the hull plan). */
export function distanceToHull(v: VesselState, x: number, z: number): number {
  const l = worldToVessel(v, [x, 0, z]);
  const plan = hullPlan(VESSEL_DEFS[v.defId]);
  const lz = Math.min(plan.transom, Math.max(plan.stem, l.z));
  const dz = Math.abs(l.z - lz);
  const dx = Math.max(0, Math.abs(l.x) - plan.halfBeam(lz));
  return Math.hypot(dx, dz);
}

function shout(r: RescueState, text: string): void {
  r.shoutSeq = (r.shoutSeq ?? 0) + 1;
  r.shout = { id: r.shoutSeq, text };
}

function persons(r: RescueState): RescueTarget[] {
  return (r.active?.targets ?? []).filter((t) => t.kind === 'person');
}

/**
 * Where she takes survivors aboard: the seats, the stern they climb over (built into her
 * hull, its fittings). Asked only of a boat that has them (rescueBoats).
 */
export function rescuePlaces(defId: string): NonNullable<VesselDef['rescueGear']> {
  const places = VESSEL_DEFS[defId].rescueGear;
  if (!places) throw new Error(`${defId} has no rescue places (her hull's fittings)`);
  return places;
}

/** The free seat for the next survivor aboard her (vessel axes). */
export function freeSeat(world: WorldState, v: VesselState): Vec3 {
  const seats = rescuePlaces(v.defId).seats;
  const taken = persons(world.rescue!).filter((t) => (t.phase === 'aboard' || t.phase === 'climbing') && (t.vessel ?? world.homeVesselId) === v.id).length;
  const [x, z] = seats[Math.min(taken, seats.length - 1)];
  return [x, hullPlan(VESSEL_DEFS[v.defId]).deckY(z), z];
}

/** Everything still in the water recovered? Then the rescue moves on to landing them. */
function checkRecovered(world: WorldState, r: RescueState): void {
  const inc = r.active;
  if (!inc || inc.phase !== 'accepted') return;
  const left = inc.targets.filter((t) => t.phase !== 'aboard');
  if (left.length) return;
  inc.phase = 'recovered';
  r.cheer = (r.cheer ?? 0) + 1;
  void world;
}

/**
 * Each boat's own life ring and boat hook (multiplayer study #15: one ring for the whole game,
 * thrown from the home boat's cleat whoever threw it, and survivors climbing aboard only her).
 * Kept by the boat's id; an old save's one ring and hook become the home boat's.
 */
function settleGear(world: WorldState): RescueState {
  const r = world.rescue!;
  const home = world.homeVesselId;
  if (home && r.ring) (r.rings ??= {})[home] ??= r.ring;
  if (home && r.hook) (r.hooks ??= {})[home] ??= r.hook;
  delete r.ring;
  delete r.hook;
  return r;
}

/** Her life ring (made if she hasn't one yet). */
export function ringOf(world: WorldState, vesselId: EntityId): RingState {
  return ((settleGear(world).rings ??= {})[vesselId] ??= createRing());
}

/** Her boat hook (made if she hasn't one yet). */
export function hookOf(world: WorldState, vesselId: EntityId): HookState {
  return ((settleGear(world).hooks ??= {})[vesselId] ??= { holder: null });
}

/** Her life ring as it stands, for the views (nothing made; an old save's is the home boat's). */
export function ringIn(world: WorldState, vesselId: EntityId): RingState | undefined {
  const r = world.rescue;
  return r?.rings?.[vesselId] ?? (vesselId === world.homeVesselId ? r?.ring : undefined);
}

/** Her boat hook as it stands, for the views. */
export function hookIn(world: WorldState, vesselId: EntityId): HookState | undefined {
  const r = world.rescue;
  return r?.hooks?.[vesselId] ?? (vesselId === world.homeVesselId ? r?.hook : undefined);
}

/** The boats that can take survivors aboard: the players' boats with rescue places. */
function rescueBoats(world: WorldState): VesselState[] {
  return playerBoats(world).filter((v) => !!VESSEL_DEFS[v.defId].rescueGear);
}

/** Whose ring a survivor on a line is on (an old save's: the home boat's). */
function ringBoat(world: WorldState, t: RescueTarget): EntityId | undefined {
  return t.ring ?? world.homeVesselId;
}

/** One tick of a boat's ring and its line: flying, floating, drawn in, a crew-mate in it. */
function stepRing(world: WorldState, r: RescueState, v: VesselState, ring: RingState, waves: readonly PreparedWave[], dt: number): void {
  const cfg = CONFIG.rescue;
  // The ring's line is made fast at her life ring station's cleat (a module).
  const station = gearOf(v, 'lifeRing')!;
  const cleat = vesselToWorld(v, station.cleat);
  const wind = windVector(world.environment, { x: 0, z: 0 });
  if (ring.state === 'flying') {
    ring.vel[1] -= CONFIG.ocean.gravity * dt;
    // The wind pushes it off line a little in flight.
    ring.vel[0] += wind.x * CONFIG.weather.ringPushPerWind * dt;
    ring.vel[2] += wind.z * CONFIG.weather.ringPushPerWind * dt;
    for (let i = 0; i < 3; i++) ring.pos[i] += ring.vel[i] * dt;
    const h = surfaceHeight(waves, ring.pos[0], ring.pos[2]);
    const dist = Math.hypot(ring.pos[0] - cleat.x, ring.pos[2] - cleat.z);
    if (ring.pos[1] <= h || dist > cfg.maxLine) {
      // Splash (or the line fetched up): it floats here, the line as long as it took.
      ring.state = 'water';
      ring.pos[1] = h;
      ring.vel = [0, 0, 0];
      ring.line = Math.min(cfg.maxLine, Math.max(dist, 1));
    }
  }
  if (ring.state !== 'water') return;
  const dv = driftVelocity(world.environment, ring.pos[0], ring.pos[2], driftV);
  ring.pos[0] += dv.x * dt;
  ring.pos[2] += dv.z * dt;
  // The line: no longer than paid out. Taut, it drags the ring toward the cleat.
  const dx = ring.pos[0] - cleat.x;
  const dz = ring.pos[2] - cleat.z;
  const d = Math.hypot(dx, dz);
  if (d > ring.line && d > 1e-6) {
    ring.pos[0] = cleat.x + (dx / d) * ring.line;
    ring.pos[2] = cleat.z + (dz / d) * ring.line;
  }
  ring.pos[1] = surfaceHeight(waves, ring.pos[0], ring.pos[2]);
  // A crew-mate in it: still in the game, and still in the water (not aboard anything).
  if (ring.player) {
    const pl = world.players[ring.player];
    if (!pl || pl.aboardVesselId) ring.player = null;
  }
  if (ring.player) {
    const at = vesselToWorld(v, rescuePlaces(v.defId).stern);
    if (v.engine.gear !== 0 && Math.hypot(ring.pos[0] - at.x, ring.pos[2] - at.z) < cfg.propRadius && world.time - (r.propWarnedCrew ?? -99) > 6) {
      r.propWarnedCrew = world.time;
      shout(r, "Neutral! Put her in neutral, I'm by the propeller!");
    }
  }
  // Reeled right in with nobody on it: back on its hook.
  const onLine = !!ring.player || persons(r).some((t) => t.phase === 'onLine' && ringBoat(world, t) === v.id);
  if (!onLine && ring.line < 1.6) ring.state = 'stowed';
}

/** One tick of every boat's ring and line, the survivors, and hooked crates. */
export function stepRecovery(world: WorldState, waves: readonly PreparedWave[], dt: number): void {
  const cfg = CONFIG.rescue;
  const r = settleGear(world);
  // A boat gone (handed back, her owner long gone): her gear with her.
  for (const id of Object.keys(r.rings ?? {})) if (!world.vessels[id]) delete r.rings![id];
  for (const id of Object.keys(r.hooks ?? {})) if (!world.vessels[id]) delete r.hooks![id];
  const boats = rescueBoats(world);
  for (const v of boats) if (gearOf(v, 'lifeRing')) stepRing(world, r, v, ringOf(world, v.id), waves, dt);

  const inc = r.active;
  if (!inc) return;
  // The rings in the water, and which are for the taking (nobody on them yet).
  const afloat = boats.filter((v) => r.rings?.[v.id]?.state === 'water').map((v) => ({ v, ring: r.rings![v.id] }));
  const free = (id: EntityId) => !r.rings?.[id]?.player && !persons(r).some((t) => t.phase === 'onLine' && ringBoat(world, t) === id);
  // People on a raft or a sinking boat: with a boat's stern alongside it and her propeller
  // stopped, they come across to her one at a time (the next once the one before is up).
  const prop = inc.prop;
  const alongside = !prop || prop.sunk || inc.phase !== 'accepted' ? undefined : boats.find((v) => {
    const stern = vesselToWorld(v, rescuePlaces(v.defId).stern);
    return v.engine.gear === 0 && Math.hypot(prop.x - stern.x, prop.z - stern.z) < cfg.raftRange;
  });
  let tookOne = inc.targets.some((t) => t.phase === 'climbing');
  for (const t of inc.targets) {
    if (t.kind !== 'person') continue;
    if (t.phase === 'raft' && alongside && !tookOne) {
      tookOne = true;
      t.phase = 'climbing';
      t.t = 0;
      t.vessel = alongside.id;
      t.seat = freeSeat(world, alongside);
    }
    if ((!t.phase || t.phase === 'floating') && afloat.length && inc.phase === 'accepted') {
      // The nearest ring: caught if it's on them; swum for if near and free.
      let near = afloat[0];
      let toRing = Infinity;
      for (const a of afloat) {
        const d = Math.hypot(t.x - a.ring.pos[0], t.z - a.ring.pos[2]);
        if (d < toRing) {
          toRing = d;
          near = a;
        }
      }
      if (toRing < cfg.catchRadius) {
        t.phase = 'onLine';
        t.ring = near.v.id;
      } else if (free(near.v.id) && toRing < cfg.swimToRing) {
        // Near enough to see it: they swim for it (owner: hard to land it right on them in VR).
        const step = Math.min(cfg.swimSpeed * dt, toRing - cfg.catchRadius * 0.5);
        t.x += ((near.ring.pos[0] - t.x) / toRing) * step;
        t.z += ((near.ring.pos[2] - t.z) / toRing) * step;
      }
    }
    if (t.phase === 'onLine') {
      const id = ringBoat(world, t);
      const v = id ? world.vessels[id] : undefined;
      const ring = v ? r.rings?.[v.id] : undefined;
      if (!v || !ring || ring.state !== 'water') {
        // Her ring gone from under them (the boat taken away): back to floating.
        t.phase = 'floating';
        delete t.ring;
        continue;
      }
      t.x = ring.pos[0];
      t.z = ring.pos[2];
      const stern = vesselToWorld(v, rescuePlaces(v.defId).stern);
      const toStern = Math.hypot(t.x - stern.x, t.z - stern.z);
      if (v.engine.gear !== 0 && toStern < cfg.propRadius) {
        // Propeller! Swim (and pay the line) away until it stops.
        if (!inc.propWarned || world.time - inc.propWarned > 6) {
          inc.propWarned = world.time;
          shout(r, 'Stop your propeller! Put her in neutral!');
        }
        ring.line = Math.min(cfg.maxLine, ring.line + cfg.swimAway * dt);
        const dx = ring.pos[0] - stern.x;
        const dz = ring.pos[2] - stern.z;
        const d = Math.hypot(dx, dz) || 1;
        ring.pos[0] += (dx / d) * cfg.swimAway * dt;
        ring.pos[2] += (dz / d) * cfg.swimAway * dt;
      } else if (toStern < cfg.climbRange && v.engine.gear === 0) {
        t.phase = 'climbing';
        t.t = 0;
        t.vessel = v.id;
        t.seat = freeSeat(world, v);
        ring.state = 'stowed';
        ring.holder = null;
      }
    } else if (t.phase === 'climbing') {
      t.t = (t.t ?? 0) + dt;
      if (t.t >= cfg.climbTime) {
        t.phase = 'aboard';
        shout(r, 'Thank you! Thank you so much!');
      }
    }
  }
  checkRecovered(world, r);
}

const RECOVERY_INTENTS = new Set(['ringTake', 'ringStow', 'ringThrow', 'ringPull', 'ringGrab', 'rescuePropStrike', 'ringLetGo', 'hookTake', 'hookPush', 'hookStow', 'hookDrop', 'crateHook', 'crateTow', 'crateQuickLift', 'crateLift']);
function isRecoveryIntent(control: string): boolean {
  return RECOVERY_INTENTS.has(control);
}

/** The ring a swimmer is in, else the one in the water nearest them (its boat's id). */
function swimmersRing(world: WorldState, who: EntityId): EntityId | undefined {
  const rings = Object.entries(world.rescue?.rings ?? {});
  const held = rings.find(([, g]) => g.player === who);
  if (held) return held[0];
  const pl = world.players[who];
  let best: EntityId | undefined;
  let d = Infinity;
  for (const [id, g] of rings) {
    if (g.state !== 'water' || !pl) continue;
    const e = Math.hypot(pl.position[0] - g.pos[0], pl.position[2] - g.pos[2]);
    if (e < d) {
      d = e;
      best = id;
    }
  }
  return best;
}

/** Recovery intents. Returns true if it was one. */
export function applyRecoveryIntent(world: WorldState, home: VesselState | undefined, intent: Intent): boolean {
  if (!isRecoveryIntent(intent.control)) return false;
  const r = settleGear(world);
  const who = intent.playerId;
  // The gear of the boat the player is aboard (a crew-mate in her own boat throws her own
  // ring); a swimmer's, the ring in the water they're in or nearest them.
  const aboard = boatOf(world, who);
  const v = aboard && VESSEL_DEFS[aboard.defId].rescueGear ? aboard : home;
  const swimmer = intent.control === 'ringGrab' || intent.control === 'ringLetGo' || intent.control === 'rescuePropStrike';
  const vid = swimmer ? swimmersRing(world, who) : v?.id;
  if (!vid) return true;
  const ring = ringOf(world, vid);
  const hook = hookOf(world, vid);
  const cfg = CONFIG.rescue;
  switch (intent.control) {
    case 'ringTake':
      if (v && !gearOf(v, 'lifeRing')) return true; // no life ring aboard
      if (ring.state === 'stowed' || (ring.state === 'water' && !ring.player && !persons(r).some((t) => t.phase === 'onLine' && ringBoat(world, t) === vid))) {
        ring.state = 'held';
        ring.holder = who;
      }
      return true;
    case 'ringStow':
      if (ring.state === 'held' && ring.holder === who) {
        ring.state = 'stowed';
        ring.holder = null;
      }
      return true;
    case 'ringThrow': {
      const a = intent.args ?? [];
      if (ring.state !== 'held' || ring.holder !== who || a.length < 6 || !a.every(Number.isFinite)) return true;
      ring.state = 'flying';
      ring.holder = null;
      ring.pos = [a[0], a[1], a[2]];
      ring.vel = [a[3], a[4], a[5]];
      ring.line = cfg.maxLine;
      return true;
    }
    case 'ringPull':
      if (ring.state === 'water' && v && gearOf(v, 'lifeRing')) {
        const cleat = vesselToWorld(v, gearOf(v, 'lifeRing')!.cleat);
        const d = Math.hypot(ring.pos[0] - cleat.x, ring.pos[2] - cleat.z);
        ring.line = Math.max(0.5, Math.min(ring.line, d) - Math.max(0, Math.min(5, intent.value)));
      }
      return true;
    case 'ringGrab': {
      // A crew-mate in the water takes the floating ring: within reach of it, nobody on it.
      const pl = world.players[who];
      if (ring.state !== 'water' || ring.player || !pl || pl.aboardVesselId) return true;
      if (persons(r).some((t) => t.phase === 'onLine' && ringBoat(world, t) === vid)) return true;
      if (Math.hypot(pl.position[0] - ring.pos[0], pl.position[2] - ring.pos[2]) > cfg.crewCatchRadius + cfg.crewCatchSlack) return true;
      ring.player = who;
      shout(r, `${pl.name || 'Your crew-mate'} has the ring: haul in!`);
      return true;
    }
    case 'rescuePropStrike': {
      // A swimmer into a turning propeller (their game saw it: propStrike.ts). Everyone's
      // view sprays red there (propStrikeView.ts); they're put back aboard by their game.
      const a = intent.args ?? [];
      if (a.length < 3 || !a.slice(0, 3).every(Number.isFinite)) return true;
      r.strikeSeq = (r.strikeSeq ?? 0) + 1;
      r.strike = { seq: r.strikeSeq, pos: [a[0], a[1], a[2]], player: who };
      if (ring.player === who) ring.player = null;
      shout(r, `Man down at the stern! ${world.players[who]?.name || 'Someone'} went into the propeller!`);
      return true;
    }
    case 'ringLetGo':
      if (ring.player === who) ring.player = null;
      return true;
    case 'hookTake':
      if (v && !gearOf(v, 'boatHook')) return true; // no boat hook aboard
      if (!hook.holder) {
        hook.holder = who;
        delete hook.deck;
      }
      return true;
    case 'hookPush': {
      // A shove off a quay with the hook (rescueHands.ts): args = the push direction (world
      // x, z, horizontal, away from what the tip is on) and where the hand is (world). The
      // boat gets CONFIG.rescue.hookPush.impulse N·s there: a change of speed, and of yaw
      // about her CG from the hand's offset.
      const a = intent.args ?? [];
      if (!v || hook.holder !== who || a.length < 5 || !a.every(Number.isFinite)) return true;
      const len = Math.hypot(a[0], a[1]);
      if (len < 1e-6) return true;
      const def = VESSEL_DEFS[v.defId];
      const J = CONFIG.rescue.hookPush.impulse;
      const jx = (a[0] / len) * J;
      const jz = (a[1] / len) * J;
      v.linearVelocity[0] += jx / def.mass;
      v.linearVelocity[2] += jz / def.mass;
      // The hand's lever arm about her CG (world, in plan): torque about y is r × J.
      const cg = vesselToWorld(v, def.cg);
      const rx = a[2] - cg.x;
      const rz = a[4] - cg.z;
      v.angularVelocity[1] += (rz * jx - rx * jz) / def.inertia[1];
      return true;
    }
    case 'hookStow':
    case 'hookDrop':
      // Back in its clips, or laid down on deck (args: butt x, y, z in vessel axes, yaw).
      // Let go of it over the side and it's back in the clips: a lost hook is no fun.
      if (hook.holder === who) {
        hook.holder = null;
        delete hook.deck;
        const a = intent.args ?? [];
        if (intent.control === 'hookDrop' && v && a.length >= 4 && a.every(Number.isFinite)) {
          const plan = hullPlan(VESSEL_DEFS[v.defId]);
          const z = Math.min(plan.transom - 0.2, Math.max(plan.stem + 0.5, a[2]));
          const x = Math.max(-(plan.halfBeam(z) - 0.2), Math.min(plan.halfBeam(z) - 0.2, a[0]));
          if (Math.abs(a[0] - x) < 0.6 && Math.abs(a[2] - z) < 0.6) hook.deck = [x, plan.deckY(z) + 0.03, z, a[3]];
        }
        for (const t of r.active?.targets ?? []) if (t.phase === 'hooked' && t.hookedBy === who) t.phase = 'floating';
      }
      return true;
    case 'crateHook': {
      const t = r.active?.targets.find((x) => x.id === intent.ref);
      if (t && t.kind === 'crate' && (!t.phase || t.phase === 'floating') && hook.holder === who) {
        t.phase = 'hooked';
        t.hookedBy = who;
      }
      return true;
    }
    case 'crateTow': {
      const t = r.active?.targets.find((x) => x.id === intent.ref);
      const a = intent.args ?? [];
      if (t && t.phase === 'hooked' && t.hookedBy === who && a.length >= 2 && a.every(Number.isFinite)) {
        // At most a few metres per update (it's being towed, not teleported).
        const dx = a[0] - t.x;
        const dz = a[1] - t.z;
        const d = Math.hypot(dx, dz);
        const k = d > 3 ? 3 / d : 1;
        t.x += dx * k;
        t.z += dz * k;
      }
      return true;
    }
    case 'crateQuickLift': {
      // The menu's quick version (no hook): every crate floating within quickLiftRange of
      // the hull lifted aboard and lashed, while there's room on deck.
      const inc = r.active;
      if (!inc || !v) return true;
      const [dx, dz] = quickDeckPoint(v);
      for (const t of inc.targets) {
        if (t.kind !== 'crate' || t.phase === 'aboard' || distanceToHull(v, t.x, t.z) > cfg.quickLiftRange) continue;
        const item: CargoItem = { id: `rescued-${t.id}`, kind: 0, mass: 40, from: 'sea', to: 'any', at: { carriedBy: who } };
        if (!stowOnDeck(world, v, item, dx, dz)) break;
        world.cargo[item.id] = item;
        t.phase = 'aboard';
        t.cargoId = item.id;
      }
      checkRecovered(world, r);
      return true;
    }
    case 'crateLift': {
      const inc = r.active;
      const t = inc?.targets.find((x) => x.id === intent.ref);
      if (!inc || !t || t.kind !== 'crate' || !v || t.phase === 'aboard') return true;
      if (distanceToHull(v, t.x, t.z) > cfg.liftRange) return true;
      const item: CargoItem = { id: `rescued-${t.id}`, kind: 0, mass: 40, from: 'sea', to: 'any', at: { carriedBy: who } };
      world.cargo[item.id] = item;
      t.phase = 'aboard';
      t.cargoId = item.id;
      checkRecovered(world, r);
      return true;
    }
  }
  return false;
}
