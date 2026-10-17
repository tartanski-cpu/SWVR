/**
 * The deck pole (owner): how the searchlight and the fire monitor stand on the working deck
 * instead of the wheelhouse roof. Not a module of its own: each of them takes a `pole` in its
 * config (null on the roof) and draws it, so the unit, its pole and its controls go and come
 * together. The pole rises from the deck under the unit to the foot of the unit's own short
 * post; a control box is fixed to its aft side at hand height (CONFIG.modules.deckPole),
 * square to the boat, so its joystick works as the helm's does: you stand aft of it facing
 * forward, push to raise, sideways to train. All in the boat's axes, as the units draw.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { GearFootprint } from '../modular/module';
import { part } from '../render/geometryUtils';

/** A unit's pole: the deck's height at its foot (boat axes, m). */
export interface DeckPole {
  deckY: number;
}

type V3 = readonly [number, number, number];
const P = CONFIG.modules.deckPole;

/** The middle of the control box's top (boat axes), for a unit at `at` on this pole. */
export function poleBoxTop(at: V3, pole: DeckPole): [number, number, number] {
  return [at[0], pole.deckY + P.boxHeight, at[2] + P.radius + P.box.depth / 2];
}

/**
 * The pole and its box, as static parts: from the deck up to `top` (the foot of the unit's
 * own post, boat axes y), and the box with a bracket to the pole.
 */
export function poleParts(at: V3, pole: DeckPole, top: number): THREE.BufferGeometry[] {
  const steel = 0x3f464c;
  const h = top - pole.deckY;
  const [bx, by, bz] = poleBoxTop(at, pole);
  return [
    part(new THREE.CylinderGeometry(P.radius, P.radius * 1.3, h, 10).translate(at[0], pole.deckY + h / 2, at[2]), steel),
    // A foot plate bolted to the deck.
    part(new THREE.BoxGeometry(0.22, 0.02, 0.22).translate(at[0], pole.deckY + 0.01, at[2]), steel),
    part(new THREE.BoxGeometry(P.box.width, P.box.height, P.box.depth).translate(bx, by - P.box.height / 2, bz), 0x2a3035),
    part(new THREE.BoxGeometry(0.06, 0.06, P.box.depth * 0.6).translate(at[0], by - P.box.height - 0.04, at[2] + P.box.depth * 0.3), steel),
  ];
}

/** What you can't walk through: the pole (the box is above your knees, beside it). */
export function poleFootprint(at: V3, top: number): GearFootprint {
  return { x: at[0], z: at[2], r: P.radius + 0.07, top };
}
