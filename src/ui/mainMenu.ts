import { BUSES } from '../audio/mixer';
import { CONFIG } from '../config';
import type { MenuPage, MenuRow } from './menuPanel';

/** What the menu can read and change. Implemented by the App; keeps the menu UI-only. */
export interface MenuHost {
  timeOfDay(): number;
  shiftTime(hours: number): void;
  /** Game hours per real second. */
  timeScale(): number;
  setTimeScale(hoursPerSecond: number): void;
  /** Sea state as a scale (0 calm, 1 moderate, ...) and its significant wave height (m). */
  seaScale(): number;
  setSeaScale(scale: number): void;
  waveHeight(): number;
  /** Weather: one-line status, the preset now, force one, and the debug switches. */
  weatherStatus(): string;
  weatherPreset(): string;
  setWeather(preset: string): void;
  weatherFixed(): boolean;
  setWeatherFixed(on: boolean): void;
  weatherFast(): boolean;
  setWeatherFast(on: boolean): void;
  /** Rain streak quality (a local setting) and the debug bilge flood. */
  rainQuality(): string;
  setRainQuality(q: string): void;
  bilgeStatus(): string;
  floodBilge(): void;
  /** Chart marks: how many, clear them all; the plot-it-yourself rescue mode. */
  chartStatus(): string;
  clearChart(): void;
  plotYourself(): boolean;
  setPlotYourself(on: boolean): void;
  /** Debug: spawn a passing ship (0) or debris (1) close by; the traffic now. */
  spawnTraffic(what: number): void;
  trafficStatus(): string;
  /** Engine oil: level and check; debug: make it low with a check due. */
  oilStatus(): string;
  oilLow(): void;
  coupling(): number;
  setCoupling(value: number): void;
  smoothWalk(): boolean;
  setSmoothWalk(on: boolean): void;
  /** The boat hook telescopes out to what you point it at. */
  hookAutoExtend(): boolean;
  setHookAutoExtend(on: boolean): void;
  snapTurnDeg(): number;
  setSnapTurnDeg(deg: number): void;
  aboard(): boolean;
  toggleBoard(): void;
  /** The tender: step into it (at the tiller); its battery charge 0..1. */
  boardSkiff(): void;
  skiffBattery(): number;
  /** The davit button's action: 'LAUNCH', 'RECOVER', or what's happening / why not. */
  davitAction(): string;
  davit(): void;
  dropBoat(): void;
  heelBoat(): void;
  /** Fuel aboard (L) and tank size. */
  fuel(): { litres: number; tank: number };
  /** Whether the boat is at a fuel berth, slow enough to take fuel. */
  canRefuel(): boolean;
  refuelling(): boolean;
  toggleRefuel(): void;
  setFuelDebug(litres: number): void;
  /** 12 V electrics: one-line status, and the debug actions (0 flat, 1 fill, 2 all on, 3 battery 1 flat, 4 quick start). */
  electricsStatus(): string;
  electricsDebug(mode: number): void;
  coolingFault(): boolean;
  toggleCoolingFault(): void;
  /** Cargo: where you are, deliveries, payload. */
  cargoStatus(): { port: string | null; delivered: number; payloadT: number; maxT: number };
  /** Cargo on the workboat's deck (row i), and in the skiff (row i), as labels. */
  cargoAboard(i: number): string | null;
  skiffCargo(i: number): string | null;
  /** The skiff's load, e.g. "1 / 2 slots, 40 kg". */
  skiffLoad(): string;
  /** Docking: status line, and whether DOCK would do something now (dock or cast off). */
  dockStatus(): { text: string; ready: boolean; docked: boolean };
  toggleDock(): void;
  /** One-line anchor/windlass status. */
  anchorStatus(): string;
  /** Ports with bearing (°T) and range (nm) from the boat. */
  ports(): { name: string; bearingDeg: number; rangeNm: number }[];
  /** Cargo run / rescue status line; debug: raise a rescue call now, end the active rescue. */
  runStatus(): string;
  rescueNow(): void;
  rescueEnd(): void;
  /** FM radio in the wheelhouse: on/off and the station (index into CONFIG.fmRadio.stations). */
  fmOn(): boolean;
  setFmOn(on: boolean): void;
  fmStation(): number;
  setFmStation(i: number): void;
  /** Sound levels 0..1 by id ('master', 'engine', 'effects', 'radio', 'music'). */
  volume(id: string): number;
  setVolume(id: string, v: number): void;
  resetVolumes(): void;
  /** Debug: say a radio check through the radio voice and report what the browser can do. */
  voiceTest(): void;
  /** Debug: a target alongside ('manOverboard' / 'lostCargo'); show targets on the chart. */
  rescueNear(defId: string): void;
  /** Debug: a survivor sitting aboard, to try landing. Rescues completed so far. */
  rescueAboard(): void;
  rescues(): number;
  /** Towing missions: one-line status (or null), make fast / cast off, tows delivered; debug. */
  towStatus(): string | null;
  towFast(): boolean;
  towToggle(): void;
  towsDelivered(): number;
  towNear(kind: string): void;
  towCall(): void;
  towEnd(): void;
  showTargets(): boolean;
  toggleShowTargets(): void;
  /** Move the boat (and you, aboard) to port i's berth or anchorage. */
  teleportToPort(i: number): void;
  seaTrialsShown(): boolean;
  toggleSeaTrials(): void;
  debugPanel(): boolean;
  toggleDebugPanel(): void;
  hydroView(): boolean;
  toggleHydroView(): void;
  probes(): boolean;
  toggleProbes(): void;
  /** Multiplayer: one-line status, and whether we're alone, hosting or in someone's game. */
  netStatus(): string;
  /** Your name over your head, and the next one from the list. */
  playerName(): string;
  nextPlayerName(): void;
  netRole(): 'solo' | 'starting' | 'host' | 'client';
  hostGame(): void;
  leaveGame(): void;
  /** The game code typed so far on the keypad. */
  joinCode(): string;
  typeDigit(d: string): void;
  backspace(): void;
  joinGame(): void;
  close(): void;
}

/** Time flow options: game time per real time. */
const TIME_FLOW: [string, number][] = [
  ['Stopped', 0],
  ['×60', 60 / 3600],
  ['×600', 600 / 3600],
];

declare const __BUILD__: string | undefined;
/** Commit and build time, injected by vite.config.ts (absent in tests). */
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

export interface MainMenu {
  header: MenuRow[];
  pages: MenuPage[];
}

export function mainMenu(h: MenuHost): MainMenu {
  const choice = <T>(label: string, value: T, get: () => T, set: (v: T) => void) => ({
    text: label,
    active: () => get() === value,
    press: () => set(value),
  });
  const header: MenuRow[] = [{ label: '', buttons: [{ text: `SWVR  ${BUILD}`, weight: 3 }, { text: 'Close ✕', press: () => h.close(), weight: 1.4 }] }];

  const seaAndTime: MenuRow[] = [
    { heading: 'Time' },
    {
      label: 'Time of day',
      buttons: [
        { text: '−1 h', press: () => h.shiftTime(-1) },
        { text: '−10′', press: () => h.shiftTime(-10 / 60) },
        { text: () => formatHours(h.timeOfDay()), weight: 1.3 },
        { text: '+10′', press: () => h.shiftTime(10 / 60) },
        { text: '+1 h', press: () => h.shiftTime(1) },
      ],
    },
    {
      label: 'Time flow',
      buttons: TIME_FLOW.map(([label, rate]) => choice(label, rate, () => h.timeScale(), (v) => h.setTimeScale(v))),
    },
    { heading: 'Weather' },
    { label: '', buttons: [{ text: () => h.weatherStatus() }] },
    {
      label: '',
      buttons: Object.keys(CONFIG.weather.presets).map((name) => ({
        text: name,
        active: () => h.weatherPreset() === name,
        press: () => h.setWeather(name),
      })),
    },
    {
      label: 'Director',
      buttons: [
        { text: () => (h.weatherFixed() ? 'Fixed weather' : 'Changing'), active: () => h.weatherFixed(), press: () => h.setWeatherFixed(!h.weatherFixed()) },
        { text: 'Fast ×10', active: () => h.weatherFast(), press: () => h.setWeatherFast(!h.weatherFast()) },
      ],
    },
    {
      label: 'Rain effect',
      buttons: (['high', 'low', 'off'] as const).map((q) => ({ text: q === 'high' ? 'High' : q === 'low' ? 'Low' : 'None', active: () => h.rainQuality() === q, press: () => h.setRainQuality(q) })),
    },
    { heading: 'Sea (test: the wind takes it back)' },
    {
      label: '',
      buttons: CONFIG.ocean.seaStates.map((st) => choice(st.name, st.scale, () => h.seaScale(), (v) => h.setSeaScale(v))),
    },
    {
      label: 'Wave height',
      buttons: [
        { text: '−', press: () => h.setSeaScale(h.seaScale() - CONFIG.ocean.seaScaleStep) },
        { text: () => `Hs ${h.waveHeight().toFixed(1)} m`, weight: 1.6 },
        { text: '+', press: () => h.setSeaScale(h.seaScale() + CONFIG.ocean.seaScaleStep) },
      ],
    },
    { heading: 'Ports (bearing, range)' },
    ...[0, 1, 2].map((i) => ({
      label: '',
      buttons: [
        {
          text: () => {
            const p = h.ports()[i];
            return p ? `${p.name}   ${p.bearingDeg.toFixed(0).padStart(3, '0')}°  ${p.rangeNm.toFixed(2)} nm` : '';
          },
          weight: 4,
        },
        { text: () => (h.ports()[i] ? 'Go' : ''), press: () => h.teleportToPort(i) },
      ],
    })),
  ];

  const boat: MenuRow[] = [
    { heading: 'Boat' },
    {
      label: '',
      buttons: [{ text: () => (h.aboard() ? 'Leave boat (to platform)' : 'Board boat (at the helm)'), press: () => h.toggleBoard() }],
    },
    {
      label: 'Skiff',
      buttons: [
        { text: 'Board', press: () => h.boardSkiff() },
        { text: () => h.davitAction(), press: () => h.davit(), weight: 1.6 },
        { text: () => `${Math.round(h.skiffBattery() * 100)} %`, weight: 0.6 },
      ],
    },
    {
      label: 'Fuel',
      buttons: [
        { text: () => `${h.fuel().litres.toFixed(0)} / ${h.fuel().tank} L`, weight: 1.1 },
        {
          text: () => (h.refuelling() ? 'Stop fuelling' : h.canRefuel() ? 'Refuel' : 'Refuel at a fuel berth'),
          active: () => h.refuelling(),
          press: () => h.toggleRefuel(),
          weight: 1.5,
        },
      ],
    },
    {
      label: 'Tow',
      buttons: [
        { text: () => h.towStatus() ?? 'No tow job', weight: 2.4 },
        { text: () => (h.towFast() ? 'Cast off' : 'Make fast'), active: () => h.towFast(), press: () => h.towToggle() },
      ],
    },
    {
      label: 'Docking',
      buttons: [
        { text: () => h.dockStatus().text, weight: 2.4 },
        {
          text: () => (h.dockStatus().docked ? 'Cast off' : 'Dock'),
          active: () => h.dockStatus().ready,
          press: () => h.toggleDock(),
        },
      ],
    },
    { label: 'Anchor', buttons: [{ text: () => h.anchorStatus() }] },
    {
      label: 'Sea trials',
      buttons: [{ text: () => (h.seaTrialsShown() ? 'Hide report' : 'Run + show report'), active: () => h.seaTrialsShown(), press: () => h.toggleSeaTrials() }],
    },
  ];

  const aboardRow = (i: number): MenuRow => ({
    label: '',
    buttons: [{ text: () => h.cargoAboard(i) ?? (i === 0 ? 'Deck empty' : '') }],
  });
  const skiffRow = (i: number): MenuRow => ({
    label: '',
    buttons: [{ text: () => h.skiffCargo(i) ?? (i === 0 ? 'Empty: two crates or one drum' : '') }],
  });
  const cargo: MenuRow[] = [
    {
      label: '',
      buttons: [
        { text: () => h.cargoStatus().port ?? 'At sea', weight: 2 },
        { text: () => `${Math.round(h.cargoStatus().payloadT * 1000)} kg`, weight: 1 },
        { text: () => `Delivered ${h.cargoStatus().delivered}`, weight: 1.3 },
      ],
    },
    { label: '', buttons: [{ text: () => h.runStatus() }] },
    { label: 'Missions', buttons: [{ text: () => `${h.rescues()} completed (${h.towsDelivered()} tows)` }] },
    { label: '', buttons: [{ text: 'Carry by hand: grip (VR) / click. Lash: trigger / Q' }] },
    { heading: 'Aboard' },
    ...[0, 1, 2, 3, 4].map(aboardRow),
    { heading: 'In the skiff' },
    { label: '', buttons: [{ text: () => h.skiffLoad() }] },
    ...[0, 1].map(skiffRow),
  ];

  const comfort: MenuRow[] = [
    { heading: 'Comfort' },
    {
      label: 'Motion coupling',
      buttons: [
        { text: '−10 %', press: () => h.setCoupling(h.coupling() - 0.1) },
        { text: () => `${Math.round(h.coupling() * 100)} %`, weight: 1.2 },
        { text: '+10 %', press: () => h.setCoupling(h.coupling() + 0.1) },
      ],
    },
    {
      label: 'Stick walking',
      buttons: [choice('On', true, () => h.smoothWalk(), (v) => h.setSmoothWalk(v)), choice('Off', false, () => h.smoothWalk(), (v) => h.setSmoothWalk(v))],
    },
    {
      label: 'Boat hook reach',
      buttons: [choice('Auto-extend', true, () => h.hookAutoExtend(), (v) => h.setHookAutoExtend(v)), choice('Fixed', false, () => h.hookAutoExtend(), (v) => h.setHookAutoExtend(v))],
    },
    {
      label: 'Snap turn',
      buttons: [15, 30, 45, 90].map((d) => choice(`${d}°`, d, () => h.snapTurnDeg(), (v) => h.setSnapTurnDeg(v))),
    },
  ];

  const sound: MenuRow[] = [
    { heading: 'Volume' },
    ...BUSES.map((b) => ({
      label: b.label,
      buttons: [
        { text: '−', press: () => h.setVolume(b.id, h.volume(b.id) - 0.1) },
        { text: () => (h.volume(b.id) <= 0 ? 'off' : `${Math.round(h.volume(b.id) * 100)} %`), weight: 1.2 },
        { text: '+', press: () => h.setVolume(b.id, h.volume(b.id) + 0.1) },
      ],
    })),
    { label: '', buttons: [{ text: 'Reset to defaults', press: () => h.resetVolumes() }] },
    { heading: 'FM radio (overhead panel in the wheelhouse)' },
    {
      label: 'Power',
      buttons: [choice('On', true, () => h.fmOn(), (v) => h.setFmOn(v)), choice('Off', false, () => h.fmOn(), (v) => h.setFmOn(v))],
    },
    ...[0, 3].map((from) => ({
      label: from === 0 ? 'Station' : '',
      buttons: CONFIG.fmRadio.stations.slice(from, from + 3).map((st, k) => ({
        text: st.name,
        active: () => h.fmOn() && h.fmStation() === from + k,
        press: () => h.setFmStation(from + k),
      })),
    })),
  ];

  const tests: MenuRow[] = [
    { heading: 'Tests' },
    {
      label: 'Boat',
      buttons: [
        { text: 'Drop 4 m', press: () => h.dropBoat() },
        { text: 'Heel 20°', press: () => h.heelBoat() },
      ],
    },
    {
      label: 'Electrics',
      buttons: [
        { text: () => h.electricsStatus(), weight: 2.2 },
        { text: 'Power on', press: () => h.electricsDebug(2) },
        { text: 'Fill', press: () => h.electricsDebug(1) },
        { text: 'Flat', press: () => h.electricsDebug(0) },
      ],
    },
    {
      label: 'Start-up',
      buttons: [
        { text: 'Quick start (all in one)', press: () => h.electricsDebug(4), weight: 1.6 },
        { text: 'Battery 1 flat', press: () => h.electricsDebug(3), weight: 1.2 },
      ],
    },
    {
      label: 'Chart',
      buttons: [
        { text: () => h.chartStatus(), weight: 1.4 },
        { text: 'Clear marks', press: () => h.clearChart() },
        { text: 'Plot it yourself', active: () => h.plotYourself(), press: () => h.setPlotYourself(!h.plotYourself()), weight: 1.3 },
      ],
    },
    {
      label: 'Traffic',
      buttons: [
        { text: () => h.trafficStatus(), weight: 1.4 },
        { text: 'Spawn ship', press: () => h.spawnTraffic(0) },
        { text: 'Spawn debris', press: () => h.spawnTraffic(1) },
      ],
    },
    {
      label: 'Engine oil',
      buttons: [
        { text: () => h.oilStatus(), weight: 2 },
        { text: 'Low + check due', press: () => h.oilLow() },
      ],
    },
    {
      label: 'Bilge',
      buttons: [
        { text: () => h.bilgeStatus(), weight: 2 },
        { text: 'Flood (60 %)', press: () => h.floodBilge() },
      ],
    },
    {
      label: 'Engine faults',
      buttons: [
        { text: 'Fuel to 5 %', press: () => h.setFuelDebug(0.05 * h.fuel().tank) },
        { text: 'Pump failure', active: () => h.coolingFault(), press: () => h.toggleCoolingFault() },
      ],
    },
    {
      label: 'Rescue',
      buttons: [
        { text: 'Call now', press: () => h.rescueNow() },
        { text: 'End rescue', press: () => h.rescueEnd() },
        { text: 'Voice test', press: () => h.voiceTest() },
      ],
    },
    {
      label: 'Alongside',
      buttons: [
        { text: 'Person', press: () => h.rescueNear('manOverboard') },
        { text: 'Crates', press: () => h.rescueNear('lostCargo') },
        { text: 'On chart', active: () => h.showTargets(), press: () => h.toggleShowTargets() },
        { text: 'Aboard', press: () => h.rescueAboard() },
      ],
    },
    {
      label: 'Tow',
      buttons: [
        { text: 'Cruiser', press: () => h.towNear('derelict') },
        { text: 'Logs', press: () => h.towNear('logRaft') },
        { text: 'Barge', press: () => h.towNear('barge') },
        { text: 'Call', press: () => h.towCall() },
        { text: 'End', press: () => h.towEnd() },
      ],
    },
    { heading: 'Debug views' },
    {
      label: '',
      buttons: [
        { text: 'Perf panel', active: () => h.debugPanel(), press: () => h.toggleDebugPanel() },
        { text: 'Buoyancy', active: () => h.hydroView(), press: () => h.toggleHydroView() },
        { text: 'Wave probes', active: () => h.probes(), press: () => h.toggleProbes() },
      ],
    },
  ];

  const solo = () => h.netRole() === 'solo';
  const digit = (d: string) => ({ text: () => (solo() ? d : ''), press: () => h.typeDigit(d) });
  const crew: MenuRow[] = [
    { heading: 'Crew (multiplayer)' },
    { label: '', buttons: [{ text: () => h.netStatus() }] },
    { label: 'Your name', buttons: [{ text: () => h.playerName(), weight: 1.6 }, { text: 'Change', press: () => h.nextPlayerName() }] },
    {
      label: '',
      buttons: [
        { text: () => (solo() ? 'Host a game' : ''), press: () => h.hostGame() },
        { text: () => (solo() ? '' : h.netRole() === 'host' ? 'Stop hosting' : 'Leave game'), press: () => h.leaveGame() },
      ],
    },
    { heading: 'Join a game' },
    {
      label: 'Game code',
      buttons: [
        { text: () => (h.joinCode() + '_____').slice(0, 5).split('').join(' '), weight: 1.6 },
        { text: () => (solo() ? 'Join' : ''), active: () => h.joinCode().length === 5, press: () => h.joinGame() },
      ],
    },
    { label: '', buttons: ['1', '2', '3', '4', '5'].map(digit) },
    { label: '', buttons: ['6', '7', '8', '9', '0'].map(digit) },
    { label: '', buttons: [{ text: () => (solo() ? '⌫' : ''), press: () => h.backspace() }] },
  ];

  return {
    header,
    pages: [
      { name: 'Sea & time', rows: seaAndTime },
      { name: 'Boat', rows: boat },
      { name: 'Cargo', rows: cargo },
      { name: 'Comfort', rows: comfort },
      { name: 'Sound', rows: sound },
      { name: 'Crew', rows: crew },
      { name: 'Tests', rows: tests },
    ],
  };
}

export function formatHours(t: number): string {
  const total = Math.round((((t % 24) + 24) % 24) * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
