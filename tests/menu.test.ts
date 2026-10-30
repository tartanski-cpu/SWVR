import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { HandFrame } from '../src/controls/InteractionSystem';
import { formatHours, mainMenu, type MainMenu, type MenuHost } from '../src/ui/mainMenu';
import type { MenuButton } from '../src/ui/menuPanel';
import type { WristMenu as WristMenuT } from '../src/ui/wristMenu';
import { DEFAULT_DESIGN, encodeDesign } from '../src/shipyard/design';
import { DESIGN_HULLS } from '../src/shipyard/build';
import { ShipyardCodes } from '../src/shipyard/takeHer';

const PILOT = encodeDesign({ ...DEFAULT_DESIGN, ...DESIGN_HULLS[3].defaults, hull: 3 } as typeof DEFAULT_DESIGN);
const LANDER = encodeDesign(DEFAULT_DESIGN);

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
  // Two Shipyard favourites in a pretend browser storage (Office > Your boats).
  const saved = JSON.stringify([
    { name: 'Pilot one', code: PILOT, savedAt: 2, picture: '', summary: '14 m · 24 kn' },
    { name: 'Little lander', code: LANDER, savedAt: 1, picture: '', summary: '9 m' },
  ]);
  const yard = new ShipyardCodes(() => ({ getItem: () => saved, setItem: () => {} }));
  const cam = { on: false, fov: 60, speed: 1, smooth: true, rideBoat: true, clean: true, zoom: (n: number) => (cam.fov += n * 2) };
  const state = { time: 10.5, scale: 0, sea: 1, coupling: 1, fov: 70, smooth: true, snap: 30, aboard: false, trials: false, dbg: false, hydro: false, probes: false, code: '', weather: 'Clear', debugMenu: true };
  const host: MenuHost = {
    passageCruise: () => '',
    passageLine: () => '',
    passageButton: () => 'Go',
    makePassage: (i) => calls.push(`passage ${i}`),
    shipyardStatus: () => '',
    takeLabel: () => 'Take her',
    weatherMode: () => 'own',
    setWeatherManual: (which, v) => calls.push(`manual ${which} ${v}`),
    setWeatherAuto: () => calls.push('auto'),
    windNow: () => 5,
    windFromNow: () => 225,
    rainNow: () => 0,
    openShipyard: () => calls.push('shipyard'),
    timeOfDay: () => state.time,
    homeBoat: () => 'workboat',
    setHomeBoat: (id) => calls.push(`boat ${id}`),
    spawnBoat: (id) => calls.push(`spawn ${id}`),
    launchBoat: (ref) => calls.push(`launch ${ref}`),
    withdrawBoat: () => calls.push('withdraw'),
    myBoat: () => 'None',
    lastBoat: () => null,
    launchLast: () => calls.push('launch last'),
    shiftTime: (h) => calls.push(`shift ${h.toFixed(3)}`),
    timeScale: () => state.scale,
    setTimeScale: (v) => (state.scale = v),
    waveHeight: () => 1.25 * state.sea,
    maxWaveHeight: () => 3.6,
    weatherStatus: () => 'Clear · wind SW 4 (7 m/s) · vis good · Hs 1.2 m · next Fog in 12 min',
    weatherFast: () => false,
    rainQuality: () => 'high',
    treeDetail: () => 'auto',
    treeLevel: () => 'desktop',
    setTreeDetail: () => 0,
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
    fov: () => state.fov,
    setFov: (d) => (state.fov = d),
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
    landOnSlip: () => calls.push('slip'),
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
    teleportToRegion: (id) => calls.push(`region ${id}`),
    regionMap: () => false,
    raceOverride: () => 0,
    shortSeas: () => true,
    setShortSeas: () => {},
    seaHereText: () => '',
    setRaceOverride: (v) => calls.push(`race ${v}`),
    gustNow: () => calls.push('gust'),
    gustStatus: () => 'None here',
    toggleRegionMap: () => calls.push('regionMap'),
    runStatus: () => 'No cargo run',
    rescueNow: () => calls.push('rescue'),
    rescueEnd: () => calls.push('rescueEnd'),
    sosStatus: () => 'Upright and afloat',
    sos: () => calls.push('sos'),
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
    transferCall: () => calls.push('transferCall'),
    transferPlace: () => calls.push('transferPlace'),
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
    projectTitle: () => 'None',
    projectAction: () => '',
    projectAccept: () => {},
    projectLine: () => '',
    projectSummary: () => '',
    debugProjectBack: () => {},
    debugProjectStage: () => calls.push('project stage'),
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
    planLine: () => 'No plan yet',
    timberLine: () => '',
    liveWeatherLine: () => '',
    liveWeatherCredit: () => '',
    timberButton: () => '',
    timberPress: () => {},
    canHandBack: () => false,
    boatFavourite: () => 'The small tug',
    canSaveBoat: () => true,
    saveBoatFavourite: () => calls.push('save boat'),
    goPlanTable: () => calls.push('plan table'),
    openPlanChart: () => calls.push('plan chart'),
    crewMember: (i: number) => (i === 0 ? { name: 'Skipper', you: true, host: false, muted: false } : null),
    toggleCrewMute: (i: number) => calls.push(`mute ${i}`),
    voiceStatus: () => '',
    voiceChat: () => false,
    setVoiceChat: () => {},
    micMuted: () => false,
    setMicMuted: () => {},
    vrFly: () => false,
    setVrFly: () => {},
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
    quickJob: () => {},
    seaTrialsShown: () => state.trials,
    toggleSeaTrials: () => calls.push('trials'),
    debugPanel: () => state.dbg,
    toggleDebugPanel: () => calls.push('debug'),
    hydroView: () => state.hydro,
    toggleHydroView: () => calls.push('hydro'),
    probes: () => state.probes,
    toggleProbes: () => calls.push('probes'),
    debugMenu: () => state.debugMenu,
    potsAboard: () => {},
    toPottingGround: () => {},
    potsReady: () => {},
    potsOnPlotter: () => false,
    togglePotsOnPlotter: () => {},
    setDebugMenu: (on) => (state.debugMenu = on),
    netStatus: () => 'Playing alone',
    playerName: () => 'Mate',
    nextPlayerName: () => calls.push('name'),
    netRole: () => 'solo',
    handTurn: () => ({ pitchDeg: 90, rollDeg: 0, yawDeg: 0 }),
    turnHands: (axis, deg) => calls.push(`turn ${axis} ${deg}`),
    handAxes: () => false,
    setHandAxes: (on) => calls.push(`axes ${on}`),
    camera: () => cam,
    setCamera: (on) => calls.push(`camera ${on}`),
    setCameraRide: (ride) => calls.push(`ride ${ride}`),
    cameraNote: () => 'Fly a camera',
    hostGame: () => calls.push('host'),
    leaveGame: () => calls.push('leave'),
    borrowed: () => false,
    waiting: () => false,
    stopWaiting: () => calls.push('stop'),
    shipyardCodes: () => yard,
    takeDesign: (code) => calls.push(`take ${code}`),
    workboatAgain: () => calls.push('workboat'),
    boatNow: () => 'The workboat',
    pasteCode: () => calls.push('paste'),
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
    const { host, state, calls } = fakeHost();
    const rows = mainMenu(host);
    const x60 = findButton(rows, '×60');
    const stopped = findButton(rows, 'Stopped');
    expect(stopped.active!()).toBe(true);
    x60.press!();
    expect(state.scale).toBeCloseTo(1 / 60);
    expect(x60.active!()).toBe(true);
    expect(stopped.active!()).toBe(false);
    // Weather by hand: a stop on the wind row sets it (m/s), the Manual button the same.
    findButton(rows, '30', 'Debug').press!();
    findButton(rows, 'heavy', 'Debug').press!();
    expect(calls).toContain(`manual 0 ${30 * 0.514444}`);
    expect(calls).toContain('manual 2 0.75');
    findButton(rows, "Game's own", 'Debug').press!();
    expect(calls).toContain('auto');
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

  it('the desktop field of view steps by 5° (Settings > Comfort)', () => {
    const { host, state } = fakeHost();
    const rows = mainMenu(host);
    findButton(rows, '+5°').press!();
    expect(state.fov).toBe(75);
    findButton(rows, '−5°').press!();
    findButton(rows, '−5°').press!();
    expect(state.fov).toBe(65);
    expect(findButton(rows, '65°')).toBeTruthy();
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
    // (Office > Your boats has a keypad too: these are the Crew tab's.)
    for (const d of ['4', '2', '0', '1', '7']) findButton(rows, d, 'Crew').press!();
    findButton(rows, '⌫', 'Crew').press!();
    findButton(rows, '9', 'Crew').press!();
    expect(state.code).toBe('42019');
    expect(findButton(rows, '4 2 0 1 9')).toBeTruthy();
    findButton(rows, 'Join').press!();
    findButton(rows, 'Host a game').press!();
    expect(calls).toEqual(['join 42019', 'host']);
  });
});

describe('office > your boats (Shipyard boats into the game)', () => {
  it('lists the Shipyard favourites from this browser by name (owner: the figures made it too long to read), newest first; Take her restarts in one', () => {
    const { host, calls } = fakeHost();
    const rows = mainMenu(host);
    expect(findButton(rows, 'Pilot one', 'Office')).toBeTruthy();
    expect(findButton(rows, 'Little lander', 'Office')).toBeTruthy();
    findButton(rows, 'Take her', 'Office').press!();
    expect(calls).toEqual([`take ${PILOT}`]);
  });

  it('her code typed on the keypad: ready only once it is whole, then Take her', () => {
    const { host, calls } = fakeHost();
    const rows = mainMenu(host);
    const chars = PILOT.replace(/-/g, '').split('');
    for (const ch of chars.slice(0, 13)) findButton(rows, ch, 'Office').press!();
    // The first 13 characters of today's code would read as an older, shorter code: not offered.
    expect(host.shipyardCodes().check().ok).toBe(false);
    expect(findButton(rows, '13 characters so far', 'Office')).toBeTruthy();
    for (const ch of chars.slice(13)) findButton(rows, ch, 'Office').press!();
    expect(findButton(rows, PILOT, 'Office')).toBeTruthy(); // shown in groups of five, as the Shipyard prints it
    expect(host.shipyardCodes().check().text).toMatch(/Pilot boat.*ready/);
    findButton(rows, '⌫', 'Office').press!();
    expect(host.shipyardCodes().check().ok).toBe(false);
    findButton(rows, chars[19], 'Office').press!();
    // The code row's Take her (the favourites' come first).
    const codeRow = mainMenu(host).pages.find((p) => p.name === 'Office')!.sections!.find((s) => s.name === 'Your boats')!.rows.find((r) => 'label' in r && r.label === 'Code')!;
    if (!('buttons' in codeRow)) throw new Error('no code row');
    codeRow.buttons[1].press!();
    expect(calls).toEqual([`take ${PILOT.replace(/-/g, '')}`]);
    findButton(rows, 'Clear', 'Office').press!();
    expect(host.shipyardCodes().code).toBe('');
  });

  it('a pasted code or play link is taken whole (lower case, dashes and all); anything else is left', () => {
    const yard = new ShipyardCodes(() => null);
    expect(yard.paste('hello there')).toBe(false);
    expect(yard.code).toBe('');
    expect(yard.paste(`  ${PILOT.toLowerCase()} `)).toBe(true);
    expect(yard.code).toBe(PILOT.replace(/-/g, ''));
    expect(yard.paste(`https://tartanski-cpu.github.io/SWVR/next/?design=${LANDER}`)).toBe(true);
    expect(yard.code).toBe(LANDER.replace(/-/g, ''));
    expect(yard.check().ok).toBe(true);
    expect(yard.favourites()).toEqual([]);
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
    expect(menu.panel.localCentreOf(findButton(def, 'Open the chart'))).not.toBeNull(); // first page (Voyage > Plan)
    menu.panel.showPage('Debug', 'Boat');
    expect(menu.panel.localCentreOf(findButton(def, 'Drop 4 m'))).not.toBeNull();
    expect(menu.panel.localCentreOf(findButton(def, 'Open the chart'))).toBeNull();
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
    expect(tab('Open the chart')).toBe(true);
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

describe('a tidy menu (owner, 30 Oct 2026: "very long, especially in VR")', () => {
  it('a row with nothing to show closes up, and the rows below move up; it opens again when there is', async () => {
    const { MenuPanel } = await import('../src/ui/menuPanel');
    let aboard = false;
    const rows = [
      { label: '', buttons: [{ text: 'Top', press: () => {} }] },
      { label: '', when: () => aboard, buttons: [{ text: 'Mate', press: () => {} }] },
      { label: '', buttons: [{ text: 'Bottom', press: () => {} }] },
    ];
    const p = new MenuPanel([], [{ name: 'A', rows }], 0.24);
    const y = (i: number) => p.localCentreOf(rows[i].buttons[0])?.y ?? null;
    expect(y(1)).toBeNull();
    const closedUp = y(2)!;
    aboard = true;
    expect(y(1)).not.toBeNull();
    expect(y(2)).toBeLessThan(closedUp); // a row lower on the panel: y runs up
    expect(y(0)).toBeCloseTo(p.localCentreOf(rows[0].buttons[0])!.y, 9); // the row above stays put
    aboard = false;
    expect(y(2)).toBeCloseTo(closedUp, 9);
  });

  it('the panel is drawn only as deep as the page shown; below that a ray meets nothing', async () => {
    const { MenuPanel } = await import('../src/ui/menuPanel');
    const row = (t: string) => ({ label: '', buttons: [{ text: t, press: () => {} }] });
    const p = new MenuPanel([], [{ name: 'Short', rows: [row('One')] }, { name: 'Long', rows: Array.from({ length: 12 }, (_, i) => row(`Row ${i}`)) }], 0.24);
    p.mesh.updateMatrixWorld(true);
    const full = p.pixelSize.h;
    const shortH = p.shownPixelHeight;
    expect(shortH).toBeLessThan(full / 2);
    p.showPage('Long');
    expect(p.shownPixelHeight).toBe(full);
    p.showPage('Short');
    // A ray at the quad's foot (where the long page's last row would be): nothing to point at.
    const foot = new THREE.Ray(new THREE.Vector3(0, -p.height / 2 + 0.01, 1), new THREE.Vector3(0, 0, -1));
    expect(p.hitRay(foot, 5)).toBeNull();
    const head = new THREE.Ray(new THREE.Vector3(0, p.height / 2 - 0.01, 1), new THREE.Vector3(0, 0, -1));
    expect(p.hitRay(head, 5)).not.toBeNull();
  });

  it('the tabs hold the whole game: every page has sections or rows, and the crew keypad is only there alone', () => {
    const { host } = fakeHost();
    const def = mainMenu(host);
    expect(def.pages.map((p) => p.name)).toEqual(['Voyage', 'Boat', 'Cargo', 'Office', 'World', 'Crew', 'Settings', 'Debug']);
    const crew = def.pages.find((p) => p.name === 'Crew')!.sections!.map((s) => s.name);
    expect(crew).toEqual(['Game', 'Aboard', 'Camera']); // Your boat joins in Voyage mode
    const keypad = def.pages.find((p) => p.name === 'Crew')!.sections![0].rows.find((r) => 'buttons' in r && r.buttons.some((b) => label(b) === '7'))!;
    expect('when' in keypad && keypad.when!()).toBe(true);
  });
});

describe('no duplicates across the tabs (owner, 30 Oct 2026)', () => {
  it('the balance, the contract, the clock and the project summary are each in one place; the camera zoom is not "field of view"', () => {
    const { host } = fakeHost();
    const def = mainMenu(host);
    const rows = def.pages.flatMap((p) => [...(p.rows ?? []), ...(p.sections ?? []).flatMap((s) => s.rows)]);
    const labelled = (l: string) => rows.filter((r) => 'label' in r && r.label === l).length;
    const buttons = (t: string) => rows.filter((r) => 'buttons' in r && r.buttons.some((b) => label(b) === t)).length;
    expect(labelled('Balance')).toBe(1);
    expect(labelled('Contract')).toBe(1);
    expect(labelled('Project')).toBe(2); // the summary on Voyage > Job, and Debug > Missions' Stage done
    expect(buttons('+1 h')).toBe(1);
    expect(buttons('−10′')).toBe(1);
    expect(labelled('Field of view')).toBe(0);
    expect(labelled('Field of view (desktop)')).toBe(1);
    expect(labelled('Zoom')).toBe(1);
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

describe('a scrolling list (long port lists)', () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => ({ label: '', buttons: [{ text: `Port ${i}`, press: () => {} }] }));

  it('the panel is as tall for 200 rows as for 20: only `show` are laid out', async () => {
    const { MenuPanel } = await import('../src/ui/menuPanel');
    const a = new MenuPanel([], [{ name: 'A', rows: [{ scroll: list(20), show: 6 }] }], 0.24);
    const b = new MenuPanel([], [{ name: 'A', rows: [{ scroll: list(200), show: 6 }] }], 0.24);
    expect(b.height).toBeCloseTo(a.height, 6);
  });

  it('shows a window of rows; ▼ and ▲ move it a page at a time, the wheel a row; it stops at the ends', async () => {
    const { MenuPanel } = await import('../src/ui/menuPanel');
    const rows = list(20);
    const p = new MenuPanel([], [{ name: 'A', rows: [{ scroll: rows, show: 6 }] }], 0.24);
    const shown = () => rows.map((r, i) => (p.localCentreOf(r.buttons[0]) ? i : -1)).filter((i) => i >= 0);
    expect(shown()).toEqual([0, 1, 2, 3, 4, 5]);
    // The ▼ button: find it by pressing what's under its centre (right column, last slot).
    const press = (label: string) => {
      const s = p.pixelSize;
      for (let y = 0; y < s.h; y += 4) {
        const b = p.hoverAt(s.w - 30, y);
        if (b && (typeof b.text === 'string' ? b.text : b.text()) === label) return b.press!();
      }
      throw new Error(`no ${label}`);
    };
    press('▼');
    expect(shown()).toEqual([5, 6, 7, 8, 9, 10]);
    press('▼');
    press('▼');
    press('▼');
    expect(shown()).toEqual([14, 15, 16, 17, 18, 19]);
    press('▲');
    expect(shown()).toEqual([9, 10, 11, 12, 13, 14]);
    // The wheel, over the list.
    const c = p.localCentreOf(rows[9].buttons[0])!;
    const py = (0.5 - c.y / p.height) * p.pixelSize.h;
    expect(p.scrollAt(py, 1)).toBe(true);
    expect(shown()[0]).toBe(10);
  });

  it('a short list has no arrows and its rows the full width', async () => {
    const { MenuPanel } = await import('../src/ui/menuPanel');
    const rows = list(3);
    const p = new MenuPanel([], [{ name: 'A', rows: [{ scroll: rows, show: 6 }] }], 0.24);
    expect(rows.every((r) => p.localCentreOf(r.buttons[0]))).toBe(true);
    expect(p.localCentreOf(rows[0].buttons[0])!.x).toBeCloseTo(0, 6);
  });
});
