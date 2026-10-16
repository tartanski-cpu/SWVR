import { BUSES } from '../audio/mixer';
import { CONFIG } from '../config';
import type { MenuPage, MenuRow, MenuSection } from './menuPanel';

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
  /** The tender crane's action: 'LAUNCH', 'RECOVER', or what's happening / why not. */
  craneAction(): string;
  crane(): void;
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
  /** Docking: status line, and whether Dock / Cast off would do something now (dock or cast off). */
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
  /** No new emergency calls (world.quietCalls). */
  quietCalls(): boolean;
  setQuietCalls(on: boolean): void;
  /** Towing missions: one-line status (or null), make fast / cast off, tows delivered; debug. */
  towStatus(): string | null;
  towFast(): boolean;
  towToggle(): void;
  towsDelivered(): number;
  towNear(kind: string): void;
  towCall(): void;
  towEnd(): void;
  /**
   * The career (Office tab): balance, reputation by port, the ledger; the harbour office's
   * job board where she lies (offers by index), the contract on; upgrades (by index).
   */
  balance(): string;
  reputation(): string;
  ledgerLine(i: number): string;
  officeName(): string;
  offerText(i: number): string;
  /** '' when it can be taken, else why not. */
  offerBlocker(i: number): string;
  acceptOffer(i: number): void;
  contractText(): string;
  abandonContract(): void;
  upgradeText(i: number): string;
  upgradeStatus(i: number): string;
  buyUpgrade(i: number): void;
  debugCash(): void;
  /** Phase 2: the hull and engine (0 'hull', 1 'engine'): state and cost, why not, mend it. */
  repairText(i: number): string;
  repairStatus(i: number): string;
  repair(i: number): void;
  debugDamage(): void;
  /**
   * Phase 3: career save slots (1..3; host / solo), a new career in the slot (press twice),
   * the first voyage (skip / restart), the crew aboard.
   */
  careerSlot(): number;
  slotText(n: number): string;
  switchSlot(n: number): void;
  newCareer(): void;
  newCareerText(): string;
  tutorialText(): string;
  tutorialSkip(): void;
  tutorialRestart(): void;
  crewList(): string;
  /** Debug side missions: a salvage log on the nearest beach; go to a fishing ground. */
  logNear(): void;
  goFishing(): void;
  /** Debug fires: one close by ('boat' / 'shore'), a call, end it. */
  fireNear(kind: string): void;
  fireCall(): void;
  fireEnd(): void;
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
  /** The Debug tab is shown (a per-browser setting, off by default). */
  debugMenu(): boolean;
  setDebugMenu(on: boolean): void;
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
  const header: MenuRow[] = [{ label: '', buttons: [{ text: `Workboat World  ${BUILD}`, weight: 3 }, { text: 'Close ✕', press: () => h.close(), weight: 1.4 }] }];

  // ---------------------------------------------------------------------------------
  // The menu is laid out for playing: Voyage, Boat, Cargo, Office and Crew are the game;
  // Settings are yours (this browser); Debug holds the test and cheat tools and is hidden
  // until switched on in Settings > Game.
  // ---------------------------------------------------------------------------------

  /** The weather line split in two (it's too long for one row): conditions, then the outlook. */
  const weatherPart = (i: number) => () => {
    const parts = h.weatherStatus().split(' · ');
    return i === 0 ? parts.slice(0, 2).join(' · ') : parts.slice(2).join(' · ');
  };

  const voyage: MenuRow[] = [
    { heading: 'Job' },
    { label: '', buttons: [{ text: () => h.contractText(), weight: 3 }, { text: () => (h.contractText().startsWith('None') ? '' : 'Abandon'), press: () => h.abandonContract() }] },
    { label: '', buttons: [{ text: () => h.runStatus() }] },
    { label: 'Done', buttons: [{ text: () => `${h.rescues()} missions · ${h.towsDelivered()} tows · ${h.cargoStatus().delivered} cargo` }] },
    // Owner request: a way to stop the VHF calling you out (rescues, tows, fires).
    { label: 'Emergency calls', buttons: [choice('On', false, () => h.quietCalls(), (v) => h.setQuietCalls(v)), choice('Off (quiet)', true, () => h.quietCalls(), (v) => h.setQuietCalls(v))] },
    { heading: 'Weather' },
    { label: '', buttons: [{ text: weatherPart(0) }] },
    { label: '', buttons: [{ text: weatherPart(1) }] },
    {
      label: 'Time of day',
      buttons: [
        { text: '−1 h', press: () => h.shiftTime(-1) },
        { text: () => formatHours(h.timeOfDay()), weight: 1.3 },
        { text: '+1 h', press: () => h.shiftTime(1) },
      ],
    },
    { label: 'Time flow', buttons: TIME_FLOW.map(([label, rate]) => choice(label, rate, () => h.timeScale(), (v) => h.setTimeScale(v))) },
    { heading: 'Ports (bearing, range)' },
    ...[0, 1, 2].map(
      (i): MenuRow => ({
        label: '',
        buttons: [
          {
            text: () => {
              const p = h.ports()[i];
              return p ? `${p.name}   ${p.bearingDeg.toFixed(0).padStart(3, '0')}°  ${p.rangeNm.toFixed(2)} nm` : '';
            },
          },
        ],
      }),
    ),
    { label: 'Paper chart', buttons: [{ text: () => h.chartStatus(), weight: 1.6 }, { text: 'Clear marks', press: () => h.clearChart() }] },
  ];

  const boat: MenuRow[] = [
    { heading: 'Deck' },
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
        { text: () => (h.dockStatus().docked ? 'Cast off' : 'Dock'), active: () => h.dockStatus().ready, press: () => h.toggleDock() },
      ],
    },
    { label: 'Anchor', buttons: [{ text: () => h.anchorStatus() }] },
    { heading: 'Skiff' },
    {
      label: '',
      buttons: [
        { text: 'Board', press: () => h.boardSkiff() },
        { text: () => h.craneAction(), press: () => h.crane(), weight: 1.6 },
        { text: () => `${Math.round(h.skiffBattery() * 100)} %`, weight: 0.6 },
      ],
    },
    { heading: 'Fuel' },
    {
      label: '',
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
    { heading: 'FM radio (overhead panel)' },
    { label: 'Power', buttons: [choice('On', true, () => h.fmOn(), (v) => h.setFmOn(v)), choice('Off', false, () => h.fmOn(), (v) => h.setFmOn(v))] },
    ...[0, 3].map((from) => ({
      label: from === 0 ? 'Station' : '',
      buttons: CONFIG.fmRadio.stations.slice(from, from + 3).map((st, k) => ({
        text: st.name,
        active: () => h.fmOn() && h.fmStation() === from + k,
        press: () => h.setFmStation(from + k),
      })),
    })),
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
    { label: '', buttons: [{ text: 'Carry by hand: grip (VR) / click. Lash: trigger / Q' }] },
    { heading: 'Aboard' },
    ...[0, 1, 2, 3, 4].map(aboardRow),
    { heading: 'In the skiff' },
    { label: '', buttons: [{ text: () => h.skiffLoad() }] },
    ...[0, 1].map(skiffRow),
  ];

  const office: MenuSection[] = [
    {
      name: 'Jobs',
      rows: [
        { label: 'Balance', buttons: [{ text: () => h.balance(), weight: 2 }] },
        { heading: 'Contract' },
        { label: '', buttons: [{ text: () => h.contractText(), weight: 3 }, { text: () => (h.contractText().startsWith('None') ? '' : 'Abandon'), press: () => h.abandonContract() }] },
        { heading: 'Job board' },
        { label: '', buttons: [{ text: () => h.officeName() }] },
        ...[0, 1].map(
          (i): MenuRow => ({
            label: '',
            buttons: [
              { text: () => h.offerText(i), weight: 3 },
              { text: () => (h.offerText(i) ? h.offerBlocker(i) || 'Accept' : ''), active: () => !!h.offerText(i) && !h.offerBlocker(i), press: () => h.acceptOffer(i) },
            ],
          }),
        ),
        { heading: 'First voyage' },
        {
          label: '',
          buttons: [
            { text: () => h.tutorialText(), weight: 3 },
            { text: () => (h.tutorialText().endsWith('done') ? 'Again' : 'Skip'), press: () => (h.tutorialText().endsWith('done') ? h.tutorialRestart() : h.tutorialSkip()) },
          ],
        },
      ],
    },
    {
      name: 'Yard',
      rows: [
        { label: 'Balance', buttons: [{ text: () => h.balance(), weight: 2 }] },
        { heading: 'Repairs (in port)' },
        ...[0, 1].map(
          (i): MenuRow => ({
            label: '',
            buttons: [
              { text: () => h.repairText(i), weight: 3 },
              { text: () => h.repairStatus(i) || (i === 0 ? 'Repair' : 'Overhaul'), active: () => !h.repairStatus(i), press: () => h.repair(i) },
            ],
          }),
        ),
        { heading: 'Chandlery (upgrades, in port)' },
        ...CONFIG.career.upgrades.map(
          (_, i): MenuRow => ({
            label: '',
            buttons: [
              { text: () => h.upgradeText(i), weight: 3 },
              { text: () => h.upgradeStatus(i) || 'Buy', active: () => !h.upgradeStatus(i), press: () => h.buyUpgrade(i) },
            ],
          }),
        ),
      ],
    },
    {
      name: 'Career',
      rows: [
        { label: 'Balance', buttons: [{ text: () => h.balance(), weight: 2 }] },
        { label: 'Reputation', buttons: [{ text: () => h.reputation(), weight: 2 }] },
        { heading: 'Ledger' },
        ...[0, 1, 2, 3, 4, 5].map((i): MenuRow => ({ label: '', buttons: [{ text: () => h.ledgerLine(i) }] })),
        { heading: 'Saved in this browser' },
        { label: 'Slot', buttons: [1, 2, 3].map((n) => ({ text: () => h.slotText(n), active: () => h.careerSlot() === n, press: () => h.switchSlot(n) })) },
        { label: '', buttons: [{ text: () => h.newCareerText(), press: () => h.newCareer() }] },
      ],
    },
  ];

  const solo = () => h.netRole() === 'solo';
  const digit = (d: string) => ({ text: () => (solo() ? d : ''), press: () => h.typeDigit(d) });
  const crew: MenuRow[] = [
    { heading: 'Crew (multiplayer)' },
    { label: '', buttons: [{ text: () => h.netStatus() }] },
    { label: '', buttons: [{ text: () => h.crewList() }] },
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

  const settings: MenuSection[] = [
    {
      name: 'Comfort',
      rows: [
        {
          label: 'Motion coupling',
          buttons: [
            { text: '−10 %', press: () => h.setCoupling(h.coupling() - 0.1) },
            { text: () => `${Math.round(h.coupling() * 100)} %`, weight: 1.2 },
            { text: '+10 %', press: () => h.setCoupling(h.coupling() + 0.1) },
          ],
        },
        { label: 'Stick walking', buttons: [choice('On', true, () => h.smoothWalk(), (v) => h.setSmoothWalk(v)), choice('Off', false, () => h.smoothWalk(), (v) => h.setSmoothWalk(v))] },
        { label: 'Snap turn', buttons: [15, 30, 45, 90].map((d) => choice(`${d}°`, d, () => h.snapTurnDeg(), (v) => h.setSnapTurnDeg(v))) },
        {
          label: 'Boat hook reach',
          buttons: [choice('Auto-extend', true, () => h.hookAutoExtend(), (v) => h.setHookAutoExtend(v)), choice('Fixed', false, () => h.hookAutoExtend(), (v) => h.setHookAutoExtend(v))],
        },
      ],
    },
    {
      name: 'Sound',
      rows: [
        ...BUSES.map((b) => ({
          label: b.label,
          buttons: [
            { text: '−', press: () => h.setVolume(b.id, h.volume(b.id) - 0.1) },
            { text: () => (h.volume(b.id) <= 0 ? 'off' : `${Math.round(h.volume(b.id) * 100)} %`), weight: 1.2 },
            { text: '+', press: () => h.setVolume(b.id, h.volume(b.id) + 0.1) },
          ],
        })),
        { label: '', buttons: [{ text: 'Reset to defaults', press: () => h.resetVolumes() }] },
      ],
    },
    {
      name: 'Game',
      rows: [
        {
          label: 'Rain effect',
          buttons: (['high', 'low', 'off'] as const).map((q) => ({ text: q === 'high' ? 'High' : q === 'low' ? 'Low' : 'None', active: () => h.rainQuality() === q, press: () => h.setRainQuality(q) })),
        },
        {
          label: 'Rescue position',
          buttons: [
            choice('On plotter', false, () => h.plotYourself(), (v) => h.setPlotYourself(v)),
            choice('Plot it yourself', true, () => h.plotYourself(), (v) => h.setPlotYourself(v)),
          ],
        },
        { label: 'Debug tab', buttons: [choice('Hidden', false, () => h.debugMenu(), (v) => h.setDebugMenu(v)), choice('Shown', true, () => h.debugMenu(), (v) => h.setDebugMenu(v))] },
      ],
    },
  ];

  const debug: MenuSection[] = [
    {
      name: 'World',
      rows: [
        {
          label: 'Time of day',
          buttons: [
            { text: '−10′', press: () => h.shiftTime(-10 / 60) },
            { text: () => formatHours(h.timeOfDay()), weight: 1.3 },
            { text: '+10′', press: () => h.shiftTime(10 / 60) },
          ],
        },
        { heading: 'Weather' },
        {
          label: '',
          buttons: Object.keys(CONFIG.weather.presets).map((name) => ({ text: name, active: () => h.weatherPreset() === name, press: () => h.setWeather(name) })),
        },
        {
          label: 'Director',
          buttons: [
            { text: () => (h.weatherFixed() ? 'Fixed weather' : 'Changing'), active: () => h.weatherFixed(), press: () => h.setWeatherFixed(!h.weatherFixed()) },
            { text: 'Fast ×10', active: () => h.weatherFast(), press: () => h.setWeatherFast(!h.weatherFast()) },
          ],
        },
        { heading: 'Sea (the wind takes it back)' },
        { label: '', buttons: CONFIG.ocean.seaStates.map((st) => choice(st.name, st.scale, () => h.seaScale(), (v) => h.setSeaScale(v))) },
        {
          label: 'Wave height',
          buttons: [
            { text: '−', press: () => h.setSeaScale(h.seaScale() - CONFIG.ocean.seaScaleStep) },
            { text: () => `Hs ${h.waveHeight().toFixed(1)} m`, weight: 1.6 },
            { text: '+', press: () => h.setSeaScale(h.seaScale() + CONFIG.ocean.seaScaleStep) },
          ],
        },
        { heading: 'Move' },
        { label: 'To port', buttons: [0, 1, 2].map((i) => ({ text: () => h.ports()[i]?.name ?? '', press: () => h.teleportToPort(i) })) },
        { label: '', buttons: [{ text: () => (h.aboard() ? 'Leave boat (to the quay)' : 'Board boat (at the helm)'), press: () => h.toggleBoard() }] },
      ],
    },
    {
      name: 'Boat',
      rows: [
        {
          label: 'Hull',
          buttons: [
            { text: 'Drop 4 m', press: () => h.dropBoat() },
            { text: 'Heel 20°', press: () => h.heelBoat() },
            { text: 'Damage', press: () => h.debugDamage() },
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
        { label: 'Engine oil', buttons: [{ text: () => h.oilStatus(), weight: 2 }, { text: 'Low + check due', press: () => h.oilLow() }] },
        { label: 'Bilge', buttons: [{ text: () => h.bilgeStatus(), weight: 2 }, { text: 'Flood (60 %)', press: () => h.floodBilge() }] },
        {
          label: 'Engine faults',
          buttons: [
            { text: 'Fuel to 5 %', press: () => h.setFuelDebug(0.05 * h.fuel().tank) },
            { text: 'Pump failure', active: () => h.coolingFault(), press: () => h.toggleCoolingFault() },
          ],
        },
        { label: 'Sea trials', buttons: [{ text: () => (h.seaTrialsShown() ? 'Hide report' : 'Run + show report'), active: () => h.seaTrialsShown(), press: () => h.toggleSeaTrials() }] },
      ],
    },
    {
      name: 'Missions',
      rows: [
        {
          label: 'Rescue',
          buttons: [
            { text: 'Call now', press: () => h.rescueNow() },
            { text: 'End rescue', press: () => h.rescueEnd() },
          ],
        },
        {
          label: 'Alongside',
          buttons: [
            { text: 'Person', press: () => h.rescueNear('manOverboard') },
            { text: 'Crates', press: () => h.rescueNear('lostCargo') },
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
        {
          label: 'Fire',
          buttons: [
            { text: 'Boat', press: () => h.fireNear('boat') },
            { text: 'Shore', press: () => h.fireNear('shore') },
            { text: 'Call', press: () => h.fireCall() },
            { text: 'End', press: () => h.fireEnd() },
          ],
        },
        {
          label: 'Side jobs',
          buttons: [
            { text: 'Log on beach', press: () => h.logNear() },
            { text: 'Fishing ground', press: () => h.goFishing() },
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
        { label: 'Career', buttons: [{ text: '+£5000, rep', press: () => h.debugCash() }] },
      ],
    },
    {
      name: 'Views',
      rows: [
        {
          label: '',
          buttons: [
            { text: 'Perf panel', active: () => h.debugPanel(), press: () => h.toggleDebugPanel() },
            { text: 'Buoyancy', active: () => h.hydroView(), press: () => h.toggleHydroView() },
            { text: 'Wave probes', active: () => h.probes(), press: () => h.toggleProbes() },
          ],
        },
        { label: 'Chart', buttons: [{ text: 'Targets on chart', active: () => h.showTargets(), press: () => h.toggleShowTargets() }] },
        { label: 'Radio voice', buttons: [{ text: 'Voice test', press: () => h.voiceTest() }] },
      ],
    },
  ];

  return {
    header,
    pages: [
      { name: 'Voyage', rows: voyage },
      { name: 'Boat', rows: boat },
      { name: 'Cargo', rows: cargo },
      { name: 'Office', sections: office },
      { name: 'Crew', rows: crew },
      { name: 'Settings', sections: settings },
      { name: 'Debug', sections: debug, hidden: () => !h.debugMenu() },
    ],
  };
}

export function formatHours(t: number): string {
  const total = Math.round((((t % 24) + 24) % 24) * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
