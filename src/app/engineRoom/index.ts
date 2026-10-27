/**
 * Going below into a boat's engine room (owner, 27 Oct 2026; plan.ts says where one fits).
 *
 * In the same page, not a separate game: the boat's simulation, the multiplayer game and VR
 * carry on, and a crew-mate can be below while another drives. What changes is what's drawn:
 * while you're below, everything outside (the sea, the coast, the sky's clouds, the other
 * boats, her own decks and wheelhouse) is hidden, and only the room is drawn (view.ts), so a
 * detailed room costs the Quest nothing while you're on deck, and the outside nothing while
 * you're below. The room's drawing is its own download (a separate piece of the game, fetched
 * the first time anyone goes below).
 *
 * You go down by "Go below" over her open engine hatch, and up by "Climb up" at the ladder
 * (player/gangway.ts): you're put at the ladder's foot, or back on her floor by the hatch.
 * While below, her walk area is the room's (walk.ts); hers is put back when you come up.
 */
import type { Control } from '../../controls/Control';
import type * as THREE from 'three';
import { VESSEL_DEFS } from '../../vessel/vesselDef';
import type { WalkArea } from '../../vessel/layout';
import type { WorldState } from '../../core/world';
import { roomEngines } from './engines';
import { engineRoomPlan, type EngineRoomPlan } from './plan';
import { roomWalkArea } from './walk';
import { tugLayout } from './tug/layout';

import type { EngineRoomView } from './view';

const PLANS = new Map<string, EngineRoomPlan | null>();

/** Her type's engine room, or null (worked out once a type). */
export function roomFor(defId: string): EngineRoomPlan | null {
  if (!PLANS.has(defId)) PLANS.set(defId, VESSEL_DEFS[defId] ? engineRoomPlan(VESSEL_DEFS[defId], roomEngines(defId)) : null);
  return PLANS.get(defId)!;
}

export interface BelowContext {
  scene: THREE.Scene;
  world: () => WorldState;
  playerId: () => string;
  boatRoot: (id: string) => THREE.Object3D | undefined;
  walkAreas: Map<string, WalkArea>;
  /** What must stay drawn whatever happens: the player's rig (its camera, hands, overlay), the menu, the marks. */
  keep: () => THREE.Object3D[];
  notify: (text: string, seconds: number) => void;
  /** Her name, for the screens. */
  boatName: (defId: string) => string;
  /** A room's controls (the tug's start-up), handed to the interaction system when it's built and taken back when it goes. */
  addControls: (cs: Control[]) => void;
  removeControls: (cs: Control[]) => void;
}

export class BelowDecks {
  /** The boat we're below in, her room's drawing, her own walk area (put back on coming up). */
  private here: { boatId: string; plan: EngineRoomPlan; view: EngineRoomView; deckArea: WalkArea | undefined } | null = null;
  /** Each boat's room drawing, made the first time (kept: going down again is instant). */
  private readonly views = new Map<string, EngineRoomView>();
  /** What going below hid, to show again (some views set their own visibility each frame: hidden again each frame). */
  private hidden = new Set<THREE.Object3D>();
  private going = false;

  constructor(private readonly ctx: BelowContext) {}

  /** The boat we're below in, or null. */
  get boatId(): string | null {
    return this.here?.boatId ?? null;
  }

  /** Down the ladder: the room drawn (fetched and built the first time), the outside hidden, us at the ladder's foot. */
  async goBelow(boatId: string): Promise<void> {
    if (this.here || this.going) return;
    const v = this.ctx.world().vessels[boatId];
    const plan = v ? roomFor(v.defId) : null;
    const root = this.ctx.boatRoot(boatId);
    if (!v || !plan || !root) return;
    this.going = true;
    try {
      let view = this.views.get(boatId);
      if (!view) {
        const { EngineRoomView } = await import('./view');
        view = new EngineRoomView(plan, this.ctx.boatName(v.defId));
        this.views.set(boatId, view);
        // Its controls work her (routed to her, whoever's boat she is), and only while we're below.
        for (const c of view.controls) {
          c.route = boatId;
          c.enabled = false;
        }
        this.ctx.addControls(view.controls);
      }
      // (She may have gone while it loaded, or we've stepped off her.)
      const p = this.ctx.world().players[this.ctx.playerId()];
      if (!p || p.aboardVesselId !== boatId || !this.ctx.world().vessels[boatId]) return;
      this.ctx.scene.add(view.root);
      view.update(root, v, 1);
      this.here = { boatId, plan, view, deckArea: this.ctx.walkAreas.get(boatId) };
      for (const c of view.controls) c.enabled = true;
      this.ctx.walkAreas.set(boatId, roomWalkArea(plan, tugLayout(plan)?.solids));
      // A step forward of the ladder's foot, facing forward along her (toward the gauges).
      p.position = [plan.ladder.x, plan.sole, Math.max(plan.z0 + 0.6, plan.ladder.z - 1.2)];
      p.yaw = 0;
      this.hideOutside(view.root);
      this.ctx.notify('In the engine room. Climb up at the ladder', 3);
    } finally {
      this.going = false;
    }
  }

  /** Up the ladder: back on her floor beside the hatch, the outside drawn again. */
  goUp(): void {
    const h = this.here;
    if (!h) return;
    const p = this.ctx.world().players[this.ctx.playerId()];
    if (p && p.aboardVesselId === h.boatId) {
      // Beside the hatch, on the side away from its middle the ladder's on.
      const hatch = h.plan.hatch;
      const hz = hatch.z1 + 0.45;
      p.position = [(hatch.x0 + hatch.x1) / 2, hatch.y, hz];
    }
    this.leave();
  }

  /** Each frame: the room moved with her, its gauges; out of it without a word if we're no longer aboard her. */
  update(dt: number): void {
    const h = this.here;
    if (!h) return;
    const w = this.ctx.world();
    const p = w.players[this.ctx.playerId()];
    const root = this.ctx.boatRoot(h.boatId);
    if (!p || p.aboardVesselId !== h.boatId || !w.vessels[h.boatId] || !root) return this.leave();
    h.view.update(root, w.vessels[h.boatId], dt, w.time);
    this.hideOutside(h.view.root);
  }

  private leave(): void {
    const h = this.here;
    if (!h) return;
    this.here = null;
    for (const c of h.view.controls) c.enabled = false;
    h.view.root.removeFromParent();
    if (h.deckArea) this.ctx.walkAreas.set(h.boatId, h.deckArea);
    for (const o of this.hidden) o.visible = true;
    this.hidden.clear();
  }

  /** A boat gone from the page: her room's drawing with her. */
  forget(boatId: string): void {
    if (this.here?.boatId === boatId) this.leave();
    const view = this.views.get(boatId);
    if (view) this.ctx.removeControls(view.controls);
    view?.dispose();
    this.views.delete(boatId);
  }

  /**
   * Hide everything but the room and what must stay (the rig and whatever holds it, the menu,
   * the marks): each top-level thing hidden whole, and inside the ones that hold what stays
   * (her own root holds the rig while aboard), their other parts hidden.
   */
  private hideOutside(room: THREE.Object3D): void {
    const keep = new Set<THREE.Object3D>([room, ...this.ctx.keep()]);
    const holders = new Set<THREE.Object3D>();
    for (const k of keep) for (let o = k.parent; o; o = o.parent) holders.add(o);
    const visit = (parent: THREE.Object3D) => {
      for (const o of parent.children) {
        if (keep.has(o)) continue;
        if (holders.has(o)) visit(o);
        else if (o.visible) {
          o.visible = false;
          this.hidden.add(o);
        }
      }
    };
    visit(this.ctx.scene);
  }
}
