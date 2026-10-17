import * as THREE from 'three';
import { panelLit } from './panelLighting';
import type { VesselState } from '../vessel/vesselState';
import { Control, type Wiring } from './Control';

/**
 * Ignition key in its lock on the console: a press turns it OFF <-> ON (a quarter turn
 * clockwise, like a car key). Sends `key` 1 / 0. Off stops a running engine.
 */
export class KeySwitch extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Ignition key: on / off';
  private readonly key = new THREE.Group();
  private on = false;

  /** Reads the key, 0 / 1 (default: today's `engine.key`). */
  private readonly read: (s: VesselState) => number;

  constructor(id = 'key', wiring: Wiring = {}) {
    super(id, wiring.channel ?? 'key');
    this.read = wiring.read ?? ((s) => s.engine.key);
    const bezel = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.012, 16), new THREE.MeshLambertMaterial({ color: 0xa8acb0 })));
    bezel.position.y = 0.006;
    // The key: a thin blade in the barrel and a flat bow you'd hold.
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.03, 0.014), this.material(0xc8b060));
    blade.position.y = 0.025;
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.032, 0.04), this.material(0x202326));
    bow.position.y = 0.055;
    this.key.add(blade, bow);
    this.key.position.y = 0.012;
    this.root.add(bezel, this.key);
    this.hitObjects.push(bow, blade, bezel);
    this.show(false);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0.05, 0));
  }

  pressStart(): void {
    this.show(!this.on);
    this.ctx?.haptic(0.5, 30);
    this.ctx?.emit(this.channel, this.on ? 1 : 0);
  }

  private show(on: boolean): void {
    this.on = on;
    this.key.rotation.y = on ? -Math.PI / 2 : 0;
  }

  sync(state: VesselState): void {
    const on = this.read(state) > 0;
    if (on !== this.on) this.show(on);
  }
}

/**
 * Battery selector on the aft wall beside the master: a knob pointing at 1, BOTH or 2. A
 * press steps it 1 -> BOTH -> 2 -> 1. Sends `batSelect` with the new position (3 = both).
 */
export class SelectorSwitch extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Battery selector: 1 / BOTH / 2';
  private readonly knob = new THREE.Group();
  private pos = 1;
  private readonly read: (s: VesselState) => number;

  constructor(id = 'batSelect', wiring: Wiring = {}) {
    super(id, wiring.channel ?? 'batSelect');
    this.read = wiring.read ?? ((s) => s.electrics?.selector ?? 1);
    const plate = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.012), new THREE.MeshLambertMaterial({ color: 0xe8e4d8 })));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.19), panelLit(new THREE.MeshBasicMaterial({ map: selectorLabel(), transparent: true })));
    label.position.z = 0.007;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.02, 16).rotateX(Math.PI / 2), this.material(0x1c1f22));
    disc.position.z = 0.016;
    const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.07, 0.024), this.material(0xc0281c));
    pointer.position.set(0, 0.01, 0.03);
    this.knob.add(disc, pointer);
    this.knob.position.y = -0.02;
    this.root.add(plate, label, this.knob);
    this.hitObjects.push(disc, pointer, plate);
    this.show(1);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, -0.02, 0.03));
  }

  pressStart(): void {
    const next = this.pos === 1 ? 3 : this.pos === 3 ? 2 : 1;
    this.show(next);
    this.ctx?.haptic(0.7, 40);
    this.ctx?.emit(this.channel, next);
  }

  private show(p: number): void {
    this.pos = p;
    // 1 at upper left, BOTH straight up, 2 at upper right.
    this.knob.rotation.z = p === 1 ? Math.PI / 3 : p === 2 ? -Math.PI / 3 : 0;
  }

  sync(state: VesselState): void {
    const p = this.read(state);
    if (p !== this.pos) this.show(p);
  }
}

function selectorLabel(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#111';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 30px system-ui, sans-serif';
  g.fillText('BATTERY', 128, 30);
  g.font = 'bold 40px system-ui, sans-serif';
  g.fillText('1', 50, 120);
  g.fillText('2', 206, 120);
  g.font = 'bold 30px system-ui, sans-serif';
  g.fillText('BOTH', 128, 78);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Warning lamps in front of the ignition, left to right. */
const LAMPS = [
  { name: 'OIL', on: 0xff3020, off: 0x2a0c08 },
  { name: 'CHARGE', on: 0xff3020, off: 0x2a0c08 },
  { name: 'GLOW', on: 0xffa020, off: 0x2a1a06 },
  { name: 'NEUTRAL', on: 0x40e060, off: 0x0c2a12 },
  { name: 'BILGE', on: 0xff3020, off: 0x2a0c08 },
] as const;

/**
 * The engine's warning lamps, as on a real panel: OIL, CHARGE, GLOW, NEUTRAL, BILGE. Each
 * is shown off, on or blinking (`show`); when each lights is decided by whoever writes its
 * bus key (modular/busKeys.ts, the lamp.* keys), not here. Colours change only when a lamp
 * changes. One instanced draw call.
 */
export class WarningLamps {
  readonly root = new THREE.Group();
  /** The lamps: one instanced draw call, a colour per lamp. */
  private readonly lamps: THREE.InstancedMesh;
  private readonly tmpColor = new THREE.Color();
  private shown = '';

  constructor(cfg: { spacing: number; position?: [number, number, number] }) {
    if (cfg.position) this.root.position.fromArray(cfg.position);
    const n = LAMPS.length;
    this.lamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.017, 0.017, 0.01, 14), new THREE.MeshBasicMaterial(), n);
    const m = new THREE.Matrix4();
    LAMPS.forEach((l, i) => {
      this.lamps.setMatrixAt(i, m.makeTranslation((i - (n - 1) / 2) * cfg.spacing, 0.004, 0));
      this.lamps.setColorAt(i, this.tmpColor.setHex(l.off));
    });
    this.root.add(this.lamps);
    const w = cfg.spacing * n;
    // Tilted up 45 degrees toward the helmsman, standing on its near edge, like the dash labels.
    const label = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.03).rotateX(-Math.PI / 4), panelLit(new THREE.MeshBasicMaterial({ map: lampLabels(n), transparent: true })));
    label.position.set(0, 0.002 + 0.015 * Math.SQRT1_2, 0.028 - 0.015 * Math.SQRT1_2);
    this.root.add(label);
  }

  /** Each lamp 'off', 'on' or 'blink' (blinking at 2 Hz), left to right. */
  show(states: readonly string[]): void {
    const blink = Math.floor(performance.now() / 250) % 2 === 0;
    const lit = LAMPS.map((_, i) => states[i] === 'on' || (states[i] === 'blink' && blink));
    const key = lit.map((x) => (x ? 1 : 0)).join('');
    if (key === this.shown) return;
    this.shown = key;
    lit.forEach((on, i) => this.lamps.setColorAt(i, this.tmpColor.setHex(on ? LAMPS[i].on : LAMPS[i].off)));
    this.lamps.instanceColor!.needsUpdate = true;
  }
}

function lampLabels(n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128 * n;
  c.height = 40;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8e2cc';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = 'bold 26px system-ui, sans-serif';
  LAMPS.forEach((l, i) => g.fillText(l.name, 64 + i * 128, 20));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The laminated start-up card by the ignition (drawn once). */
export function checklistCard(cfg: { position: [number, number, number]; width: number; height: number }): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = Math.round((512 * cfg.height) / cfg.width);
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f0e2';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#c0281c';
  g.fillRect(0, 0, c.width, 70);
  g.fillStyle = '#fff';
  g.font = 'bold 40px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('ENGINE START', 24, 36);
  const steps = [
    '1  Battery MASTER on',
    '    (aft wall, by the door)',
    '2  INSTR breaker on',
    '    (panel by the helm)',
    '3  Throttle in NEUTRAL',
    '4  KEY on',
    '5  Wait for the GLOW lamp',
    '    to go out (buzzer sounds)',
    '6  Hold START until she runs',
    '7  CHART, RADIO, NAV LTS',
    '    breakers as needed',
    '',
    'STOP: throttle neutral,',
    '  key off; master off when',
    '  leaving the boat.',
    'Flat battery? Selector to 2.',
  ];
  g.fillStyle = '#1a1a1a';
  g.font = '28px system-ui, sans-serif';
  steps.forEach((t, i) => g.fillText(t, 22, 100 + i * 38));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // On the panel lighting, like the dials: dims at dusk, red at night.
  const card = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width, cfg.height), panelLit(new THREE.MeshBasicMaterial({ map: tex })));
  card.position.fromArray(cfg.position);
  // Upright on the console's aft face, facing the helmsman (+z).
  card.name = 'checklistCard';
  return card;
}
