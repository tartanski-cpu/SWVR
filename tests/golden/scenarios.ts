/**
 * Golden runs (modular boats, M1): scripted sessions on today's boat, recorded once as
 * fixtures. Every later milestone of the modular rebuild must reproduce them, so "she
 * plays exactly as before" is checked by numbers, not only by feel.
 *
 * Each scenario drives the simulation through the ordinary intent path (as a player
 * would) and, every `every` simulated seconds, records the boat's pose and velocities,
 * every key on her bus, and a few world values the scenario cares about.
 *
 * To re-record after an intended change in behaviour (NOT during the refactor):
 *   GOLDEN_RECORD=1 npx vitest run tests/golden.test.ts
 */
import * as THREE from 'three';
import { CONFIG } from '../../src/config';
import { IdFactory } from '../../src/core/ids';
import type { Intent } from '../../src/core/intents';
import { stepWorld } from '../../src/core/simulation';
import { createWorld, type WorldState } from '../../src/core/world';
import { jetPath } from '../../src/fire/fire';
import { allKeys, busOf } from '../../src/modular/bus';
import { berthAxis } from '../../src/vessel/physics/mooring';
import { placeVessel } from '../../src/vessel/vesselControl';
import { VESSEL_DEFS } from '../../src/vessel/vesselDef';
import type { VesselState } from '../../src/vessel/vesselState';
import { BERTHS, PORTS } from '../../src/world/archipelago';

const DT = 1 / 60;

export type Value = number | string | boolean | null;
export type Checkpoint = Record<string, Value>;

export interface Harness {
  world: WorldState;
  /** The boat being recorded. */
  v: VesselState;
  send(control: string, value?: number, ref?: string, targetId?: string): void;
  /** Run `s` simulated seconds, recording checkpoints on the way. */
  run(s: number): void;
}

interface Opts {
  cold?: boolean;
  tender?: boolean;
  waves?: boolean;
  geography?: 'archipelago' | 'openSea';
  /** Where the recorded boat starts: x, z, heading. */
  at?: [number, number, number];
}

/** Numbers kept to 9 significant figures: exact enough, and small fixtures. */
function round(x: Value): Value {
  if (typeof x !== 'number') return x;
  if (!Number.isFinite(x)) return null;
  return Number(x.toPrecision(9));
}

function snapshot(v: VesselState, extra: Record<string, Value>): Checkpoint {
  const cp: Checkpoint = {};
  v.position.forEach((x, i) => (cp[`pos.${'xyz'[i]}`] = round(x)));
  v.orientation.forEach((x, i) => (cp[`quat.${'xyzw'[i]}`] = round(x)));
  v.linearVelocity.forEach((x, i) => (cp[`vel.${'xyz'[i]}`] = round(x)));
  v.angularVelocity.forEach((x, i) => (cp[`rot.${'xyz'[i]}`] = round(x)));
  const bus = busOf(v);
  for (const k of allKeys()) if (bus.has(k)) cp[k] = round(bus.get(k));
  for (const [k, x] of Object.entries(extra)) cp[`x.${k}`] = round(x);
  return cp;
}

/**
 * Run a scenario and return its checkpoints.
 * @param pick    which vessel to record (default: the workboat)
 * @param extras  world values to record at each checkpoint
 */
export function play(
  opts: Opts,
  every: number,
  script: (h: Harness) => void,
  extras: (world: WorldState, v: VesselState) => Record<string, Value> = () => ({}),
  pick?: (world: WorldState, workboat: VesselState) => VesselState,
): Checkpoint[] {
  const { world, vesselId } = createWorld(new IdFactory(), 'workboat', { cold: opts.cold, tender: opts.tender });
  if (!opts.waves) world.environment.waves = [];
  world.geography = opts.geography ?? 'openSea';
  const boat = world.vessels[vesselId];
  const [x, z, hdg] = opts.at ?? [0, -400, 0];
  placeVessel(boat, x, 0, z, hdg);
  const v = pick ? pick(world, boat) : boat;
  const out: Checkpoint[] = [];
  let next = 0;
  const record = () => {
    while (world.time >= next - 1e-9) {
      out.push({ t: round(world.time), ...snapshot(v, extras(world, v)) });
      next += every;
    }
  };
  const step = (intents: Intent[]) => {
    stepWorld(world, intents, DT);
    record();
  };
  const h: Harness = {
    world,
    v,
    send: (control, value = 1, ref, targetId = boat.id) => step([{ playerId: 'player-1', targetId, control, value, ref }]),
    run: (s) => {
      for (let i = 0; i < Math.round(s / DT); i++) step([]);
    },
  };
  record();
  script(h);
  return out;
}

const preheat = VESSEL_DEFS.workboat.engine!.preheatTime;
const berth = BERTHS.find((b) => b.id === 'calder-cargo')!;
const selkie = PORTS.find((p) => p.id === 'selkie')!.cargo.anchorage!;
const ground = CONFIG.fishing.grounds[1];

const skiffOf = (world: WorldState) => Object.values(world.vessels).find((x) => x.defId === 'skiff')!;
const towLine = (world: WorldState): Record<string, Value> => {
  const line = world.tow?.line;
  const tv = world.tow?.job ? world.vessels[world.tow.job.vesselId] : undefined;
  return {
    lineOn: !!line,
    lineLength: line?.length ?? null,
    towX: tv?.position[0] ?? null,
    towZ: tv?.position[2] ?? null,
  };
};

/** The scenarios, by fixture name. */
export const SCENARIOS: Record<string, () => Checkpoint[]> = {
  /** Stone cold, started by the card: master, INSTR, key, HEAT, START; then idling. */
  'cold-start': () =>
    play({ cold: true }, 5, (h) => {
      h.run(1);
      h.send('master', 1);
      h.send('brk_instruments', 1);
      h.send('key', 1);
      h.send('heat', 1);
      h.run(preheat + 0.2);
      h.send('heat', 0);
      h.send('start', 1);
      h.run(3);
      h.send('start', 0);
      h.run(40);
    }),

  /** Full ahead from rest, then hard over to starboard. */
  'full-ahead-turn': () =>
    play({}, 5, (h) => {
      h.send('engineStartStop');
      h.run(3);
      h.send('lever', 1);
      h.run(40);
      h.send('helm', 1);
      h.run(30);
    }),

  /** Full ahead, then full astern (crash stop), then neutral. */
  'crash-stop': () =>
    play({}, 5, (h) => {
      h.send('engineStartStop');
      h.run(3);
      h.send('lever', 1);
      h.run(40);
      h.send('lever', -1);
      h.run(20);
      h.send('lever', 0);
      h.run(10);
    }),

  /** Alongside Calder Haven's cargo berth: Dock (both lines), warp in, then cast off. */
  docking: () => {
    const a = berthAxis(berth, false);
    const x = berth.x - berth.shoreX * 7 + a.x * -5;
    const z = berth.z - berth.shoreZ * 7 + a.z * -5;
    return play({ geography: 'archipelago', at: [x, z, berth.headingDeg + 12] }, 5, (h) => {
      h.run(1);
      h.send('dock');
      h.run(30);
      h.send('cleat', 0);
      h.send('cleat', 1);
      h.run(5);
      h.send('dock');
      h.run(10);
    });
  },

  /** Anchor in Selkie Bay, lie back on it astern, weigh it. */
  anchor: () =>
    play({ geography: 'archipelago', at: [selkie.x, selkie.z, 0] }, 5, (h) => {
      h.send('engineStartStop');
      h.run(5);
      h.send('anchor', 1);
      h.run(60);
      h.send('lever', -0.3);
      h.run(20);
      h.send('lever', 0);
      h.send('anchor', 0);
      h.run(90);
    }),

  /** The skiff launched by the tender crane, then recovered. */
  crane: () =>
    play(
      { tender: true },
      2.5,
      (h) => {
        h.send('engineStartStop');
        h.run(3);
        const skiff = skiffOf(h.world);
        h.send('crane', 1, undefined, skiff.id);
        h.run(20);
        h.send('crane', 1, undefined, skiff.id);
        h.run(25);
      },
      (world) => {
        const s = skiffOf(world);
        return { skiffPhase: s.tender?.phase ?? null, skiffT: s.tender?.t ?? null, skiffX: s.position[0], skiffY: s.position[1], skiffZ: s.position[2], skiffBattery: s.battery ?? null };
      },
    ),

  /** The barge made fast astern, towed at half ahead, then hove in on the winch. */
  'tow-barge': () =>
    play(
      {},
      5,
      (h) => {
        h.send('engineStartStop');
        h.run(3);
        h.send('towDebugNear', 1, 'barge');
        h.send('towMake');
        h.run(1);
        h.send('lever', 0.5);
        h.run(60);
        h.send('lever', 0);
        h.send('winchHeave', 1);
        h.run(10);
        h.send('winchHeave', 0);
        h.run(5);
      },
      towLine,
    ),

  /** The trawl shot on Skerry Ground, towed at about 2.6 kn, inside the 2-4.5 kn window (a box of fish comes aboard), then hauled. */
  trawl: () =>
    play(
      { at: [ground.x, ground.z + 100, 0] },
      5,
      (h) => {
        h.send('engineStartStop');
        h.run(3);
        h.send('trawl', 1);
        h.send('lever', 0.25);
        h.run(60);
        h.send('trawl', 0);
        h.send('lever', 0);
        h.run(15);
      },
      (world) => ({ net: world.fishing?.net ?? null, netT: world.fishing?.t ?? null, caught: world.fishing?.caught ?? null }),
    ),

  /** A burning boat ahead, hosed with the fire monitor. */
  fire: () =>
    play(
      {},
      5,
      (h) => {
        h.send('engineStartStop');
        h.run(3);
        h.send('fireDebugNear', 1, 'boat');
        h.send('firePump', 1);
        h.send('monPan', 0);
        // The elevation that brings the jet down on her (searched, as the fire test does).
        const job = h.world.fire!.job!;
        const pts = Array.from({ length: 60 }, () => new THREE.Vector3());
        let best = 0;
        let bestD = Infinity;
        for (let t = 0; t <= 55; t += 0.5) {
          h.v.controls.monTilt = t;
          const n = jetPath(h.world, h.v, pts);
          const d = Math.hypot(pts[n - 1].x - job.x, pts[n - 1].z - job.z);
          if (d < bestD) [best, bestD] = [t, d];
        }
        h.send('monTilt', best);
        h.run(70);
      },
      (world) => ({ fireIntensity: world.fire?.job?.intensity ?? null, firePhase: world.fire?.job?.phase ?? null, fireOut: world.fire?.out ?? null }),
    ),

  /** Every light and the radio on with the engine off; then the alternator charges. */
  'battery-drain': () =>
    play({}, 10, (h) => {
      for (const c of ['navLights', 'deckFore', 'deckAft', 'railLights', 'spotlight', 'fmOn', 'wipers', 'chartLamp']) h.send(c, 1);
      h.send('cabinLight', 1);
      h.run(120);
      h.send('engineStartStop');
      h.run(60);
    }),

  /** Under way in the default moderate sea, a little helm on. */
  'moderate-sea': () =>
    play({ waves: true }, 5, (h) => {
      h.send('engineStartStop');
      h.run(3);
      h.send('lever', 0.6);
      h.send('helm', 0.3);
      h.run(60);
    }),

  /** The skiff on her own: motor on, ahead, a turn (outboard, tiller, battery). */
  skiff: () =>
    play(
      { tender: true },
      5,
      (h) => {
        const s = h.v;
        placeVessel(s, 30, 0, -400, 0); // afloat, off the crane
        h.run(1);
        h.send('obPower', 1, undefined, s.id);
        h.send('obGear', 1, undefined, s.id);
        h.send('lever', 1, undefined, s.id);
        h.run(20);
        h.send('helm', 0.6, undefined, s.id);
        h.run(20);
      },
      undefined,
      (world) => skiffOf(world),
    ),
};
