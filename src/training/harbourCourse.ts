/**
 * Course 1, Harbour practice, the rest of it (docs/TRAINING.md section 3; milestone 3): start
 * up and shut down, fuelling, lines and fenders, holding off a mark, alongside with the wind
 * on, anchoring on three bottoms, the horn's manoeuvring signals and lights, the low-speed
 * slalom, springing off, and picking up a mooring. The first five of the course (H4, H5, H6,
 * H8, H10) are in exercises.ts. Limits: CONFIG.training's.
 */
import { isPowered } from '../vessel/electrics';
import { fuelTankL } from '../vessel/fuelTank';
import { MARKS, PORTS } from '../world/archipelago';
import { aheadKn, bowPoint, cfg, coldAndDark, FACE, fmt, heading, inGear, inLane, lengthOf, placeAt, placeFree, setWind, speedKn, turnFrom, type Ctx, type ExerciseDef } from './exerciseKit';

const mark = (name: string) => MARKS.find((m) => m.name === name)!;
const distTo = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z);
const since = (c: Ctx) => c.world.time - c.t.stepAt;

/** H1: start her up, and shut her down. */
const H1: ExerciseDef = {
  id: 'startUp',
  code: 'H1',
  name: 'Start her up',
  course: 'harbour',
  practises: 'RYA Level 1/2: pre-start checks, starting and stopping; SBF: engine checks (basic questions)',
  brief: 'You are alongside Berth B and she is cold and dark. Bring her to life in the right order, let her run a while, then shut her down and switch off.',
  limitS: 600,
  setup(world, v) {
    placeAt(v, 'training-b');
    coldAndDark(v);
    setWind(world, 4, 200);
  },
  steps: [
    { text: 'Battery MASTER on', say: 'First the battery master switch.', done: (c) => (c.v.electrics?.master ?? 1) > 0 },
    { text: 'Breakers on: INSTR at least', say: 'Now the breakers on the panel by the helm: the instruments at least.', done: (c) => isPowered(c.v, 'instruments') },
    {
      text: 'Lever neutral, KEY on, wait for GLOW, then START',
      say: 'Start her: lever in neutral, key on, wait for the glow lamp to go out, then hold START until she runs.',
      done(c) {
        if (c.v.engine.phase !== 'running') return false;
        c.d.startS = c.world.time - c.t.startedAt;
        return true;
      },
    },
    { text: `Let her idle ${cfg().startUp.idleS} s: oil pressure, temperatures`, say: 'Good. Let her idle a little: watch the oil pressure come up and the temperature start to rise.', done: (c) => since(c) >= cfg().startUp.idleS && c.v.engine.phase === 'running' },
    { text: 'Shut her down: lever neutral, KEY off', say: 'Now shut her down: lever in neutral, key off.', done: (c) => c.v.engine.phase === 'off' },
    { text: 'Battery MASTER off', say: 'And the battery master off.', done: (c) => (c.v.electrics?.master ?? 0) === 0 },
  ],
  watch(c) {
    // Starting in gear: the starter turning with the lever out of neutral.
    if (c.v.engine.phase === 'cranking' && Math.abs(c.v.controls.lever) > 0.05) return { kind: 'gearStart', weight: cfg().weights.knock, text: 'Starting with the lever out of neutral' };
    return null;
  },
  verdict: () => ({ passed: true, reason: 'Started, run and shut down in the right order' }),
  numbers: (c) => [
    ['Running after', fmt(c.d.startS, 's', 0)],
    ['Time in all', fmt((c.world.time - c.t.startedAt) / 60, 'min')],
  ],
};

/** H2: fuel her up. */
const H2: ExerciseDef = {
  id: 'fuelUp',
  code: 'H2',
  name: 'Fuel her up',
  course: 'harbour',
  practises: 'RYA Level 1: the fuel tank and fuelling; SBF: fuelling (basic questions)',
  brief: 'You are alongside Berth A, the fuel berth, with her tank low and the engine running. Fill her up safely: no fuelling with the engine running.',
  limitS: 600,
  setup(world, v) {
    placeAt(v, 'training-a');
    v.engine.fuelL = fuelTankL(v) * cfg().fuel.startShare;
    setWind(world, 4, 200);
  },
  steps: [
    { text: 'Engine off', say: 'First, engine off.', done: (c) => c.v.engine.phase === 'off' },
    { text: 'Take fuel: the hose to her filler (or menu Boat, Refuel)', say: 'Now take the hose from the pump to her filler, or Refuel in the Boat tab.', done: (c) => c.v.refuelling },
    { text: `Fill her to ${Math.round(cfg().fuel.fullShare * 100)} %`, say: 'Fill her up. Watch the gauge.', done: (c) => c.v.engine.fuelL >= fuelTankL(c.v) * cfg().fuel.fullShare },
    { text: 'Stop fuelling, the hose back on the pump', say: 'Full. Stop and hang the hose back up.', done: (c) => !c.v.refuelling },
  ],
  watch(c) {
    if (c.v.refuelling && c.v.engine.phase !== 'off') return { kind: 'fuelRunning', weight: cfg().weights.fail, text: 'Fuelling with the engine running' };
    return null;
  },
  verdict: () => ({ passed: true, reason: 'Fuelled with the engine off' }),
  numbers: (c) => [
    ['Fuel', `${Math.round(c.v.engine.fuelL)} of ${Math.round(fuelTankL(c.v))} L`],
    ['Time', fmt((c.world.time - c.t.startedAt) / 60, 'min')],
  ],
};

/** H3: lines and fenders, in the order asked. */
const H3: ExerciseDef = {
  id: 'linesFenders',
  code: 'H3',
  name: 'Lines and fenders',
  course: 'harbour',
  practises: 'RYA Level 1: fasten to a cleat, lines and fenders; SBF: making fast (Festmachen)',
  brief: 'You are alongside Berth B with the fenders in. Work the fenders and lines in the order I call them: the cleats on deck make each line fast or let it go; the springs are in the Boat tab.',
  limitS: 600,
  setup(world, v) {
    placeAt(v, 'training-b');
    v.controls.fenders = 0;
    setWind(world, 6, 200);
  },
  steps: [
    { text: 'Fenders out', say: 'Fenders out.', done: (c) => c.v.controls.fenders > 0 },
    { text: 'Let go the stern line (an aft cleat)', say: 'Let go the stern line.', done: (c) => !c.v.mooring.stern && !!c.v.mooring.bow },
    { text: 'Make the stern line fast again', say: 'Make it fast again.', done: (c) => !!c.v.mooring.stern },
    { text: 'Let go the bow line (a forward cleat)', say: 'Now let go the bow line.', done: (c) => !c.v.mooring.bow && !!c.v.mooring.stern },
    { text: 'Make the bow line fast again', say: 'And make it fast again.', done: (c) => !!c.v.mooring.bow },
    { text: 'A fore spring on (Boat tab: Springs, Fore)', say: 'Put a fore spring on: from her bow aft to the quay.', done: (c) => c.v.mooring.spring?.end === 'fore' },
    { text: 'Take the spring off', say: 'Good. Take it off again.', done: (c) => !c.v.mooring.spring },
  ],
  watch(c) {
    const m = c.v.mooring;
    // The wrong line let go: the bow when the stern was asked, and the other way round.
    if (c.t.said && c.t.step === 1 && !m.bow) return { kind: 'wrongLine', weight: cfg().weights.knock, text: 'The bow line let go: the stern line was asked' };
    if (c.t.said && c.t.step === 3 && !m.stern) return { kind: 'wrongLine', weight: cfg().weights.knock, text: 'The stern line let go: the bow line was asked' };
    return null;
  },
  verdict: (c) => (c.t.faults.some((f) => f.kind === 'wrongLine') ? { passed: false, reason: 'A line let go out of turn' } : { passed: true, reason: 'Every line and fender in the order asked' }),
  numbers: (c) => [
    ['Lines out of turn', String(c.t.faults.filter((f) => f.kind === 'wrongLine').length)],
    ['Time', fmt((c.world.time - c.t.startedAt) / 60, 'min')],
  ],
};

/** H7: hold off the mark. */
const H7: ExerciseDef = {
  id: 'holdOff',
  code: 'H7',
  name: 'Hold off the mark',
  course: 'harbour',
  practises: 'RYA Level 2: holding off; RYA Advanced: holding station',
  brief: `Go up to the yellow hold-off mark and keep her bow within one of her lengths of it for ${cfg().holdOff.seconds} seconds. The wind is setting you off it: short bursts ahead, and the helm, to stay there. Don't touch it.`,
  limitS: 480,
  setup(world, v) {
    const m = mark('Hold-off mark');
    placeFree(v, m.x, m.z + 40, 0);
    setWind(world, cfg().holdOff.windKn, cfg().holdOff.windFrom);
  },
  steps: [
    { text: 'Bow within a length of the mark', say: 'Up to the mark.', done: (c) => distTo(bowPoint(c.v), mark('Hold-off mark')) < lengthOf(c.v) },
    {
      text: `Hold her there ${cfg().holdOff.seconds} s`,
      say: `Hold her there. ${cfg().holdOff.seconds} seconds from now.`,
      enter(c) {
        c.d.held = 0;
        c.d.in = 1;
        c.d.lastT = c.world.time;
        c.d.out = 0;
      },
      done: (c) => (c.d.held ?? 0) >= cfg().holdOff.seconds,
    },
  ],
  watch(c) {
    if (c.t.step !== 1 || !c.t.said) return null;
    const d = distTo(bowPoint(c.v), mark('Hold-off mark'));
    const inside = d < lengthOf(c.v);
    if (inside) c.d.held = (c.d.held ?? 0) + (c.world.time - (c.d.lastT ?? c.world.time));
    c.d.lastT = c.world.time;
    if (!inside && c.d.in) c.d.out = (c.d.out ?? 0) + 1;
    c.d.in = inside ? 1 : 0;
    if ((c.d.out ?? 0) > cfg().holdOff.excursions) return { kind: 'offMark', weight: cfg().weights.fail, text: `Off the mark ${c.d.out} times` };
    if (d < cfg().holdOff.touchM) return { kind: 'touchMark', weight: cfg().weights.knock, text: 'Her bow on the mark' };
    return null;
  },
  verdict: (c) => ({ passed: true, reason: `Held off ${cfg().holdOff.seconds} s, off the mark ${c.d.out ?? 0} ${c.d.out === 1 ? 'time' : 'times'}` }),
  numbers: (c) => [
    ['Time held', fmt(c.d.held, 's', 0)],
    ['Times off the mark', String(c.d.out ?? 0)],
  ],
};

/** H9: alongside with the wind blowing her onto the berth. */
const H9_BERTH = 'training-c';
const H9: ExerciseDef = {
  id: 'alongsideWindOn',
  code: 'H9',
  name: 'Alongside, wind on',
  course: 'harbour',
  practises: 'RYA Level 2: coming alongside, the wind on; SBF: coming alongside (Anlegen), "drifting onto the berth is not allowed"',
  brief: `Bring her alongside Berth C, port side to, heading west. The wind is ${cfg().windOn.windKn} knots onto the quay: stop her parallel to it a width off, then bring her in under control, with rudder and engine. Letting her drift on in neutral is not allowed.`,
  limitS: 600,
  setup(world, v) {
    placeFree(v, 70, 140, 250);
    v.controls.fenders = 0;
    setWind(world, cfg().windOn.windKn, cfg().windOn.windFrom);
  },
  steps: [
    { text: 'Fenders out', say: 'Fenders out first.', done: (c) => c.v.controls.fenders > 0 },
    { text: 'Alongside Berth C, port side to: parallel, a width off, then in', say: 'In to Berth C, port side to. Slowly.', done: (c) => c.v.mooring.phase !== 'free' },
    { text: 'Make fast bow and stern', say: 'Make fast fore and aft.', done: (c) => c.v.mooring.phase === 'moored' },
  ],
  watch(c) {
    const v = c.v;
    // In neutral with the helm amidships: since when (she's being left to drift).
    const idle = Math.abs(v.controls.lever) < 0.05 && Math.abs(v.controls.helm) < 0.1;
    if (!idle) delete c.d.idleSince;
    else c.d.idleSince ??= c.world.time;
    const touching = v.contact.force > 0 || (v.contact.guardForce ?? 0) > 0;
    if (c.t.step >= 1 && c.d.touched === undefined && touching) {
      c.d.touched = 1;
      c.d.touchKnock = v.contact.impact;
      const h = heading(v);
      c.d.angle = Math.min(Math.abs(turnFrom(h, 270)), Math.abs(turnFrom(h, 90)));
      if (c.d.idleSince !== undefined && c.world.time - c.d.idleSince > cfg().windOn.driftS) {
        c.d.drifted = 1;
        return { kind: 'driftedOn', weight: cfg().weights.speed, text: 'Drifted onto the berth in neutral (SBF: rudder and engine only)' };
      }
    }
    return null;
  },
  verdict(c) {
    const v = c.v;
    if (v.mooring.berthId !== H9_BERTH) return { passed: false, reason: 'Made fast at another berth: Berth C was asked' };
    if (Math.abs(turnFrom(heading(v), 270)) > 45) return { passed: false, reason: 'Starboard side to: port side to was asked (heading west)' };
    if ((c.d.maxKnock ?? 0) > cfg().alongside.knockKn) return { passed: false, reason: `Too hard onto the quay: ${(c.d.maxKnock ?? 0).toFixed(2)} kn (under ${cfg().alongside.knockKn})` };
    return { passed: true, reason: c.d.drifted ? 'Alongside, but she drifted on in neutral at the end' : 'Alongside under control, the wind on' };
  },
  numbers: (c) => [
    ['Angle at first touch', fmt(c.d.angle, '°', 0)],
    ['Biggest knock', fmt(c.d.maxKnock, 'kn', 2)],
    ['Drifted on', c.d.drifted ? 'yes' : 'no'],
  ],
};

/** H11 (three runs): anchor, check she holds, weigh. */
function anchoring(bottom: 'sand' | 'mud' | 'weed'): ExerciseDef {
  const portId = `training-${bottom}`;
  const at = () => PORTS.find((p) => p.id === portId)!.cargo.anchorage!;
  const a = () => cfg().anchor;
  const minScope = () => (bottom === 'weed' ? a().weedScope : a().minScope);
  return {
    id: `anchor${bottom[0].toUpperCase()}${bottom.slice(1)}`,
    code: `H11${bottom === 'sand' ? 'a' : bottom === 'mud' ? 'b' : 'c'}`,
    name: `Anchor in ${bottom}`,
    course: 'harbour',
    practises: 'RYA Level 2: anchoring, holding, weighing; SKS: the anchoring manoeuvre',
    brief: `Anchor in the ${bottom} anchorage, outside the breakwater${bottom === 'weed' ? ': weed holds poorly, so give her plenty of scope' : ''}. Choose your scope first (the Boat tab: Scope), head up into the wind, take the way off her, let go, drop back and let it set. Check she holds for a minute, then heave in and stow.`,
    limitS: 900,
    setup(world, v) {
      const p = at();
      placeFree(v, p.x, p.z + a().startM, 0);
      setWind(world, a().windKn[bottom], 0);
    },
    steps: [
      {
        text: `Scope chosen; into the wind in the anchorage, way off`,
        say: `Into the anchorage, head to wind, and take the way off her.`,
        done: (c) => distTo({ x: c.v.position[0], z: c.v.position[2] }, at()) < at().radius && speedKn(c.v) < a().letGoKn && Math.abs(turnFrom(heading(c.v), 0)) < a().headDeg,
      },
      {
        text: 'Let go (the anchor switch)',
        say: 'Let go.',
        done(c) {
          if (c.v.anchor.phase === 'stowed') return false;
          c.d.letGoKn = aheadKn(c.v);
          c.d.scope = c.v.anchor.scope ?? 5;
          return true;
        },
      },
      {
        text: 'Drop back: let her lay out the chain and set',
        say: 'Let her drop back and lay out the chain.',
        done(c) {
          if (c.v.anchor.phase !== 'set') return false;
          c.d.setX = c.v.anchor.x;
          c.d.setZ = c.v.anchor.z;
          return true;
        },
      },
      { text: `Hold ${a().holdS} s: check she holds`, say: `It's set. Check she's holding: take a transit ashore, and give it a minute.`, done: (c) => since(c) >= a().holdS },
      { text: 'Heave in and stow (anchor switch off)', say: 'Holding. Now heave in and stow it. Motor gently up to it, never hard over the chain.', done: (c) => c.v.anchor.phase === 'stowed' },
    ],
    watch(c) {
      const v = c.v;
      if (c.d.setX !== undefined) {
        c.d.moved = Math.max(c.d.moved ?? 0, Math.hypot(v.anchor.x - c.d.setX, v.anchor.z - (c.d.setZ ?? 0)));
        if (c.t.step <= 3 && (c.d.moved ?? 0) > a().dragM) return { kind: 'dragged', weight: cfg().weights.fail, text: `Her anchor dragged ${(c.d.moved ?? 0).toFixed(0)} m: more scope` };
      }
      // Hard ahead with the chain out (it snatches, and can run under her).
      if ((v.anchor.phase === 'set' || v.anchor.phase === 'weighing') && v.engine.gear > 0 && v.controls.lever > a().overChainLever) return { kind: 'overChain', weight: cfg().weights.knock, text: 'Motoring hard over the chain' };
      return null;
    },
    verdict(c) {
      if ((c.d.letGoKn ?? 0) > a().letGoKn) return { passed: false, reason: `Let go with way on: ${(c.d.letGoKn ?? 0).toFixed(1)} kn ahead` };
      if ((c.d.scope ?? 5) < minScope()) return { passed: false, reason: `Too short a scope (${c.d.scope}:1): at least ${minScope()}:1${bottom === 'weed' ? ' in weed' : ''}` };
      return { passed: true, reason: `Anchored at ${c.d.scope}:1 and she held` };
    },
    numbers: (c) => [
      ['Scope', c.d.scope ? `${c.d.scope}:1` : 'not reached'],
      ['Way on at let go', fmt(c.d.letGoKn, 'kn')],
      ['Anchor moved', fmt(c.d.moved, 'm')],
    ],
  };
}

/** H12: the horn's manoeuvring signals, and lights after sunset. */
const SIGNALS: { blasts: number; say: string; text: string; done: (c: Ctx) => boolean }[] = [
  { blasts: 1, say: 'Alter course to starboard. Signal first: one short blast.', text: 'One short blast, then alter to starboard', done: (c) => turnFrom(heading(c.v), c.d.hdg0) > cfg().signals.turnDeg },
  { blasts: 2, say: 'Now alter to port. Two short blasts first.', text: 'Two short blasts, then alter to port', done: (c) => turnFrom(heading(c.v), c.d.hdg0) < -cfg().signals.turnDeg },
  { blasts: 3, say: 'Going astern: three short blasts, then astern.', text: 'Three short blasts, then go astern', done: (c) => aheadKn(c.v) < -cfg().signals.asternKn },
];
const H12: ExerciseDef = {
  id: 'hornSignals',
  code: 'H12',
  name: 'Horn and lights',
  course: 'harbour',
  practises: 'SBF: manoeuvring signals (one, two, three short blasts); RYA Level 2: sound signals, navigation lights; COLREG rule 34',
  brief: "It's after sunset. Lights on before you leave, then out to the middle. I'll call three manoeuvres: sound the right signal on the horn first (a short blast is about a second), then do it.",
  limitS: 600,
  setup(world, v) {
    placeAt(v, 'training-b');
    v.controls.navLights = 0;
    setWind(world, 5, 200, cfg().signals.hour);
  },
  steps: [
    { text: 'Nav lights on', say: 'Navigation lights on first.', done: (c) => c.v.controls.navLights > 0 },
    { text: 'Cast off and out between the lane marks', say: 'Cast off and take her out to the middle, between the yellow marks.', done: (c) => c.v.mooring.phase === 'free' && inLane(c.v) },
    ...SIGNALS.map((sg, i) => ({
      text: sg.text,
      say: sg.say,
      enter(c: Ctx) {
        c.d.hdg0 = heading(c.v);
        c.d.sigOk = 0;
        c.d.sigSeen = c.t.horn.signalAt;
        c.d.sigIndex = i;
      },
      done: (c: Ctx) => !!c.d.sigOk && sg.done(c),
    })),
    { text: 'Stop her, then back alongside any berth', say: 'Good. Stop her and bring her back alongside.', done: (c) => c.v.mooring.phase === 'moored' },
  ],
  watch(c) {
    const v = c.v;
    if (v.mooring.phase === 'free' && !v.controls.navLights) return { kind: 'noLights', weight: cfg().weights.knock, text: 'Under way after sunset without lights' };
    const sg = c.d.sigIndex !== undefined && c.t.step === 2 + c.d.sigIndex && c.t.said ? SIGNALS[c.d.sigIndex] : null;
    if (!sg) return null;
    // A whole signal heard since the call: the right number of blasts, or a fault (sound it again).
    if (c.t.horn.signalAt > (c.d.sigSeen ?? -Infinity)) {
      c.d.sigSeen = c.t.horn.signalAt;
      if (c.t.horn.signal === sg.blasts) c.d.sigOk = 1;
      else return { kind: `signal${sg.blasts}`, weight: cfg().weights.knock, text: `${c.t.horn.signal} ${c.t.horn.signal === 1 ? 'blast' : 'blasts'}: ${sg.blasts} ${sg.blasts === 1 ? 'was' : 'were'} called for` };
    }
    // The manoeuvre before its signal.
    if (!c.d.sigOk && sg.done(c)) return { kind: `before${sg.blasts}`, weight: cfg().weights.speed, text: 'The manoeuvre began before its signal' };
    return null;
  },
  verdict: (c) => (c.t.faults.some((f) => f.kind.startsWith('signal')) ? { passed: false, reason: 'A wrong signal on the horn' } : { passed: true, reason: 'Every signal right, lights on' }),
  numbers: (c) => [
    ['Wrong signals', String(c.t.faults.filter((f) => f.kind.startsWith('signal')).length)],
    ['Under way without lights', c.t.faults.some((f) => f.kind === 'noLights') ? 'yes' : 'no'],
  ],
};

/** H13: the low-speed slalom, there and back. */
const SLALOM = () => MARKS.filter((m) => m.name.startsWith('Slalom ')).sort((a, b) => a.x - b.x);
const H13: ExerciseDef = {
  id: 'slalom',
  code: 'H13',
  name: 'Low-speed slalom',
  course: 'harbour',
  practises: 'RYA Level 2: low-speed control, the wind on her; SBF: steering by marks',
  brief: `Weave east through the six yellow slalom marks, leaving them alternately to port and starboard, round the end, and weave back. Under ${cfg().slalom.speedKn} knots, touching none.`,
  capKn: cfg().slalom.speedKn,
  limitS: 900,
  setup(world, v) {
    placeFree(v, SLALOM()[0].x - 45, SLALOM()[0].z + 12, 90);
    setWind(world, 8, 330);
  },
  steps: [
    { text: 'East through the marks, alternately', say: 'Off you go: east through them, the first to port.', done: (c) => (c.d.east ?? 0) >= SLALOM().length },
    { text: 'Round the end and back west through them', say: 'Round the end, and back through them westward.', done: (c) => (c.d.west ?? 0) >= SLALOM().length },
  ],
  watch(c) {
    const x = c.v.position[0];
    const z = c.v.position[2];
    const px = c.d.px ?? x;
    c.d.px = x;
    for (const m of SLALOM()) {
      const east = px < m.x && x >= m.x;
      const west = px > m.x && x <= m.x;
      if (!east && !west) continue;
      // Which side she left it: heading east the mark is to port when she's south of it (z greater).
      const toPort = east ? z > m.z : z < m.z;
      const off = Math.abs(z - m.z);
      const key = east ? 'east' : 'west';
      c.d[key] = (c.d[key] ?? 0) + 1;
      const last = c.d[`${key}Last`];
      c.d[`${key}Last`] = toPort ? 1 : -1;
      if (off > cfg().slalom.gateM) return { kind: `gate${m.name}${key}`, weight: cfg().weights.knock, text: `${m.name} missed: ${off.toFixed(0)} m off it` };
      // The first eastward to port; after that each the other side from the one before.
      const want = last === undefined ? (east ? 1 : toPort ? 1 : -1) : -last;
      if ((toPort ? 1 : -1) !== want) return { kind: `side${m.name}${key}`, weight: cfg().weights.knock, text: `${m.name} on the wrong side` };
    }
    return null;
  },
  verdict: (c) => {
    const wrong = c.t.faults.filter((f) => f.kind.startsWith('side') || f.kind.startsWith('gate')).length;
    return wrong ? { passed: false, reason: `${wrong} ${wrong === 1 ? 'mark' : 'marks'} missed or on the wrong side` } : { passed: true, reason: 'Every mark the right side, there and back' };
  },
  numbers: (c) => [
    ['Marks wrong', String(c.t.faults.filter((f) => f.kind.startsWith('side') || f.kind.startsWith('gate')).length)],
    ['Time', fmt((c.world.time - c.t.startedAt) / 60, 'min')],
  ],
};

/** H14: springing off. */
const H14: ExerciseDef = {
  id: 'springOff',
  code: 'H14',
  name: 'Springing off',
  course: 'harbour',
  practises: 'RYA Level 2: using springs; SBF: leaving the berth, the examiners\' own example (Eindampfen in die Vorspring)',
  brief: `You are alongside Berth B with ${cfg().springOff.windKn} knots blowing you onto the quay: you can't just steer off. Put a fore spring on, let the bow and stern lines go, then motor slow ahead against the spring with the helm to the quay: her stern swings out. When it's well out, let the spring go and back away.`,
  limitS: 600,
  setup(world, v) {
    placeAt(v, 'training-b');
    v.controls.fenders = 1;
    setWind(world, cfg().springOff.windKn, cfg().springOff.windFrom);
  },
  steps: [
    { text: 'Fore spring on (Boat tab: Springs, Fore)', say: 'Fore spring on: Boat tab, Springs, Fore.', done: (c) => c.v.mooring.spring?.end === 'fore' },
    { text: 'Let go the bow and stern lines', say: 'Now let go the bow and the stern lines: she lies to the spring.', done: (c) => !c.v.mooring.bow && !c.v.mooring.stern && !!c.v.mooring.spring },
    {
      text: `Slow ahead, helm to the quay: stern out ${cfg().springOff.swingDeg}°`,
      say: 'Slow ahead against the spring, the helm to the quay. Watch her stern come out.',
      enter(c) {
        c.d.hdg0 = heading(c.v);
      },
      done(c) {
        c.d.swing = Math.max(c.d.swing ?? 0, Math.abs(turnFrom(heading(c.v), c.d.hdg0)));
        return (c.d.swing ?? 0) >= cfg().springOff.swingDeg;
      },
    },
    {
      text: 'Spring off, then astern: two lengths clear',
      say: 'Well out. Neutral, let the spring go, and back away astern.',
      done(c) {
        if (c.v.mooring.spring || c.v.position[2] > FACE - 2.5 - 2 * lengthOf(c.v)) return false;
        c.d.away = aheadKn(c.v);
        return true;
      },
    },
  ],
  watch(c) {
    // Her plating on the quay once she's off the lines (her fenders and the bow on the spring's side may touch).
    if (c.v.contact.force > 0 && c.v.mooring.phase === 'free') return { kind: 'hull', weight: cfg().weights.knock, text: 'Her hull on the quay' };
    return null;
  },
  verdict: (c) => ((c.d.away ?? 0) > 0 ? { passed: false, reason: 'Left ahead: back away astern once the stern is out' } : { passed: true, reason: `Sprung off ${Math.round(c.d.swing ?? 0)}° and away astern` }),
  numbers: (c) => [
    ['Stern swung out', fmt(c.d.swing, '°', 0)],
    ['Hull touches', String(c.t.faults.filter((f) => f.kind === 'hull').length)],
  ],
};

/** H15: pick up a mooring. */
const H15: ExerciseDef = {
  id: 'pickUpMooring',
  code: 'H15',
  name: 'Pick up the mooring',
  course: 'harbour',
  practises: 'RYA Level 2: approach and secure to a mooring buoy',
  brief: 'Pick up the orange mooring buoy ahead. Come up to it into the wind, slowly, and stop with it close under the bow; out of gear while it\'s there. Make fast (a forward cleat, or the Boat tab), lie to it a moment, then slip it and back away.',
  limitS: 600,
  setup(world, v) {
    const m = mark('The mooring');
    placeFree(v, m.x, m.z + 90, 0);
    setWind(world, cfg().mooring.windKn, 0);
  },
  steps: [
    {
      text: 'Up to the buoy into the wind, way off, it under the bow',
      say: 'Up to the buoy, into the wind.',
      done(c) {
        const m = mark('The mooring');
        if (distTo(bowPoint(c.v), m) > cfg().mooring.atM || speedKn(c.v) > cfg().mooring.arriveKn) return false;
        c.d.arriveKn = speedKn(c.v);
        return true;
      },
    },
    { text: 'Make fast to it', say: 'Make fast.', done: (c) => !!c.v.mooring.buoy },
    {
      text: `Lie to it ${cfg().mooring.lieS} s, then slip it and back off`,
      say: 'Lie to it a moment. Then slip it and back away.',
      done: (c) => since(c) >= cfg().mooring.lieS && !c.v.mooring.buoy && distTo(bowPoint(c.v), mark('The mooring')) > lengthOf(c.v),
    },
  ],
  watch(c) {
    const m = mark('The mooring');
    if (c.t.step <= 1 && inGear(c.v) && distTo(bowPoint(c.v), m) < cfg().mooring.gearM) return { kind: 'gearBuoy', weight: cfg().weights.speed, text: 'In gear with the buoy under the bow' };
    return null;
  },
  verdict: (c) => ((c.d.arriveKn ?? 0) > cfg().mooring.arriveKn ? { passed: false, reason: 'Too fast at the buoy' } : { passed: true, reason: `Picked up at ${(c.d.arriveKn ?? 0).toFixed(1)} kn and slipped` }),
  numbers: (c) => [
    ['Speed at the buoy', fmt(c.d.arriveKn, 'kn')],
    ['In gear by it', String(c.t.faults.filter((f) => f.kind === 'gearBuoy').length)],
  ],
};

/** The rest of Course 1 (exercises.ts orders the whole list). */
export const HARBOUR_MORE: readonly ExerciseDef[] = [H1, H2, H3, H7, H9, anchoring('sand'), anchoring('mud'), anchoring('weed'), H12, H13, H14, H15];
