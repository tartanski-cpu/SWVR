/**
 * Small gear the crew handles on transit jobs (duties):
 *   FenderBasket  a basket of fenders on the aft deck; a press puts all six out over the
 *                 side or takes them in (`fenders`). FendersView draws them (one instanced
 *                 draw call): hanging outside the hull when out, lying along the bulwark in.
 *   EngineHatch   the hatch in the wheelhouse floor over the engine (aft starboard): a
 *                 press on its lifting ring opens or shuts it (`engineHatch`).
 *   Dipstick      on the engine's inboard side, under the hatch: a press pulls it and reads
 *                 the oil (`dipstick`; the App says what it shows).
 *   OilCan        on a shelf beside the engine: a press tops the sump up (`oilTopUp`).
 * The dipstick and the can only work with the hatch open.
 *   Cleat         a horn cleat on the bulwark top, forward and aft on each side (owner
 *                 request: these replace the DOCK button). Alongside a berth, a press sends
 *                 its line ashore to the nearest bollard; a press with the line fast lets it
 *                 go (`cleat`, value = which cleat). A few turns of rope show on it while fast.
 */
import * as THREE from 'three';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { withPixelPaint } from '../render/pixelPaint';
import type { VesselState } from '../vessel/vesselState';
import { FENDER_HANG } from '../vessel/physics/guards';
import { Control, type Wiring } from './Control';

export class FenderBasket extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Fenders: out / in';
  private out = false;
  private readonly read: (s: VesselState) => number;

  constructor(id = 'fenders', wiring: Wiring = {}) {
    super(id, wiring.channel ?? 'fenders');
    this.read = wiring.read ?? ((s) => s.controls.fenders);
    const basket = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.35, 10, 1, true).translate(0, 0.175, 0), new THREE.MeshLambertMaterial({ color: 0x3a3f44, side: THREE.DoubleSide })));
    // A couple of fenders poking out of it (while they're in).
    const f = new THREE.Mesh(
      mergeParts([part(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8).translate(-0.06, 0.4, 0), 0x1a3a6a), part(new THREE.CapsuleGeometry(0.09, 0.3, 4, 8).rotateZ(0.3).translate(0.07, 0.38, 0.04), 0x1a3a6a)]),
      flatVertexColorMaterial(),
    );
    this.root.add(basket, f);
    this.hitObjects.push(f, basket);
    this.show(false);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0.3, 0));
  }

  pressStart(): void {
    this.show(!this.out);
    this.ctx?.haptic(0.5, 40);
    this.ctx?.emit(this.channel, this.out ? 1 : 0);
  }

  private show(out: boolean): void {
    this.out = out;
    // The fenders in the basket are hidden while they're over the side.
    (this.root.children[1] as THREE.Object3D).visible = !out;
  }

  sync(state: VesselState): void {
    const out = this.read(state) > 0;
    if (out !== this.out) this.show(out);
  }
}

/** The six fenders, out over the side or stowed along the bulwark (one instanced draw call). */
export class FendersView {
  readonly mesh: THREE.InstancedMesh;
  private shown = -1;
  private readonly spots: { z: number; side: number; halfBeam: number; deckY: number }[] = [];

  constructor(zs: readonly number[], plan: { halfBeam(z: number): number; deckY(z: number): number }) {
    // The fender and its line up to the rail (visible from on board; laid out on deck when stowed).
    const geo = mergeParts([part(new THREE.CapsuleGeometry(FENDER_HANG.radius, 0.45, 4, 8), 0x1a3a6a), part(new THREE.CylinderGeometry(0.008, 0.008, 0.95).translate(0, 0.8, 0), 0xe8e0c8)]);
    for (const side of [-1, 1]) for (const z of zs) this.spots.push({ z, side, halfBeam: plan.halfBeam(z), deckY: plan.deckY(z) });
    this.mesh = new THREE.InstancedMesh(geo, flatVertexColorMaterial(), this.spots.length);
    this.mesh.name = 'fenders';
    this.update(false); // stowed until told otherwise (the Shipyard's preview never updates her)
  }

  /** @param over  the fenders are out over the side */
  update(over: boolean): void {
    const out = over ? 1 : 0;
    if (out === this.shown) return;
    this.shown = out;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    this.spots.forEach((s, i) => {
      if (out) {
        // Hanging on their lines just outside the hull, below the sheer.
        m.compose(new THREE.Vector3(s.side * (s.halfBeam + FENDER_HANG.off), s.deckY - FENDER_HANG.drop, s.z), q.identity(), one);
      } else {
        // Lying fore-and-aft on deck against the bulwark.
        q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
        m.compose(new THREE.Vector3(s.side * (s.halfBeam - 0.25), s.deckY + 0.12, s.z), q, one);
      }
      this.mesh.setMatrixAt(i, m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * The engine hatch: a floor panel hinged along its outboard edge. A press on the lifting
 * ring (or anywhere on it) swings it up to stand against the starboard wall, or down shut,
 * over about half a second. Its root is the hinge: on the floor at the outboard edge,
 * the panel running inboard (-x) from it, `length` fore-aft (z) centred on the root.
 */
export class EngineHatch extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Engine hatch: open / shut';
  private readonly lid = new THREE.Group();
  private open = 0;
  private target = 0;
  private pressed = false;

  private readonly read: (s: VesselState) => number;

  constructor(width: number, length: number, id = 'engineHatch', wiring: Wiring = {}) {
    super(id, wiring.channel ?? 'engineHatch');
    this.read = wiring.read ?? ((s) => s.controls.engineHatch ?? 0);
    // The panel: chequer-plate grey, its top flush with the floor, with a flush lifting ring
    // near the inboard edge (yellow, so you can find it).
    const plate = new THREE.Mesh(mergeParts([part(new THREE.BoxGeometry(width, 0.035, length).translate(-width / 2, -0.0175, 0), 0xffffff, 'chequer')]), withPixelPaint(this.material(0x8a9096)));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 14).rotateX(Math.PI / 2).translate(-width + 0.09, 0.004, 0), this.material(0xe8c020));
    // Two hinge knuckles on the outboard edge.
    const hinges = new THREE.Mesh(
      mergeParts([-1, 1].map((s) => part(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 8).rotateX(Math.PI / 2).translate(0, 0, s * (length / 2 - 0.12)), 0x3a3f44))),
      flatVertexColorMaterial(),
    );
    this.lid.add(plate, ring);
    this.root.add(this.lid, hinges);
    this.hitObjects.push(ring, plate);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(-0.3, 0, 0));
  }

  pressStart(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.target = this.target > 0.5 ? 0 : 1;
    this.markPending();
    this.ctx?.haptic(0.6, 50);
    this.ctx?.emit(this.channel, this.target);
  }

  pressEnd(): void {
    this.pressed = false;
  }

  /** Open (or opening). */
  get isOpen(): boolean {
    return this.target > 0.5;
  }

  sync(state: VesselState): void {
    const open = this.read(state) > 0.5 ? 1 : 0;
    if (this.awaiting(open === this.target)) return;
    this.target = open;
  }

  tick(dt: number): void {
    super.tick(dt);
    if (this.open === this.target) return;
    this.open += Math.sign(this.target - this.open) * Math.min(Math.abs(this.target - this.open), dt * 2);
    // Up to just short of vertical, leaning a little inboard so it stays open against its stop.
    this.lid.rotation.z = -this.open * (Math.PI / 2 - 0.05);
  }
}

export class Dipstick extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Dipstick: check the oil';
  private readonly stick = new THREE.Group();
  private pulled = 0;

  constructor(id = 'dipstick', wiring: Wiring = {}) {
    super(id, wiring.channel ?? 'dipstick');
    const tube = this.fixed(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12).translate(0, 0.06, 0), new THREE.MeshLambertMaterial({ color: 0x2a2e32 })));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), this.material(0xe8c020));
    ring.position.y = 0.16;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.3).translate(0, -0.02, 0), this.material(0xb0b4b8));
    this.stick.add(ring, rod);
    this.root.add(tube, this.stick);
    this.hitObjects.push(ring, tube);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0.16, 0));
  }

  pressStart(): void {
    this.pulled = 1.2; // out for a moment to read, then back in
    this.ctx?.haptic(0.4, 40);
    this.ctx?.emit(this.channel, 1);
  }

  sync(): void {}

  tick(dt: number): void {
    super.tick(dt);
    this.pulled = Math.max(0, this.pulled - dt);
    this.stick.position.y = this.pulled > 0 ? 0.22 : 0;
  }
}

export class OilCan extends Control {
  readonly kind = 'press' as const;
  readonly label = 'Oil can: top up the engine oil';

  constructor(id = 'oilTopUp', wiring: Wiring = {}) {
    super(id, wiring.channel ?? 'oilTopUp');
    const can = new THREE.Mesh(
      mergeParts([part(new THREE.BoxGeometry(0.16, 0.24, 0.1).translate(0, 0.12, 0), 0xc0281c), part(new THREE.CylinderGeometry(0.02, 0.02, 0.05).translate(0.04, 0.265, 0), 0xe8c020), part(new THREE.BoxGeometry(0.03, 0.06, 0.08).translate(-0.05, 0.27, 0), 0x2a2a2a)]),
      flatVertexColorMaterial(),
    );
    this.root.add(can);
    this.hitObjects.push(can);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0.15, 0));
  }

  pressStart(): void {
    this.ctx?.haptic(0.4, 60);
    this.ctx?.emit(this.channel, 1);
  }

  sync(): void {}
}

/**
 * A mooring cleat: 0 forward port, 1 forward starboard, 2 aft port, 3 aft starboard (the
 * order vessel/physics/mooring.ts toggleCleat uses). Its root sits on the bulwark top, the
 * horns running fore and aft. Galvanised grey; the rope turns (line-coloured) show while its
 * end's line is fast on this side.
 */
export class Cleat extends Control {
  readonly kind = 'press' as const;
  readonly label: string;
  private readonly turns: THREE.Mesh;
  private fast = false;
  private pressed = false;
  /** The skiff's painter is on this cleat (set each frame from her state, before sync). */
  painterOn = false;

  /**
   * `index` 0-3: a mooring cleat (channel 'cleat'); 4-5: a midship cleat, for the skiff's
   * painter only (channel 'painterCleat'); -1: the skiff's own bow cleat (channel
   * `<skiffId>:painter`). Its value on press is its index.
   */
  constructor(
    readonly index: number,
    opts: { id?: string; channel?: string; label?: string } = {},
  ) {
    super(opts.id ?? `cleat${index}`, opts.channel ?? 'cleat');
    this.label = opts.label ?? `${index < 2 ? 'Bow' : 'Stern'} line (${index % 2 === 0 ? 'port' : 'starboard'} cleat): make fast / let go`;
    const body = new THREE.Mesh(
      mergeParts([
        part(new THREE.BoxGeometry(0.09, 0.012, 0.16).translate(0, 0.006, 0), 0x6a7076), // base plate
        ...[-1, 1].map((s) => part(new THREE.CylinderGeometry(0.018, 0.024, 0.05, 8).translate(0, 0.037, s * 0.045), 0x8a9096)), // the two legs
        part(new THREE.CapsuleGeometry(0.017, 0.24, 3, 8).rotateX(Math.PI / 2).translate(0, 0.07, 0), 0x8a9096), // the horns
      ]),
      flatVertexColorMaterial(),
    );
    // A figure-of-eight of rope: two crossed turns round the horns and legs.
    this.turns = new THREE.Mesh(
      mergeParts([0.5, -0.5].map((a) => part(new THREE.TorusGeometry(0.075, 0.014, 5, 14).scale(0.45, 1, 1).rotateY(a).rotateX(Math.PI / 2).translate(0, 0.055, 0), 0xe0d2a0))),
      flatVertexColorMaterial(),
    );
    this.turns.visible = false;
    this.root.add(body, this.turns);
    this.hitObjects.push(body, this.turns);
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(new THREE.Vector3(0, 0.05, 0));
  }

  pressStart(): void {
    if (this.pressed) return;
    this.pressed = true;
    this.ctx?.haptic(0.5, 40);
    this.ctx?.emit(this.channel, this.index);
  }

  pressEnd(): void {
    this.pressed = false;
  }

  sync(state: VesselState): void {
    let fast = this.painterOn;
    if (this.index < 0) fast = !!state.tender?.painter; // her bow cleat: the painter's on
    else if (this.index < 4) {
      const m = state.mooring;
      const end = this.index < 2 ? m.bow : m.stern;
      fast ||= m.phase !== 'free' && end === (this.index % 2 === 0 ? -1 : 1);
    }
    if (fast !== this.fast) this.turns.visible = this.fast = fast;
  }
}
