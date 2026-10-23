/**
 * Drawing the ferries (the coast extras plan, C7; traffic/ferries.ts): each one in sight
 * (not away past the map's edge) within `drawDistance` of the viewer, as her class's design
 * in her route's livery (ferryKit.ts). Cheap: a few ferries on a map, one merged mesh each
 * (one draw call), her lights a few points after dark.
 *   - She rides the swell as the traffic's ships do: rise, pitch and roll from three wave
 *     samples, damped for her length.
 *   - Her wake: the boats' own foam ribbon (vessel/view/wakeTrail.ts) behind her transom
 *     while she's under way and within `wakeDistance`.
 *   - She moves on smoothly between the host's snapshots: her position eases onto the shared one.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial } from '../render/geometryUtils';
import { glowSprite, LightPointsMaterial } from '../render/lightPoints';
import { WakeTrail } from '../vessel/view/wakeTrail';
import type { FerryRouteDef } from '../world/defs';
import { ferriesInSight } from './ferries';
import { ferryGeometry, ferryLights } from './ferryKit';

interface Shown {
  root: THREE.Group;
  lights: THREE.Points;
  wake: WakeTrail | null;
  /** Where she's drawn (eased onto the shared position). */
  x: number;
  z: number;
}

/** Her wake is drawn within this of the viewer (m). */
const WAKE_DISTANCE = 2500;

export class FerryView {
  readonly root = new THREE.Group();
  private readonly material = flatVertexColorMaterial();
  private readonly lightMat = new LightPointsMaterial(glowSprite(), CONFIG.lightPoints.size * 0.9);
  private readonly shown = new Map<string, Shown>();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  /** How many are drawn now (tests, the perf panel). */
  count = 0;
  private lastTime = 0;

  constructor(private readonly ocean: Record<string, { value: unknown }>) {
    this.root.name = 'ferries';
  }

  private make(ship: string, cls: FerryRouteDef['cls'], livery: FerryRouteDef['livery']): Shown {
    const root = new THREE.Group();
    root.name = `ferry:${ship}`;
    root.add(new THREE.Mesh(ferryGeometry(cls, livery), this.material));
    const ls = ferryLights(cls);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(ls.flatMap((l) => l.p), 3));
    const c = new THREE.Color();
    lg.setAttribute('color', new THREE.Float32BufferAttribute(ls.flatMap((l) => c.setHex(l.c).toArray()), 3));
    const lights = new THREE.Points(lg, this.lightMat);
    root.add(lights);
    this.root.add(root);
    return { root, lights, wake: null, x: 0, z: 0 };
  }

  update(world: WorldState, waves: readonly PreparedWave[], darkness: number, time: number, viewer: { x: number; z: number }): void {
    const dt = Math.max(0, Math.min(0.25, time - this.lastTime));
    this.lastTime = time;
    const seen = new Set<string>();
    const d2 = CONFIG.ferries.drawDistance ** 2;
    for (const { f, cls, livery, p } of ferriesInSight(world)) {
      if ((p.x - viewer.x) ** 2 + (p.z - viewer.z) ** 2 > d2) continue;
      seen.add(f.id);
      let sh = this.shown.get(f.id);
      if (!sh) {
        sh = this.make(f.ship, cls, livery);
        sh.x = p.x;
        sh.z = p.z;
        this.shown.set(f.id, sh);
      }
      const k = CONFIG.ferries.classes[cls];
      const fx = Math.sin(p.heading);
      const fz = -Math.cos(p.heading);
      // Keep moving between snapshots; ease onto the shared position (straight there if far off).
      sh.x += fx * f.v * dt;
      sh.z += fz * f.v * dt;
      const ease = Math.hypot(p.x - sh.x, p.z - sh.z) > 50 ? 1 : Math.min(1, dt * 2);
      sh.x += (p.x - sh.x) * ease;
      sh.z += (p.z - sh.z) * ease;
      // On the waves: rise, pitch and roll from three samples, damped for her length.
      const x = sh.x;
      const z = sh.z;
      const h = surfaceHeight(waves, x, z);
      const bow = surfaceHeight(waves, x + fx * k.length * 0.4, z + fz * k.length * 0.4);
      const stern = surfaceHeight(waves, x - fx * k.length * 0.4, z - fz * k.length * 0.4);
      const side = surfaceHeight(waves, x - fz * k.beam * 0.5, z + fx * k.beam * 0.5);
      const damp = Math.min(1, 25 / k.length);
      sh.root.position.set(x, (h * 2 + bow + stern) / 4, z);
      sh.root.quaternion.setFromEuler(this.e.set(Math.atan2(bow - stern, k.length * 0.8) * damp, -p.heading, Math.atan2(side - h, k.beam * 0.5) * damp * 0.6));
      sh.root.updateMatrixWorld();
      sh.lights.visible = darkness > 0.35;
      // Her wake while she's under way and near enough to see it.
      const near = (x - viewer.x) ** 2 + (z - viewer.z) ** 2 < WAKE_DISTANCE ** 2;
      if (near && !sh.wake) {
        sh.wake = new WakeTrail(this.ocean, k.length / 2 - 0.5, { propD: k.beam * 0.15, length: k.length });
        this.root.add(sh.wake.mesh);
      } else if (!near && sh.wake) {
        this.root.remove(sh.wake.mesh);
        sh.wake.mesh.geometry.dispose();
        sh.wake = null;
      }
      // Lying at a terminal, her foam long faded: no wake drawn (a draw call saved at the pier).
      if (sh.wake) sh.wake.mesh.visible = f.phase !== 'berthed' || f.t < 60;
      if (sh.wake?.mesh.visible) {
        // (The wake reads only her velocity and her propellers' thrust from a vessel's state.)
        const wakeState = { linearVelocity: [fx * f.v, 0, fz * f.v], thrust: f.v > 0.3 ? CONFIG.effects.wake.fullWashThrust * 0.5 : 0 } as unknown as Parameters<WakeTrail['update']>[0];
        sh.wake.update(wakeState, sh.root, waves, time);
      }
    }
    for (const [id, sh] of this.shown) {
      if (seen.has(id)) continue;
      this.root.remove(sh.root);
      if (sh.wake) {
        this.root.remove(sh.wake.mesh);
        sh.wake.mesh.geometry.dispose();
      }
      sh.lights.geometry.dispose();
      this.shown.delete(id);
    }
    this.lightMat.set(CONFIG.lightPoints.size * 0.9 * (0.5 + 0.5 * darkness), Math.min(1, (darkness - 0.35) * 4));
    this.count = this.shown.size;
  }
}
