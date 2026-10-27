/**
 * Name plates in the harbour tug's engine room (owner, 27 Oct 2026: "many of the things are not
 * labeled, so you don't know what's the oil pump ... label everything. Like this is the air
 * compressor, this is the lube oil pumps, and this is the pre-lubing feature"): engraved-style
 * plates, white with black lettering, as engine rooms label their machinery and valves. All on
 * one canvas (an atlas of cells), drawn once; the room places each as a quad (room.ts), one draw
 * call for them all.
 */
import type { Region } from './panels';

/** Each plate: its name, and a second line under it (where it leads, what it does). */
export const LABELS = {
  compressor: ['AIR COMPRESSOR', 'fills the starting air bottles'],
  airBottle: ['STARTING AIR', '30 bar · start needs 12 bar'],
  airValve: ['MAIN AIR VALVE', 'to the main engines\' starters'],
  tankPort: ['FUEL DAY TANK', 'PORT MAIN ENGINE'],
  tankStbd: ['FUEL DAY TANK', 'STBD MAIN ENGINE'],
  outletPort: ['OUTLET VALVE', 'port main engine fuel'],
  outletStbd: ['OUTLET VALVE', 'stbd main engine fuel'],
  strainerPort: ['SEA WATER STRAINER', 'PORT MAIN ENGINE COOLING'],
  strainerStbd: ['SEA WATER STRAINER', 'STBD MAIN ENGINE COOLING'],
  seaPort: ['SEA SUCTION VALVE', 'port main engine'],
  seaStbd: ['SEA SUCTION VALVE', 'stbd main engine'],
  gen1: ['GENERATOR 1', '400 V 50 Hz · in use'],
  gen2: ['GENERATOR 2', 'standby'],
  genFuel: ['GENERATOR 1 FUEL VALVE', 'open before START'],
  genStart: ['GENERATOR 1', 'START / STOP'],
  stand: ['PRE-LUBE PUMP     START     STOP', 'lube oil pump: run until 1 bar, then START'],
  valveChest: ['BILGE & BALLAST VALVE CHEST', ''],
  bilgePump: ['BILGE PUMP', ''],
} as const;

export type LabelName = keyof typeof LABELS;

/** The atlas: cells of `CELL` px, two across. */
export const LABEL_SIZE = [1024, 1024] as const;
const CELL = [512, 96] as const;
/** A plate's width over its height (its quads keep it). */
export const LABEL_ASPECT = CELL[0] / CELL[1];

/** Each plate's cell on the atlas. */
export function labelRegion(name: LabelName): Region {
  const i = Object.keys(LABELS).indexOf(name);
  return { x: (i % 2) * CELL[0], y: Math.floor(i / 2) * CELL[1], w: CELL[0], h: CELL[1] };
}

/** Draw every plate on the atlas canvas. */
export function drawLabels(canvas: HTMLCanvasElement): void {
  [canvas.width, canvas.height] = LABEL_SIZE;
  const g = canvas.getContext('2d');
  if (!g) return;
  for (const name of Object.keys(LABELS) as LabelName[]) {
    const r = labelRegion(name);
    const [title, sub] = LABELS[name];
    g.fillStyle = '#f2f1ea';
    g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    g.strokeStyle = '#1a1d1f';
    g.lineWidth = 4;
    g.strokeRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
    g.fillStyle = '#111416';
    g.textAlign = 'center';
    if (name === 'stand') {
      // Its three words over its three controls: 0.13 m apart on a 0.42 m plate.
      const step = (0.13 / 0.42) * r.w;
      g.font = 'bold 26px sans-serif';
      ['PRE-LUBE PUMP', 'START', 'STOP'].forEach((word, k) => g.fillText(word, r.x + r.w / 2 + (k - 1) * step, r.y + 46, step - 8));
      g.font = '20px sans-serif';
      g.fillText(sub, r.x + r.w / 2, r.y + 78, r.w - 30);
      continue;
    }
    g.font = `bold ${sub ? 34 : 38}px sans-serif`;
    g.fillText(title, r.x + r.w / 2, r.y + (sub ? 48 : 62), r.w - 30);
    if (sub) {
      g.font = '600 26px sans-serif';
      g.fillText(sub, r.x + r.w / 2, r.y + 80, r.w - 30);
    }
    g.textAlign = 'left';
  }
}
