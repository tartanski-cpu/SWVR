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
 *
 * The same for her crew area (owner, 29 Oct 2026; crew/): a second space, in by "Go inside" at
 * the door in her deckhouse's aft face, out by "Go outside" by it; its two decks drawn in place
 * of everything outside, its walk area hers while you're in. BelowDecks keeps one space at a time.
 */
import type { Control } from '../../controls/Control';
import type * as THREE from 'three';
import { VESSEL_DEFS } from '../../vessel/vesselDef';
import type { WalkArea } from '../../vessel/layout';
import type { WorldState } from '../../core/world';
import { CONFIG } from '../../config';
import { roomEngines } from './engines';
import { engineRoomPlan, type EngineRoomPlan } from './plan';
import { roomWalkArea } from './walk';
import { tugLayout } from './tug/layout';
import { crewAreaPlan, type CrewAreaPlan } from './crew/plan';

import type { EngineRoomView } from './view';
import type { CrewAreaView } from './crew/view';
import { crewLayout, onDeck, type CrewLayout } from './crew/layout';
import { crewWalkArea } from './crew/walk';

const PLANS = new Map<string, EngineRoomPlan | null>();

/** Her type's engine room, or null (worked out once a type). */
export function roomFor(defId: string): EngineRoomPlan | null {
  if (!PLANS.has(defId)) PLANS.set(defId, VESSEL_DEFS[defId] ? engineRoomPlan(VESSEL_DEFS[defId], roomEngines(defId)) : null);
  return PLANS.get(defId)!;
}

const CREW = new Map<string, CrewAreaPlan | null>();

/** Her type's crew area (crew/plan.ts), or null (worked out once a type). */
export function crewAreaFor(defId: string): CrewAreaPlan | null {
  if (!CREW.has(defId)) CREW.set(defId, VESSEL_DEFS[defId] ? crewAreaPlan(VESSEL_DEFS[defId], roomFor(defId)) : null);
  return CREW.get(defId)!;
}

const CREW_LAYOUTS = new Map<string, CrewLayout | null>();

/** Her type's crew area laid out (crew/layout.ts), or null. */
export function crewLayoutFor(defId: string): CrewLayout | null {
  if (!CREW_LAYOUTS.has(defId)) {
    const plan = crewAreaFor(defId);
    CREW_LAYOUTS.set(defId, plan ? crewLayout(plan) : null);
  }
  return CREW_LAYOUTS.get(defId)!;
}

/** Is a point (her axes) inside her crew area: on one of its decks, between its floor and deckhead? */
export function inCrewArea(l: CrewLayout, p: readonly number[]): boolean {
  return Object.values(l.decks).some((d) => d && onDeck(d, p[0], p[2]) && p[1] > d.floor - 0.4 && p[1] < d.deckhead);
}

/** The spaces you can be in, inside her: her engine room (below), her crew area (inside). */
export type SpaceId = 'engine' | 'crew';

/** A space's drawing: the engine room's (view.ts) or the crew area's (crew/view.ts). */
type SpaceView = EngineRoomView | CrewAreaView;

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
  /** The boat we're inside, which space, its drawing, her own walk area (put back on coming out). */
  private here: { boatId: string; space: SpaceId; view: SpaceView; deckArea: WalkArea | undefined } | null = null;
  /** Each boat's spaces' drawings ("boat:space"), made the first time (kept: going in again is instant). */
  private readonly views = new Map<string, SpaceView>();
  /** What going below hid, to show again (some views set their own visibility each frame: hidden again each frame). */
  private hidden = new Set<THREE.Object3D>();
  private going = false;

  constructor(private readonly ctx: BelowContext) {}

  /** The boat we're inside (below in her engine room, or in her crew area), or null. */
  get boatId(): string | null {
    return this.here?.boatId ?? null;
  }

  /** Which space we're in, or null. */
  get space(): SpaceId | null {
    return this.here?.space ?? null;
  }

  /** What to say when you try to leave some other way (a jump, the board key): the way out. */
  get wayOut(): string {
    return this.here?.space === 'crew' ? 'Inside: go out by the door aft' : 'In the engine room: climb up at the ladder';
  }

  /** Down the ladder: the room drawn (fetched and built the first time), the outside hidden, us at the ladder's foot. */
  goBelow(boatId: string): Promise<void> {
    return this.enter(boatId, 'engine');
  }

  /** In at the door: the crew area drawn (fetched and built the first time), the outside hidden, us just inside the door. */
  goInside(boatId: string): Promise<void> {
    return this.enter(boatId, 'crew');
  }

  private async enter(boatId: string, space: SpaceId): Promise<void> {
    if (this.here || this.going) return;
    const v = this.ctx.world().vessels[boatId];
    const plan = v ? roomFor(v.defId) : null;
    const crew = v ? crewLayoutFor(v.defId) : null;
    const root = this.ctx.boatRoot(boatId);
    if (!v || !root || (space === 'engine' ? !plan : !crew)) return;
    this.going = true;
    try {
      const key = `${boatId}:${space}`;
      let view = this.views.get(key);
      if (!view) {
        if (space === 'engine') {
          const { EngineRoomView } = await import('./view');
          view = new EngineRoomView(plan!, this.ctx.boatName(v.defId));
        } else {
          const { CrewAreaView } = await import('./crew/view');
          view = new CrewAreaView(crew!, this.ctx.boatName(v.defId));
        }
        this.views.set(key, view);
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
      this.here = { boatId, space, view, deckArea: this.ctx.walkAreas.get(boatId) };
      for (const c of view.controls) c.enabled = true;
      if (space === 'engine') {
        this.ctx.walkAreas.set(boatId, roomWalkArea(plan!, tugLayout(plan!)?.solids));
        // A step forward of the ladder's foot, facing forward along her (toward the gauges).
        p.position = [plan!.ladder.x, plan!.sole, Math.max(plan!.z0 + 0.6, plan!.ladder.z - 1.2)];
        this.ctx.notify('In the engine room. Climb up at the ladder', 3);
      } else {
        this.ctx.walkAreas.set(boatId, crewWalkArea(crew!));
        // Just inside the door, facing forward into the lobby.
        p.position = [...crew!.inside];
        this.ctx.notify('Inside. Go out by the door aft', 3);
      }
      p.yaw = 0;
      this.hideOutside(view.root);
    } finally {
      this.going = false;
    }
  }

  /** Up the ladder (back on her floor beside the hatch), or out of the door (on her deck outside it): the outside drawn again. */
  goUp(): void {
    const h = this.here;
    if (!h) return;
    const w = this.ctx.world();
    const p = w.players[this.ctx.playerId()];
    const v = w.vessels[h.boatId];
    if (p && v && p.aboardVesselId === h.boatId) {
      const plan = roomFor(v.defId);
      const crew = crewAreaFor(v.defId);
      if (h.space === 'engine' && plan) {
        // Beside the hatch, on the side away from its middle the ladder's on.
        const hatch = plan.hatch;
        p.position = [(hatch.x0 + hatch.x1) / 2, hatch.y, hatch.z1 + 0.45];
      } else if (h.space === 'crew' && crew) {
        // On her deck, a step aft of the door, facing aft.
        const d = crew.door;
        p.position = [d.x, d.deck, d.z + CONFIG.crewArea.main.wall + 0.6];
        p.yaw = Math.PI;
      }
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
    h.view.update(root, w.vessels[h.boatId], dt, w.time, p.position);
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

  /** A boat gone from the page: her spaces' drawings with her. */
  forget(boatId: string): void {
    if (this.here?.boatId === boatId) this.leave();
    for (const space of ['engine', 'crew'] as const) {
      const key = `${boatId}:${space}`;
      const view = this.views.get(key);
      if (view) this.ctx.removeControls(view.controls);
      view?.dispose();
      this.views.delete(key);
    }
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
    // What's kept now but was hidden before (a crew-mate who has come down since we did), and
    // whatever holds it: shown again. (Hiding only ever hid: whoever went below first never saw
    // the one who came after; owner, 27 Oct 2026.)
    for (const k of keep)
      for (let o: THREE.Object3D | null = k; o; o = o.parent)
        if (this.hidden.delete(o)) o.visible = true;
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
