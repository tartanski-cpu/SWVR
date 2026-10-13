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
  coupling(): number;
  setCoupling(value: number): void;
  smoothWalk(): boolean;
  setSmoothWalk(on: boolean): void;
  snapTurnDeg(): number;
  setSnapTurnDeg(deg: number): void;
  aboard(): boolean;
  toggleBoard(): void;
  dropBoat(): void;
  heelBoat(): void;
  /** Fuel aboard (L) and tank size. */
  fuel(): { litres: number; tank: number };
  /** Whether the boat is at a fuel berth, slow enough to take fuel. */
  canRefuel(): boolean;
  refuelling(): boolean;
  toggleRefuel(): void;
  setFuelDebug(litres: number): void;
  coolingFault(): boolean;
  toggleCoolingFault(): void;
  /** Cargo: where you are, deliveries, payload. */
  cargoStatus(): { port: string | null; delivered: number; payloadT: number; maxT: number };
  /** Cargo in deck slot i, or waiting at this port (row i): label and whether the action is possible now. */
  cargoAboard(i: number): { label: string; ready: boolean } | null;
  cargoWaiting(i: number): { label: string; ready: boolean } | null;
  unloadCargo(i: number): void;
  loadCargo(i: number): void;
  /** Docking: status line, and whether DOCK would do something now (dock or cast off). */
  dockStatus(): { text: string; ready: boolean; docked: boolean };
  toggleDock(): void;
  /** One-line anchor/windlass status. */
  anchorStatus(): string;
  /** Ports with bearing (°T) and range (nm) from the boat. */
  ports(): { name: string; bearingDeg: number; rangeNm: number }[];
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
  const header: MenuRow[] = [{ label: '', buttons: [{ text: 'SWVR menu', weight: 3 }, { text: 'Close ✕', press: () => h.close(), weight: 1.4 }] }];

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
    { heading: 'Sea' },
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
    buttons: [
      { text: () => h.cargoAboard(i)?.label ?? (i === 0 ? 'Deck empty' : ''), weight: 3 },
      {
        text: () => (h.cargoAboard(i) ? (h.cargoAboard(i)!.ready ? 'Skiff ashore' : '—') : ''),
        active: () => h.cargoAboard(i)?.ready ?? false,
        press: () => h.unloadCargo(i),
      },
    ],
  });
  const waitingRow = (i: number): MenuRow => ({
    label: '',
    buttons: [
      { text: () => h.cargoWaiting(i)?.label ?? (i === 0 ? 'Only at an anchorage, anchored in the bay' : ''), weight: 3 },
      {
        text: () => (h.cargoWaiting(i) ? (h.cargoWaiting(i)!.ready ? 'Skiff out' : '—') : ''),
        active: () => h.cargoWaiting(i)?.ready ?? false,
        press: () => h.loadCargo(i),
      },
    ],
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
    { heading: 'Anchorage skiff' },
    ...[0, 1].map(waitingRow),
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
      label: 'Snap turn',
      buttons: [15, 30, 45, 90].map((d) => choice(`${d}°`, d, () => h.snapTurnDeg(), (v) => h.setSnapTurnDeg(v))),
    },
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
      label: 'Engine faults',
      buttons: [
        { text: 'Fuel to 5 %', press: () => h.setFuelDebug(0.05 * h.fuel().tank) },
        { text: 'Pump failure', active: () => h.coolingFault(), press: () => h.toggleCoolingFault() },
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
