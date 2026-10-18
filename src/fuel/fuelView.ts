import * as THREE from 'three';
import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import { layFrom, sagOf } from '../mechanisms/line';
import { surfaceHeight, type PreparedWave } from '../ocean/waves';
import { flatVertexColorMaterial, mergeParts, part } from '../render/geometryUtils';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { PortDef } from '../world/archipelago';
import { standingHeight } from '../world/geography';
import { fillerPoints, fuelPorts, gaugeOf, hasFiller, pumpFrame, pumpPoint, type FuelHose } from './fuelHose';

const SEGMENTS = 16;
/** Pumps further than this from the viewer (m) aren't drawn. */
const SHOW_WITHIN = 160;
/** Fillers drawn at most (two a boat). */
const MAX_FILLERS = 12;

/** A hose as it is, or the one on its pump (nobody has touched it yet). */
export function hoseAt(world: WorldState, portId: string): FuelHose {
  return world.fuel?.hoses[portId] ?? { port: portId, at: { kind: 'pump' }, litres: 0 };
}

/** One pump: its fixed parts, gauge, nozzle and hose. */
interface PumpView {
  port: PortDef;
  root: THREE.Group;
  gauge: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; shown: string };
  nozzle: THREE.Mesh;
  hose: THREE.InstancedMesh;
}

/**
 * The fuel pumps, their hoses and the boats' fillers (fuel/fuelHose.ts), drawn:
 *   pump    a red cabinet facing its berth, a white top, a gauge (litres and price this
 *           fill, the tank of the boat it's in), START (green) and STOP (red), the
 *           holster the nozzle hangs in, and the hose's outlet on its side.
 *   hose    black, from the outlet to the nozzle: instanced short pieces (one draw call),
 *           hanging in a curve and lying on the quay or the water where it's slack, as the
 *           towline is. No collisions: drawn only.
 *   nozzle  a dark handle and spout: in its holster, in a hand, on the quay, or in a filler.
 *   fillers a chrome cap in a dark ring on each side deck of every boat with a diesel; the
 *           one a nozzle in your hand can plug into shows a green ring.
 * Each pump is about four draw calls, only near enough to see; the fillers are one.
 */
export class FuelView {
  readonly root = new THREE.Group();
  private readonly pumps: PumpView[] = [];
  private readonly caps: THREE.InstancedMesh;
  private readonly hot: THREE.Mesh;
  private readonly m = new THREE.Matrix4();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly p0 = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private gaugeT = 0;

  constructor() {
    this.root.name = 'fuel';
    const cfg = CONFIG.fuelHose.pump;
    const [w, h, d] = cfg.size;
    const mat = flatVertexColorMaterial();
    const nozzleGeo = mergeParts([
      part(new THREE.BoxGeometry(0.06, 0.16, 0.05).translate(0, 0.08, 0), 0x1c1e20), // the handle
      part(new THREE.BoxGeometry(0.05, 0.03, 0.14).translate(0, 0.16, 0.06), 0x2a2c2e), // its body, back to the hose
      part(new THREE.CylinderGeometry(0.012, 0.014, 0.16, 6).rotateX(Math.PI / 2 + 0.6).translate(0, 0.11, 0.15), 0xb8bcc0), // the spout
    ]);
    for (const port of fuelPorts()) {
      const f = pumpFrame(port);
      const root = new THREE.Group();
      root.position.set(f.x, f.y, f.z);
      root.rotation.y = f.yaw;
      // The cabinet (its face +z, toward the berth), the top, the gauge bezel, the buttons, the holster, the outlet.
      const fixed = new THREE.Mesh(
        mergeParts([
          part(new THREE.BoxGeometry(w, h - 0.15, d).translate(0, (h - 0.15) / 2, 0), 0xc8281e, 'worn'),
          part(new THREE.BoxGeometry(w + 0.04, 0.15, d + 0.04).translate(0, h - 0.075, 0), 0xf0f0f0),
          part(new THREE.BoxGeometry(0.46, 0.3, 0.02).translate(cfg.gauge[0], cfg.gauge[1], d / 2 + 0.005), 0x2a2c2e),
          part(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12).rotateX(Math.PI / 2).translate(cfg.start[0], cfg.start[1], d / 2 + 0.015), 0x2fa040),
          part(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12).rotateX(Math.PI / 2).translate(cfg.stop[0], cfg.stop[1], d / 2 + 0.015), 0xc02020),
          part(new THREE.BoxGeometry(0.1, 0.12, 0.06).translate(cfg.holster[0], cfg.holster[1] - 0.02, d / 2 + 0.03), 0x3a3c3e),
          part(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8).rotateZ(Math.PI / 2).translate(cfg.outlet[0] - 0.02, cfg.outlet[1], cfg.outlet[2]), 0x3a3c3e),
        ]),
        mat,
      );
      root.add(fixed);
      // The gauge: a small screen drawn on a canvas.
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 160;
      const ctx = canvas.getContext('2d')!;
      const tex = new THREE.CanvasTexture(canvas);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), new THREE.MeshBasicMaterial({ map: tex }));
      screen.position.set(cfg.gauge[0], cfg.gauge[1], d / 2 + 0.017);
      root.add(screen);
      const nozzle = new THREE.Mesh(nozzleGeo, mat);
      const hose = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 6, 1, true).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x18191a }), SEGMENTS);
      hose.frustumCulled = false;
      nozzle.frustumCulled = false;
      this.root.add(root, nozzle, hose);
      this.pumps.push({ port, root, gauge: { canvas, ctx, tex, shown: '' }, nozzle, hose });
    }
    // Fillers: a chrome cap in a dark ring, flush on the deck.
    const cap = mergeParts([part(new THREE.CylinderGeometry(0.09, 0.09, 0.015, 14).translate(0, 0.0075, 0), 0x2a2c2e), part(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 14).translate(0, 0.015, 0), 0xc8ccd0)]);
    this.caps = new THREE.InstancedMesh(cap, mat, MAX_FILLERS);
    this.caps.frustumCulled = false;
    this.caps.count = 0;
    this.hot = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 6, 20).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x40e060 }));
    this.hot.visible = false;
    this.root.add(this.caps, this.hot);
  }

  /** A filler in the world, from her drawn pose. */
  fillerAt(roots: Map<string, THREE.Object3D>, world: WorldState, vesselId: string, side: number, out: THREE.Vector3): THREE.Vector3 | null {
    const root = roots.get(vesselId);
    const v = world.vessels[vesselId];
    if (!root || !v) return null;
    const f = fillerPoints(VESSEL_DEFS[v.defId])[side];
    return root.localToWorld(out.set(f[0], f[1], f[2]));
  }

  /**
   * @param hot   the filler the nozzle in our hand would plug into, if any (its green ring)
   * @param held  the nozzle we're holding, if we are: where our hand has it (drawn there at
   *              once, not when the host's word comes back)
   */
  update(world: WorldState, roots: Map<string, THREE.Object3D>, focus: THREE.Vector3, waves: readonly PreparedWave[], dt: number, hot: { vessel: string; side: number } | null, held: { port: string; pos: THREE.Vector3 } | null): void {
    // Fillers, on every boat with a diesel.
    let n = 0;
    for (const v of Object.values(world.vessels)) {
      if (!hasFiller(v) || n + 2 > MAX_FILLERS) continue;
      const root = roots.get(v.id);
      if (!root) continue;
      root.getWorldQuaternion(this.q);
      for (const side of [0, 1]) {
        this.fillerAt(roots, world, v.id, side, this.v);
        this.caps.setMatrixAt(n++, this.m.compose(this.v, this.q, this.one));
      }
    }
    this.caps.count = n;
    this.caps.instanceMatrix.needsUpdate = true;
    this.hot.visible = !!hot && !!this.fillerAt(roots, world, hot.vessel, hot.side, this.hot.position);
    if (this.hot.visible) this.hot.position.y += 0.02;

    this.gaugeT -= dt;
    const drawGauges = this.gaugeT <= 0;
    if (drawGauges) this.gaugeT = 0.25;
    for (const pv of this.pumps) {
      const near = pv.root.position.distanceTo(focus) < SHOW_WITHIN;
      pv.root.visible = pv.nozzle.visible = pv.hose.visible = near;
      if (!near) continue;
      const hose = hoseAt(world, pv.port.id);
      // The nozzle: where it is (from the drawn boat when it's in a filler; from our hand while we hold it).
      const at = hose.at;
      const end = this.b;
      let resting = true;
      if (held && held.port === pv.port.id) {
        end.copy(held.pos);
        resting = false;
      } else if (at.kind === 'hand' || at.kind === 'ground') {
        end.fromArray(at.pos);
        resting = at.kind === 'ground';
      } else if (at.kind === 'filler' && this.fillerAt(roots, world, at.vessel, at.side, end)) {
        end.y += 0.05;
      } else pumpPoint(pv.port, CONFIG.fuelHose.pump.holster, end);
      pv.nozzle.position.copy(end);
      // Facing away from the pump (its spout out ahead), tipped down; lying flat on the quay.
      const out = pumpPoint(pv.port, CONFIG.fuelHose.pump.outlet, this.a);
      pv.nozzle.rotation.set(at.kind === 'ground' && resting ? -Math.PI / 2 + 0.3 : 0, Math.atan2(end.x - out.x, end.z - out.z), 0);
      if (at.kind === 'pump' && !(held && held.port === pv.port.id)) pv.nozzle.rotation.y = pv.root.rotation.y;
      // The hose, from the outlet to the back of the nozzle: slack, it hangs and lies on the quay (or floats).
      const span = out.distanceTo(end);
      const sag = sagOf(span, at.kind === 'pump' ? span + 0.9 : CONFIG.fuelHose.hoseLength);
      const point = (t: number, o: THREE.Vector3) => {
        o.lerpVectors(out, end, t);
        const floor = Math.max(standingHeight(o.x, o.z), surfaceHeight(waves, o.x, o.z)) + 0.025;
        return o.setY(Math.max(o.y - 4 * sag * t * (1 - t), floor));
      };
      point(0, this.p0);
      for (let i = 0; i < SEGMENTS; i++) {
        point((i + 1) / SEGMENTS, this.p1);
        layFrom(pv.hose, i, this.p0, this.p1, this.m);
        this.p0.copy(this.p1);
      }
      pv.hose.instanceMatrix.needsUpdate = true;
      if (drawGauges) this.drawGauge(pv, world);
    }
  }

  /** The gauge: this fill's litres and price, and her tank while the nozzle's in her. */
  private drawGauge(pv: PumpView, world: WorldState): void {
    const g = gaugeOf(world, pv.port.id);
    const lines = [`${g.litres.toFixed(1)} L`, `£${g.price.toFixed(2)}`, g.tank ? `TANK ${Math.round(g.tank.litres)}/${g.tank.size} L${g.tank.litres >= g.tank.size - 0.5 ? ' FULL' : ''}` : 'NOZZLE NOT IN', g.pumping ? 'PUMPING' : ''];
    const key = lines.join('|');
    if (key === pv.gauge.shown) return;
    pv.gauge.shown = key;
    const { ctx, canvas, tex } = pv.gauge;
    ctx.fillStyle = '#0d1a12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#7dff9a';
    ctx.textAlign = 'right';
    ctx.font = 'bold 44px monospace';
    ctx.fillText(lines[0], 244, 50);
    ctx.font = 'bold 30px monospace';
    ctx.fillText(lines[1], 244, 88);
    ctx.textAlign = 'left';
    ctx.font = '20px monospace';
    ctx.fillText(lines[2], 12, 120);
    ctx.fillStyle = g.pumping ? '#ffd24a' : '#3a5a42';
    ctx.fillText(g.pumping ? 'PUMPING' : 'START  STOP below', 12, 148);
    tex.needsUpdate = true;
  }

  /** Every pump's port (for the hands). */
  ports(): PortDef[] {
    return this.pumps.map((p) => p.port);
  }
}

