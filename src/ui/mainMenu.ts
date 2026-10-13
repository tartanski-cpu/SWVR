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
  /** One-line anchor/windlass status. */
  anchorStatus(): string;
  /** Ports with bearing (°T) and range (nm) from the boat. */
  ports(): { name: string; bearingDeg: number; rangeNm: number }[];
  seaTrialsShown(): boolean;
  toggleSeaTrials(): void;
  debugPanel(): boolean;
  toggleDebugPanel(): void;
  hydroView(): boolean;
  toggleHydroView(): void;
  probes(): boolean;
  toggleProbes(): void;
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
        },
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
    { label: 'Anchor', buttons: [{ text: () => h.anchorStatus() }] },
    {
      label: 'Sea trials',
      buttons: [{ text: () => (h.seaTrialsShown() ? 'Hide report' : 'Run + show report'), active: () => h.seaTrialsShown(), press: () => h.toggleSeaTrials() }],
    },
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

  return {
    header,
    pages: [
      { name: 'Sea & time', rows: seaAndTime },
      { name: 'Boat', rows: boat },
      { name: 'Comfort', rows: comfort },
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
