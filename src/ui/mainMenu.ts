import { BUSES } from '../audio/mixer';
import { FLEET } from '../boats/fleet';
import { CONFIG } from '../config';
import { PORTS } from '../world/archipelago';
import { REGIONS } from '../world/regions';
import { MODE, VOYAGE_MAP_ID } from '../mode';
import { voyageMap } from '../world/maps';
import type { MenuPage, MenuRow, MenuSection } from './menuPanel';
import { ALPHABET } from '../shipyard/design';
import { groupCode, PER_PAGE, type ShipyardCodes } from '../shipyard/takeHer';

/** What the menu can read and change. Implemented by the App; keeps the menu UI-only. */
export interface MenuHost {
  timeOfDay(): number;
  shiftTime(hours: number): void;
  /** Game hours per real second. */
  timeScale(): number;
  setTimeScale(hoursPerSecond: number): void;
  /** The sea's significant wave height (m), and the biggest the game makes. */
  waveHeight(): number;
  maxWaveHeight(): number;
  /** Weather: one-line status, and the debug switches. */
  weatherStatus(): string;
  weatherFast(): boolean;
  setWeatherFast(on: boolean): void;
  /** Debug weather by hand: 'manual', or the weather running itself ('live' on a Voyage map with live weather, else 'own'). */
  weatherMode(): 'live' | 'own' | 'manual';
  /** Set one of the hand-set weather's values (0 wind m/s, 1 from deg, 2 rain 0..1, 3 wave height m): the weather goes manual. */
  setWeatherManual(which: number, value: number): void;
  /** Back from manual: live weather (asked for afresh), or the game's own. */
  setWeatherAuto(): void;
  /** The wind now (m/s), where it's from (deg), the rain (0..1). */
  windNow(): number;
  windFromNow(): number;
  rainNow(): number;
  /** Rain streak quality (a local setting) and the debug bilge flood. */
  rainQuality(): string;
  setRainQuality(q: string): void;
  /** Trees' reach: the setting ('auto', 'quest', 'desktop') and, for Auto, what the device was taken for. */
  treeDetail(): string;
  treeLevel(): string;
  setTreeDetail(d: string): void;
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
  /** Debug: a bow-ramp boat landed on the nearest slipway, her ramp down (world/slipway.ts). */
  landOnSlip(): void;
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
  /**
   * Quick jobs (one click instead of carrying; the same rules): cargo 'load' / 'unload' /
   * 'lash' / 'release' / 'lift' (floating crates aboard), and pots 'potLoad' /
   * 'potShoot' / 'potHaul'. Says why not when it can't.
   */
  quickJob(what: string): void;
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
  /** Sound levels 0..1 by id ('master', 'engine', 'effects', 'radio', 'voice', 'music'). */
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
  /** SOS (rescue/sos.ts): her condition in a line, and send it (recover her to the yard if she's over or under). */
  sosStatus(): string;
  sos(): void;
  /** Towing missions: one-line status (or null), make fast / cast off, tows delivered; debug. */
  towStatus(): string | null;
  towFast(): boolean;
  towToggle(): void;
  towsDelivered(): number;
  towNear(kind: string): void;
  towCall(): void;
  towEnd(): void;
  /** Crew transfer (debug): a job now; the boat 40 m off its turbine's landing. */
  transferCall(): void;
  transferPlace(): void;
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
  /** Debug money: £5000 and reputation; or `amount` alone. */
  debugCash(amount?: number): void;
  /** Office > Projects (career/projects.ts): the project under way or offered, what to press, the stage's jobs; debug: the stage done. */
  projectTitle(): string;
  projectAction(): string;
  projectAccept(): void;
  projectLine(i: number): string;
  /** Debug: the project back to the start of the stage before. */
  debugProjectBack(): void;
  /** The project under way in short: line 0 its stage and jobs left, line 1 the next job ('' none). */
  projectSummary(i: number): string;
  debugProjectStage(): void;
  /** Phase 2: the hull and engine (0 'hull', 1 'engine'): state and cost, why not, mend it. */
  repairText(i: number): string;
  repairStatus(i: number): string;
  repair(i: number): void;
  debugDamage(): void;
  /** The yard's door into the Shipyard (app/shipyardTrip.ts): why it won't open now ('' if it will), and through it. */
  shipyardStatus(): string;
  openShipyard(): void;
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
  /**
   * Who's in the game, one by one (the Crew tab's list, owner Oct 2026), or null past the
   * last: their name, whether it's you or the host, and whether you've muted their voice.
   */
  crewMember(i: number): { name: string; you: boolean; host: boolean; muted: boolean } | null;
  /** Mute or unmute one crew-mate's voice, for you only. */
  toggleCrewMute(i: number): void;
  /** Voice with the crew (net/voice.ts): a status line, and your microphone muted. */
  voiceStatus(): string;
  /** Voice chat and the handheld VHF on (off by default; a per-browser setting). */
  voiceChat(): boolean;
  setVoiceChat(on: boolean): void;
  micMuted(): boolean;
  setMicMuted(m: boolean): void;
  /** Debug > World: VR fly (the left stick flies where you look; the triggers go faster). */
  vrFly(): boolean;
  setVrFly(on: boolean): void;
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
  /**
   * The boat you're aboard as a favourite (Boat tab): a line about her (or what saving did),
   * whether she can be saved (a Shipyard design), and save her to this browser's favourites.
   */
  boatFavourite(): string;
  canSaveBoat(): boolean;
  saveBoatFavourite(): void;
  /** Voyage mode: the plan's next point ("Next: Stop 2: Rothesay, 3.1 nm"), and put me ashore by the planning table. */
  planLine(): string;
  goPlanTable(): void;
  /** Voyage mode: the timber run (voyage/timber.ts): its line, and its buttons (0: sell at the merchant; '' hides one). */
  timberLine(): string;
  /** Voyage mode: the map's live weather (world/coastWeather.ts), and its source's credit; '' when it's the game's own. */
  liveWeatherLine(): string;
  liveWeatherCredit(): string;
  timberButton(i: number): string;
  timberPress(i: number): void;
  /** Regions (debug): put the boat in a region, by id; the region map on the perf panel. */
  teleportToRegion(id: string): void;
  regionMap(): boolean;
  toggleRegionMap(): void;
  /** Debug: the short seas by fetch (ocean/windSea.ts) on or off, and the sea where you are. */
  shortSeas(): boolean;
  setShortSeas(on: boolean): void;
  seaHereText(): string;
  /** Debug: the tidal races pinned (0 the clock, 1 the flood's peak, 2 slack, 3 the ebb's peak). */
  raceOverride(): number;
  setRaceOverride(v: number): void;
  /** Debug: a katabatic gust now, on the zone nearest the boat; and what the gusts are doing. */
  gustNow(): void;
  gustStatus(): string;
  seaTrialsShown(): boolean;
  toggleSeaTrials(): void;
  /** Which boat you start in (the fleet, the Alaskan); choosing one restarts the game in her. */
  homeBoat(): string;
  setHomeBoat(defId: string): void;
  /** Debug: a second boat of this type put afloat beside the home boat (multi-boat M2; host or alone). */
  spawnBoat(defId: string): void;
  /** Your own boat in a Voyage game (multi-boat M3): launch one (a fleet id or a design token), hand her back, and where she is. */
  launchBoat(ref: string): void;
  withdrawBoat(): void;
  myBoat(): string;
  /** A boat you launched (crew) that you can hand back. */
  canHandBack(): boolean;
  /** The boat you launched last time, remembered on this device (multi-boat M5): her name, or null. */
  lastBoat(): string | null;
  launchLast(): void;
  debugPanel(): boolean;
  toggleDebugPanel(): void;
  hydroView(): boolean;
  toggleHydroView(): void;
  probes(): boolean;
  toggleProbes(): void;
  /** Lobster and crab potting is on (a per-browser setting while it's being built). */
  potting(): boolean;
  setPotting(on: boolean): void;
  /** Debug: the pallet's pots onto our aft deck; our boat to the nearest potting ground. */
  potsAboard(): void;
  toPottingGround(): void;
  /** Debug: every pot in the water ready to haul; our pots shown on the chartplotter. */
  potsReady(full?: boolean): void;
  potsOnPlotter(): boolean;
  togglePotsOnPlotter(): void;
  /** The Debug tab is shown (a per-browser setting, off by default). */
  debugMenu(): boolean;
  setDebugMenu(on: boolean): void;
  /** Multiplayer: one-line status, and whether we're alone, hosting or in someone's game. */
  netStatus(): string;
  /** Your name over your head, and the next one from the list. */
  playerName(): string;
  nextPlayerName(): void;
  netRole(): 'solo' | 'starting' | 'host' | 'client';
  /** Debug > Hands: the VR hands' turn on the controller (deg), nudged; the controller's axes shown. */
  handTurn(): { pitchDeg: number; rollDeg: number; yawDeg: number };
  turnHands(axis: 'pitchDeg' | 'rollDeg' | 'yawDeg', deg: number | null): void;
  handAxes(): boolean;
  setHandAxes(on: boolean): void;
  /** The recording camera (player/cameraMode.ts): its options, on and off, a line of help. */
  camera(): CameraOptions;
  setCamera(on: boolean): void;
  setCameraRide(ride: boolean): void;
  cameraNote(): string;
  hostGame(): void;
  leaveGame(): void;
  /** The world on this page is a friend's (left their game, or they were lost): Back to your own game shows. */
  borrowed(): boolean;
  /** Office > Your boats (shipyard/takeHer.ts): the favourites' page and the code being typed. */
  shipyardCodes(): ShipyardCodes;
  /** Restart the game in a Shipyard boat by her code; or back in the game's start boat (the beginner boat). */
  takeDesign(code: string): void;
  /** What Take her does for this code: in the career, buy her at a boatyard or a sea trial away from one. */
  takeLabel(code: string): string;
  workboatAgain(): void;
  /** What she is now: "the workboat", or a Shipyard boat's name or code. */
  boatNow(): string;
  /** Desktop: the clipboard's code into the keypad's line. */
  pasteCode(): void;
  /** The game code typed so far on the keypad. */
  joinCode(): string;
  typeDigit(d: string): void;
  backspace(): void;
  joinGame(): void;
  close(): void;
}

/** The recording camera's options the menu works directly (player/cameraMode.ts). */
export interface CameraOptions {
  readonly on: boolean;
  fov: number;
  speed: number;
  smooth: boolean;
  readonly rideBoat: boolean;
  clean: boolean;
  zoom(steps: number): void;
}

/** Time flow options: game time per real time. */
const TIME_FLOW: [string, number][] = [
  ['Stopped', 0],
  ['×12', 12 / 3600],
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

/** The weather sliders' stops (Debug > World > Weather): wind in knots, rain, significant wave height (m). */
const KN = 0.514444;
const WIND_KN = [0, 5, 10, 15, 20, 25, 30, 40, 50];
const RAIN = [
  { name: 'none', v: 0 },
  { name: 'drizzle', v: 0.15 },
  { name: 'light', v: 0.3 },
  { name: 'moderate', v: 0.5 },
  { name: 'heavy', v: 0.75 },
  { name: 'torrent', v: 1 },
];
const WAVES_M = [0, 0.5, 1, 1.5, 2, 3, 4, 5];
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function mainMenu(h: MenuHost): MainMenu {
  const choice = <T>(label: string, value: T, get: () => T, set: (v: T) => void) => ({
    text: label,
    active: () => get() === value,
    press: () => set(value),
  });
  const title = MODE === 'voyage' ? `Voyage: ${voyageMap(VOYAGE_MAP_ID)?.name ?? VOYAGE_MAP_ID}` : 'Workboat World';
  const header: MenuRow[] = [{ label: '', buttons: [{ text: `${title}  ${BUILD}`, weight: 3 }, { text: 'Close ✕', press: () => h.close(), weight: 1.4 }] }];

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
    // The crew's plan from the planning table on the start quay (voyage/planTable.ts).
    ...(MODE === 'voyage' ? ([{ heading: 'Voyage plan' }, { label: '', buttons: [{ text: () => h.planLine(), weight: 2.6 }, { text: 'Go to the table', press: () => h.goPlanTable() }] }] as MenuRow[]) : []),
    // The timber run: where it stands; at the merchant's quay, sell the logs.
    ...(MODE === 'voyage'
      ? ([{ label: 'Timber', buttons: [{ text: () => h.timberLine(), weight: 2.4 }, { text: () => h.timberButton(0), press: () => h.timberPress(0) }, { text: () => h.timberButton(1), press: () => h.timberPress(1) }] }] as MenuRow[])
      : []),
    { heading: 'Job' },
    { label: '', buttons: [{ text: () => h.contractText(), weight: 3 }, { text: () => (h.contractText().startsWith('None') ? '' : 'Abandon'), press: () => h.abandonContract() }] },
    { label: '', buttons: [{ text: () => h.runStatus() }] },
    { label: 'Done', buttons: [{ text: () => `${h.rescues()} missions · ${h.towsDelivered()} tows · ${h.cargoStatus().delivered} cargo` }] },
    // Owner request: a way to stop the VHF calling you out (rescues, tows, fires).
    { label: 'Emergency calls', buttons: [choice('On', false, () => h.quietCalls(), (v) => h.setQuietCalls(v)), choice('Off (quiet)', true, () => h.quietCalls(), (v) => h.setQuietCalls(v))] },
    { heading: 'Weather' },
    { label: '', buttons: [{ text: weatherPart(0) }] },
    { label: '', buttons: [{ text: weatherPart(1) }] },
    // Voyage: the real weather at the map, as fetched at the start, with its source's credit.
    ...(MODE === 'voyage' ? ([{ label: '', buttons: [{ text: () => h.liveWeatherLine() || "The game's own weather (no live weather fetched)" }] }, { label: '', buttons: [{ text: () => h.liveWeatherCredit() }] }] as MenuRow[]) : []),
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
    // A scrolling list: a coast map has dozens of ports (the Clyde 59), which would make the
    // panel too tall to read in VR.
    {
      show: CONFIG.menu.portRows,
      scroll: PORTS.map((_, i) => ({
        label: '',
        buttons: [
          {
            text: () => {
              const p = h.ports()[i];
              return p ? `${p.name}   ${p.bearingDeg.toFixed(0).padStart(3, '0')}°  ${p.rangeNm.toFixed(2)} nm` : '';
            },
            weight: 3,
          },
          // Voyage mode (owner, Oct 2026: a way to get about the map that isn't the Debug menu):
          // Go puts your boat at that port, at its cargo berth or in its bay.
          ...(MODE === 'voyage' ? [{ text: () => (h.ports()[i] ? 'Go' : ''), press: () => h.teleportToPort(i) }] : []),
        ],
      })),
    },
    { label: 'Paper chart', buttons: [{ text: () => h.chartStatus(), weight: 1.6 }, { text: 'Clear marks', press: () => h.clearChart() }] },
  ];

  const boat: MenuRow[] = [
    // The boat you're aboard, into this browser's favourites (from VR, without the Shipyard).
    { label: 'Favourite', buttons: [{ text: () => h.boatFavourite(), weight: 2.4 }, { text: () => (h.canSaveBoat() ? 'Save her' : ''), press: () => h.saveBoatFavourite() }] },
    { heading: 'Deck' },
    {
      label: 'SOS',
      buttons: [
        { text: () => h.sosStatus(), weight: 2.4 },
        { text: 'Send SOS', press: () => h.sos() },
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
    { label: '', buttons: [{ text: 'Carry and lash by hand, or in one click:', weight: 2.4 }, { text: 'Lift crates', press: () => h.quickJob('lift') }] },
    {
      label: '',
      buttons: [
        { text: 'Load', press: () => h.quickJob('load') },
        { text: 'Unload', press: () => h.quickJob('unload') },
        { text: 'Lash all', press: () => h.quickJob('lash') },
        { text: 'Release all', press: () => h.quickJob('release') },
      ],
    },
    { heading: 'Pots' },
    {
      label: '',
      buttons: [
        { text: 'Load pots', press: () => h.quickJob('potLoad') },
        { text: 'Shoot one', press: () => h.quickJob('potShoot') },
        { text: 'Haul nearest', press: () => h.quickJob('potHaul') },
      ],
    },
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
        { label: '', buttons: [{ text: 'Add-ons, upgrades, repairs: the boatyard on the Calder Haven quay', weight: 3 }] },
        { heading: 'Contract' },
        { label: '', buttons: [{ text: () => h.contractText(), weight: 3 }, { text: () => (h.contractText().startsWith('None') ? '' : 'Abandon'), press: () => h.abandonContract() }] },
        // The construction project under way, alongside the contract (owner: what's next, and
        // what else is on); each job's state is on the Projects page.
        { heading: 'Project' },
        { label: '', buttons: [{ text: () => h.projectSummary(0) || 'None under way (see the Projects page)', weight: 3 }] },
        { label: '', buttons: [{ text: () => h.projectSummary(1), weight: 3 }] },
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
      // Construction projects (career/projects.ts; owner, Oct 2026): a chain of jobs that builds
      // something new, Tarran Rig wind farm the first. Its marks and lines are on the plotter.
      name: 'Projects',
      rows: [
        { heading: 'Construction project' },
        { label: '', buttons: [{ text: () => h.projectTitle(), weight: 3 }, { text: () => h.projectAction(), active: () => h.projectAction() === 'Take it on', press: () => h.projectAccept(), weight: 1.1 }] },
        { heading: 'This stage' },
        ...[0, 1, 2, 3, 4].map((i): MenuRow => ({ label: '', buttons: [{ text: () => h.projectLine(i), weight: 3 }] })),
        { label: '', buttons: [{ text: 'Survey lines and buoy spots are on the chartplotter, in magenta. Buoys: lift them off the quay with a deck crane, lower them into the sea at their spot.', weight: 3 }] },
      ],
    },
    {
      name: 'Your boats',
      rows: yourBoats(h),
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
  // Who's aboard, one row each: their name, and Mute for a crew-mate's voice.
  const member = (i: number): MenuRow => ({
    label: '',
    buttons: [
      { text: () => { const m = h.crewMember(i); return m ? `${m.name}${m.you ? ' (you)' : ''}${m.host ? ' · host' : ''}` : ''; }, weight: 2.4 },
      { text: () => { const m = h.crewMember(i); return !m || m.you ? '' : m.muted ? 'Muted' : 'Mute'; }, active: () => !!h.crewMember(i)?.muted, press: () => h.toggleCrewMute(i) },
    ],
  });
  // In the order you need them (owner, Oct 2026): host or join first; then who's in the game,
  // their voices and yours; then your boat; the recording camera last.
  const crew: MenuRow[] = [
    { heading: 'Crew (multiplayer)' },
    { label: '', buttons: [{ text: () => h.netStatus() }] },
    {
      label: '',
      buttons: [
        { text: () => (solo() ? 'Host a game' : ''), press: () => h.hostGame() },
        { text: () => (solo() ? '' : h.netRole() === 'host' ? 'Stop hosting' : 'Leave game'), press: () => h.leaveGame() },
      ],
    },
    // Still in a friend's world with nobody else (multiplayer study #11): the way home.
    { label: '', buttons: [{ text: () => (solo() && h.borrowed() ? 'Back to your own game' : ''), press: () => h.leaveGame() }] },
    {
      label: 'Or join: code',
      buttons: [
        { text: () => (solo() ? (h.joinCode() + '_____').slice(0, 5).split('').join(' ') : ''), weight: 1.6 },
        { text: () => (solo() ? 'Join' : ''), active: () => h.joinCode().length === 5, press: () => h.joinGame() },
      ],
    },
    { label: '', buttons: ['1', '2', '3', '4', '5'].map(digit) },
    { label: '', buttons: ['6', '7', '8', '9', '0'].map(digit) },
    { label: '', buttons: [{ text: () => (solo() ? '⌫' : ''), press: () => h.backspace() }] },
    { heading: 'Aboard' },
    ...Array.from({ length: 4 }, (_, i) => member(i)),
    { label: '', buttons: [{ text: () => (h.crewMember(4) ? h.crewList() : '') }] },
    { label: 'Your name', buttons: [{ text: () => h.playerName(), weight: 1.6 }, { text: 'Change', press: () => h.nextPlayerName() }] },
    { label: 'Voice chat', buttons: [choice('On', true, () => h.voiceChat(), (v) => h.setVoiceChat(v)), choice('Off', false, () => h.voiceChat(), (v) => h.setVoiceChat(v))] },
    { label: 'Voice', buttons: [{ text: () => h.voiceStatus(), weight: 2 }] },
    { label: 'Microphone', buttons: [choice('On', false, () => h.micMuted(), (v) => h.setMicMuted(v)), choice('Muted', true, () => h.micMuted(), (v) => h.setMicMuted(v))] },
    ...(MODE === 'voyage' ? yourBoat(h) : []),
    { heading: 'Camera (for recording)' },
    { label: '', buttons: [{ text: () => h.cameraNote() }] },
    { label: 'Be the camera', buttons: [choice('On', true, () => h.camera().on, (v) => h.setCamera(v)), choice('Off', false, () => h.camera().on, (v) => h.setCamera(v))] },
    {
      label: 'Field of view',
      buttons: [
        { text: '−', press: () => h.camera().zoom(-2.5) },
        { text: () => `${Math.round(h.camera().fov)}°`, weight: 1.2 },
        { text: '+', press: () => h.camera().zoom(2.5) },
      ],
    },
    {
      label: 'Flying speed',
      buttons: ['Slow', 'Normal', 'Fast'].map((n, i) =>
        choice(n, i, () => h.camera().speed, (v) => {
          h.camera().speed = v;
        }),
      ),
    },
    {
      label: 'Smoothing',
      buttons: [true, false].map((v) =>
        choice(v ? 'On' : 'Off', v, () => h.camera().smooth, (x) => {
          h.camera().smooth = x;
        }),
      ),
    },
    { label: 'Rides with', buttons: [choice('The boat', true, () => h.camera().rideBoat, (v) => h.setCameraRide(v)), choice('Stays put', false, () => h.camera().rideBoat, (v) => h.setCameraRide(v))] },
    {
      label: 'Clean screen',
      buttons: [true, false].map((v) =>
        choice(v ? 'On' : 'Off', v, () => h.camera().clean, (x) => {
          h.camera().clean = x;
        }),
      ),
    },
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
          // How far the trees are drawn: Auto picks by the device (a Quest near, a desktop far).
          label: 'Trees',
          buttons: (['auto', 'quest', 'desktop'] as const).map((d) => ({
            text: () => (d === 'auto' ? `Auto (${h.treeLevel() === 'desktop' ? 'far' : 'near'})` : d === 'quest' ? 'Near (Quest)' : 'Far (desktop)'),
            active: () => h.treeDetail() === d,
            press: () => h.setTreeDetail(d),
          })),
        },
        {
          label: 'Rescue position',
          buttons: [
            choice('On plotter', false, () => h.plotYourself(), (v) => h.setPlotYourself(v)),
            choice('Plot it yourself', true, () => h.plotYourself(), (v) => h.setPlotYourself(v)),
          ],
        },
        { label: 'Potting (new, in progress)', buttons: [choice('Off', false, () => h.potting(), (v) => h.setPotting(v)), choice('On', true, () => h.potting(), (v) => h.setPotting(v))] },
        { label: 'Debug tab', buttons: [choice('Hidden', false, () => h.debugMenu(), (v) => h.setDebugMenu(v)), choice('Shown', true, () => h.debugMenu(), (v) => h.setDebugMenu(v))] },
        // Credits: the open data a region made from real maps is built from (its licence asks for them).
        ...REGIONS.filter((r) => r.coast).flatMap((r) => [{ heading: `Credits: ${r.name}` }, ...creditLines(r.coast!.pkg.credits).map((t) => ({ heading: t }))]),
        // Voyage's live weather (world/coastWeather.ts): its source asks to be credited.
        ...(MODE === 'voyage' ? [{ heading: CONFIG.liveWeather.credit }] : []),
      ],
    },
  ];

  const turnRow = (label: string, axis: 'pitchDeg' | 'rollDeg' | 'yawDeg'): MenuRow => ({
    label,
    buttons: [
      { text: '−15°', press: () => h.turnHands(axis, -15) },
      { text: () => `${Math.round(h.handTurn()[axis])}°`, weight: 1.2 },
      { text: '+15°', press: () => h.turnHands(axis, 15) },
    ],
  });
  const debug: MenuSection[] = [
    {
      name: 'Hands',
      rows: [
        { heading: 'VR hands on the controllers (tell us the numbers that look right)' },
        turnRow('Pitch (about red X)', 'pitchDeg'),
        turnRow('Roll (about blue Z)', 'rollDeg'),
        turnRow('Yaw (about green Y)', 'yawDeg'),
        { label: '', buttons: [{ text: 'Back to 90 / 0 / 0', press: () => h.turnHands('pitchDeg', null) }] },
        { label: 'Controller axes', buttons: [choice('Shown', true, () => h.handAxes(), (v) => h.setHandAxes(v)), choice('Hidden', false, () => h.handAxes(), (v) => h.setHandAxes(v))] },
        { heading: 'Red X: out of the back of your right hand · Green Y: back along your arm · Blue Z: down the handle' },
      ],
    },
    {
      name: 'World',
      rows: [
        {
          label: 'VR fly',
          buttons: [choice('On', true, () => h.vrFly(), (v) => h.setVrFly(v)), choice('Off', false, () => h.vrFly(), (v) => h.setVrFly(v))],
        },
        { heading: 'VR fly: left stick flies where you look · one trigger fast · both triggers very fast' },
        {
          label: 'Time of day',
          buttons: [
            { text: '−10′', press: () => h.shiftTime(-10 / 60) },
            { text: () => formatHours(h.timeOfDay()), weight: 1.3 },
            { text: '+10′', press: () => h.shiftTime(10 / 60) },
          ],
        },
        // Weather by hand (owner, Oct 2026: off live weather, to test big waves and strong
        // winds; "a wind slider, rain slider and wave height slider"). Each row of stops is a
        // slider: press a stop (it and those below it light); the readout above says where it is.
        // Pressing any of them makes the weather manual; Live / Game's own gives it back.
        { heading: 'Weather' },
        {
          label: '',
          buttons: [
            { text: () => (MODE === 'voyage' ? 'Live weather' : "Game's own"), active: () => h.weatherMode() !== 'manual', press: () => h.setWeatherAuto(), weight: 1.4 },
            { text: 'Manual', active: () => h.weatherMode() === 'manual', press: () => h.setWeatherManual(0, h.windNow()), weight: 1.1 },
            { text: 'Fast ×10', active: () => h.weatherFast(), press: () => h.setWeatherFast(!h.weatherFast()) },
          ],
        },
        {
          label: '',
          buttons: [
            {
              text: () => `Now: wind ${Math.round(h.windNow() / KN)} kn from ${COMPASS[Math.round(h.windFromNow() / 45) % 8]} · rain ${RAIN.reduce((best, r) => (Math.abs(r.v - h.rainNow()) < Math.abs(best.v - h.rainNow()) ? r : best)).name} · waves Hs ${h.waveHeight().toFixed(1)} m`,
              weight: 3,
            },
          ],
        },
        {
          label: 'Wind (kn)',
          buttons: WIND_KN.map((kn) => ({ text: String(kn), active: () => h.windNow() / KN >= kn - 0.5, press: () => h.setWeatherManual(0, kn * KN) })),
        },
        {
          label: 'From',
          buttons: COMPASS.map((d, i) => ({ text: d, active: () => Math.round(h.windFromNow() / 45) % 8 === i, press: () => h.setWeatherManual(1, i * 45) })),
        },
        {
          label: 'Rain',
          buttons: RAIN.map((r) => ({ text: r.name, active: () => h.rainNow() >= r.v - 0.02, press: () => h.setWeatherManual(2, r.v) })),
        },
        {
          label: 'Waves Hs (m)',
          buttons: [
            ...WAVES_M.map((m) => ({ text: String(m), active: () => h.waveHeight() >= m - 0.05, press: () => h.setWeatherManual(3, m) })),
            // The game's biggest sea (CONFIG.ocean.maxSeaScale, Hs about 6 m).
            { text: 'max', active: () => h.waveHeight() >= h.maxWaveHeight() - 0.05, press: () => h.setWeatherManual(3, h.maxWaveHeight()) },
          ],
        },
        // Short, steep seas in enclosed water, long ones in the open (docs/FETCH_SEAS.md): off
        // to compare with the sea as it was, the long waves everywhere.
        { label: 'Short seas', buttons: [choice('By fetch', true, () => h.shortSeas(), (v) => h.setShortSeas(v)), choice('Off (as before)', false, () => h.shortSeas(), (v) => h.setShortSeas(v))] },
        { label: '', buttons: [{ text: () => h.seaHereText(), weight: 3 }] },
        { heading: 'Tidal races' },
        // The flood runs with a race's set, the ebb against it. Overfalls (steep seas) come where
        // the sea runs against the flow: in Sruth Tarsk and the Falls of Lora, on the ebb.
        { label: 'Running', buttons: [choice('By the clock', 0, () => h.raceOverride(), (v) => h.setRaceOverride(v)), choice('Flood', 1, () => h.raceOverride(), (v) => h.setRaceOverride(v)), choice('Ebb', 3, () => h.raceOverride(), (v) => h.setRaceOverride(v)), choice('Slack', 2, () => h.raceOverride(), (v) => h.setRaceOverride(v))] },
        { heading: 'Katabatic gusts' },
        { label: '', buttons: [{ text: 'Gust now (nearest zone)', press: () => h.gustNow() }, { text: () => h.gustStatus(), weight: 1.6 }] },
        { heading: 'Move: to port' },
        // Two to a row, in a scrolling list (a coast map brings dozens of harbours, and long names).
        {
          show: CONFIG.menu.portRows,
          scroll: Array.from({ length: Math.ceil(PORTS.length / 2) }, (_, row) => ({
            label: '',
            buttons: PORTS.slice(row * 2, row * 2 + 2).map((_, k) => ({ text: () => h.ports()[row * 2 + k]?.name ?? '', press: () => h.teleportToPort(row * 2 + k) })),
          })),
        },
        { label: 'To region', buttons: REGIONS.map((r) => ({ text: r.name, press: () => h.teleportToRegion(r.id) })) },
        { label: '', buttons: [{ text: () => (h.aboard() ? 'Leave boat (to the quay)' : 'Board boat (at the helm)'), press: () => h.toggleBoard() }] },
      ],
    },
    {
      name: 'Boat',
      rows: [
        {
          // The fleet (boats/fleet.ts): the game's own boats, designed in the Shipyard (the
          // beginner boat as your career has her kitted out), and the Alaskan 38. The old
          // workboat and landing craft are hidden (owner, Oct 2026; ?boat= still starts them).
          label: 'Start in',
          buttons: [...FLEET.map((f) => choice(f.name, f.id, () => h.homeBoat(), (v) => h.setHomeBoat(v))), choice('Alaskan 38', 'alaskan38', () => h.homeBoat(), (v) => h.setHomeBoat(v))],
        },
        {
          // Multi-boat M2: another boat afloat beside yours, to walk across to and take her helm
          // (Voyage mode only: the owner, Oct 2026: multi-boat is Voyage's to begin with).
          label: 'Second boat',
          buttons: FLEET.map((f) => ({ text: () => (MODE === 'voyage' ? f.name : ''), press: () => MODE === 'voyage' && h.spawnBoat(f.id) })),
        },
        {
          label: 'Hull',
          buttons: [
            { text: 'Drop 4 m', press: () => h.dropBoat() },
            { text: 'Heel 20°', press: () => h.heelBoat() },
            { text: 'Damage', press: () => h.debugDamage() },
            { text: 'On a slip', press: () => h.landOnSlip() },
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
            // A tow of that size, its kind at random (owner: small, medium or large).
            { text: 'Small', press: () => h.towNear('small') },
            { text: 'Medium', press: () => h.towNear('medium') },
            { text: 'Large', press: () => h.towNear('large') },
            { text: 'Ship', press: () => h.towNear('ship') },
            { text: 'Call', press: () => h.towCall() },
            { text: 'End', press: () => h.towEnd() },
          ],
        },
        {
          // Crew transfer to the wind farm (transfer/transfer.ts): a job now, the boat off its landing.
          label: 'Wind farm',
          buttons: [
            { text: 'Call job', press: () => h.transferCall() },
            { text: 'To its landing', press: () => h.transferPlace() },
          ],
        },
        {
          label: 'Potting',
          buttons: [
            { text: 'Pots aboard', press: () => h.potsAboard() },
            { text: 'To a ground', press: () => h.toPottingGround() },
            { text: 'Ready', press: () => h.potsReady() },
            { text: 'Full', press: () => h.potsReady(true) },
            { text: 'On plotter', active: () => h.potsOnPlotter(), press: () => h.togglePotsOnPlotter() },
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
        { label: 'Career', buttons: [{ text: '+£5000, rep', press: () => h.debugCash() }, { text: '+£50,000', press: () => h.debugCash(50000) }] },
        { label: 'Project', buttons: [{ text: 'Stage done', press: () => h.debugProjectStage() }, { text: 'Stage back', press: () => h.debugProjectBack() }] },
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
            { text: 'Region map', active: () => h.regionMap(), press: () => h.toggleRegionMap() },
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
      { name: 'Office', sections: office, hidden: () => MODE === 'voyage' },
      { name: 'Crew', rows: crew },
      { name: 'Settings', sections: settings },
      { name: 'Debug', sections: debug, hidden: () => !h.debugMenu() },
    ],
  };
}

/**
 * Crew > Your boat (multi-boat M3, Voyage mode): launch a boat of your own into the game, one
 * of the fleet or a Shipyard favourite (or her code, typed or pasted), and hand her back. The
 * host puts her at the harbour: moored where her length fits, else at anchor.
 */
function yourBoat(h: MenuHost): MenuRow[] {
  const c = () => h.shipyardCodes();
  const fav = (i: number): MenuRow => ({
    label: '',
    buttons: [
      // Her name only (owner: the figures made the line too long to read here).
      { text: () => c().favouriteAt(i)?.name ?? (i === 0 ? 'None saved in this browser' : ''), weight: 2.6 },
      { text: () => (c().favouriteAt(i) ? 'Launch' : ''), press: () => c().favouriteAt(i) && h.launchBoat(c().favouriteAt(i)!.code) },
    ],
  });
  return [
    { heading: 'Your boat' },
    { label: '', buttons: [{ text: () => h.myBoat(), weight: 2.6 }, { text: () => (h.canHandBack() ? 'Hand her back' : ''), press: () => h.withdrawBoat() }] },
    { label: '', buttons: [{ text: () => (h.lastBoat() ? `Last time: ${h.lastBoat()}` : ''), weight: 2.6 }, { text: () => (h.lastBoat() ? 'Launch again' : ''), press: () => h.launchLast() }] },
    { label: 'Launch', buttons: FLEET.map((f) => ({ text: f.name, press: () => h.launchBoat(f.id) })) },
    { heading: 'Or a Shipyard favourite' },
    ...Array.from({ length: PER_PAGE }, (_, i) => fav(i)),
    {
      label: 'Code',
      buttons: [
        { text: () => groupCode(c().code) || '_ (type it in Office > Your boats, or Paste)', weight: 3.2 },
        { text: 'Paste', press: () => h.pasteCode() },
        { text: () => (c().check().ok ? 'Launch' : ''), active: () => c().check().ok, press: () => c().check().ok && h.launchBoat(c().code) },
      ],
    },
  ];
}

/**
 * Office > Your boats: take a Shipyard boat into the game (shipyard/takeHer.ts). Her
 * favourites, from this browser, at a press each (nothing to paste in VR); or her code,
 * typed on the keypad or pasted (desktop). Either restarts the game in her.
 */
function yourBoats(h: MenuHost): MenuRow[] {
  const c = () => h.shipyardCodes();
  const fav = (i: number): MenuRow => ({
    label: '',
    buttons: [
      { text: () => c().favouriteAt(i)?.name ?? (i === 0 ? 'None saved: in the Shipyard, or Boat > Save her' : ''), weight: 3.2 },
      { text: () => (c().favouriteAt(i) ? h.takeLabel(c().favouriteAt(i)!.code) : ''), press: () => c().favouriteAt(i) && h.takeDesign(c().favouriteAt(i)!.code) },
    ],
  });
  const key = (ch: string) => ({ text: ch, press: () => c().type(ch) });
  return [
    {
      label: 'Now',
      buttons: [
        { text: () => h.boatNow(), weight: 2.4 },
        { text: () => (h.boatNow() === 'The beginner boat' ? '' : 'Back to the beginner boat'), press: () => h.workboatAgain(), weight: 1.4 },
      ],
    },
    { heading: 'Shipyard favourites (saved in this browser)' },
    ...Array.from({ length: PER_PAGE }, (_, i) => fav(i)),
    {
      label: '',
      buttons: [
        { text: '◀', press: () => c().turn(-1) },
        { text: () => `Page ${c().page + 1} of ${c().pages()}`, weight: 2 },
        { text: '▶', press: () => c().turn(1) },
      ],
    },
    { heading: 'Or type her code' },
    {
      label: 'Code',
      buttons: [
        { text: () => groupCode(c().code) || '_', weight: 3.2 },
        { text: () => (c().check().ok ? h.takeLabel(c().code) : ''), active: () => c().check().ok, press: () => c().check().ok && h.takeDesign(c().code) },
      ],
    },
    { label: '', buttons: [{ text: () => c().check().text }] },
    ...[0, 8, 16, 24].map((from): MenuRow => ({ label: '', buttons: ALPHABET.slice(from, from + 8).split('').map(key) })),
    {
      label: '',
      buttons: [
        { text: '⌫', press: () => c().backspace() },
        { text: 'Clear', press: () => c().clear() },
        { text: 'Paste', press: () => h.pasteCode() },
      ],
    },
  ];
}

export function formatHours(t: number): string {
  const total = Math.round((((t % 24) + 24) % 24) * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** A credits line broken at its commas into lines that fit the menu. */
function creditLines(text: string, width = 60): string[] {
  const out: string[] = [];
  let line = '';
  for (const part of text.split(', ')) {
    const next = line ? `${line}, ${part}` : part;
    if (next.length > width && line) {
      out.push(`${line},`);
      line = part;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}
