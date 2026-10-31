/**
 * Course 3, Coast practice (docs/TRAINING.md section 3; milestone 4): outside the breakwater.
 * Steering by the compass and by the marks, a fix from two bearings taken through the
 * binoculars and plotted on the paper chart, the slalom at planing speed in the RIB, reading
 * the buoyage past a wreck and a rock, crossing a tidal stream, and the same buoyage at night
 * by the lights' rhythms. The places are world/regions/training.ts's; the limits
 * CONFIG.training.coast's.
 *
 * World axes: +X east, -Z north; a heading is degrees true, 0 north, clockwise. Every bearing
 * in the game is true (no variation: owner, 31 Oct 2026, the binoculars' readout).
 */
import { hasModule } from '../boats/sims';
import { LIGHTS, MARKS, WRECKS } from '../world/archipelago';
import type { MarkKind } from '../world/defs';
import { bearingTo, cfg, ENTRANCE_Z, fmt, heading, inGear, placeFree, setWind, speedKn, stopped, turnFrom, type Ctx, type ExerciseDef } from './exerciseKit';

const k = () => cfg().coast;
const mark = (name: string) => MARKS.find((m) => m.name === name)!;
const since = (c: Ctx) => c.world.time - c.t.stepAt;
const pad = (deg: number) => String(Math.round(deg) % 360).padStart(3, '0');
/** A course said as an instructor says it, figure by figure: "two seven zero". */
const spoken = (deg: number) => pad(deg).split('').map((d) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][+d]).join(' ');
const start = (v: Ctx['v'], at: readonly [number, number, number]) => placeFree(v, at[0], at[1], at[2]);
/** A line for the VHF in its turn (training.ts speaks the queue). */
const tell = (c: Ctx, text: string) => c.t.queue.push(text);
/** Steering by hand: the autopilot on is a fail in the steering exercises. */
const byHand = (c: Ctx) => (c.v.controls.autopilot ? { kind: 'autopilot', weight: cfg().weights.fail, text: 'The autopilot was on: steer her by hand' } : null);
/** Touching anything out here (the rock, the wreck, the bottom) is going aground. */
const aground = (c: Ctx) => (c.v.contact.force > 0 && c.v.position[2] < ENTRANCE_Z ? { kind: 'aground', weight: cfg().weights.fail, text: 'She touched the bottom' } : null);
const share = (c: Ctx, key: string) => (c.d[`${key}n`] ? c.d[`${key}in`] / c.d[`${key}n`] : undefined);
const pct = (x: number | undefined) => (x === undefined ? 'not reached' : `${Math.round(x * 100)} %`);
/** Count a sample toward a share: `key`n every time, `key`in when `ok`. */
function sample(c: Ctx, key: string, ok: boolean): void {
  c.d[`${key}n`] = (c.d[`${key}n`] ?? 0) + 1;
  c.d[`${key}in`] = (c.d[`${key}in`] ?? 0) + (ok ? 1 : 0);
}

// ── C1: steer the course ──

const C1: ExerciseDef = {
  id: 'steerCourse',
  code: 'C1',
  name: 'Steer the course',
  course: 'coast',
  practises: 'SBF: steering by compass (steady over a distance, a change at once, a bigger number is a turn to starboard); RYA Level 2: steering a compass course',
  brief: `Outside the harbour. Steer her by hand by the compass: no autopilot. Bring her up to ${k().steer.speedKn} knots; I will give you a course, turn to it at once the shorter way, and hold it ${k().steer.legs[0][1]} metres, then the next.`,
  capKn: k().capKn,
  limitS: 900,
  setup(world, v) {
    start(v, k().steer.start);
    setWind(world, k().windKn, k().windFrom);
  },
  steps: (() => {
    const s = k().steer;
    return [
      { text: `Up to ${s.speedKn} kn`, say: `Bring her up to ${s.speedKn} knots on this heading.`, done: (c: Ctx) => speedKn(c.v) >= s.speedKn - 0.5 },
      ...s.legs.map(([course, len], i) => ({
        text: `Steer ${pad(course)}° for ${len} m`,
        say: `Steer ${spoken(course)}.`,
        enter(c: Ctx) {
          c.d[`h${i}`] = heading(c.v);
          c.d[`x${i}`] = c.v.position[0];
          c.d[`z${i}`] = c.v.position[2];
        },
        done(c: Ctx) {
          const d = c.d;
          const h = heading(c.v);
          // The turn begun: her head moved `beganDeg` off where it was at the call; which way.
          const want = turnFrom(course, d[`h${i}`]);
          const moved = turnFrom(h, d[`h${i}`]);
          if (d[`began${i}`] === undefined && Math.abs(moved) >= s.beganDeg) {
            d[`began${i}`] = since(c);
            d[`wrong${i}`] = Math.sign(moved) !== Math.sign(want) ? 1 : 0;
          }
          // On it once within the limit; from then every tick counts toward the share.
          const err = Math.abs(turnFrom(h, course));
          if (err <= s.withinDeg) d[`on${i}`] = 1;
          if (d[`on${i}`]) sample(c, `leg${i}`, err <= s.withinDeg);
          return Math.hypot(c.v.position[0] - d[`x${i}`], c.v.position[2] - d[`z${i}`]) >= len;
        },
      })),
    ];
  })(),
  watch: byHand,
  verdict(c) {
    const s = k().steer;
    for (let i = 0; i < s.legs.length; i++) {
      const course = pad(s.legs[i][0]);
      if (c.d[`wrong${i}`]) return { passed: false, reason: `The turn to ${course} began the wrong way: a bigger number is a turn to starboard` };
      const began = c.d[`began${i}`];
      if (began === undefined) return { passed: false, reason: `The turn to ${course} never began` };
      if (began > s.beginS) return { passed: false, reason: `The turn to ${course} began after ${Math.round(began)} s (within ${s.beginS} s)` };
      const sh = share(c, `leg${i}`) ?? 0;
      if (sh < s.share) return { passed: false, reason: `${course} held within ${s.withinDeg}° for ${pct(sh)} of the leg (${Math.round(s.share * 100)} % wanted)` };
    }
    return { passed: true, reason: 'Every course taken up at once, the right way, and held' };
  },
  numbers: (c) =>
    k().steer.legs.flatMap(([course], i): [string, string][] => [
      [`${pad(course)}°: held within ${k().steer.withinDeg}°`, pct(share(c, `leg${i}`))],
      [`${pad(course)}°: turn begun after`, fmt(c.d[`began${i}`], 's', 0)],
    ]),
};

// ── C2: steer for the mark, then the leading line ──

const C2: ExerciseDef = {
  id: 'steerForMark',
  code: 'C2',
  name: 'Steer for the mark',
  course: 'coast',
  practises: 'SBF: steering by marks and landmarks; RYA Advanced: transits (leading lines)',
  brief: 'Outside the harbour. First I will name a mark by its shape and colour: steer straight for it. Then bring her in on the leading line: two fixed white lights behind the quay, one above the other, the line runs 180 through the entrance.',
  capKn: k().capKn,
  limitS: 1200,
  setup(world, v) {
    start(v, k().forMark.start);
    setWind(world, k().windKn, k().windFrom);
  },
  steps: (() => {
    const f = k().forMark;
    const m = mark(f.mark);
    return [
      {
        text: 'Steer for the yellow special mark',
        say: 'Steer for the yellow buoy with the yellow cross on top: a special mark, to the north-east of you.',
        done(c: Ctx) {
          const d = Math.hypot(m.x - c.v.position[0], m.z - c.v.position[2]);
          if (since(c) > f.settleS && d > f.arriveM) sample(c, 'mark', Math.abs(turnFrom(heading(c.v), bearingTo(c.v.position[0], c.v.position[2], m.x, m.z))) <= f.withinDeg);
          return d < f.arriveM;
        },
      },
      {
        text: 'On the leading line: the two white lights in line, 180°',
        say: 'Good. Now find the two white lights behind the quay to the south. Get on the line where they stand one above the other, well outside, and head down it: one eight zero.',
        done: (c: Ctx) => Math.abs(c.v.position[0] - f.lineX) < 2 * f.offM && c.v.position[2] < f.joinZ && Math.abs(turnFrom(heading(c.v), 180)) < 20,
      },
      {
        text: 'In on the line to the entrance',
        say: 'Keep the lights in line all the way to the entrance. If the rear one opens to the right, you are left of the line.',
        done(c: Ctx) {
          const z = c.v.position[2];
          if (z > ENTRANCE_Z - f.lastM && z < ENTRANCE_Z) {
            const off = Math.abs(c.v.position[0] - f.lineX);
            c.d.maxOff = Math.max(c.d.maxOff ?? 0, off);
            sample(c, 'line', off <= f.offM);
          }
          return z >= ENTRANCE_Z;
        },
      },
    ];
  })(),
  watch: (c) => byHand(c) ?? aground(c),
  verdict(c) {
    const f = k().forMark;
    const sm = share(c, 'mark') ?? 0;
    if (sm < f.share) return { passed: false, reason: `Heading for the mark within ${f.withinDeg}° for ${pct(sm)} of the way (${Math.round(f.share * 100)} % wanted)` };
    const sl = share(c, 'line') ?? 0;
    if (sl < f.share) return { passed: false, reason: `On the line within ${f.offM} m for ${pct(sl)} of the last ${f.lastM} m (${Math.round(f.share * 100)} % wanted)` };
    return { passed: true, reason: 'Straight for the mark, and in on the leading line' };
  },
  numbers: (c) => [
    ['Heading for the mark', pct(share(c, 'mark'))],
    ['On the leading line', pct(share(c, 'line'))],
    ['Furthest off the line', fmt(c.d.maxOff, 'm')],
  ],
};

// ── C3: where are we? (two bearings, a fix) ──

/** What may be taken a bearing of: the charted marks and lights (world/regions/training.ts). */
const CHARTED = () => [...MARKS.map((m) => ({ name: m.name, x: m.x, z: m.z })), ...LIGHTS.map((l) => ({ name: l.name, x: l.x, z: l.z }))];

const C3: ExerciseDef = {
  id: 'whereAreWe',
  code: 'C3',
  name: 'Where are we?',
  course: 'coast',
  practises: 'SBF: bearings ("Peilen"), a position fixed by cross bearings; RYA Level 2: hand-bearing compass, position fixing',
  brief: 'Outside the harbour. Stop her, then fix your position: a bearing of each of two charted marks or lights, well apart, through the binoculars (the bearing shows under the lenses: press to take it). Draw both on the paper chart, and put a pot marker where they cross.',
  limitS: 1200,
  needs: (v) => (hasModule(v.defId, 'furniture.chart-table') ? null : 'a chart table: the pilot boat has one (Training tab, Boat)'),
  setup(world, v) {
    start(v, k().fix.start);
    setWind(world, 4, k().windFrom);
  },
  steps: [
    { text: 'Stop her, out of gear', say: 'Stop her here, out of gear.', done: (c) => stopped(c.v) && !inGear(c.v) },
    {
      text: 'A bearing of a charted mark or light',
      say: 'Binoculars up: put a charted mark or light on the line in the middle and press to take its bearing.',
      done: (c) => (c.d.bearings ?? 0) >= 1,
    },
    {
      text: `A second bearing, ${k().fix.cutDeg}° or more round from the first`,
      say: 'And a second one, well round from the first: the closer to a right angle, the better the fix.',
      done: (c) => (c.d.bearings ?? 0) >= 2,
    },
    {
      text: 'Both on the chart; a pot marker on the fix',
      say: 'Now the chart table. Draw each bearing as a line through its mark, and put a pot marker where the two lines cross.',
      done: (c) => c.d.fixErr !== undefined,
    },
  ],
  onBearing(c, deg, x, z) {
    const f = k().fix;
    const n = c.d.bearings ?? 0;
    if (n >= 2) return;
    // The charted object nearest that bearing: the one meant.
    let best = -1;
    let err = Infinity;
    CHARTED().forEach((o, i) => {
      const e = Math.abs(turnFrom(deg, bearingTo(x, z, o.x, o.z)));
      if (e < err) {
        err = e;
        best = i;
      }
    });
    if (best < 0 || err > f.matchDeg) {
      tell(c, `${pad(deg)}: no charted mark or light on that bearing. Try another.`);
      return;
    }
    const o = CHARTED()[best];
    if (n === 1) {
      const first = CHARTED()[c.d.obj0];
      const cut = Math.abs(turnFrom(bearingTo(x, z, o.x, o.z), bearingTo(x, z, first.x, first.z)));
      if (cut < f.cutDeg) {
        tell(c, `${o.name}, ${pad(deg)}: only ${Math.round(cut)} degrees from the first. Pick one further round.`);
        return;
      }
      c.d.cut = cut;
      // Where she was when the fix was taken: the answer to "where are we?".
      c.d.posX = x;
      c.d.posZ = z;
    }
    c.d[`obj${n}`] = best;
    c.d[`err${n}`] = err;
    c.d.bearings = n + 1;
    tell(c, `${o.name}, ${pad(deg)}.`);
  },
  onFix(c, x, z) {
    if ((c.d.bearings ?? 0) < 2) {
      tell(c, 'Two bearings first, then the fix.');
      return;
    }
    c.d.fixErr = Math.hypot(x - c.d.posX, z - c.d.posZ);
  },
  verdict(c) {
    const f = k().fix;
    for (const i of [0, 1]) {
      if (c.d[`err${i}`] > f.bearingDeg) return { passed: false, reason: `The bearing of ${CHARTED()[c.d[`obj${i}`]].name} was ${c.d[`err${i}`].toFixed(1)}° out (within ${f.bearingDeg}°)` };
    }
    if (c.d.fixErr > f.fixM) return { passed: false, reason: `The fix was ${Math.round(c.d.fixErr)} m from where she was (within ${f.fixM} m)` };
    return { passed: true, reason: `Fixed within ${Math.round(c.d.fixErr)} m` };
  },
  numbers: (c) => [
    ['First bearing', c.d.obj0 === undefined ? 'not taken' : `${CHARTED()[c.d.obj0].name}, ${c.d.err0.toFixed(1)}° out`],
    ['Second bearing', c.d.obj1 === undefined ? 'not taken' : `${CHARTED()[c.d.obj1].name}, ${c.d.err1.toFixed(1)}° out`],
    ['Angle between them', fmt(c.d.cut, '°', 0)],
    ['The fix off', fmt(c.d.fixErr, 'm', 0)],
  ],
};

// ── C4: the slalom at planing speed ──

const SLALOM = () => MARKS.filter((m) => m.name.startsWith('Fast slalom')).sort((a, b) => b.z - a.z);
/** The passes, in order: out (south to north) 1..8, round the last, back 8..1. */
const PASSES = () => [...SLALOM(), ...SLALOM().reverse()];

const C4: ExerciseDef = {
  id: 'fastSlalom',
  code: 'C4',
  name: 'Slalom at speed',
  course: 'coast',
  practises: 'RYA Level 2: high-speed manoeuvres, S- and U-turns at planing speed',
  brief: 'You are in the RIB: clip the kill cord on (Boat tab), then start her: key on, hold START. Up on the plane, then weave through the eight yellow marks to the north, alternately each side; round the last one and weave back. Then off the plane and back to the entrance slowly.',
  boat: 'rib',
  capKn: k().fastSlalom.capKn,
  limitS: 900,
  setup(world, v) {
    start(v, k().fastSlalom.start);
    setWind(world, k().windKn, k().windFrom);
  },
  steps: [
    {
      text: 'Through the marks and back, alternately each side',
      say: 'Up on the plane, and through the marks: the first is to the north.',
      done(c) {
        const s = k().fastSlalom;
        const list = PASSES();
        const i = c.d.pass ?? 0;
        if (i >= list.length) return true;
        const m = list[i];
        const [x, , z] = c.v.position;
        const dist = Math.hypot(x - m.x, z - m.z);
        c.d.closest = Math.min(c.d.closest ?? dist, dist);
        if (c.d.pass && speedKn(c.v) > 0) sample(c, 'plane', speedKn(c.v) >= s.planeKn);
        // Passed: she's crossed the mark's line (east-west through it) going the leg's way: north
        // on the way out, south on the way back. Round the last mark she crosses its line twice,
        // out on one side and back on the other: so the sides alternate there too.
        const out = i < list.length / 2;
        const lastZ = c.d.lastZ ?? z;
        c.d.lastZ = z;
        const crossed = out ? lastZ > m.z && z <= m.z : lastZ < m.z && z >= m.z;
        if (!crossed) return false;
        if (Math.abs(x - m.x) > s.laneM) {
          c.d.missed = (c.d.missed ?? 0) + 1;
        } else {
          const side = x > m.x ? 1 : -1;
          if (c.d.side !== undefined && side === c.d.side) c.d.sameSide = (c.d.sameSide ?? 0) + 1;
          c.d.side = side;
        }
        c.d.nearest = Math.min(c.d.nearest ?? c.d.closest, c.d.closest);
        delete c.d.closest;
        c.d.pass = i + 1;
        return c.d.pass >= list.length;
      },
    },
    {
      text: `Off the plane: to the entrance under ${k().fastSlalom.entranceKn} kn`,
      say: `Well done. Off the plane now, and back to the entrance: under ${k().fastSlalom.entranceKn} knots near it.`,
      done: (c) => c.v.position[2] >= ENTRANCE_Z,
    },
  ],
  watch(c) {
    const s = k().fastSlalom;
    const near = Math.hypot(c.v.position[0], c.v.position[2] - ENTRANCE_Z) < s.entranceM;
    if (near && speedKn(c.v) > s.entranceKn + 0.05) return { kind: 'entrance', weight: cfg().weights.knock, text: `Over ${s.entranceKn} kn near the entrance` };
    return aground(c);
  },
  verdict(c) {
    const s = k().fastSlalom;
    if (c.d.missed) return { passed: false, reason: `${c.d.missed} mark${c.d.missed > 1 ? 's' : ''} missed (more than ${s.laneM} m off)` };
    if (c.d.sameSide) return { passed: false, reason: 'Two marks running passed on the same side: alternately, please' };
    if (c.d.nearest !== undefined && c.d.nearest < s.clearM) return { passed: false, reason: `A mark passed ${c.d.nearest.toFixed(1)} m off (at least ${s.clearM} m)` };
    const sp = share(c, 'plane') ?? 0;
    if (sp < s.share) return { passed: false, reason: `On the plane (over ${s.planeKn} kn) for ${pct(sp)} of the run (${Math.round(s.share * 100)} % wanted)` };
    if (c.t.faults.some((f) => f.kind === 'entrance')) return { passed: false, reason: `Too fast near the entrance (under ${s.entranceKn} kn)` };
    return { passed: true, reason: 'Through every mark on the plane, and slow by the entrance' };
  },
  numbers: (c) => [
    ['Marks passed', `${c.d.pass ?? 0} of ${PASSES().length}`],
    ['On the plane', pct(share(c, 'plane'))],
    ['Closest to a mark', fmt(c.d.nearest, 'm')],
  ],
};

// ── C5 and C7: read the marks (by day; by their lights at night) ──

/** Which side of a cardinal is safe: the side it's named for. */
const SAFE: Partial<Record<MarkKind, (dx: number, dz: number) => boolean>> = {
  N: (_dx, dz) => dz < 0,
  S: (_dx, dz) => dz > 0,
  E: (dx) => dx > 0,
  W: (dx) => dx < 0,
};
const CARDINALS = () => MARKS.filter((m) => SAFE[m.kind]);
const WRECK = () => WRECKS.find((w) => w.name === 'Kittiwake')!;
const ROCK = () => mark('Gull Rock');

/** The marks' own checks every tick: inside a danger circle, aground, and each cardinal's side at her closest. */
function watchMarks(c: Ctx) {
  const s = k().marks;
  const [x, , z] = c.v.position;
  CARDINALS().forEach((m, i) => {
    const d = Math.hypot(x - m.x, z - m.z);
    if (c.d[`cd${i}`] === undefined || d < c.d[`cd${i}`]) {
      c.d[`cd${i}`] = d;
      c.d[`cs${i}`] = SAFE[m.kind]!(x - m.x, z - m.z) ? 1 : 0;
    }
  });
  // Through the entrance: between the two buoys, red to port.
  const lastZ = c.d.lastZ ?? z;
  c.d.lastZ = z;
  const no2 = mark('Training No 2');
  if (lastZ < no2.z && z >= no2.z) c.d.gateX = x;
  const w = WRECK();
  const r = ROCK();
  const dw = Math.hypot(x - w.x, z - w.z);
  const dr = Math.hypot(x - r.x, z - r.z);
  c.d.wreckM = Math.min(c.d.wreckM ?? dw, dw);
  c.d.rockM = Math.min(c.d.rockM ?? dr, dr);
  if (dw < s.wreckM) return { kind: 'wreck', weight: cfg().weights.fail, text: 'Inside the wreck\'s danger circle' };
  if (dr < s.rockM) return { kind: 'rock', weight: cfg().weights.fail, text: 'Too close to the isolated danger' };
  return aground(c);
}

const QUARTER: Partial<Record<MarkKind, string>> = { N: 'north', S: 'south', E: 'east', W: 'west' };
const passed = (c: Ctx, i: number) => c.d[`cd${i}`] !== undefined && c.d[`cd${i}`] < k().marks.passM;

function verdictMarks(c: Ctx): { passed: boolean; reason: string } | null {
  const wrong = CARDINALS().find((_, i) => passed(c, i) && !c.d[`cs${i}`]);
  if (wrong) return { passed: false, reason: `${wrong.name} passed on the wrong side: a ${QUARTER[wrong.kind]} cardinal is passed to its ${QUARTER[wrong.kind]}` };
  const no1 = mark('Training No 1');
  const no2 = mark('Training No 2');
  if (c.d.gateX === undefined || c.d.gateX < no1.x || c.d.gateX > no2.x) return { passed: false, reason: 'Not in between the entrance buoys: red to port going in' };
  return null;
}

const numbersMarks = (c: Ctx): [string, string][] => [
  ['Cardinals passed', `${CARDINALS().filter((_, i) => passed(c, i)).length}, ${CARDINALS().filter((_, i) => passed(c, i) && c.d[`cs${i}`]).length} on the right side`],
  ['Closest to the wreck', fmt(c.d.wreckM, 'm', 0)],
  ['Closest to the rock', fmt(c.d.rockM, 'm', 0)],
];

const marksSteps = [
  {
    text: 'Past the Kittiwake: each cardinal on its own side',
    say: 'Ahead lies the wreck of the Kittiwake, with a cardinal mark on each side of her: pass each one on the side it names.',
    done: (c: Ctx) => c.v.position[2] > WRECK().z + 30 && Math.hypot(c.v.position[0] - WRECK().x, c.v.position[2] - WRECK().z) > 80,
  },
  {
    text: 'Gull Rock: the isolated danger left well clear',
    say: 'Beyond her, Gull Rock: an isolated danger mark on it. Water all round, but give it a wide berth.',
    done: (c: Ctx) => c.v.position[2] > ROCK().z + 30,
  },
  {
    text: 'In between the entrance buoys, red to port',
    say: 'Now in to the entrance: between the two buoys, the red one to port.',
    done: (c: Ctx) => c.v.position[2] >= ENTRANCE_Z,
  },
];

const C5: ExerciseDef = {
  id: 'readMarks',
  code: 'C5',
  name: 'Read the marks',
  course: 'coast',
  practises: 'RYA Level 2: buoyage (lateral, cardinal, isolated danger); SBF: lateral and cardinal marks',
  brief: 'Outside the harbour, to the north-east. Take her in to the entrance by the marks: past a wreck by her cardinal marks, past a rock by its isolated danger mark, then in between the entrance buoys.',
  capKn: k().capKn,
  limitS: 1200,
  setup(world, v) {
    start(v, k().marks.start);
    setWind(world, k().windKn, k().windFrom);
  },
  steps: marksSteps,
  watch: watchMarks,
  verdict: (c) => verdictMarks(c) ?? { passed: true, reason: 'Every mark passed on its right side, and in red to port' },
  numbers: numbersMarks,
};

/** The marks a light's rhythm names (world/navMarks.ts), as the answers to C7's question. */
const LIGHT_ANSWERS: [MarkKind, string][] = [
  ['N', 'North cardinal: pass north of it'],
  ['E', 'East cardinal: pass east of it'],
  ['S', 'South cardinal: pass south of it'],
  ['W', 'West cardinal: pass west of it'],
  ['isolated', 'Isolated danger: keep well clear all round'],
];

const C7: ExerciseDef = {
  id: 'lightsAtNight',
  code: 'C7',
  name: 'Lights at night',
  course: 'coast',
  practises: 'RYA Advanced: night pilotage; SBF: light characters; COLREG: navigation lights',
  brief: 'The same marks, at night: the wreck\'s cardinals, the rock\'s isolated danger and the entrance, by their lights alone. Navigation lights on, and tell me what the nearest light is by its rhythm.',
  capKn: k().capKn,
  limitS: 1500,
  setup(world, v) {
    start(v, k().marks.nightStart);
    setWind(world, k().windKn, k().windFrom, k().night.hour);
    v.controls.navLights = 0;
  },
  steps: [
    { text: 'Nav lights on', say: 'Navigation lights on.', done: (c) => c.v.controls.navLights > 0 },
    {
      text: 'The nearest white light: what is it? (Training tab)',
      say: 'Watch the nearest white flashing light for a while: count its flashes. What is it? Answer on the Training tab.',
      enter(c) {
        // The nearest of the marks with a white light, and two other answers beside the right one.
        const [x, , z] = c.v.position;
        const lit = MARKS.filter((m) => LIGHT_ANSWERS.some(([kind]) => kind === m.kind));
        const near = lit.reduce((a, m) => (Math.hypot(m.x - x, m.z - z) < Math.hypot(a.x - x, a.z - z) ? m : a), lit[0]);
        const right = LIGHT_ANSWERS.findIndex(([kind]) => kind === near.kind);
        const others = LIGHT_ANSWERS.map((_, i) => i).filter((i) => i !== right);
        const seed = Math.floor(c.world.time * 10);
        const pick = [right, others[seed % others.length], others[(seed + 2) % others.length]];
        // (The right answer's place: the seed again, so it isn't always first.)
        const order = [0, 1, 2].sort((a, b) => ((a + seed) % 3) - ((b + seed) % 3));
        const choices = order.map((i) => pick[i]);
        c.d.right = choices.indexOf(right);
        c.d.nearM = Math.hypot(near.x - x, near.z - z);
        c.t.ask = { q: `The nearest white light, about ${Math.round(c.d.nearM / 10) * 10} m off: what is it?`, choices: choices.map((i) => LIGHT_ANSWERS[i][1]) };
      },
      done: (c) => c.d.answer !== undefined,
    },
    ...marksSteps,
  ],
  onAnswer(c, choice) {
    if (!c.t.ask || c.d.answer !== undefined) return;
    c.d.answer = choice;
    const said = c.t.ask.choices[choice] ?? '';
    const right = c.t.ask.choices[c.d.right] ?? '';
    delete c.t.ask;
    tell(c, choice === c.d.right ? `Right: ${said.split(':')[0].toLowerCase()}.` : `No: it is the ${right.split(':')[0].toLowerCase()}. Count its flashes again as you pass.`);
  },
  watch(c) {
    if (c.v.mooring.phase === 'free' && !c.v.controls.navLights && c.t.step > 0) return { kind: 'noLights', weight: cfg().weights.knock, text: 'Under way at night without lights' };
    return watchMarks(c);
  },
  verdict(c) {
    if (c.d.answer !== c.d.right) return { passed: false, reason: 'The light was named wrong: count its rhythm' };
    if (c.t.faults.some((f) => f.kind === 'noLights')) return { passed: false, reason: 'Under way without navigation lights' };
    return verdictMarks(c) ?? { passed: true, reason: 'The light named, every mark passed right, in red to port' };
  },
  numbers: (c) => [['The light named', c.d.answer === undefined ? 'not answered' : c.d.answer === c.d.right ? 'right' : 'wrong'], ...numbersMarks(c)],
};

// ── C6: set and drift (a tidal stream) ──

const RACE_W = () => mark('Race W');
const RACE_E = () => mark('Race E');

/** One crossing of the stream between the marks: `dir` 1 eastward, -1 back westward. */
function crossing(key: string, dir: 1 | -1) {
  return (c: Ctx) => {
    const s = k().stream;
    const x0 = RACE_W().x + s.insideM;
    const x1 = RACE_E().x - s.insideM;
    const lineZ = (RACE_W().z + RACE_E().z) / 2;
    const [x, , z] = c.v.position;
    const off = Math.abs(z - lineZ);
    if (x > x0 && x < x1) {
      sample(c, key, off <= s.offM);
      c.d[`${key}Max`] = Math.max(c.d[`${key}Max`] ?? 0, off);
    }
    const there = dir > 0 ? x >= x1 : x <= x0;
    if (there) c.d[`${key}Arrive`] = off;
    return there;
  };
}

const C6: ExerciseDef = {
  id: 'setAndDrift',
  code: 'C6',
  name: 'Set and drift',
  course: 'coast',
  practises: 'RYA Level 2: allowing for tidal stream; RYA Intermediate: course to steer; SBF: set and drift',
  brief: 'West of the head a tidal stream runs north between two yellow marks. Cross it on the straight line between them: point her up into the stream so she crabs across (a ferry glide). Then back again at slack water.',
  capKn: k().capKn,
  limitS: 1200,
  setup(world, v) {
    start(v, k().stream.start);
    setWind(world, 4, k().windFrom);
  },
  steps: [
    {
      text: 'Across to the east mark, on the line',
      say: 'The stream is running, about two and a half knots, north. Over to the east mark, on the line.',
      enter: (c) => (c.world.environment.raceOverride = 'peak'),
      done: crossing('east', 1),
    },
    {
      text: 'Back to the west mark at slack water',
      say: 'Now it has gone slack. Turn round and back to the west mark, on the line.',
      enter: (c) => (c.world.environment.raceOverride = 'slack'),
      done: crossing('west', -1),
    },
  ],
  watch: (c) => byHand(c) ?? aground(c),
  verdict(c) {
    const s = k().stream;
    for (const [key, name] of [['east', 'Across the stream'], ['west', 'Back at slack']] as const) {
      const sh = share(c, key) ?? 0;
      if (sh < s.share) return { passed: false, reason: `${name}: on the line within ${s.offM} m for ${pct(sh)} of it (${Math.round(s.share * 100)} % wanted)` };
      if (c.d[`${key}Arrive`] === undefined || c.d[`${key}Arrive`] > s.arriveM) return { passed: false, reason: `${name}: arrived ${Math.round(c.d[`${key}Arrive`])} m off the line (within ${s.arriveM} m)` };
    }
    return { passed: true, reason: 'Across the stream on the line, and back' };
  },
  numbers: (c) => [
    ['Across: on the line', pct(share(c, 'east'))],
    ['Across: furthest off', fmt(c.d.eastMax, 'm')],
    ['Back at slack: on the line', pct(share(c, 'west'))],
    ['Back: furthest off', fmt(c.d.westMax, 'm')],
  ],
};

/** Course 3, in order. */
export const COAST: readonly ExerciseDef[] = [C1, C2, C3, C4, C5, C6, C7];
