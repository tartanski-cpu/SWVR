import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HandFrame } from '../controls/InteractionSystem';
import type { WorldState } from '../core/world';
import { hullPlan } from '../vessel/layout';
import { hasWheelhouse, VESSEL_DEFS } from '../vessel/vesselDef';
import { berthWithId } from '../world/berths';
import { landFloor } from '../world/landWalkArea';
import { quaySpot } from '../world/startSpot';
import { allFarms, landingFace, platformAt } from '../world/windFarm';
import type { Handedness } from './xrInput';

/**
 * The gangway mark (owner, Oct 2026: "a bit clunky to get from the ship onto the quay side ...
 * if the ship's low, you kind of fall underneath it ... something where you look at the quay
 * side from the boat, as long as it's docked, that you can click ... and then it just puts
 * you ashore"):
 *
 *   aboard a moored boat   a mark low over the quay's edge abreast of her, "Step ashore"
 *                          (you go ashore a step back from the edge: world/startSpot.ts quaySpot);
 *   ashore near one        a mark over her deck by the rail on the quay side, "Step aboard"
 *                          (you go aboard where you'd board her: her boarding spot).
 *   on a turbine's landing (crew transfer, transfer/transfer.ts: her bow held on its tubes)
 *                          a mark over the tubes, "Step across" (onto its platform, at the
 *                          ladder's head: world/windFarm.ts platformSpot); and on the
 *                          platform, while she's still held there, one over her bow,
 *                          "Step aboard".
 *
 * Point at it and press: VR, a free hand's trigger (its ray on the ring); desktop, a click
 * with the reticle on it. It sends the same `board` intent as the board key (the host puts
 * you there: player/playerControl.ts). A ring with a down arrow and its words, turned to
 * face you and drawn over everything (seen from inside her wheelhouse too); a few meshes,
 * drawn only while there's somewhere to step.
 */
export interface GangwayContext {
  world: WorldState;
  playerId: string;
  /** A boat's root in the scene (her frame), to place the mark over her deck. */
  boatRoot: (id: string) => THREE.Object3D | undefined;
  /** Send the board intent: ref, the boat to step aboard; none, ashore. */
  board: (ref?: string) => void;
  notify: (text: string) => void;
  pulse: (h: Handedness, intensity: number, ms: number) => void;
}

/** Ashore, aboard, or (crew transfer) across from a boat on a turbine's landing onto its platform: `turbine` "farm:turbine". */
type Target = { kind: 'ashore' | 'aboard' | 'across'; boatId: string; turbine?: string };

const AMBER = 0xf0b030;

export class Gangway {
  /** The mark: in the scene (world frame). */
  readonly root = new THREE.Group();
  private target: Target | null = null;
  private readonly at = new THREE.Vector3();
  private readonly label: THREE.Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: THREE.CanvasTexture;
  private shown = '';
  private lastPress = 0;
  private readonly sphere = new THREE.Sphere();
  private readonly hit = new THREE.Vector3();

  constructor() {
    const c = CONFIG.gangway;
    // Drawn over everything, as the menu panels are: from inside her wheelhouse the quay's top
    // is above your eyes, and the roof would hide a mark over it.
    const mat = new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false });
    // A ring, and an arrow pointing down at where you'll stand.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(c.radius, 0.035, 8, 32), mat);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.26, 12).rotateX(Math.PI), mat);
    arrow.position.y = -c.radius - 0.2;
    this.canvas.width = 512;
    this.canvas.height = 96;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.label = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.225), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false }));
    this.label.position.y = c.radius + 0.22;
    this.root.add(ring, arrow, this.label);
    this.root.visible = false;
    for (const m of this.root.children) m.renderOrder = 10;
  }

  /** Once a frame: where there's somewhere to step, the mark there, turned to the viewer. */
  update(ctx: GangwayContext, viewer: THREE.Vector3): void {
    this.target = this.find(ctx);
    this.root.visible = !!this.target && this.place(ctx, this.target);
    if (!this.root.visible) return;
    this.paint(this.target!.kind === 'ashore' ? 'Step ashore' : this.target!.kind === 'across' ? 'Step across' : 'Step aboard');
    // Face the viewer, upright.
    this.root.lookAt(viewer.x, this.root.position.y, viewer.z);
  }

  /** Where to step from here: ashore from a moored boat you're on; aboard the nearest moored boat near you ashore. */
  private find(ctx: GangwayContext): Target | null {
    const p = ctx.world.players[ctx.playerId];
    if (!p || p.mode !== 'walk') return null;
    if (p.aboardVesselId) {
      const v = ctx.world.vessels[p.aboardVesselId];
      // Held on a wind turbine's landing (crew transfer: transfer/transfer.ts): across onto its platform.
      const on = v ? ctx.world.transfer?.landed[v.id] : undefined;
      if (v && on) return { kind: 'across', boatId: v.id, turbine: on };
      return v?.mooring.phase === 'moored' && v.mooring.berthId ? { kind: 'ashore', boatId: v.id } : null;
    }
    // On a turbine's platform: back aboard the boat held on its landing, if there is one.
    const here = platformAt(p.position[0], p.position[2]);
    if (here) {
      const landed = Object.entries(ctx.world.transfer?.landed ?? {}).find(([, t]) => t === here);
      return landed && ctx.boatRoot(landed[0]) ? { kind: 'aboard', boatId: landed[0], turbine: here } : null;
    }
    let best: Target | null = null;
    let bd = CONFIG.gangway.aboardRange;
    for (const v of Object.values(ctx.world.vessels)) {
      const def = VESSEL_DEFS[v.defId];
      if (v.mooring.phase !== 'moored' || !v.mooring.berthId || !def || !hasWheelhouse(def) || def.tow || !ctx.boatRoot(v.id)) continue;
      const d = Math.hypot(v.position[0] - p.position[0], v.position[2] - p.position[2]);
      if (d < bd) [best, bd] = [{ kind: 'aboard', boatId: v.id }, d];
    }
    return best;
  }

  /** The mark's place: over the quay spot, or over her boarding spot. False if it can't be placed. */
  private place(ctx: GangwayContext, t: Target): boolean {
    const v = ctx.world.vessels[t.boatId];
    if (!v) return false;
    const up = CONFIG.gangway.up;
    if (t.kind === 'across' || t.turbine) {
      // Across: over the landing's tubes at her bow. Back aboard: over her bow, seen from the platform.
      const [f, i] = (t.turbine ?? '').split(':').map(Number);
      const tb = allFarms()[f]?.turbines[i];
      if (!tb) return false;
      if (t.kind === 'across') {
        const face = landingFace(tb);
        this.at.set(face.x, CONFIG.windFarm.landing.top + 0.4, face.z);
      } else {
        const root = ctx.boatRoot(v.id);
        if (!root) return false;
        const plan = hullPlan(VESSEL_DEFS[v.defId]);
        root.localToWorld(this.at.set(0, plan.deckY(plan.stem) + up, plan.stem + 1.5));
      }
    } else if (t.kind === 'ashore') {
      // On the quay's edge abreast of her (a little in from it), low over the quay.
      const berth = berthWithId(v.mooring.berthId ?? '');
      if (!berth) return false;
      const c = CONFIG.gangway;
      const x = berth.x + berth.shoreX * (berth.shoreDist + c.edgeIn);
      const z = berth.z + berth.shoreZ * (berth.shoreDist + c.edgeIn);
      const q = quaySpot(berth.id);
      this.at.set(x, (landFloor(x, z) ?? landFloor(q.x, q.z) ?? 1.6) + c.ashoreUp, z);
    } else {
      // Over her deck by the rail on the quay side, amidships, clear of her wheelhouse roof:
      // her middle, moved toward the quay by most of her half-beam, `up` over the quay.
      const berth = berthWithId(v.mooring.berthId ?? '');
      if (!berth) return false;
      const half = hullPlan(VESSEL_DEFS[v.defId]).halfBeam(0) * 0.8;
      const x = v.position[0] + berth.shoreX * half;
      const z = v.position[2] + berth.shoreZ * half;
      const q = quaySpot(berth.id);
      this.at.set(x, (landFloor(q.x, q.z) ?? 1.6) + up, z);
    }
    this.root.position.copy(this.at);
    return true;
  }

  private paint(text: string): void {
    if (text === this.shown) return;
    this.shown = text;
    const g = this.canvas.getContext('2d')!;
    const { width: W, height: H } = this.canvas;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(20,24,28,0.75)';
    g.beginPath();
    g.roundRect(4, 4, W - 8, H - 8, 18);
    g.fill();
    g.fillStyle = '#f0b030';
    g.font = `bold ${Math.round(H * 0.55)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 2);
    this.tex.needsUpdate = true;
  }

  /** Does this ray hit the mark (within reach)? */
  private aimed(ray: THREE.Ray): boolean {
    if (!this.root.visible || !this.target) return false;
    this.sphere.set(this.root.position, CONFIG.gangway.radius + 0.1);
    const p = ray.intersectSphere(this.sphere, this.hit);
    return !!p && p.distanceTo(ray.origin) <= CONFIG.gangway.reach;
  }

  private step(ctx: GangwayContext, hand: Handedness | 'desk'): void {
    const now = performance.now();
    if (!this.target || now - this.lastPress < 500) return;
    this.lastPress = now;
    if (this.target.kind === 'ashore') ctx.board();
    else if (this.target.kind === 'across') ctx.board(`turbine:${this.target.turbine}`);
    else ctx.board(this.target.boatId);
    if (hand !== 'desk') ctx.pulse(hand, 0.5, 40);
  }

  /** Desktop: the words under the reticle when it's on the mark. */
  updateDesktop(ray: THREE.Ray | null): string | null {
    if (!ray || !this.aimed(ray)) return null;
    return `${this.shown}\nclick`;
  }

  /** Desktop: a click on the mark. Returns whether it took it. */
  desktopClick(ctx: GangwayContext, ray: THREE.Ray | null): boolean {
    if (!ray || !this.aimed(ray)) return false;
    this.step(ctx, 'desk');
    return true;
  }

  /** VR: a free hand's trigger with its ray on the mark. Returns the hands it used this frame. */
  updateXR(ctx: GangwayContext, hands: Record<Handedness, HandFrame>, busy: Record<Handedness, boolean>): Record<Handedness, boolean> {
    const used = { left: false, right: false };
    for (const h of ['right', 'left'] as const) {
      const f = hands[h];
      if (!f.tracked || busy[h] || !f.triggerPressed || !this.aimed(f.ray)) continue;
      this.step(ctx, h);
      used[h] = true;
    }
    return used;
  }
}
