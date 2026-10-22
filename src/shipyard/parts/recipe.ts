/**
 * The Shipyard's builder, part by part (P4; build.ts runs them in turn): Her recipe: machinery, controls, lights and gear as modules.
 * Each part takes the design (`a`) and what the parts before it worked out (`p`), and gives
 * what the parts after it need.
 */
import { CONFIG } from '../../config';
import landingCraftRecipe from '../../boats/landingCraft.json';
import type { Mount, Recipe } from '../../modular/recipe';
import { houseFlare } from '../../vessel/houseFlare';
import { cellsOf, SCREENS, type ScreenName, type TouchPage } from '../../controls/instruments';
import { dashCap, packDash, packPanel, panelKey, placeDashByHand, placeOnDash, placePanelByHand, SCREEN_NAMES, type GridPlace, type PanelGroup } from './consoleGrid';
import { DASH_SLOTS, dashCell, PANEL_SLOTS } from '../design';
import { BASE_TORQUE, type BuildArgs, type V3 } from './common';
import type { HullPart } from './hull';
import type { HousePart, LayoutPart, OverheadPart, InteriorPart } from './house';
import type { TrimPart } from './trim';
import type { MachineryPart, EngineHatchPart } from './engineRoom';
import type { PlacesPart } from './places';
import type { DeckGearPart, HouseGearPart } from './deckGear';
import type { HullDefPart } from './hullDef';
import type { FurniturePart } from './furniture';

/** Her recipe: the landing craft's as the template, with her machinery, her controls laid out on the console, her lights and her deck gear. */
export function recipePart(a: BuildArgs, p: HullPart & HousePart & LayoutPart & TrimPart & MachineryPart & PlacesPart & DeckGearPart & OverheadPart & EngineHatchPart & InteriorPart & HouseGearPart & HullDefPart & FurniturePart) {
  const { code, d, id } = a;
  const { towHook, aFrame, ac, aft, anchorAt, at, basketAt, bowCleat, bowRamp, chartTableAt, consoleHalf, craneAt, cranePlaced, dip, dipZ, dp, eh, eng, engH, engL, engMid, engW, engX, fenderZs, front, gear, h, hasLamp, hasMonitor, helmAssist, house, hw, kw, lampFoot, lampOnRoof, lampRoof, layout, midCleat, monitorFoot, monitorOnRoof, monitorRoof, nozzle, obc, outboards, pdc, podPropD, podSet, pods, prop, propD, propPos, prot, pushFender, q, r2, ring, rnd, rodRack, roofBack, roofFront, roofThickness, roofTopAt, roofY, rs, rudderArea, rudderPos, sb, sdLegs, sdPropD, sdc, shaft, sideDoor, skiffAt, stack, stem, sternCleat, sternRoller, tankL, transom, twin, twinX, wall, winchAt, zHead } = p;
  // ── Recipe: the landing craft's, with her machinery, controls and places ──
  const recipe = structuredClone(landingCraftRecipe) as unknown as Recipe;
  recipe.id = `vessel.${id}`;
  recipe.name = `Shipyard design ${code}`;
  recipe.hull = `hull.${id}`;
  const k = kw / 150;
  // (A slower-revving engine, ENGINES ratedRpm, `rs` above: every rpm of the 1800 rpm curve
  // scaled by rs, its torque by k / rs (the same power at fewer revs is more torque). Its
  // friction follows the torque; its flywheel is heavier in the same proportion.)
  const kq = k / rs;
  const bySocket = (list: Mount[], id: string) => list.find((m) => m.socket === id);
  const engine = bySocket(recipe.modules, 'engine')!.config as Record<string, any>;
  Object.assign(engine.engine, {
    powerKw: kw,
    torqueCurve: BASE_TORQUE.map(([r, t]) => [Math.round(r * rs), Math.round(t * kq)]),
    frictionTorque: Math.round(40 * kq ** 0.6),
    inertia: Math.round(1.6 * kq * 10) / 10,
    starterTorque: Math.round(280 * Math.sqrt(kq)),
    // (Its own idle if it has one: the tug diesel's 450 rpm. Scaled from the 1800 rpm
    // engine's it was 360, so slow its six fired 18 times a second, heard as one thumping
    // cylinder, owner: "still sounds like a single cylinder"; 450 is usual for its kind.)
    idleRpm: 'idleRpm' in eng ? eng.idleRpm : Math.round(engine.engine.idleRpm * rs),
    ratedRpm: eng.ratedRpm,
    droopRpm: Math.round(engine.engine.droopRpm * rs),
    starterMaxRpm: Math.round(engine.engine.starterMaxRpm * rs),
    rackRiseRate: eng.rackRise,
    gearRatio: gear,
  });
  engine.engine.fuel = { ...engine.engine.fuel, tankL: tankL, startL: Math.round(tankL * 0.7) };
  engine.engine.thermal = { ...engine.engine.thermal, heatCapacity: Math.round(60 * k), exchangerKwPerK: Math.round(1.7 * k * 100) / 100 };
  Object.assign(engine.propeller, { diameter: propD, kt0: prop.kt0, j0: prop.j0, kq0: prop.kq0, jq0: prop.jq0, wake: prop.wake, thrustDeduction: prop.thrustDeduction, position: propPos });
  engine.sampleAt = rudderPos;
  engine.voice = eng.voice;
  engine.massKg = eng.kg;
  if (twin) engine.twin = { x: twinX };
  Object.assign(engine.maintenance, {
    engine: { ...engine.maintenance.engine, x: engX, z: rnd(engMid), length: engL, width: engW, height: engH },
    dipstick: [dip[0], dip[2]],
    filler: [engX, rnd(dipZ)],
    oilCan: [rnd(eh.x1 - 0.08), rnd(eh.z1 - 0.15)],
  });
  // Drawn as built (vessel/view/engineModels.ts): the Shipyard's model of her engine type, on her shaft line.
  engine.installed = { model: d.engine, size: [engL, engW, engH], xs: twin ? [-shaft.x, shaft.x] : [0], flangeY: rnd(shaft.flangeY), flangeZ: rnd(shaft.flangeZ), angleDeg: shaft.angleDeg };
  const rudder = bySocket(recipe.modules, 'rudder')!.config as Record<string, any>;
  Object.assign(rudder.rudder, { area: rudderArea, position: rudderPos });
  rudder.propeller = { wake: prop.wake, diameter: propD };
  rudder.nozzle = nozzle;
  engine.nozzle = nozzle;
  if (sdLegs) {
    // Her stern drives in place of the shaft and rudder: the outboards' module (the legs swing
    // to steer) with her inboard engine package, drawn inside against the transom.
    recipe.modules = recipe.modules.filter((m) => m.socket !== 'engine' && m.socket !== 'rudder');
    recipe.modules.unshift({
      socket: 'sternDrive',
      module: 'propulsion.outboard',
      config: {
        engine: engine.engine,
        propeller: { ...engine.propeller, diameter: sdPropD },
        units: sdLegs.units,
        mount: sdLegs.mount,
        steering: obc.steering,
        look: sdLegs.look,
        // (The inboard's electrics and oil, as its module has them: CONFIG.modules.dieselInboard.)
        alternatorAmps: engine.alternatorAmps ?? CONFIG.modules.dieselInboard.alternatorAmps,
        oilUse: engine.oilUse ?? CONFIG.vessels.workboat.maintenance.use,
        starterAmps: engine.starterAmps ?? CONFIG.modules.dieselInboard.starterAmps,
        massKg: eng.kg + sdc.legKg,
        maintenance: engine.maintenance,
        voice: eng.voice,
        sterndrive: true,
        installed: engine.installed,
      },
    });
  }
  if (podSet) {
    // Her pod drives in place of the shafts and rudders, their engines drawn inside over them.
    recipe.modules = recipe.modules.filter((m) => m.socket !== 'engine' && m.socket !== 'rudder');
    recipe.modules.unshift({
      socket: 'pods',
      module: 'propulsion.pods',
      config: {
        engine: engine.engine,
        propeller: { ...engine.propeller, diameter: podPropD, wake: 0.02 },
        ...podSet,
        steering: pdc.steering,
        look: pdc.look,
        joystick: pdc.joystick,
        centreZ: rnd(h.lcb),
        alternatorAmps: engine.alternatorAmps ?? CONFIG.modules.dieselInboard.alternatorAmps,
        oilUse: engine.oilUse ?? CONFIG.vessels.workboat.maintenance.use,
        starterAmps: engine.starterAmps ?? CONFIG.modules.dieselInboard.starterAmps,
        massKg: eng.kg + pdc.legKg,
        maintenance: engine.maintenance,
        voice: eng.voice,
        installed: engine.installed,
      },
    });
  }
  if (outboards) {
    // Her outboards in place of the inboard and its rudder; her upkeep (the oil checks) at the hatch as before.
    const maintenance = engine.maintenance;
    recipe.modules = recipe.modules.filter((m) => m.socket !== 'engine' && m.socket !== 'rudder');
    recipe.modules.unshift({ socket: 'outboards', module: 'propulsion.outboard', config: { ...outboards, maintenance } });
  }
  bySocket(recipe.modules, 'fuelTank')!.config = { tankL, startL: Math.round(tankL * 0.7) };
  for (const m of recipe.modules) {
    if (m.module === 'deck.cleat') (m.config as Record<string, any>).stations = { bow: bowCleat, stern: sternCleat, midship: midCleat ?? 0 };
  }
  // The skiff's painter's cleats (amidships, each side), with the skiff (if she's aboard).
  if (midCleat !== null && skiffAt)
    recipe.modules.push(
      { socket: 'cleatMidPort', module: 'deck.cleat', config: { end: 'midship', side: -1, stations: { bow: bowCleat, stern: sternCleat, midship: midCleat } } },
      { socket: 'cleatMidStbd', module: 'deck.cleat', config: { end: 'midship', side: 1, stations: { bow: bowCleat, stern: sternCleat, midship: midCleat } } },
    );
  // The searchlight on the roof or its pole (or none), and the fire monitor.
  if (lampFoot) bySocket(recipe.modules, 'searchlight')!.config = { position: [lampFoot[0], r2(lampFoot[1] + dp.lampHeight), lampFoot[2]], pole: { deckY: lampFoot[1] } };
  else if (hasLamp) bySocket(recipe.modules, 'searchlight')!.config = { position: lampRoof };
  else recipe.modules = recipe.modules.filter((m) => m.socket !== 'searchlight');
  if (monitorFoot) recipe.modules.push({ socket: 'fireMonitor', module: 'deck.fire-monitor', config: { position: [monitorFoot[0], r2(monitorFoot[1] + dp.nozzleHeight), monitorFoot[2]], pole: { deckY: monitorFoot[1] } } });
  else if (hasMonitor) recipe.modules.push({ socket: 'fireMonitor', module: 'deck.fire-monitor', config: { position: monitorRoof } }); // its gauge: on the console, below
  const fl = houseFlare(layout.wheelhouse!);
  const onFlaredRoof = ([x, y, z]: V3): V3 => (fl ? fl.at(x, y, z) : [x, y, z]).map((v, i) => (i === 1 ? v : r2(v))) as V3;
  bySocket(recipe.modules, 'navLights')!.config = {
    // The masthead light on its own pole from the roof (no signal mast on her).
    mast: { footY: roofTopAt(roofFront + 0.475) },
    lights: {
      masthead: [0, roofTopAt(roofFront + 0.475) + 1.1, roofFront + 0.475],
      // The sidelights on the house sides, above the windows, just aft of the header.
      // The sidelights on the roof's edges (the windows run up to it), just aft of the front glass.
      // (On the chamfered side at mid-thickness, just proud of it.)
      // (A faceted front's roof is cut back at its corners: they go back with it.)
      // (Raked out all round, the roof's edge is further out: they go with it, houseFlare.ts.)
      port: onFlaredRoof([-(hw + 0.15 - roofBack / 2 + 0.03), roofY + roofThickness / 2, Math.max(front, zHead) + 0.175 + sb(hw + 0.15)]),
      starboard: onFlaredRoof([hw + 0.15 - roofBack / 2 + 0.03, roofY + roofThickness / 2, Math.max(front, zHead) + 0.175 + sb(hw + 0.15)]),
      stern: [0, q.deckY(transom) + 0.6, transom - 0.05],
    },
  };
  // The console, laid out across her cabin: the landing craft's dash, widened or narrowed.
  const consoleMount = bySocket(recipe.modules, 'helm')!;
  const cc = consoleMount.config as Record<string, any>;
  // The helm's searchlight and monitor controls: always for a unit on the roof (the only
  // place to work it from); for one on a pole (which has its own) with the advanced controls.
  const lampAtHelm = lampOnRoof || (!!lampFoot && !!d.controls);
  const monitorAtHelm = monitorOnRoof || (!!monitorFoot && !!d.controls);
  // The panel's group colours (the reference console's), for the switch panel below (CS2).
  const colourOf = Object.fromEntries((cc.groups as { title: string; color: number }[]).map((gp) => [gp.title, gp.color]));
  if (!lampAtHelm) consoleMount.modules = consoleMount.modules!.filter((m) => m.socket !== 'spotlight' && m.socket !== 'spotJoystick');
  if (monitorAtHelm) {
    // FIRE PUMP beside SPOT (or in its place), the monitor's joystick aft on the same pedestal
    // as the searchlight's, and its FIRE gauge between them.
    const [px] = cc.pedestals.x.filter((x: number) => x < 0);
    cc.slots.monJoystick = { position: [px, 0.01, 0.23] };
    if (lampAtHelm) cc.slots.spotJoystick.position = [px, 0.01, -0.01];
    consoleMount.modules!.push(
      { socket: 'firePump', module: 'control.toggle', config: { label: 'FIRE PUMP (needs the engine running)', engrave: 'FIRE PUMP' }, bind: { value: 'firePump.on' } },
      { socket: 'monJoystick', module: 'control.joystick', config: { label: 'Fire monitor joystick', engrave: 'MONITOR', knob: '#d8301a', panRateDeg: 40 }, bind: { pan: 'monitor.pan', tilt: 'monitor.tilt' } },
    );
  }
  // The ANCHOR switch (in the DECK group with the skiff crane's button: the switch panel, below).
  if (anchorAt) consoleMount.modules!.push({ socket: 'anchor', module: 'control.toggle', config: { label: 'Anchor: let go / heave in', engrave: 'ANCHOR' }, bind: { value: 'anchor.letGo' } });
  // The dash along the console (cut short on a wide wheelhouse: consoleHalf), what's on it spread or closed up with it.
  const dashHalf = consoleHalf - 0.11;
  const sx = dashHalf / cc.dash.halfWidth;
  cc.dash.halfWidth = Math.round(dashHalf * 1000) / 1000;
  // The throttle (and its pedestal) beside the wheel, no further out than on the reference console
  // (owner: on a wide console, spread with it, it was out of reach in VR); closer on a narrow one.
  const throttleX = cc.slots.throttle.position[0] as number;
  const throttleAt = Math.round(throttleX * Math.min(1, sx) * 1000) / 1000;
  cc.pedestals.x = cc.pedestals.x.map((x: number) => (x === throttleX ? throttleAt : Math.round(x * sx * 1000) / 1000));
  for (const slot of Object.values(cc.slots) as { position: V3 }[]) slot.position = [Math.round(slot.position[0] * sx * 1000) / 1000, slot.position[1], slot.position[2]];
  cc.slots.throttle.position = [throttleAt, cc.slots.throttle.position[1], cc.slots.throttle.position[2]];
  if (pods) {
    // Pod drives: the black throttle, moved forward on its pedestal, and the helm joystick
    // aft of it with its JOYSTICK button between (CONFIG.shipyard.helm.podJoystick).
    const pj = CONFIG.shipyard.helm.podJoystick;
    cc.slots.throttle.position = [throttleAt, cc.slots.throttle.position[1], pj.throttleZ];
    cc.slots.podJoystick = { position: [throttleAt, 0.01, pj.stickZ] };
    const lever = consoleMount.modules!.find((m) => m.socket === 'throttle')!;
    lever.config = { ...lever.config, style: 'black' };
    consoleMount.modules!.push({ socket: 'podJoystick', module: 'control.helm-joystick', config: { button: pj.button } });
  }
  // Its screens in one row centred over the wheel, in their order, whichever she has (the basic
  // controls' two side by side), never spread with the dash; closer on a narrow one.
  // TOW LINE (owner, Oct 2026): with the advanced instruments, on a boat that can tow (her
  // stern roller is her tow point): last in the row, starboard of the engine monitor.
  if (sternRoller && d.controls) {
    cc.slots.towline = { position: [0, cc.slots.engineMonitor.position[1], cc.slots.engineMonitor.position[2]] };
    consoleMount.modules!.push({ socket: 'towline', module: 'instrument.screen', config: { screen: 'towline' } });
  }
  // ANCHOR (owner, Oct 2026: "is the chain going down? Is the anchor set? Is the chain going
  // up? Is it in?"): a quarter screen beside the speed screen, on any boat with an anchor.
  if (anchorAt) {
    cc.slots.anchorScreen = { position: [0, cc.slots.speed.position[1], cc.slots.speed.position[2]] };
    consoleMount.modules!.push({ socket: 'anchorScreen', module: 'instrument.screen', config: { screen: 'anchor' } });
  }
  // Old school (design.oldSchool, with the basic controls; owner, Oct 2026: "three tiers of
  // instruments"): round analogue gauges, each a quarter, in place of the screens: the compass
  // and the log, depth and the chain counter (with an anchor), revs, temperature and fuel.
  const oldSchool = !!d.oldSchool && !d.controls;
  const dials = ['dialCompass', 'dialSpeed', 'dialDepth', ...(anchorAt ? ['dialChain'] : []), 'dialRpm', 'dialTemp', 'dialFuel'];
  if (oldSchool) {
    consoleMount.modules = consoleMount.modules!.filter((m) => !['speed', 'rpm', 'anchorScreen'].includes(m.socket));
    for (const id of dials) {
      cc.slots[id] = { position: [0, cc.slots.speed.position[1], cc.slots.speed.position[2]] };
      consoleMount.modules!.push({ socket: id, module: 'instrument.screen', config: { screen: id } });
    }
  }
  // Touchscreens (design.touch, with the advanced controls; CS5, owner, Oct 2026: "just one
  // screen that you have tabs that you have to flip between"): one or two, in place of her
  // separate console screens, each with every page she has (the anchor's with an anchor, the
  // tow line's with a tow point); the first opens on SPEED, a second on ENGINE.
  const touch = d.controls ? Math.max(0, Math.min(2, d.touch ?? 0)) : 0;
  const touchIds = touch ? ['touch1', 'touch2'].slice(0, touch) : [];
  if (touch) {
    const pages: TouchPage[] = ['speed', 'heading', 'rpm', 'engineMonitor', ...(anchorAt ? (['anchor'] as const) : []), ...(sternRoller ? (['towline'] as const) : []), 'nav'];
    consoleMount.modules = consoleMount.modules!.filter((m) => !['speed', 'anchorScreen', 'heading', 'rpm', 'engineMonitor', 'towline'].includes(m.socket));
    touchIds.forEach((id, k) => {
      cc.slots[id] = { position: [0, cc.slots.speed.position[1], cc.slots.speed.position[2]] };
      consoleMount.modules!.push({ socket: id, module: 'instrument.screen', config: { screen: 'touch', pages, channel: k ? 'touchPage2' : 'touchPage1', first: k ? 2 : 0 } });
    });
  }
  // The ship's clock (CS5; owner, Oct 2026: "a ship's clock would be good"): a quarter, last on
  // the dash, round with the old school gauges. (A touchscreen has the time on its tab bar.)
  const clockId = oldSchool ? 'dialClock' : 'clock';
  if (!touch) {
    cc.slots[clockId] = { position: [0, cc.slots.speed.position[1], cc.slots.speed.position[2]] };
    consoleMount.modules!.push({ socket: clockId, module: 'instrument.screen', config: { screen: clockId } });
  }
  const screens = (touch ? touchIds : oldSchool ? [...dials, clockId] : ['speed', 'anchorScreen', 'heading', 'rpm', 'engineMonitor', 'towline', clockId]).filter((id) => consoleMount.modules!.some((m) => m.socket === id && m.module === 'instrument.screen') && (d.controls || oldSchool || ['speed', 'anchorScreen', 'rpm', 'clock'].includes(id)));
  // The dash as a grid of quarter cells (consoleGrid.ts; dynamic console sockets CS1): each
  // screen its own size (a full screen, a strip or a quarter: instruments.ts `cells`), placed
  // by its rules in this order, the half-height ones stacked two high in one screen's place
  // (owner, Oct 2026: "use the space above as well"), the row centred over the wheel. If the
  // row is longer than the dash (a small wheelhouse: owner, Oct 2026, the smallest landing
  // craft's overlapped), all of it smaller together until it fits. (Spacing them closer
  // without shrinking them overlapped them.)
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const sc = CONFIG.modules.screen.dash;
  const gap = CONFIG.shipyard.helm.screenGap;
  const cellsFor = (id: string) => cellsOf(SCREENS[(consoleMount.modules!.find((x) => x.socket === id)!.config as { screen: ScreenName }).screen]) as [number, number];
  const ROWS = 2;
  const items = screens.map((id) => ({ id, cells: cellsFor(id) }));
  const grid = packDash(items, ROWS);
  const pitch = (sc.width + gap) / 2;
  const rowRoom = 2 * dashHalf - 2 * gap;
  // The dash's whole grid, for placing by hand (CS3): as many columns as it has room for.
  const whole = dashCap(rowRoom, pitch, gap, grid.cols);
  const want = Object.fromEntries(screens.map((id) => [id, dashCell(d[DASH_SLOTS[id as keyof typeof DASH_SLOTS]] ?? 0)]));
  const byHand = screens.some((id) => want[id]);
  /** Each screen at its place on the dash: the automatic row (centred, smaller together if it's long), or placed by hand on the whole grid. */
  const fit = (places: GridPlace[], cols: number, p: number, snap: boolean) => {
    const k = p / pitch;
    for (const gp of places) {
      const at = placeOnDash(gp, places, cols, ROWS, p, gap * k, (sc.height / 2) * k, snap);
      const slot = cc.slots[gp.id] as { position: V3 };
      slot.position = [r3(at.x), slot.position[1], slot.position[2]];
      // A strip or a quarter always says its size (and its rise, stacked); a full screen only when smaller.
      const full = gp.w === 2 && gp.h === ROWS;
      if (k < 1 || !full || at.rise) {
        const m = consoleMount.modules!.find((q) => q.socket === gp.id)!;
        m.config = { ...m.config, width: r3(at.width), height: r3(at.height), ...(at.rise ? { rise: r3(at.rise) } : {}) };
      }
    }
  };
  let shown: GridPlace[];
  if (!byHand) {
    const shrink = Math.min(1, rowRoom / (grid.cols * pitch - gap));
    fit(grid.places, grid.cols, pitch * shrink, true);
    // (On the whole grid, for the Shipyard: the row in its middle.)
    const off = Math.floor((whole.cap - grid.cols) / 2);
    shown = grid.places.map((gp) => ({ ...gp, col: gp.col + off }));
  } else {
    const put = placeDashByHand(items, ROWS, whole.cap, want);
    fit(put.places, whole.cap, whole.pitch, false);
    shown = put.places;
    const named = (id: string) => (SCREEN_NAMES[id] ?? id).toLowerCase();
    for (const id of put.moved) p.warnings.push(put.places.some((q) => q.id === id) ? `The ${named(id)} screen doesn't fit where it was placed on the dash: put where the rules would.` : `No room on the dash for the ${named(id)} screen.`);
    // (No room at all: off the console.)
    consoleMount.modules = consoleMount.modules!.filter((m) => !(m.module === 'instrument.screen' && screens.includes(m.socket) && !put.places.some((q) => q.id === m.socket)));
  }
  // Her dash's grid, for the Shipyard (CS3) and the tests: its whole size, each screen's cells on it, whether placed by hand.
  cc.dashGrid = { cap: whole.cap, rows: ROWS, pitch: r3(whole.pitch), places: shown, byHand };
  // The dash's face leans back as far as its screens do (from its foot, so the switch panel in
  // front stays as it was; never so far its top is under 2 cm deep), and the screens and gauges
  // lie flat on it (owner, Oct 2026: "I'd certainly not like the gauges or the instruments
  // floating"). Not with low sills: the dash comes off then, its screens on stalks.
  if (!d.sills) {
    const dd = cc.dash as { front: number; aft: number; bottom: number; top: number };
    // (Raised a little first: the lower row's foot was behind the ledge in front of the dash.)
    for (const m of consoleMount.modules!) if (m.module === 'instrument.screen' && (m.config as { mount?: string } | undefined)?.mount !== 'hung' && cc.slots[m.socket]) {
      const p = cc.slots[m.socket].position as V3;
      cc.slots[m.socket].position = [p[0], r3(p[1] + CONFIG.shipyard.helm.screenLift), p[2]];
    }
    const lean = Math.min(Math.tan((sc.tiltDeg * Math.PI) / 180), (dd.aft - dd.front - 0.02) / (dd.top - dd.bottom));
    const leanDeg = (Math.atan(lean) * 180) / Math.PI;
    cc.leanDeg = Math.round(leanDeg * 100) / 100;
    for (const m of consoleMount.modules!) {
      const conf = m.config as { mount?: string; screen?: string } | undefined;
      if (m.module !== 'instrument.screen' || conf?.mount === 'hung' || !cc.slots[m.socket]) continue;
      m.config = { ...m.config, tiltDeg: cc.leanDeg, faceBack: r3((cc.slots[m.socket].position[1] - dd.bottom) * lean) };
    }
  }
  // A faceted front: the dash wraps round with it (console.standard's `wrap`), its wings set back as the outer windows are.
  // Its controls stay square to her (owner: forward is forward); its screens turn with the wings, flush with the dash's face.
  if (house.facet)
    cc.wrap = {
      centre: house.facet.centre,
      k: Math.round((house.facet.depth / (hw - house.facet.centre)) * 1e4) / 1e4,
      turn: consoleMount.modules!.filter((m) => m.module === 'instrument.screen').map((m) => m.socket),
      // The throttle stays beside the wheel where it is on a flat console (owner: set back with the wing it was out of reach in VR).
      fixed: ['throttle', 'podJoystick'],
    };
  // The advanced instruments (taken off again below for the basic controls), and the chart table.
  recipe.modules.push(
    { socket: 'chartplotter', module: 'nav.chartplotter' },
    { socket: 'navDisplay', module: 'instrument.screen', config: { screen: 'nav', mount: 'hung' } },
    // (As wide as fits port of the door, up to its own width.)
    { socket: 'whiteboard', module: 'furniture.whiteboard', config: { roller: { ...CONFIG.modules.whiteboard.roller, width: Math.round(Math.min(CONFIG.modules.whiteboard.roller.width, hw - wall - 0.1 - 0.2) * 100) / 100 } } },
    { socket: 'dutyBoard', module: 'furniture.duty-board' },
  );
  // The working lights (the workboat's, as modules): the floods aimed at the middle of the
  // foredeck and of the aft deck, and the overhead panel with their two switches (no FM set
  // in it: hers hangs on its own, out to starboard; no rail lights for now, owner).
  const zFore = (stem + front) / 2;
  const zAftDeck = (aft + transom) / 2;
  const lamps = {
    fore: { position: at.floodFore, target: [0, r2(q.deckY(zFore)), r2(zFore)] as V3 },
    aft: { position: at.floodAft, target: [0, r2(q.deckY(zAftDeck)), r2(zAftDeck)] as V3 },
  };
  const ohp = CONFIG.modules.overheadPanel;
  recipe.modules.push(
    { socket: 'floodFore', module: 'light.flood', config: { end: 'fore', lamps }, bind: { on: 'lights.deckFore' } },
    { socket: 'floodAft', module: 'light.flood', config: { end: 'aft', lamps }, bind: { on: 'lights.deckAft' } },
    {
      socket: 'overhead',
      module: 'panel.overhead',
      config: {
        width: 0.32,
        slots: { deckFore: { x: -0.06, hang: true }, deckAft: { x: 0.06, hang: true } },
        legends: [
          { text: 'FOREDECK', x: -0.06 },
          { text: 'AFT DECK', x: 0.06 },
        ],
        legend: ohp.legend,
      },
      modules: [
        { socket: 'deckFore', module: 'control.toggle', config: { label: 'Foredeck floodlight' }, bind: { value: 'lights.deckFore' } },
        { socket: 'deckAft', module: 'control.toggle', config: { label: 'Aft deck floodlight' }, bind: { value: 'lights.deckAft' } },
      ],
    },
  );
  if (chartTableAt) recipe.modules.push({ socket: 'chartTable', module: 'furniture.chart-table' });
  if (helmAssist) recipe.modules.push({ socket: 'helmAssist', module: 'panel.helm-assist' });
  if (stack) recipe.modules.push({ socket: 'exhaustStack', module: 'fitting.exhaust-stack', config: stack });
  if (!d.controls) {
    // Basic: wheel, throttle, starting (key, START, the lamps and the card), speed with
    // depth, rpm, the ANCHOR screen, and the VHF (owner, Oct 2026: every boat answers calls,
    // hears the forecasts and the harbours), and her navigation lights and their switch (owner,
    // Oct 2026: in every tier). No cabin light, searchlight, horn, wipers, heading, engine
    // monitor or FM radio. The searchlight's and monitor's controls stay if they're worked from here.
    const keep = ['wheel', 'throttle', 'podJoystick', 'start', 'key', 'lamps', 'card', 'navLights', 'speed', 'anchorScreen', 'rpm', 'spotlight', 'spotJoystick', 'firePump', 'monJoystick', 'anchor', ...dials, 'clock', 'dialClock'];
    consoleMount.modules = consoleMount.modules!.filter((m) => keep.includes(m.socket));
    // (The FM set and the advanced instruments come with the advanced controls, owner.)
    recipe.modules = recipe.modules.filter((m) => !['cabinLight', 'horn', 'wipers', 'fm', 'chartplotter', 'navDisplay', 'whiteboard', 'dutyBoard', 'overhead', 'floodFore', 'floodAft'].includes(m.socket));
  }
  // The switch panel as a row of switch cells (dynamic console sockets CS2; consoleGrid.ts
  // packPanel): LIGHTS, then SEARCH / FIRE, in from the port end; ENGINE, then DECK (the
  // ANCHOR switch, the skiff crane's button), in from the starboard end; the horn just port of
  // the wheel. Each group's members side by side in the middle of its run of cells, under its
  // coloured plate; the warning lamps and the start-up card in the middle of ENGINE's.
  {
    const hc = CONFIG.shipyard.helm;
    const has = (id: string) => consoleMount.modules!.some((m) => m.socket === id);
    const search = ['spotlight', 'firePump'].filter(has);
    const panel: PanelGroup[] = [
      { title: 'LIGHTS', color: colourOf.LIGHTS, side: 'port', members: ['navLights', 'cabinLight', 'wipers'].filter(has) },
      { title: search.length === 2 ? 'SEARCH · FIRE' : search[0] === 'firePump' ? 'FIRE' : 'SEARCH', color: colourOf.SEARCH, side: 'port', members: search },
      { title: '', color: 0, side: 'wheelPort', members: ['horn'].filter(has) },
      { title: 'ENGINE', color: colourOf.ENGINE, side: 'starboard', members: ['start', 'key'].filter(has) },
      { title: 'DECK', color: 0x8a6d2a, side: 'starboard', members: [...(anchorAt ? ['anchor'] : []), ...(skiffAt ? ['skiffCrane'] : [])] },
    ];
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    // The panel's whole row of cells, for placing by hand (CS3): as many as it has room for.
    const cap = Math.max(1, Math.floor((2 * dashHalf) / hc.switchPitch + 1e-9));
    const cellP = (2 * dashHalf) / cap;
    const cellOf = (key: string) => {
      const v = d[PANEL_SLOTS[key as keyof typeof PANEL_SLOTS]] ?? 0;
      return v ? v - 1 : null;
    };
    const want = Object.fromEntries(panel.map((g) => [panelKey(g), cellOf(panelKey(g))]));
    const byHand = panel.some((g) => g.members.length && want[panelKey(g)] !== null);
    let laid: { at: Record<string, number>; runs: { group: PanelGroup; x0: number; x1: number }[]; pitch: number };
    if (!byHand) laid = packPanel(panel, dashHalf, hc.switchPitch, hc.wheelClear, hc.groupClear, hc.minPitch);
    else {
      // Placed by hand: each group from its cell, its members a cell apart in the middle of its run.
      const put = placePanelByHand(panel, cap, want);
      const at: Record<string, number> = {};
      const runs: { group: PanelGroup; x0: number; x1: number }[] = [];
      for (const g of panel) {
        const k = put.starts[panelKey(g)];
        if (k === undefined || !g.members.length) continue;
        const n = Math.max(g.cells ?? 0, g.members.length);
        const x0 = -dashHalf + k * cellP;
        g.members.forEach((id, i) => (at[id] = x0 + ((n - g.members.length) / 2 + i + 0.5) * cellP));
        runs.push({ group: g, x0, x1: x0 + n * cellP });
      }
      for (const key of put.moved) p.warnings.push(put.starts[key] !== undefined ? `The ${key === 'horn' ? 'horn' : key} switches don't fit where they were placed on the console: put where the rules would.` : `No room on the console for the ${key === 'horn' ? 'horn' : key} switches.`);
      // (No room at all: those switches off the console.)
      const off = panel.filter((g) => put.starts[panelKey(g)] === undefined).flatMap((g) => g.members);
      consoleMount.modules = consoleMount.modules!.filter((m) => !off.includes(m.socket));
      laid = { at, runs, pitch: cellP };
    }
    for (const [id, x] of Object.entries(laid.at)) {
      const was = cc.slots[id]?.position as V3 | undefined;
      cc.slots[id] = { position: [r3(x), was?.[1] ?? 0.01, was?.[2] ?? -0.2] };
    }
    cc.groups = laid.runs.filter((r) => r.group.title).map((r) => ({ title: r.group.title, color: r.group.color, x: [r3(r.x0 + hc.plateInset), r3(r.x1 - hc.plateInset)] }));
    const engine = laid.runs.find((r) => r.group.title === 'ENGINE');
    if (engine) {
      const mid = r3((engine.x0 + engine.x1) / 2);
      for (const id of ['lamps', 'card']) if (cc.slots[id]) cc.slots[id].position = [mid, cc.slots[id].position[1], cc.slots[id].position[2]];
    }
    // Her switch panel, for the Shipyard (CS3) and the tests: its whole row of cells, whether
    // placed by hand, and each group's members, its run (m) and its first cell on the row.
    cc.panelGrid = {
      cap,
      cell: r3(cellP),
      pitch: r3(laid.pitch),
      byHand,
      runs: laid.runs.map((r) => ({ key: panelKey(r.group), title: r.group.title, color: r.group.color, members: r.group.members, n: Math.max(r.group.cells ?? 0, r.group.members.length), start: Math.max(0, Math.round((r.x0 + dashHalf) / cellP)), x: [r3(r.x0), r3(r.x1)] })),
    };
  }
  // Low windows (owner): the console's upright panel comes off, so you see down past it; its
  // screens stay where they were, each on a stalk from the desk (console.standard's `bare`).
  if (d.sills) cc.bare = { screens: consoleMount.modules!.filter((m) => m.module === 'instrument.screen').map((m) => m.socket) };
  if (hasMonitor && !monitorFoot) {
    // The roof monitor's FIRE gauge on the console, between the two joysticks.
    const [mx, , mz] = cc.slots.monJoystick.position as V3;
    const mon = bySocket(recipe.modules, 'fireMonitor')!;
    mon.config = { ...mon.config, gauge: { ...CONFIG.vessels.workboat.fireMonitor.gauge, position: [r2(at.console[0] + mx), r2(at.console[1] + 0.012), r2(at.console[2] + mz - 0.125 + sb(mx))] } };
  }
  if (!bowRamp) recipe.modules = recipe.modules.filter((m) => m.socket !== 'rampCabin' && m.socket !== 'rampBow');
  if (craneAt) {
    // Its control post goes inboard of it by itself (the module's seat), whichever way it faces.
    recipe.modules.push({ socket: 'deckCrane', module: 'deck.crane', ...(cranePlaced ? { config: { side: 'socket' } } : {}) });
  }
  // The working deck gear (version 10), and a hydraulic pump for whatever needs one.
  if (winchAt) recipe.modules.push({ socket: 'towWinch', module: 'deck.tow-winch' });
  // A tug's tow point is her towing hook near amidships (deckGear.ts towHook), not the roller.
  if (sternRoller) recipe.modules.push({ socket: 'sternRoller', module: 'deck.stern-roller', ...(towHook ? { config: { hook: towHook } } : {}) });
  if (aFrame) recipe.modules.push({ socket: 'aFrame', module: 'deck.a-frame' }, { socket: 'trawl', module: 'fishing.trawl' });
  if (ring) recipe.modules.push({ socket: 'lifeRing', module: 'rescue.life-ring-station', config: { stow: ring.stow, cleat: ring.cleat } }, { socket: 'boatHook', module: 'rescue.boat-hook-rack', config: { stow: ring.hook } });
  if (rodRack) recipe.modules.push({ socket: 'rodRack', module: 'deck.rod-rack', config: rodRack });
  if (sideDoor)
    recipe.modules.push(
      { socket: 'sideDoorIn', module: 'control.door-button', config: { label: 'Side door: open / shut' }, bind: { door: 'door.side.open' } },
      { socket: 'sideDoorOut', module: 'control.door-button', config: { label: 'Side door: open / shut' }, bind: { door: 'door.side.open' } },
    );
  if (anchorAt) recipe.modules.push({ socket: 'anchor', module: 'deck.anchor-windlass', ...(bowRamp ? { config: { aft: ac.kedgeAft } } : {}) });
  if (skiffAt && cc.slots.skiffCrane) {
    // Its SKIFF CRANE button on the dash, starboard of the wheel (beside the ANCHOR switch).
    const [bx, , bz] = cc.slots.skiffCrane.position as V3;
    recipe.modules.push({ socket: 'tenderCrane', module: 'deck.tender-crane', config: { consoleButton: [r2(at.console[0] + bx), r2(at.console[1] + 0.01), r2(at.console[2] + bz + sb(bx))] } });
  }
  if (craneAt || winchAt || skiffAt) recipe.modules.push({ socket: 'hydraulicPump', module: 'hydraulics.pto-pump' });
  if (basketAt) recipe.modules.push({ socket: 'fenders', module: 'deck.fenders', config: { z: fenderZs, basket: basketAt } });
  if (pushFender) recipe.modules.push({ socket: 'pushFender', module: 'hull.push-fender', config: pushFender });
  if (prot.side) recipe.modules.push({ socket: 'hullGuard', module: 'hull.guard', config: { kind: prot.side, aroundBow: !bowRamp } });
  // Her furniture (P5), each piece on its place.
  recipe.modules.push(...p.furnitureMounts);

  return { recipe };
}
export type RecipePart = ReturnType<typeof recipePart>;
