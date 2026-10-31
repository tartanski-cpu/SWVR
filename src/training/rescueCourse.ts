/**
 * Course 2, Rescue practice (docs/TRAINING.md section 3; milestone 3): man overboard into the
 * wind and by drifting down, taking a boat in tow, a fire, fog, an engine alarm, and a search.
 * The casualty is the rescue system's own person in the water (rescue/rescue.ts: a man
 * overboard incident, recovered with the life ring or the boat hook as in the game), the tow
 * its own (tow/tow.ts), the fire its own (fire/fire.ts). Limits: CONFIG.training's.
 *
 * The rule over all of it (the SBF examiners' and the RYA's): out of gear whenever the person
 * in the water is near the propeller. In gear within `mob.guardM` of it fails the run there
 * and then (and ends an Examiner's Run).
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { gearOf } from '../boats/sims';
import { createRescueState, type RescueTarget } from '../rescue/rescue';
import { turningPropellers } from '../rescue/propStrike';
import { vesselToWorld } from '../rescue/recovery';
import { startTowCall, towFast } from '../tow/tow';
import { createFireState } from '../fire/fire';
import type { VesselState } from '../vessel/vesselState';
import { MARKS } from '../world/archipelago';
import { bearingTo, cfg, ENTRANCE_Z, fmt, heading, inGear, lengthOf, motorOn, placeAt, placeFree, setFog, setWind, speedKn, turnFrom, type Ctx, type ExerciseDef } from './exerciseKit';

const m = () => cfg().mob;
const since = (c: Ctx) => c.world.time - c.t.stepAt;

/** The person in the water (the training's man overboard), or null. */
function casualty(world: WorldState): RescueTarget | null {
  return world.rescue?.active?.targets.find((t) => t.id === 'mob') ?? null;
}

/** Recovered: on the line and climbing, or aboard. */
const recovered = (world: WorldState) => ['climbing', 'aboard'].includes(casualty(world)?.phase ?? '');

/** A person in the water at (x, z): a man overboard incident, already answered (it's ours). */
function dropCasualty(world: WorldState, x: number, z: number): void {
  const r = (world.rescue ??= createRescueState());
  r.active = { defId: 'manOverboard', phase: 'accepted', x, z, radius: 0, count: 1, callT: world.time, alertT: world.time, targets: [{ id: 'mob', kind: 'person', x, z }] };
}

const hub = new THREE.Vector3();
/** How near the casualty is to a turning propeller (m; her stern for an outboard), or Infinity out of gear. */
function propToSwimmer(world: WorldState, v: VesselState): number {
  const p = casualty(world);
  if (!p || p.phase === 'aboard' || p.phase === 'climbing' || !inGear(v)) return Infinity;
  const props = turningPropellers(v);
  if (props)
    return Math.min(
      ...props.hubs.map((h) => {
        const w = vesselToWorld(v, h, hub);
        return Math.hypot(w.x - p.x, w.z - p.z);
      }),
    );
  // An outboard or electric motor: its propeller is at her stern.
  const hd = (heading(v) * Math.PI) / 180;
  const half = lengthOf(v) / 2;
  return Math.hypot(v.position[0] - Math.sin(hd) * half - p.x, v.position[2] + Math.cos(hd) * half - p.z);
}

/** The propeller rule, every tick once someone's in the water. */
function guard(c: Ctx): { kind: string; weight: number; text: string } | null {
  if (propToSwimmer(c.world, c.v) < m().guardM) return { kind: 'gearSwimmer', weight: cfg().weights.fail, text: 'In gear with the swimmer by the propeller' };
  return null;
}

/** Up to speed: since when she has been at `kn` or more (forgotten below it). */
function upToSpeed(c: Ctx, kn: number, s: number): boolean {
  if (speedKn(c.v) < kn) delete c.d.fastSince;
  else c.d.fastSince ??= c.world.time;
  return c.d.fastSince !== undefined && c.world.time - c.d.fastSince >= s;
}

/** The man overboard exercises: into the wind (R1, and in the skiff), or drifting down (R2). */
function manOverboard(kind: 'intoWind' | 'driftDown', boat?: string): ExerciseDef {
  const drift = kind === 'driftDown';
  const skiff = boat === 'skiff';
  const speed = skiff ? m().skiffKn : m().speedKn;
  return {
    id: drift ? 'mobDriftDown' : skiff ? 'mobSkiff' : 'mobIntoWind',
    code: drift ? 'R2' : skiff ? 'R1T' : 'R1',
    name: drift ? 'Man overboard, drift down' : skiff ? 'Man overboard (tiller)' : 'Man overboard, into wind',
    course: 'rescue',
    boat,
    practises: drift
      ? 'RYA Level 2: man overboard, the drift-down method (both are needed at Level 2)'
      : `RYA Level 2: man overboard, the into-wind method${skiff ? ', tiller steering' : ''}; SBF: the rescue manoeuvre (Mensch-über-Bord): out of gear at once, stern away, the side named, stopped by the casualty with the propeller stopped`,
    brief: `${skiff ? 'In the skiff: clip the kill cord on (Boat tab), switch the motor on, then ' : ''}Head east outside the breakwater at about ${speed} knots. When I call man overboard: out of gear at once, turn your stern away from them, keep them in sight. ${drift ? `Then stop two to four of her lengths upwind of them, beam on, engine off, and drift down onto them.` : 'Then come round downwind of them and up to them into the wind, dead slow, stopping with them by the bow on the side I named, engine out of gear.'} Get them aboard with the life ring or the boat hook. Never in gear with them near the propeller.`,
    capKn: speed + 3,
    limitS: 720,
    setup(world, v) {
      placeFree(v, -150, -230, 90);
      setWind(world, m().windKn, m().windFrom);
    },
    steps: [
      { text: `East at about ${speed} kn`, say: `Off you go: east at about ${speed} knots.`, done: (c) => upToSpeed(c, speed - 1, 3) },
      {
        text: 'MAN OVERBOARD: neutral at once, stern away',
        say: 'Man overboard, port side!',
        enter(c) {
          // In the water off her port quarter: half her length aft, a metre or two out from her side.
          const v = c.v;
          const h = (heading(v) * Math.PI) / 180;
          const half = lengthOf(v) / 2;
          // Port of a heading h: its direction turned 90° anticlockwise, (-cos h, -sin h) in (x, z).
          const x = v.position[0] - Math.sin(h) * half - Math.cos(h) * m().dropOut;
          const z = v.position[2] + Math.cos(h) * half - Math.sin(h) * m().dropOut;
          dropCasualty(c.world, x, z);
          c.d.dropT = c.world.time;
          c.d.hdg0 = heading(v);
        },
        done(c) {
          if (inGear(c.v)) return false;
          c.d.neutralS = c.world.time - c.d.dropT;
          return true;
        },
      },
      drift
        ? {
            text: '2 to 4 lengths upwind of them, beam on, stopped',
            say: 'Get upwind of them: stop two to four lengths off, beam on to the wind, and let her drift down.',
            done(c) {
              const p = casualty(c.world);
              if (!p) return false;
              const d = Math.hypot(p.x - c.v.position[0], p.z - c.v.position[2]);
              const L = lengthOf(c.v);
              // Upwind: the casualty lies the way the wind blows (from windFrom, toward windFrom + 180).
              const downwind = Math.abs(turnFrom(bearingTo(c.v.position[0], c.v.position[2], p.x, p.z), m().windFrom + 180)) < 45;
              const beam = Math.min(Math.abs(turnFrom(heading(c.v), m().windFrom + 90)), Math.abs(turnFrom(heading(c.v), m().windFrom - 90)));
              if (speedKn(c.v) > 0.6 || d < m().driftLengths[0] * L || d > m().driftLengths[1] * L || !downwind) return false;
              c.d.beamOff = beam;
              c.d.offL = d / L;
              return true;
            },
          }
        : {
            text: 'Round downwind, then up to them into the wind, dead slow',
            say: 'Round downwind of them, then up to them into the wind. Dead slow. Stop with them by your bow.',
            done(c) {
              const p = casualty(c.world);
              if (!p) return false;
              const d = Math.hypot(p.x - c.v.position[0], p.z - c.v.position[2]);
              // (Only once she has been round: two lengths off them at least, as she carries her way past.)
              if (d > 2 * lengthOf(c.v)) c.d.wentRound = 1;
              if (!c.d.wentRound || d > lengthOf(c.v) || speedKn(c.v) > m().arriveKn) return false;
              c.d.windOff = Math.abs(turnFrom(heading(c.v), m().windFrom));
              c.d.arriveKn = speedKn(c.v);
              return true;
            },
          },
      ...(drift ? [{ text: 'Engine off as she drifts down', say: 'Engine off, and let her drift down onto them.', done: (c: Ctx) => !motorOn(c.v) }] : []),
      { text: 'Get them aboard: the life ring or the boat hook', say: 'Out of gear. Get them aboard: throw the ring and haul them in, or the boat hook.', done: (c) => recovered(c.world) },
    ],
    watch(c) {
      // Turned away in the first seconds: her stern swung from them (her bow toward the side they went).
      if (c.d.dropT !== undefined && c.d.awayTurn === undefined && c.world.time - c.d.dropT >= m().awayS) c.d.awayTurn = turnFrom(heading(c.v), c.d.hdg0);
      if (c.d.dropT !== undefined) {
        const g = guard(c);
        if (g) return g;
      }
      return null;
    },
    verdict(c) {
      if ((c.d.neutralS ?? 99) > m().neutralS) return { passed: false, reason: `Out of gear after ${(c.d.neutralS ?? 0).toFixed(0)} s: at once, under ${m().neutralS}` };
      if (drift && (c.d.beamOff ?? 99) > m().beamDeg) return { passed: false, reason: `Not beam on to the wind: ${Math.round(c.d.beamOff ?? 0)}° off` };
      if (!drift && (c.d.windOff ?? 99) > m().approachDeg) return { passed: false, reason: `Came up to them ${Math.round(c.d.windOff ?? 0)}° off the wind (within ${m().approachDeg}°)` };
      // Port side overboard: the bow turned to port (negative) swings the stern away from them.
      if ((c.d.awayTurn ?? 0) > -m().awayDeg) return { passed: true, reason: 'Recovered, but her stern was not turned away from them at once' };
      return { passed: true, reason: drift ? 'Drifted down onto them and recovered, out of gear' : 'Round, up into the wind, and recovered out of gear' };
    },
    numbers: (c) => [
      ['Out of gear after', fmt(c.d.neutralS, 's', 1)],
      ['Turned away', c.d.awayTurn === undefined ? 'not reached' : c.d.awayTurn < -m().awayDeg ? `yes, ${Math.round(-c.d.awayTurn)}° to port` : 'no'],
      drift ? ['Off them, beam on', c.d.offL === undefined ? 'not reached' : `${c.d.offL.toFixed(1)} lengths, ${Math.round(c.d.beamOff ?? 0)}° off beam`] : ['Off the wind coming up', fmt(c.d.windOff, '°', 0)],
      ['Time to recover', recovered(c.world) && c.d.dropT !== undefined ? `${Math.round(c.world.time - c.d.dropT)} s` : 'not reached'],
    ],
  };
}

/** R3: take a boat in tow. */
const R3: ExerciseDef = {
  id: 'takeInTow',
  code: 'R3',
  name: 'Take her in tow',
  course: 'rescue',
  practises: 'RYA Advanced: towing in confined waters; Safety Boat: towing astern',
  brief: `A small boat has broken down outside, drifting. Go out to her, come up from downwind, make the towline fast to her bow eye (the boat hook, or Boat tab, Tow), take the strain gently and tow her in through the entrance, under ${cfg().tow.speedKn} knots, without parting the line.`,
  capKn: cfg().tow.speedKn,
  limitS: 900,
  needs: (v) => (gearOf(v, 'towPoint') ? null : 'a towing post or stern roller: the pilot boat has one (Training tab, Boat)'),
  setup(world, v) {
    placeFree(v, 0, 60, 0);
    setWind(world, cfg().tow.windKn, 0);
    const job = startTowCall(world, v, cfg().tow.kind, { name: 'the motor boat Sandpiper', at: { x: 0, z: cfg().tow.atZ, r: 10 } });
    job.phase = 'accepted';
  },
  steps: [
    { text: 'Out to her, up from downwind, slowly', say: 'Out through the entrance to her. Come up from downwind, slowly.', done: (c) => towDist(c) < cfg().tow.nearM && speedKn(c.v) < 2 },
    { text: 'Make the towline fast to her bow eye', say: 'Make the towline fast to her bow eye.', done: (c) => towFast(c.world, c.v.id) },
    { text: `Take the strain gently; tow her in, under ${cfg().tow.speedKn} kn`, say: 'Take up the strain gently. Then tow her in.', done: (c) => towZ(c) > ENTRANCE_Z + 20 },
    { text: 'Inside: slow, and let her come to rest', say: 'Inside. Slow right down and bring her to rest.', done: (c) => c.world.tow?.job?.phase === 'delivered' || (towZ(c) > ENTRANCE_Z + 40 && speedKn(c.v) < 1) },
  ],
  watch(c) {
    const line = c.v.towLine;
    if (line?.parted) return { kind: 'parted', weight: cfg().weights.fail, text: 'The towline parted' };
    if (line?.fast && line.load > cfg().tow.snatchN) return { kind: 'snatch', weight: cfg().weights.knock, text: 'A snatch on the towline' };
    c.d.peak = Math.max(c.d.peak ?? 0, line?.load ?? 0);
    return null;
  },
  verdict: () => ({ passed: true, reason: 'Towed in without parting the line' }),
  numbers: (c) => [
    ['Peak towline load', c.d.peak ? `${(c.d.peak / 1000).toFixed(1)} kN` : 'not reached'],
    ['Snatches', String(c.t.faults.filter((f) => f.kind === 'snatch').length)],
  ],
};
function towBoat(c: Ctx): VesselState | undefined {
  const id = c.world.tow?.job?.vesselId;
  return id ? c.world.vessels[id] : undefined;
}
const towDist = (c: Ctx) => {
  const b = towBoat(c);
  return b ? Math.hypot(b.position[0] - c.v.position[0], b.position[2] - c.v.position[2]) : Infinity;
};
const towZ = (c: Ctx) => towBoat(c)?.position[2] ?? -Infinity;

/** R4: a fire on a boat outside. */
const R4: ExerciseDef = {
  id: 'fireFight',
  code: 'R4',
  name: 'Fire on a boat',
  course: 'rescue',
  practises: 'RYA Level 2 and Advanced: fire, and helping a vessel on fire',
  brief: 'A boat is on fire outside the breakwater, nobody aboard. Go out, close in from upwind (out of the smoke), pump on, and put it out with the monitor. Keep clear of her: no touching.',
  limitS: 600,
  needs: (v) => (gearOf(v, 'fireMonitor') ? null : 'a fire monitor: the pilot boat has one (Training tab, Boat)'),
  setup(world, v) {
    placeFree(v, 0, 60, 0);
    setWind(world, 8, 0);
    // A boat ablaze outside (fire/fire.ts's own fire, already answered: it's ours).
    const f = (world.fire ??= createFireState());
    f.job = { kind: 'boat', x: cfg().fire.at[0], z: cfg().fire.at[1], y: 0, yawDeg: 40, intensity: CONFIG.fire.startIntensity, wetting: 0, phase: 'accepted', callT: world.time, alertT: world.time };
  },
  steps: [
    { text: 'Out to her, upwind of her', say: 'Out to the burning boat. Come at her from upwind.', done: (c) => fireDist(c) < cfg().fire.nearM },
    { text: 'Pump on, the monitor on the fire: put it out', say: 'Fire pump on, and put it out.', done: (c) => c.world.fire?.job?.phase === 'out' },
  ],
  watch(c) {
    if (fireDist(c) < cfg().fire.tooCloseM) return { kind: 'tooClose', weight: cfg().weights.knock, text: 'Too close to the burning boat' };
    return null;
  },
  verdict: (c) => ({ passed: true, reason: `Put out in ${Math.round(c.world.time - c.t.startedAt)} s` }),
  numbers: (c) => [['Time', fmt((c.world.time - c.t.startedAt) / 60, 'min')]],
};
const fireDist = (c: Ctx) => {
  const j = c.world.fire?.job;
  return j ? Math.hypot(j.x - c.v.position[0], j.z - c.v.position[2]) : Infinity;
};

/** R5: fog in the pen. */
const R5: ExerciseDef = {
  id: 'fogPen',
  code: 'R5',
  name: 'Fog in the harbour',
  course: 'rescue',
  practises: 'RYA Level 2: restricted visibility, IRPCS rules 19 and 35; SBF: sound signals in reduced visibility',
  brief: `Thick fog. Lights on, then take her out: one prolonged blast (four seconds or more) at least every two minutes while she's under way, under ${cfg().fog.speedKn} knots. Out by compass to the entrance buoys, then turn and back in on the reciprocal, and alongside.`,
  capKn: cfg().fog.speedKn,
  limitS: 1200,
  setup(world, v) {
    placeAt(v, 'training-b');
    v.controls.navLights = 0;
    setFog(world);
  },
  steps: [
    { text: 'Nav lights on', say: 'Lights on.', done: (c) => c.v.controls.navLights > 0 },
    { text: 'Cast off; a prolonged blast every 2 minutes', say: 'Cast off. Sound your fog signal as soon as you are under way.', done: (c) => c.v.mooring.phase === 'free' && speedKn(c.v) > 0.5 },
    { text: 'Out by compass, 000, past the entrance buoys', say: 'Steer north, 000, out through the entrance, past the buoys.', done: (c) => c.v.position[2] < cfg().fog.outZ },
    { text: 'Turn and back in on 180', say: 'Turn round and come back in, 180.', done: (c) => c.v.position[2] > 100 },
    { text: 'Alongside any berth', say: 'Alongside, any berth.', done: (c) => c.v.mooring.phase === 'moored' },
  ],
  watch(c) {
    const v = c.v;
    const underWay = v.mooring.phase === 'free' && speedKn(v) > 0.3;
    if (!underWay) return null;
    if (!v.controls.navLights) return { kind: 'noLights', weight: cfg().weights.knock, text: 'Under way in fog without lights' };
    c.d.underWaySince ??= c.world.time;
    const lastBlast = Math.max(c.t.horn.prolongedAt, c.d.underWaySince ?? 0, c.d.missedAt ?? -Infinity);
    if (c.world.time - lastBlast > cfg().fog.blastS) {
      c.d.missedAt = c.world.time;
      c.d.missed = (c.d.missed ?? 0) + 1;
      return { kind: `noBlast${c.d.missed}`, weight: cfg().weights.knock, text: 'No fog signal for two minutes' };
    }
    return null;
  },
  verdict: (c) => ((c.d.missed ?? 0) > 0 ? { passed: false, reason: `Fog signal missed ${c.d.missed} ${c.d.missed === 1 ? 'time' : 'times'}` } : { passed: true, reason: 'Out and back in fog, the signal sounded throughout' }),
  numbers: (c) => [
    ['Fog signals missed', String(c.d.missed ?? 0)],
    ['Time', fmt((c.world.time - c.t.startedAt) / 60, 'min')],
  ],
};

/** R6: an engine alarm under way. */
const R6: ExerciseDef = {
  id: 'engineAlarm',
  code: 'R6',
  name: 'Alarm under way',
  course: 'rescue',
  practises: 'RYA Advanced: engine fault finding; SBF: engine warning lamps and overheating (basic questions)',
  brief: 'Down the stopping lane at about 4 knots, and keep an eye on your engine as you go.',
  limitS: 600,
  setup(world, v) {
    placeFree(v, -130, 55, 90);
    setWind(world, 3, 0);
    // The raw-water pump's impeller has failed (vessel/physics/engineThermal.ts): she'll overheat.
    v.engine.coolingFault = true;
    v.engine.coolantC = cfg().alarm.startC;
  },
  steps: [
    { text: 'East down the lane at about 4 kn', say: 'Off you go, east, about four knots.', done: (c) => upToSpeed(c, 3.5, 3) },
    {
      text: 'Watch your gauges and lamps',
      say: 'Keep an eye on your gauges.',
      done(c) {
        // The TEMP alarm, then the lever back: her reaction.
        const alarm = c.v.engine.coolantC >= alarmC(c.v);
        if (alarm) c.d.alarmT ??= c.world.time;
        if (c.d.alarmT === undefined || c.v.controls.lever > cfg().alarm.easedLever) return false;
        c.d.reactS = c.world.time - c.d.alarmT;
        return true;
      },
    },
    { text: 'Stop the engine before she overheats: KEY off', say: 'She is overheating. Stop the engine.', done: (c) => c.v.engine.phase === 'off' },
  ],
  watch(c) {
    // Shut down by the engine itself (her protection), not by the skipper.
    if (c.v.engine.coolantC >= shutdownC(c.v) - 0.5 || (c.v.engine.phase === 'off' && c.v.engine.key > 0)) return { kind: 'cooked', weight: cfg().weights.fail, text: 'She overheated and shut herself down' };
    return null;
  },
  verdict: (c) => ((c.d.reactS ?? 99) > cfg().alarm.reactS ? { passed: false, reason: `Throttled back ${Math.round(c.d.reactS ?? 0)} s after the alarm (within ${cfg().alarm.reactS})` } : { passed: true, reason: `Saw the alarm, eased off in ${Math.round(c.d.reactS ?? 0)} s, stopped her in time` }),
  numbers: (c) => [
    ['Eased off after', fmt(c.d.reactS, 's', 0)],
    ['Coolant at stop', `${Math.round(c.v.engine.coolantC)} °C`],
  ],
};
const alarmC = (v: VesselState) => gearOf(v, 'diesel')?.engine.thermal?.alarmC ?? 95;
const shutdownC = (v: VesselState) => gearOf(v, 'diesel')?.engine.thermal?.shutdownC ?? 115;

/** R7: search (an expanding square from the datum) and recover. */
const datum = () => MARKS.find((x) => x.name === 'Datum')!;
const R7: ExerciseDef = {
  id: 'search',
  code: 'R7',
  name: 'Search and recover',
  course: 'rescue',
  practises: 'RYA Advanced: search patterns; then man overboard recovery',
  brief: 'A person was last seen by the yellow datum mark north of the entrance, ten minutes ago, and the fog is in. Go to the datum, then search it in an expanding square: I will call each leg, its course and its length. When you sight them, recover them as before: out of gear by them.',
  limitS: 1500,
  setup(world, v) {
    placeFree(v, 0, -330, 0);
    setFog(world);
    const d = datum();
    dropCasualty(world, d.x + cfg().search.offset[0], d.z + cfg().search.offset[1]);
  },
  steps: [
    { text: 'To the datum mark', say: 'To the datum: the yellow mark ahead.', done: (c) => sighted(c) || Math.hypot(datum().x - c.v.position[0], datum().z - c.v.position[2]) < cfg().search.atM },
    ...cfg().search.legs.map(([course, length], i) => ({
      text: `Leg ${i + 1}: ${String(course).padStart(3, '0')}° for ${length} m`,
      say: `Leg ${i + 1}: steer ${String(course).padStart(3, '0')}, ${length} metres.`,
      enter(c: Ctx) {
        c.d[`leg${i}x`] = c.v.position[0];
        c.d[`leg${i}z`] = c.v.position[2];
        c.d[`leg${i}err`] = 0;
        c.d[`leg${i}n`] = 0;
      },
      done(c: Ctx) {
        // Heading error, averaged over the leg after its first 10 s (time to come round).
        if (since(c) > 10) {
          c.d[`leg${i}err`] += Math.abs(turnFrom(heading(c.v), course));
          c.d[`leg${i}n`] += 1;
        }
        return sighted(c) || Math.hypot(c.v.position[0] - c.d[`leg${i}x`], c.v.position[2] - c.d[`leg${i}z`]) >= length;
      },
    })),
    { text: 'Sighted: recover them, out of gear by them', say: 'Person in the water, close! Recover them: out of gear by them.', done: (c) => recovered(c.world) },
  ],
  watch(c) {
    if (sighted(c)) c.d.sightedT ??= c.world.time;
    return guard(c);
  },
  verdict(c) {
    const legs = cfg().search.legs.map((_, i) => (c.d[`leg${i}n`] ? c.d[`leg${i}err`] / c.d[`leg${i}n`] : null)).filter((x): x is number => x !== null);
    const off = legs.findIndex((e) => e > cfg().search.headingDeg);
    if (off >= 0) return { passed: false, reason: `Leg ${off + 1} steered ${Math.round(legs[off])}° off its course on average (within ${cfg().search.headingDeg}°)` };
    return { passed: true, reason: `Found and recovered after ${Math.round(((c.d.sightedT ?? c.world.time) - c.t.startedAt) / 60)} minutes` };
  },
  numbers: (c) => [
    ...cfg().search.legs.slice(0, 4).map((_, i): [string, string] => [`Leg ${i + 1} off course`, c.d[`leg${i}n`] ? `${Math.round(c.d[`leg${i}err`] / c.d[`leg${i}n`])}°` : 'not run']),
  ],
};
const sighted = (c: Ctx) => {
  const p = casualty(c.world);
  return !!p && Math.hypot(p.x - c.v.position[0], p.z - c.v.position[2]) < cfg().search.sightM;
};

/** Course 2, in order. */
export const RESCUE: readonly ExerciseDef[] = [manOverboard('intoWind'), manOverboard('driftDown'), manOverboard('intoWind', 'skiff'), R3, R4, R5, R6, R7];
