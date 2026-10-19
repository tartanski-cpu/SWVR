import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { gearOf } from '../boats/sims';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import type { RodGame } from './rodGame';

const LINE_POINTS = 12;
const MAX_FISH = CONFIG.rod.bucketMax;
const RODS = CONFIG.rod.perRack;

/**
 * What the rod game shows (owner, Oct 2026): the line from the rod's tip to the float (a
 * sagging curve, taut when a fish pulls), the float itself (an orange and white pear on the
 * water), and the fish in the bucket on deck (one per catch, up to the bucket's fill), drawn
 * from the boat's catch (VesselState.rodCatch) so the crew see it too. A line and a float
 * per rod of the rack (yours: your games), one mesh of fish.
 */
export class RodView {
  readonly root = new THREE.Group();
  private readonly lines: { line: THREE.Line; float: THREE.Mesh; pts: THREE.Vector3[] }[] = [];
  private readonly fish: THREE.InstancedMesh;
  private bucketHome: THREE.Object3D | null = null;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly p = new THREE.Vector3();
  private shown = -1;

  constructor() {
    this.root.name = 'rodFishing';
    const floatGeo = mergeParts([part(new THREE.SphereGeometry(0.05, 8, 6).translate(0, 0.02, 0), 0xe85a1a), part(new THREE.SphereGeometry(0.035, 8, 6).translate(0, 0.08, 0), 0xf4f0e8)]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xe8e8e0, transparent: true, opacity: 0.8 });
    for (let i = 0; i < RODS; i++) {
      const pts = Array.from({ length: LINE_POINTS }, () => new THREE.Vector3());
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
      line.frustumCulled = false;
      line.visible = false;
      const float = new THREE.Mesh(floatGeo, flatVertexColorMaterial());
      float.visible = false;
      this.lines.push({ line, float, pts });
      this.root.add(line, float);
    }
    // A fish: a flat spindle with a tail, silver-blue.
    const fishGeo = mergeParts([part(new THREE.SphereGeometry(0.1, 8, 5).scale(1.6, 0.45, 0.25), 0x9ab0c0), part(new THREE.ConeGeometry(0.06, 0.1, 4).rotateZ(Math.PI / 2).translate(-0.19, 0, 0), 0x7a90a0)]);
    this.fish = new THREE.InstancedMesh(fishGeo, flatVertexColorMaterial(), MAX_FISH);
    this.fish.count = 0;
    this.fish.frustumCulled = false;
  }

  /** The bucket's boat (its root), so the fish ride in it. */
  attachBucket(boatRoot: THREE.Object3D): void {
    if (this.bucketHome === boatRoot) return;
    this.bucketHome = boatRoot;
    boatRoot.add(this.fish);
    this.shown = -1;
  }

  /**
   * @param rods  your own rods' games (the lines and floats are yours), each with its tip (world) if in hand
   */
  update(world: WorldState, vesselId: string, rods: { game: RodGame; tip: THREE.Vector3 | null }[]): void {
    this.lines.forEach((l, i) => {
      const r = rods[i];
      const out = !!r && r.game.phase !== 'idle' && !!r.tip;
      l.line.visible = out;
      l.float.visible = out;
      if (!out || !r.tip) return;
      const tip = r.tip;
      const game = r.game;
      const f = game.float;
      l.float.position.set(f.x, f.y, f.z);
      // The line: a sag between the tip and the float, pulled straight by the fish.
      const sag = game.phase === 'playing' ? 0.3 * (1 - game.tension) : 0.9;
      for (let i = 0; i < LINE_POINTS; i++) {
        const t = i / (LINE_POINTS - 1);
        l.pts[i].set(tip.x + (f.x - tip.x) * t, tip.y + (f.y - tip.y) * t - sag * 4 * t * (1 - t), tip.z + (f.z - tip.z) * t);
      }
      l.line.geometry.setFromPoints(l.pts);
    });
    // The bucket's fish.
    const v = world.vessels[vesselId];
    const rack = v ? gearOf(v, 'rodRack') : null;
    const n = Math.min(MAX_FISH, v?.rodCatch?.count ?? 0);
    if (!rack || n === this.shown) return;
    this.shown = n;
    const [bx, by, bz] = rack.bucket;
    for (let i = 0; i < n; i++) {
      // Stacked in the bucket, each turned a little: tails up out of it as it fills.
      const a = i * 2.4;
      this.q.setFromEuler(new THREE.Euler(0.3 * Math.sin(a), a, 0.9 + 0.1 * i));
      this.p.set(bx + 0.04 * Math.cos(a), by + 0.08 + i * 0.03, bz + 0.04 * Math.sin(a));
      this.m.compose(this.p, this.q, this.s);
      this.fish.setMatrixAt(i, this.m);
    }
    this.fish.count = n;
    this.fish.instanceMatrix.needsUpdate = true;
  }
}
