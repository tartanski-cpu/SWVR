/**
 * The controls of the harbour tug's start-up (owner, 27 Oct 2026; the procedure and what each
 * does: plant/plant.ts): ordinary controls (a press through the interaction system, to the host
 * as `er.<what>`), placed on the machinery they work, in her axes:
 *   the control room's switchboard: the battery master, the generator breaker, the fuel supply
 *     pump and the control place (LOCAL / CONTROL ROOM / BRIDGE);
 *   the generator (to port, aft): its fuel valve and START / STOP;
 *   the day tanks: each engine's outlet valve; the air bottles: the main air valve and the
 *     compressor's switch; the sea water strainers: each engine's sea suction valve;
 *   each engine's own panel: its pre-lube pump, START and STOP.
 * Built with the room the first time someone goes below; worked only while you're down there.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Button } from '../../../controls/Button';
import { Control } from '../../../controls/Control';
import { MasterSwitch } from '../../../controls/batteryMaster';
import { Toggle } from '../../../controls/Toggle';
import type { PlantState, VesselState } from '../../../vessel/vesselState';
import type { EngineRoomPlan } from '../plan';
import type { V3 } from './kit';
import type { TugLayout } from './layout';
import { MSB_CUBICLES } from './panels';

/** The main switchboard's face (room.ts draws it): its left end and width (m), along her. */
export function msbFace(t: TugLayout): { x0: number; w: number } | null {
  const e = t.ecr;
  return e ? { x0: e.x0 + 0.12, w: e.x1 - 0.5 - (e.x0 + 0.1) - 0.04 } : null;
}

/** The middle (x) of the switchboard cubicle that holds a control. */
function msbCubicle(t: TugLayout, control: string): number {
  const f = msbFace(t)!;
  const i = MSB_CUBICLES.findIndex((c) => c.control === control);
  return f.x0 + ((i + 0.5) * f.w) / MSB_CUBICLES.length;
}

/** Which way a control faces (out of the surface it's on). */
export type Facing = '+x' | '-x' | '+z' | '-z' | '+y';

/** Turn a control built facing up (+y, as the game's switches and buttons are) to face `f`. */
function face(c: Control, f: Facing, at: V3): Control {
  c.root.position.set(...at);
  if (f === '+z') c.root.rotation.x = Math.PI / 2;
  else if (f === '-z') c.root.rotation.x = -Math.PI / 2;
  else if (f === '+x') c.root.rotation.z = -Math.PI / 2;
  else if (f === '-x') c.root.rotation.z = Math.PI / 2;
  return c;
}

const plantOf = (s: VesselState): PlantState | undefined => s.plant;

/**
 * A valve with a handwheel (owner's procedure: "turn the fuel"): a press opens it if it's shut
 * and shuts it if it's open. The wheel turns as it goes, and its spindle rises out of the bonnet
 * when it's open (a rising-stem valve: how an engineer sees at a glance which way it stands).
 * Built with its wheel facing +y, turned to face its way by `face`.
 */
export class Valve extends Control {
  readonly kind = 'press' as const;
  private readonly wheel = new THREE.Group();
  private readonly spindle: THREE.Mesh;
  private open = 0;
  /** Its shown opening, 0..1, eased toward `open` (the wheel turning). */
  private shown = 0;

  constructor(
    id: string,
    channel: string,
    private readonly name: string,
    private readonly read: (s: VesselState) => number,
    wheelColour = 0xb52a20,
    private readonly r = 0.09,
  ) {
    super(id, channel);
    // Its bonnet.
    const bonnet = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.36, r * 0.6, 10).translate(0, r * 0.3, 0), new THREE.MeshLambertMaterial({ color: 0x6f767b })));
    this.spindle = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.08, r * 0.08, r * 0.9, 8).translate(0, r * 0.45, 0), new THREE.MeshLambertMaterial({ color: 0xd8d4c4 }));
    // The handwheel: its rim, two spokes across and its hub, one mesh (one draw call).
    const wheel = new THREE.Mesh(
      mergeGeometries([
        new THREE.TorusGeometry(r, r * 0.13, 6, 18).rotateX(Math.PI / 2).toNonIndexed(),
        new THREE.BoxGeometry(2 * r, r * 0.12, r * 0.12).toNonIndexed(),
        new THREE.BoxGeometry(r * 0.12, r * 0.12, 2 * r).toNonIndexed(),
        new THREE.CylinderGeometry(r * 0.2, r * 0.2, r * 0.25, 10).toNonIndexed(),
      ]),
      this.material(wheelColour),
    );
    this.wheel.position.y = r * 0.75;
    this.wheel.add(wheel);
    this.root.add(bonnet, this.spindle, this.wheel);
    this.hitObjects.push(wheel);
    this.show();
  }

  get label(): string {
    return `${this.name}: ${this.open ? 'open' : 'shut'}, press to ${this.open ? 'shut' : 'open'}`;
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(this.wheel.position);
  }

  pressStart(): void {
    this.open = this.open ? 0 : 1;
    this.markPending();
    this.ctx?.haptic(0.5, 60);
    this.ctx?.emit(this.channel, this.open);
  }

  sync(state: VesselState): void {
    const v = this.read(state) > 0.5 ? 1 : 0;
    if (!this.awaiting(v === this.open)) this.open = v;
  }

  tick(dt: number): void {
    if (this.shown === this.open) return;
    // (About a second from shut to open: a few turns of the wheel.)
    this.shown = this.open > this.shown ? Math.min(this.open, this.shown + dt) : Math.max(this.open, this.shown - dt);
    this.show();
  }

  private show(): void {
    this.wheel.rotation.y = -this.shown * Math.PI * 6;
    this.wheel.position.y = this.r * (0.75 + 0.5 * this.shown);
    this.spindle.position.y = this.r * 0.5 * this.shown;
  }
}

/** Where the room's controls go: from its plan and layout, and each engine's own panel (from the room's drawing). */
export interface ControlPlaces {
  /** Each engine's local panel (on its stand): its centre and which way it faces (port engine first). */
  lops: { at: V3; facing: '+x' | '-x' }[];
}

/** The start-up's controls, placed in her room. */
export function tugControls(p: EngineRoomPlan, t: TugLayout, places: ControlPlaces): Control[] {
  const out: Control[] = [];
  const sole = p.sole;
  const add = (c: Control, f: Facing, at: V3) => out.push(face(c, f, at));
  const pl = (f: (q: PlantState) => number) => (s: VesselState) => {
    const q = plantOf(s);
    return q ? f(q) : 0;
  };

  // ── The control room's switchboard (its face toward +z, along the forward bulkhead) ──
  if (t.ecr) {
    const e = t.ecr;
    const zFace = e.z0 + 0.5;
    // Each in its own cubicle, named on a plate under it (panels.ts MSB_CUBICLES), at a hand's height.
    const row = sole + 0.99;
    add(new MasterSwitch('er.master', { channel: 'master' }), '+z', [msbCubicle(t, 'master'), row, zFace + 0.005]);
    add(new Toggle('er.genBreaker', 'er.genBreaker', 'Generator 1 breaker: close / open', pl((q) => q.genBreaker)), '+z', [msbCubicle(t, 'er.genBreaker'), row, zFace]);
    add(new Toggle('er.fuelPump', 'er.fuelPump', 'Fuel supply pump (fuel pressure to both main engines): on / off', pl((q) => q.fuelPump)), '+z', [msbCubicle(t, 'er.fuelPump'), row, zFace]);
    add(new Toggle('er.place', 'er.place', 'Engine control: LOCAL / CONTROL ROOM / BRIDGE', pl((q) => q.place), 3), '+z', [msbCubicle(t, 'er.place'), row, zFace]);
  }

  // ── The generator (the port one; the starboard one is the standby) ──
  const g = [...t.gensets].sort((a, b) => a.x - b.x)[0];
  if (g) {
    // Its fuel valve on its supply line by its forward end, outboard; START / STOP on the side of
    // its control box toward the aisle between the two (its aft face is hard against the bulkhead).
    add(new Valve('er.genFuel', 'er.genFuel', 'Generator fuel valve', pl((q) => q.genFuel), 0xe2b21c, 0.07), '+y', [g.x - 0.55, sole + 0.12, g.z0 + 0.3]);
    add(new Button('er.genStart', 'er.genStart', 'Generator: START / STOP', 'pulse', 0x2f9a48, (s) => plantOf(s)?.gen === 'running'), '+x', [g.x + 0.205, sole + 1.08, g.z1 - 0.3]);
  }

  // ── The day tanks: each engine's outlet valve, at the tank's foot (port engine's on the inboard tank) ──
  const tanks = [...t.dayTanks].sort((a, b) => a.x0 - b.x0);
  tanks.forEach((tk, i) => {
    const k = i + 1;
    add(new Valve(`er.dayValve${k}`, `er.dayValve${k}`, `Day tank valve, ${k === 1 ? 'port' : 'starboard'} engine`, pl((q) => q.dayValve[i]), 0xe2b21c, 0.07), '+z', [(tk.x0 + tk.x1) / 2, sole + 0.35, tk.z1 + 0.05]);
  });

  // ── The air bottles: the main air valve on the forward one; the compressor's switch on its motor ──
  const r0 = t.receivers[0];
  if (r0) add(new Valve('er.airValve', 'er.airValve', 'Starting air main valve', pl((q) => q.airValve), 0xb52a20, 0.06), '+y', [r0.x, sole + 1.72, r0.z]);
  if (t.compressor) add(new Toggle('er.compressor', 'er.compressor', 'Air compressor (fills the starting air bottles): on / off', pl((q) => q.compressor)), '+z', [t.compressor.x - 0.2, sole + 0.6, t.compressor.z + 0.2]);

  // ── The sea water strainers (port side): each engine's sea suction valve, aft one the port engine's ──
  const strainers = [...t.strainers].sort((a, b) => a.z - b.z);
  strainers.forEach((st, i) => {
    const k = i + 1;
    add(new Valve(`er.sea${k}`, `er.sea${k}`, `Sea suction valve, ${k === 1 ? 'port' : 'starboard'} engine`, pl((q) => q.sea[i]), 0x3f8a52, 0.08), '+y', [st.x + 0.05, sole + 0.72, st.z + 0.28]);
  });

  // ── Each engine's local control stand: its pre-lube pump, START and STOP, under its panel ──
  places.lops.forEach((l, i) => {
    const k = i + 1;
    const n = k === 1 ? 'Port engine' : 'Starboard engine';
    const out1 = l.facing === '+x' ? 1 : -1;
    const x = l.at[0] + out1 * 0.005;
    const y = l.at[1] - 0.26;
    // Left to right as you face it: pre-lube, START, STOP (facing +x, your left is +z).
    const dz = l.facing === '+x' ? -0.13 : 0.13;
    add(new Toggle(`er.prelube${k}`, `er.prelube${k}`, `${n}: pre-lube pump (lube oil pressure before starting) on / off`, pl((q) => q.prelube[i])), l.facing, [x, y, l.at[2] - dz]);
    add(new Button(`er.start${k}`, `er.start${k}`, `${n}: START (local)`, 'pulse', 0x2f9a48, (s) => (i === 0 ? s.engine : s.engine.stbd)?.phase === 'running'), l.facing, [x, y, l.at[2]]);
    add(new Button(`er.stop${k}`, `er.stop${k}`, `${n}: STOP (local)`, 'pulse', 0xb52a20), l.facing, [x, y, l.at[2] + dz]);
  });
  return out;
}
