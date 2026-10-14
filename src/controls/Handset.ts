import * as THREE from 'three';
import type { VesselState } from '../vessel/vesselState';
import { Control, type Pointer } from './Control';

/**
 * The radio handset. Grab it off its clip (VR grip, or click on the desktop) and it's in
 * your hand: picking it up sends 'rescueHandset' 1, which answers a distress call. Let go
 * and it springs back onto the clip. A coiled cord follows it from the radio.
 *
 * Positions are in the control's root frame (the clip), which hangs off the radio.
 */
export class Handset extends Control {
  readonly kind = 'grab' as const;
  readonly label = 'Radio handset';
  private readonly body = new THREE.Group();
  private readonly cord: THREE.Line;
  private readonly cordPts: THREE.Vector3[] = [];
  /** Where the cord leaves the radio, in this root's frame. */
  private readonly cordStart: THREE.Vector3;
  private lifted = false;
  private readonly tmp = new THREE.Vector3();

  constructor(id: string, cordStart: THREE.Vector3) {
    super(id, 'rescueHandset');
    this.cordStart = cordStart.clone();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.035), this.material(0x22262a));
    const ptt = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.04, 0.02), this.material(0x555c62));
    ptt.position.set(-0.03, 0.01, 0);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.002), new THREE.MeshLambertMaterial({ color: 0x0c0d0e }));
    grille.position.set(0, 0.045, 0.018);
    this.body.add(shell, ptt, grille);
    this.root.add(this.body);
    this.hitObjects.push(shell);
    for (let i = 0; i < 14; i++) this.cordPts.push(new THREE.Vector3());
    this.cord = new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.cordPts), new THREE.LineBasicMaterial({ color: 0x15171a }));
    this.cord.frustumCulled = false;
    this.root.add(this.cord);
    this.layCord();
  }

  distanceTo(world: THREE.Vector3): number {
    return this.toLocal(world).distanceTo(this.body.position);
  }

  grabStart(p: Pointer): void {
    this.held = true;
    this.pickUp();
    this.grabMove(p);
  }

  grabMove(p: Pointer): void {
    const h = this.toLocal(p.position, this.tmp);
    // The cord is about a metre long.
    if (h.length() > 1.0) h.setLength(1.0);
    this.body.position.copy(h);
    this.layCord();
  }

  grabEnd(_p: Pointer): void {
    this.held = false;
    this.lifted = false;
    this.body.position.set(0, 0, 0);
    this.layCord();
    this.ctx?.emit(this.channel, 0);
  }

  /** Desktop: a click lifts it off the clip toward you (held while the button is down). */
  nudge(_dx: number, _dy: number): void {
    if (this.lifted) return;
    this.pickUp();
    this.body.position.set(0, -0.12, 0.18);
    this.layCord();
  }

  private pickUp(): void {
    if (this.lifted) return;
    this.lifted = true;
    this.ctx?.haptic(0.5, 40);
    this.ctx?.emit(this.channel, 1);
  }

  sync(_state: VesselState): void {}

  /** A sagging coil from the radio to the bottom of the handset. */
  private layCord(): void {
    const end = this.tmp.copy(this.body.position).add(new THREE.Vector3(0, -0.075, 0));
    const n = this.cordPts.length;
    const span = end.distanceTo(this.cordStart);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const p = this.cordPts[i].lerpVectors(this.cordStart, end, t);
      p.y -= Math.sin(t * Math.PI) * (0.05 + 0.15 * Math.min(1, span));
      // A little coil wiggle.
      p.x += Math.sin(t * 40) * 0.006;
    }
    (this.cord.geometry as THREE.BufferGeometry).setFromPoints(this.cordPts);
  }
}
