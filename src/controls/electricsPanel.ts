import * as THREE from 'three';
import { clamp } from '../core/math';
import type { VesselState } from '../vessel/vesselState';
import { Control } from './Control';

/**
 * Battery master switch: the big red key on a yellow plate, low on the aft wall by the door
 * (where the engine-room switch is on a real boat), so you have to walk to it. A press
 * turns it a quarter turn: OFF (key across) / ON (key up). Sends `master` 1 / 0.
 */
export class MasterSwitch extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Battery master: on / off';
  private readonly key = new THREE.Group();
  private on = false;

  constructor() {
    super('master', 'master');
    // Plate faces +z in its own frame (the root is turned to face into the wheelhouse).
    const plate = this.fixed(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.012), new THREE.MeshLambertMaterial({ color: 0xe0b020 })));
    const boss = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.025, 16).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1c1f22 })));
    boss.position.z = 0.018;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.06), new THREE.MeshBasicMaterial({ map: plateLabel(), transparent: true }));
    label.position.set(0, 0.068, 0.007);
    // The key: a red bar with a round grip, turning about the plate normal.
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.028, 0.03), this.material(0xc0281c));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.035, 12).rotateX(Math.PI / 2), this.material(0xc0281c));
    this.key.position.z = 0.045;
    this.key.add(bar, hub);
    this.root.add(plate, boss, label, this.key);
    this.hitObjects.push(bar, hub, plate);
    this.show(false);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0, 0.045));
  }

  pressStart(): void {
    this.show(!this.on);
    this.ctx?.haptic(0.8, 50);
    this.ctx?.emit(this.channel, this.on ? 1 : 0);
  }

  private show(on: boolean): void {
    this.on = on;
    this.key.rotation.z = on ? Math.PI / 2 : 0; // ON: key turned up
  }

  sync(state: VesselState): void {
    const on = (state.electrics?.master ?? 1) > 0.5;
    if (on !== this.on) this.show(on);
  }
}

/** "BATTERY MASTER  OFF / ON" lettering for the plate (drawn once). */
function plateLabel(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 104;
  const g = c.getContext('2d')!;
  g.fillStyle = '#111';
  g.font = 'bold 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('BATTERY MASTER', 128, 26);
  g.font = 'bold 26px system-ui, sans-serif';
  g.fillText('OFF  ↔   ↕  ON', 128, 76);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The electrics panel on the starboard wall by the helm. For now its voltmeter: a dial
 * (8-16 V, printed once) and a needle that swings to the bus voltage - no texture uploads.
 * Wired straight to the bus (not through a breaker), so it reads 0 with the master off.
 * The breakers join it in the next milestone.
 */
export class ElectricsPanel {
  readonly root = new THREE.Group();
  private readonly needle = new THREE.Group();
  private shown = 0;

  constructor(cfg: { position: [number, number, number]; width: number; height: number; tiltDeg: number }) {
    this.root.position.fromArray(cfg.position);
    // Face inboard (-x) from the starboard wall, tilted back so the face looks up at you.
    this.root.rotation.set((-cfg.tiltDeg * Math.PI) / 180, -Math.PI / 2, 0, 'YXZ');
    // A wedge-ish housing: the sloping face plus a block behind it down to the wall.
    const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.width, cfg.height, 0.12), new THREE.MeshLambertMaterial({ color: 0x2a2f33 }));
    body.position.z = -0.06;
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.075, 32), new THREE.MeshBasicMaterial({ map: dialFace() }));
    face.position.set(-cfg.width / 2 + 0.1, cfg.height / 2 - 0.1, 0.001);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.06, 0.002).translate(0, 0.03, 0), new THREE.MeshBasicMaterial({ color: 0xff3a20 }));
    this.needle.position.copy(face.position).setZ(0.003);
    this.needle.add(needle);
    this.root.add(body, face, this.needle);
    this.setNeedle(0);
  }

  /** Smoothly follow the bus voltage (a real meter's movement takes a moment). */
  update(state: VesselState, dt: number): void {
    const v = state.electrics?.volts ?? 0;
    this.shown += (v - this.shown) * Math.min(1, dt * 4);
    this.setNeedle(this.shown);
  }

  private setNeedle(volts: number): void {
    // 8 V at -120°, 16 V at +120° (clockwise from up is negative z-rotation).
    const f = clamp((volts - 8) / 8, -0.05, 1.05);
    this.needle.rotation.z = (120 - 240 * f) * (Math.PI / 180);
  }
}

/** Voltmeter dial: 8-16 V scale, red below 11.5, green 12.4-14.4 (drawn once). */
function dialFace(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f2efe6';
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  g.fill();
  const cx = S / 2;
  const cy = S / 2;
  const ang = (v: number) => (-90 - 120 + ((v - 8) / 8) * 240) * (Math.PI / 180);
  const band = (a: number, b: number, color: string) => {
    g.strokeStyle = color;
    g.lineWidth = 16;
    g.beginPath();
    g.arc(cx, cy, 96, ang(a), ang(b));
    g.stroke();
  };
  band(8, 11.5, '#d03a2a');
  band(12.4, 14.4, '#3aa04a');
  g.strokeStyle = '#111';
  g.fillStyle = '#111';
  g.font = 'bold 26px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let v = 8; v <= 16; v++) {
    const a = ang(v);
    g.lineWidth = v % 2 === 0 ? 5 : 3;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 104, cy + Math.sin(a) * 104);
    g.lineTo(cx + Math.cos(a) * (v % 2 === 0 ? 82 : 90), cy + Math.sin(a) * (v % 2 === 0 ? 82 : 90));
    g.stroke();
    if (v % 2 === 0) g.fillText(String(v), cx + Math.cos(a) * 64, cy + Math.sin(a) * 64);
  }
  g.font = 'bold 30px system-ui, sans-serif';
  g.fillText('VOLTS', cx, cy + 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
