import type { MenuRow } from './menuPanel';

/** What the menu can read and change. Implemented by the App; keeps the menu UI-only. */
export interface MenuHost {
  timeOfDay(): number;
  shiftTime(hours: number): void;
  /** Game hours per real second. */
  timeScale(): number;
  setTimeScale(hoursPerSecond: number): void;
  calmSea(): boolean;
  setCalmSea(calm: boolean): void;
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

export function mainMenuRows(h: MenuHost): MenuRow[] {
  const choice = <T>(label: string, value: T, get: () => T, set: (v: T) => void) => ({
    text: label,
    active: () => get() === value,
    press: () => set(value),
  });
  return [
    { label: '', buttons: [{ text: 'SWVR menu', weight: 3 }, { text: 'Close ✕', press: () => h.close(), weight: 1.4 }] },
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
      label: 'Sea state',
      buttons: [choice('Flat calm', true, () => h.calmSea(), (v) => h.setCalmSea(v)), choice('Moderate', false, () => h.calmSea(), (v) => h.setCalmSea(v))],
    },
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
    { heading: 'Boat' },
    {
      label: '',
      buttons: [
        { text: () => (h.aboard() ? 'Leave boat (to platform)' : 'Board boat (at the helm)'), press: () => h.toggleBoard() },
      ],
    },
    {
      label: 'Tests',
      buttons: [
        { text: 'Drop 4 m', press: () => h.dropBoat() },
        { text: 'Heel 20°', press: () => h.heelBoat() },
      ],
    },
    {
      label: 'Sea trials',
      buttons: [{ text: () => (h.seaTrialsShown() ? 'Hide report' : 'Run + show report'), active: () => h.seaTrialsShown(), press: () => h.toggleSeaTrials() }],
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
}

export function formatHours(t: number): string {
  const total = Math.round((((t % 24) + 24) % 24) * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
