import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { HandFrame } from '../src/controls/InteractionSystem';
import { formatHours, mainMenu, type MainMenu, type MenuHost } from '../src/ui/mainMenu';
import type { MenuButton } from '../src/ui/menuPanel';
import type { WristMenu as WristMenuT } from '../src/ui/wristMenu';

// The menu draws onto a canvas; in Node, give it a canvas whose 2D context ignores
// every call. Hit-testing and press logic don't depend on what gets drawn.
beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => {} });
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
});

function fakeHost() {
  const calls: string[] = [];
  const state = { time: 10.5, scale: 0, sea: 1, coupling: 1, smooth: true, snap: 30, aboard: false, trials: false, dbg: false, hydro: false, probes: false, code: '', weather: 'Clear', debugMenu: true };
  const host: MenuHost = {
    timeOfDay: () => state.time,
    shiftTime: (h) => calls.push(`shift ${h.toFixed(3)}`),
    timeScale: () => state.scale,
    setTimeScale: (v) => (state.scale = v),
    seaScale: () => state.sea,
    setSeaScale: (v) => (state.sea = v),
    waveHeight: () => 1.25 * state.sea,
    weatherStatus: () => 'Clear · wind SW 4 (7 m/s) · vis good · Hs 1.2 m · next Fog in 12 min',
    weatherPreset: () => state.weather,
    setWeather: (n) => (state.weather = n),
    weatherFixed: () => false,
    setWeatherFixed: () => {},
    weatherFast: () => false,
    rainQuality: () => 'high',
    setRainQuality: () => 0,
    bilgeStatus: () => 'Bilge 0 %',
    floodBilge: () => 0,
    chartStatus: () => 'Chart: 0 marks',
    clearChart: () => 0,
    plotYourself: () => false,
    setPlotYourself: () => 0,
    spawnTraffic: () => 0,
    trafficStatus: () => '0 ships',
    oilStatus: () => 'Oil 72 %',
    oilLow: () => 0,
    setWeatherFast: () => {},
    coupling: () => state.coupling,
    setCoupling: (v) => (state.coupling = v),
    smoothWalk: () => state.smooth,
    setSmoothWalk: (on) => (state.smooth = on),
    snapTurnDeg: () => state.snap,
    setSnapTurnDeg: (d) => (state.snap = d),
    aboard: () => state.aboard,
    toggleBoard: () => calls.push('board'),
    boardSkiff: () => calls.push('boardSkiff'),
    skiffBattery: () => 1,
    craneAction: () => 'LAUNCH',
    crane: () => calls.push('crane'),
    dropBoat: () => calls.push('drop'),
    heelBoat: () => calls.push('heel'),
    fuel: () => ({ litres: 420, tank: 600 }),
    canRefuel: () => false,
    refuelling: () => false,
    toggleRefuel: () => calls.push('refuel'),
    setFuelDebug: (l) => calls.push(`fuel ${l}`),
    electricsStatus: () => 'Master on',
    electricsDebug: (m) => calls.push(`electrics ${m}`),
    coolingFault: () => false,
    toggleCoolingFault: () => calls.push('fault'),
    ports: () => [],
    teleportToPort: (i) => calls.push(`go ${i}`),
    runStatus: () => 'No cargo run',
    rescueNow: () => calls.push('rescue'),
    rescueEnd: () => calls.push('rescueEnd'),
    voiceTest: () => calls.push('voiceTest'),
    rescueAboard: () => calls.push('rescueAboard'),
    rescues: () => 0,
    quietCalls: () => false,
    setQuietCalls: (on: boolean) => calls.push(`quiet:${on}`),
    hookAutoExtend: () => true,
    setHookAutoExtend: (on) => calls.push(`hook ${on}`),
    towStatus: () => null,
    towFast: () => false,
    towToggle: () => calls.push('towToggle'),
    towsDelivered: () => 0,
    towNear: (k) => calls.push(`towNear ${k}`),
    towCall: () => calls.push('towCall'),
    towEnd: () => calls.push('towEnd'),
    logNear: () => calls.push('logNear'),
    goFishing: () => calls.push('goFishing'),
    balance: () => '£500',
    reputation: () => '',
    ledgerLine: () => '',
    officeName: () => '',
    offerText: () => '',
    offerBlocker: () => '',
    acceptOffer: () => calls.push('accept'),
    contractText: () => 'None',
    abandonContract: () => calls.push('abandon'),
    upgradeText: () => '',
    upgradeStatus: () => '',
    buyUpgrade: () => calls.push('buy'),
    debugCash: () => calls.push('cash'),
    repairText: () => '',
    repairStatus: () => '',
    repair: () => calls.push('repair'),
    debugDamage: () => calls.push('damage'),
    careerSlot: () => 1,
    slotText: (n: number) => `${n}: empty`,
    switchSlot: () => calls.push('slot'),
    newCareer: () => calls.push('new'),
    newCareerText: () => 'New career in this slot',
    tutorialText: () => 'First voyage: done',
    tutorialSkip: () => calls.push('skip'),
    tutorialRestart: () => calls.push('restart'),
    crewList: () => 'Just you',
    fireNear: (k) => calls.push(`fireNear ${k}`),
    fireCall: () => calls.push('fireCall'),
    fireEnd: () => calls.push('fireEnd'),
    fmOn: () => false,
    setFmOn: () => {},
    fmStation: () => 0,
    setFmStation: () => {},
    volume: () => 0.5,
    setVolume: () => {},
    resetVolumes: () => {},
    rescueNear: (k) => calls.push(`near ${k}`),
    showTargets: () => false,
    toggleShowTargets: () => calls.push('showTargets'),
    anchorStatus: () => 'stowed',
    dockStatus: () => ({ text: 'No berth in range', ready: false, docked: false }),
    toggleDock: () => calls.push('dock'),
    cargoStatus: () => ({ port: null, delivered: 0, payloadT: 0, maxT: 5 }),
    cargoAboard: () => null,
    skiffCargo: () => null,
    skiffLoad: () => '0 / 2',
    seaTrialsShown: () => state.trials,
    toggleSeaTrials: () => calls.push('trials'),
    debugPanel: () => state.dbg,
    toggleDebugPanel: () => calls.push('debug'),
    hydroView: () => state.hydro,
    toggleHydroView: () => calls.push('hydro'),
    probes: () => state.probes,
    toggleProbes: () => calls.push('probes'),
    debugMenu: () => state.debugMenu,
    setDebugMenu: (on) => (state.debugMenu = on),
    netStatus: () => 'Playing alone',
    playerName: () => 'Mate',
    nextPlayerName: () => calls.push('name'),
    netRole: () => 'solo',
    hostGame: () => calls.push('host'),
    leaveGame: () => calls.push('leave'),
    joinCode: () => state.code,
    typeDigit: (d) => (state.code += d),
    backspace: () => (state.code = state.code.slice(0, -1)),
    joinGame: () => calls.push(`join ${state.code}`),
    close: () => calls.push('close'),
  };
  return { host, calls, state };
}

const label = (b: MenuButton) => (typeof b.text === 'function' ? b.text() : b.text);

/** Find a button by its label anywhere in the menu (header, any page or section), or only on the page named. */
function findButton(menu: MainMenu, text: string, page?: string): MenuButton {
  const pages = menu.pages.filter((p) => !page || p.name === page);
  const rows = [...menu.header, ...pages.flatMap((p) => [...(p.rows ?? []), ...(p.sections ?? []).flatMap((s) => s.rows)])];
  for (const r of rows) if ('buttons' in r) for (const b of r.buttons) if (label(b) === text) return b;
  throw new Error(`no button "${text}"`);
}

describe('main menu contents', () => {
  it('time buttons shift the time of day and the clock shows it', () => {
    const { host, calls } = fakeHost();
    const rows = mainMenu(host);
    findButton(rows, '+1 h').press!();
    findButton(rows, '−10′').press!();
    expect(calls).toEqual(['shift 1.000', 'shift -0.167']);
    expect(findButton(rows, '10:30').press).toBeUndefined(); // read-only value box
  });

  it('choice rows highlight the current setting and switch it', () => {
    const { host, state } = fakeHost();
    const rows = mainMenu(host);
    const x60 = findButton(rows, '×60');
    const stopped = findButton(rows, 'Stopped');
    expect(stopped.active!()).toBe(true);
    x60.press!();
    expect(state.scale).toBeCloseTo(1 / 60);
    expect(x60.active!()).toBe(true);
    expect(stopped.active!()).toBe(false);
    findButton(rows, 'Storm').press!();
    expect(state.sea).toBe(2.6);
    expect(findButton(rows, 'Storm').active!()).toBe(true);
    findButton(rows, '−', 'Debug').press!();
    expect(state.sea).toBeCloseTo(2.5);
    findButton(rows, 'Fog').press!();
    expect(state.weather).toBe('Fog');
    expect(findButton(rows, 'Fog').active!()).toBe(true);
    findButton(rows, '45°').press!();
    expect(state.snap).toBe(45);
    findButton(rows, 'Off', 'Settings').press!();
    expect(state.smooth).toBe(false);
  });

  it('coupling steps by 10 % and the board button names what it will do', () => {
    const { host, state } = fakeHost();
    const rows = mainMenu(host);
    findButton(rows, '−10 %').press!();
    expect(state.coupling).toBeCloseTo(0.9);
    expect(findButton(rows, 'Board boat (at the helm)')).toBeTruthy();
    state.aboard = true;
    expect(findButton(rows, 'Leave boat (to the quay)')).toBeTruthy();
  });

  it('formats time of day, wrapping at midnight', () => {
    expect(formatHours(10.5)).toBe('10:30');
    expect(formatHours(23.9999)).toBe('00:00');
    expect(formatHours(-0.5)).toBe('23:30');
  });
});

describe('crew tab', () => {
  it('the keypad types a game code and Join sends it', () => {
    const { host, calls, state } = fakeHost();
    const rows = mainMenu(host);
    for (const d of ['4', '2', '0', '1', '7']) findButton(rows, d).press!();
    findButton(rows, '⌫').press!();
    findButton(rows, '9').press!();
    expect(state.code).toBe('42019');
    expect(findButton(rows, '4 2 0 1 9')).toBeTruthy();
    findButton(rows, 'Join').press!();
    findButton(rows, 'Host a game').press!();
    expect(calls).toEqual(['join 42019', 'host']);
  });
});

describe('wrist menu pointing and poking', () => {
  let WristMenu: typeof WristMenuT;
  beforeAll(async () => {
    ({ WristMenu } = await import('../src/ui/wristMenu'));
  });

  /** A menu floating in front of a camera at the origin looking down -Z. */
  function setup() {
    const { host, calls } = fakeHost();
    const def = mainMenu(host);
    const menu = new WristMenu(def);
    menu.panel.showPage('Debug', 'Boat');
    const frame = new THREE.Group();
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld(true);
    menu.openInFront(frame, camera);
    frame.updateMatrixWorld(true);
    /** World point on a button's centre, `depth` m in front of the panel. */
    const at = (text: string, depth: number) => {
      const c = menu.panel.localCentreOf(findButton(def, text))!;
      return menu.panel.mesh.localToWorld(new THREE.Vector3(c.x, c.y, depth));
    };
    const hand = (tip: THREE.Vector3, dir: THREE.Vector3, trigger = false): HandFrame => ({
      tracked: true,
      grip: tip.clone(),
      ray: new THREE.Ray(tip.clone(), dir.clone().normalize()),
      gripDown: false,
      gripPressed: false,
      triggerDown: trigger,
      triggerPressed: trigger,
    });
    return { menu, calls, at, hand, def };
  }

  it('a fingertip poke from the front presses once until it backs off', () => {
    const { menu, calls, at, hand } = setup();
    const fwd = new THREE.Vector3(0, 0, -1);
    const step = (d: number) => menu.updateXR(hand(at('Drop 4 m', d), fwd), () => {});
    expect(step(0.03)).toBe(true); // over the panel: the hand is the menu's
    step(0.015);
    step(0.0); // touches the surface -> press
    step(-0.005); // pushing through doesn't repeat
    step(0.01); // not backed off far enough to re-arm
    step(0.0);
    expect(calls).toEqual(['drop']);
    step(0.03); // back off...
    step(0.0); // ...and poke again
    expect(calls).toEqual(['drop', 'drop']);
  });

  it('reaching the surface from behind the panel does not press', () => {
    const { menu, calls, at, hand } = setup();
    const fwd = new THREE.Vector3(0, 0, -1);
    menu.updateXR(hand(at('Drop 4 m', -0.03), fwd), () => {});
    menu.updateXR(hand(at('Drop 4 m', -0.01), fwd), () => {});
    menu.updateXR(hand(at('Drop 4 m', 0.0), fwd), () => {});
    expect(calls).toEqual([]);
  });

  it('pointer ray + trigger presses from a distance; the ray alone does not', () => {
    const { menu, calls, at, hand } = setup();
    const target = at('Heel 20°', 0);
    const origin = target.clone().add(new THREE.Vector3(0.1, -0.2, 0.5));
    const dir = target.clone().sub(origin);
    expect(menu.updateXR(hand(origin, dir), () => {})).toBe(true);
    expect(calls).toEqual([]);
    menu.updateXR(hand(origin, dir, true), () => {});
    expect(calls).toEqual(['heel']);
    expect(menu.rayLine.visible).toBe(true);
  });

  it('a closed menu takes nothing', () => {
    const { menu, at, hand } = setup();
    menu.close();
    expect(menu.updateXR(hand(at('Drop 4 m', 0.01), new THREE.Vector3(0, 0, -1), true), () => {})).toBe(false);
  });
});

describe('menu tabs', () => {
  it('only the current page is pressable; the tab bar switches pages', async () => {
    const { WristMenu } = await import('../src/ui/wristMenu');
    const { host, calls } = fakeHost();
    const def = mainMenu(host);
    const menu = new WristMenu(def);
    expect(menu.panel.localCentreOf(findButton(def, 'Drop 4 m'))).toBeNull(); // on Debug > Boat
    expect(menu.panel.localCentreOf(findButton(def, '+1 h'))).not.toBeNull(); // first page
    menu.panel.showPage('Debug', 'Boat');
    expect(menu.panel.localCentreOf(findButton(def, 'Drop 4 m'))).not.toBeNull();
    expect(menu.panel.localCentreOf(findButton(def, '+1 h'))).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('menu sections and the Debug tab', () => {
  it('sections switch from their own bar; the Debug tab hides until switched on in Settings', async () => {
    const { WristMenu } = await import('../src/ui/wristMenu');
    const { host, state } = fakeHost();
    state.debugMenu = false;
    const def = mainMenu(host);
    const menu = new WristMenu(def);
    const tab = (name: string) => menu.panel.localCentreOf(findButton(def, name)) !== null;
    // Hidden: no Debug tab, and asking for it stays on a shown page.
    expect(() => findButton(def, 'Debug')).toThrow(); // tab buttons belong to the panel, not the menu def
    menu.panel.showPage('Debug', 'Boat');
    expect(tab('Drop 4 m')).toBe(false);
    expect(tab('+1 h')).toBe(true);
    // Settings > Game: show it.
    menu.panel.showPage('Settings', 'Game');
    expect(tab('High')).toBe(true);
    findButton(def, 'Shown', 'Settings').press!();
    expect(state.debugMenu).toBe(true);
    menu.panel.showPage('Debug', 'Missions');
    expect(tab('Call now')).toBe(true);
    expect(tab('Drop 4 m')).toBe(false); // other section
    // Settings remembers its own section.
    menu.panel.showPage('Settings');
    expect(tab('Shown')).toBe(true);
  });

  it('the weather line is split over two rows', () => {
    const { host } = fakeHost();
    const def = mainMenu(host);
    expect(findButton(def, 'Clear · wind SW 4 (7 m/s)', 'Voyage')).toBeTruthy();
    expect(findButton(def, 'vis good · Hs 1.2 m · next Fog in 12 min', 'Voyage')).toBeTruthy();
  });
});

describe('menu placement', () => {
  it('floats upright in front of the viewer, whatever frame it is put in', async () => {
    const { placeInFront } = await import('../src/ui/placeInFront');
    const frame = new THREE.Group();
    frame.position.set(5, 3, -2); // e.g. the rig on the 3 m platform
    frame.rotation.set(0.1, 0.7, -0.15); // and on a heeled, yawed boat
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(5, 4.7, -2);
    camera.updateMatrixWorld(true);
    const obj = new THREE.Group();
    placeInFront(obj, frame, camera, 0.6, 0.12);
    obj.updateMatrixWorld(true);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()));
    expect(up.y).toBeGreaterThan(0.999); // upright
    const w = obj.getWorldPosition(new THREE.Vector3());
    expect(w.y).toBeCloseTo(4.58, 5);
    expect(Math.hypot(w.x - 5, w.z + 2)).toBeCloseTo(0.6, 5);
    // Facing the camera: its +Z points back at the viewer.
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()));
    expect(facing.z).toBeGreaterThan(0.99);
  });
});
