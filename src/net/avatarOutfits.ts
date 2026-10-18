import * as THREE from 'three';
import { CONFIG } from '../config';
import { mergeParts, part } from '../render/geometryUtils';
import type { HandPose } from '../player/handGesture';

/**
 * Crew-mates' looks (owner request: a random selection of fisherman and workboat clothing).
 * Each player gets a `look` number when they join (PlayerState.look, picked by the host);
 * everyone builds the same figure from it: an outfit, a skin tone, a beard or not. The
 * player's own colour (name tag, laser) shows as an accent on the hat or collar, so
 * crew-mates stay easy to tell apart.
 *
 * Built from boxes and cylinders with vertex colours (one shared material for everyone),
 * in five rigid parts per figure: head (with hat), torso, upper arms, forearms, gloves.
 * Original designs: generic working gear, no brand marks.
 */
export interface Outfit {
  name: string;
  /** Jacket / jumper body and sleeves. */
  jacket: number;
  /** A second colour on the torso: bib, vest, reflective band or yoke. */
  trim: number;
  /** What the trim is. */
  trimKind: 'bib' | 'vest' | 'bands' | 'yoke' | 'collar';
  gloves: number;
  hat: 'souwester' | 'beanie' | 'cap' | 'hardhat' | 'flatcap';
  hatColor: number;
}

export const OUTFITS: Outfit[] = [
  { name: 'Yellow oilskins and sou’wester', jacket: 0xf0c020, trim: 0xd8a810, trimKind: 'bib', gloves: 0xe86a1a, hat: 'souwester', hatColor: 0xf0c020 },
  { name: 'Orange float coat and beanie', jacket: 0xf06418, trim: 0xd8dcd8, trimKind: 'bands', gloves: 0x2a2e33, hat: 'beanie', hatColor: 0x1d2a44 },
  { name: 'Navy fisherman’s jumper and flat cap', jacket: 0x1f2b48, trim: 0x2a385a, trimKind: 'yoke', gloves: 0x5a4a3a, hat: 'flatcap', hatColor: 0x4a4038 },
  { name: 'Hi-vis vest over work blues, hard hat', jacket: 0x2c4a78, trim: 0xd8f020, trimKind: 'vest', gloves: 0x3a3e44, hat: 'hardhat', hatColor: 0xf2f2ee },
  { name: 'Green bib-and-brace oilskins, check shirt', jacket: 0x9a2a2a, trim: 0x2f6a3a, trimKind: 'bib', gloves: 0xe86a1a, hat: 'beanie', hatColor: 0x2f6a3a },
  { name: 'Red crew jacket and cap', jacket: 0xc42a22, trim: 0x22262c, trimKind: 'collar', gloves: 0x2a2e33, hat: 'cap', hatColor: 0x22262c },
];

const SKINS = [0xf0c8a8, 0xe0aa84, 0xc68a62, 0x9a6440, 0x6e4630];
const BEARDS = [0x6a4a2a, 0x3a2a1e, 0xb8b0a4, 0xa0522d];

/** Everything the figure is built from, decoded from the look number. */
export interface Look {
  outfit: Outfit;
  skin: number;
  /** Beard colour, or null for none. */
  beard: number | null;
}

export function decodeLook(look: number): Look {
  const n = Math.abs(Math.floor(look));
  const outfit = OUTFITS[n % OUTFITS.length];
  const skin = SKINS[Math.floor(n / OUTFITS.length) % SKINS.length];
  const b = Math.floor(n / (OUTFITS.length * SKINS.length)) % (BEARDS.length * 2);
  return { outfit, skin, beard: b < BEARDS.length ? BEARDS[b] : null };
}

/** A look for a player with none (a host on an older version): from their id, so it stays put. */
export function lookFromId(id: string): number {
  let h = 7;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** A fresh random look (the host picks one for each player as they join). */
export function randomLook(): number {
  return Math.floor(Math.random() * 1e6);
}

/**
 * The head: face toward -z (the way they look), centred on the head's position. A face of
 * skin with eyes and a nose (so you see which way they're looking), maybe a beard, and the
 * hat, with the player's colour as a band or bobble.
 */
export function headGeometry(l: Look, accent: number): THREE.BufferGeometry {
  const parts = [
    part(new THREE.BoxGeometry(0.17, 0.21, 0.2), l.skin),
    part(new THREE.BoxGeometry(0.03, 0.045, 0.03).translate(0, -0.005, -0.112), l.skin), // nose
    ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.02, 0.013, 0.01).translate(s * 0.04, 0.03, -0.101), 0x1a1d22)), // eyes
    ...[-1, 1].map((s) => part(new THREE.BoxGeometry(0.02, 0.045, 0.04).translate(s * 0.092, 0.0, 0.0), l.skin)), // ears
  ];
  if (l.beard !== null) {
    parts.push(part(new THREE.BoxGeometry(0.175, 0.08, 0.06).translate(0, -0.075, -0.08), l.beard));
    parts.push(part(new THREE.BoxGeometry(0.06, 0.016, 0.012).translate(0, -0.035, -0.105), l.beard)); // moustache
  }
  const hc = l.outfit.hatColor;
  switch (l.outfit.hat) {
    case 'souwester':
      parts.push(part(new THREE.CylinderGeometry(0.1, 0.11, 0.1, 10).translate(0, 0.12, 0.005), hc));
      parts.push(part(new THREE.CylinderGeometry(0.16, 0.17, 0.015, 12).rotateX(-0.25).translate(0, 0.085, 0.03), hc)); // brim, long at the back
      parts.push(part(new THREE.BoxGeometry(0.18, 0.012, 0.02).translate(0, 0.075, -0.075), accent)); // band
      break;
    case 'beanie':
      parts.push(part(new THREE.CylinderGeometry(0.075, 0.098, 0.1, 10).translate(0, 0.13, 0), hc));
      parts.push(part(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 10).translate(0, 0.09, 0), accent)); // turn-up
      parts.push(part(new THREE.SphereGeometry(0.03, 6, 4).translate(0, 0.19, 0), accent)); // bobble
      break;
    case 'cap':
      parts.push(part(new THREE.CylinderGeometry(0.085, 0.097, 0.07, 10).translate(0, 0.125, 0), hc));
      parts.push(part(new THREE.BoxGeometry(0.15, 0.012, 0.09).translate(0, 0.095, -0.13), accent)); // peak
      break;
    case 'hardhat':
      parts.push(part(new THREE.SphereGeometry(0.11, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.09, 0), hc));
      parts.push(part(new THREE.CylinderGeometry(0.125, 0.125, 0.012, 12).translate(0, 0.09, -0.01), hc));
      parts.push(part(new THREE.BoxGeometry(0.03, 0.03, 0.2).translate(0, 0.19, 0), accent)); // ridge stripe
      break;
    case 'flatcap':
      parts.push(part(new THREE.CylinderGeometry(0.1, 0.1, 0.045, 10).scale(1, 1, 1.15).rotateX(0.12).translate(0, 0.12, -0.01), hc));
      parts.push(part(new THREE.BoxGeometry(0.14, 0.01, 0.06).translate(0, 0.1, -0.12), hc));
      parts.push(part(new THREE.BoxGeometry(0.2, 0.01, 0.01).translate(0, 0.104, -0.095), accent)); // a coloured seam
      break;
  }
  return mergeParts(parts);
}

/**
 * The torso: hangs from the neck (the origin) down -y for `torsoLength`, front toward -z.
 * Upper body only (owner's choice): it ends at the waist. A collar of the player's colour.
 */
export function torsoGeometry(l: Look, accent: number): THREE.BufferGeometry {
  const o = l.outfit;
  const L = CONFIG.avatar.torsoLength;
  const sw = CONFIG.avatar.shoulderHalf * 2 + 0.06;
  const parts = [
    part(new THREE.BoxGeometry(sw, 0.16, 0.22).translate(0, -0.1, 0), o.jacket), // shoulders and chest
    part(new THREE.BoxGeometry(sw - 0.08, L - 0.16, 0.2).translate(0, -0.18 - (L - 0.16) / 2 + 0.02, 0), o.jacket), // waist
    part(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 8).translate(0, -0.015, 0), l.skin), // neck
    part(new THREE.CylinderGeometry(0.085, 0.09, 0.04, 8).translate(0, -0.035, 0), accent), // collar
  ];
  switch (o.trimKind) {
    case 'bib': // bib-and-brace: the bib on the front, braces over the shoulders
      parts.push(part(new THREE.BoxGeometry(0.22, L - 0.2, 0.02).translate(0, -0.2 - (L - 0.2) / 2 + 0.05, -0.105), o.trim));
      for (const s of [-1, 1]) parts.push(part(new THREE.BoxGeometry(0.04, 0.02, 0.24).translate(s * 0.08, -0.025, 0), o.trim));
      break;
    case 'vest': // hi-vis vest with a silver band round it
      parts.push(part(new THREE.BoxGeometry(sw - 0.06, L - 0.14, 0.215).translate(0, -0.12 - (L - 0.14) / 2 + 0.02, 0), o.trim));
      parts.push(part(new THREE.BoxGeometry(sw - 0.05, 0.03, 0.225).translate(0, -L + 0.12, 0), 0xc8ccd0));
      break;
    case 'bands': // reflective bands round the chest and waist
      for (const y of [-0.16, -L + 0.1]) parts.push(part(new THREE.BoxGeometry(sw - (y < -0.2 ? 0.07 : 0), 0.03, 0.225).translate(0, y, 0), o.trim));
      break;
    case 'yoke': // a jumper's ribbed yoke across the shoulders
      parts.push(part(new THREE.BoxGeometry(sw + 0.005, 0.06, 0.225).translate(0, -0.06, 0), o.trim));
      break;
    case 'collar': // a big dark collar and zip
      parts.push(part(new THREE.BoxGeometry(0.2, 0.06, 0.23).translate(0, -0.05, 0), o.trim));
      parts.push(part(new THREE.BoxGeometry(0.015, L - 0.1, 0.01).translate(0, -0.08 - (L - 0.1) / 2, -0.105), o.trim));
      break;
  }
  return mergeParts(parts);
}

/** An arm segment: from the origin down -y for `length` (sleeve colour), with a cuff on the forearm. */
export function armGeometry(l: Look, length: number, cuff: boolean): THREE.BufferGeometry {
  const parts = [part(new THREE.CylinderGeometry(0.045, cuff ? 0.04 : 0.045, length, 7).translate(0, -length / 2, 0), l.outfit.jacket)];
  if (cuff) parts.push(part(new THREE.CylinderGeometry(0.043, 0.043, 0.03, 7).translate(0, -length + 0.02, 0), l.outfit.trimKind === 'yoke' ? l.outfit.trim : 0x2a2e33));
  return mergeParts(parts);
}

/**
 * A woollen mitt (owner: keep it simple, no fingers), closed round the controller, in the
 * controller's grip frame (WebXR grip space: origin in the palm, the handle running along
 * z through the fist, -z forward; +x is to the player's right for both hands):
 *   - the mitt: one rounded lump round the handle, a little toward the back of the hand
 *     (outboard: +x for the right hand, -x for the left);
 *   - the thumb: a lobe on top on the inner side, lying forward along the handle;
 *   - the cuff: a ribbed band at the wrist, where the forearm leaves the fist (back and a
 *     little down), a shade darker, hiding the join with the sleeve.
 * Its shape shows the hand's roll, pitch and yaw from across the deck.
 */
export function gloveGeometry(l: Look, side: -1 | 1): THREE.BufferGeometry {
  const g = l.outfit.gloves;
  const cuff = new THREE.Color(g).multiplyScalar(0.7).getHex();
  return mergeParts([
    part(new THREE.SphereGeometry(1, 10, 8).scale(0.042, 0.05, 0.056).translate(side * 0.006, -0.004, -0.006), g), // the mitt
    part(new THREE.CapsuleGeometry(0.017, 0.03, 3, 8).rotateX(-1.21).translate(-side * 0.03, 0.03, -0.03), g), // thumb lobe
    part(new THREE.CylinderGeometry(0.036, 0.04, 0.045, 10).rotateX(-1.1).translate(0, -0.024, 0.052), cuff), // cuff
  ]);
}

/**
 * The hand in each gesture pose (player/handGesture.ts), in the same grip frame as the mitt
 * (-z forward, +y up, the thumb on the inner side). `rest` is the mitt itself; the others are
 * a closed fist:
 *   - the back of the hand, a little smaller than the mitt round the controller;
 *   - four knuckles stacked down the front, index on top;
 *   - the thumb on top on the inner side, as on the mitt (folded across the front for `rude`);
 *   - `point`: the index finger out instead of its knuckle, straight forward;
 *   - `rude`: the middle finger out instead of its knuckle, a little longer.
 * The finger points along the hand: turn the hand to aim it (up, for the rude one).
 */
export function handGeometry(l: Look, side: -1 | 1, pose: HandPose): THREE.BufferGeometry {
  if (pose === 'rest') return gloveGeometry(l, side);
  const g = l.outfit.gloves;
  const cuff = new THREE.Color(g).multiplyScalar(0.7).getHex();
  const out = pose === 'point' ? 0 : pose === 'rude' ? 1 : -1;
  const knuckleY = [0.024, 0.006, -0.012, -0.03];
  const parts = [
    part(new THREE.SphereGeometry(1, 10, 8).scale(0.04, 0.046, 0.044).translate(side * 0.006, -0.004, 0.002), g), // back of the hand
    // The thumb: on top, along the hand; for the rude one folded across the front of the fist,
    // so the middle finger stands alone.
    pose === 'rude'
      ? part(new THREE.CapsuleGeometry(0.0135, 0.026, 3, 8).rotateZ(Math.PI / 2).translate(-side * 0.008, -0.016, -0.05), g)
      : part(new THREE.CapsuleGeometry(0.016, 0.028, 3, 8).rotateX(-1.21).translate(-side * 0.028, 0.026, -0.026), g),
    part(new THREE.CylinderGeometry(0.036, 0.04, 0.045, 10).rotateX(-1.1).translate(0, -0.024, 0.052), cuff), // cuff
  ];
  knuckleY.forEach((y, i) => {
    if (i !== out) parts.push(part(new THREE.SphereGeometry(1, 8, 6).scale(0.017, 0.0125, 0.016).translate(side * 0.008, y, -0.036), g));
  });
  if (out >= 0) {
    // The finger: a capsule along -z from its knuckle (CapsuleGeometry runs along +y).
    const r = out === 0 ? 0.0105 : 0.011;
    const len = out === 0 ? 0.052 : 0.06;
    parts.push(part(new THREE.CapsuleGeometry(r, len, 3, 8).rotateX(-Math.PI / 2).translate(side * 0.006, knuckleY[out], -0.03 - len / 2 - r), g));
  }
  return mergeParts(parts);
}

/** Every pose's hand for a look and side, built once and shared (own hands, crew-mates'). */
const handCache = new Map<string, Record<HandPose, THREE.BufferGeometry>>();
export function handGeometries(look: number, side: -1 | 1): Record<HandPose, THREE.BufferGeometry> {
  const key = `${look}:${side}`;
  let set = handCache.get(key);
  if (!set) {
    const l = decodeLook(look);
    // Turned to sit right on the controller (CONFIG.avatar.handTurn): pitch forward (about
    // +x, by minus the angle: +y toward -z), then roll (about +z: +y toward -x).
    const t = CONFIG.avatar.handTurn;
    const turn = new THREE.Matrix4().makeRotationZ((t.rollDeg * Math.PI) / 180).multiply(new THREE.Matrix4().makeRotationX((-t.pitchDeg * Math.PI) / 180));
    const hand = (pose: HandPose) => handGeometry(l, side, pose).applyMatrix4(turn);
    set = { rest: hand('rest'), fist: hand('fist'), point: hand('point'), rude: hand('rude') };
    handCache.set(key, set);
  }
  return set;
}

/**
 * The recording camera as crew-mates see it (player/cameraMode.ts): a small hand-held camera,
 * its origin at the lens, looking down -z. A dark body behind the lens, the lens with a
 * glass ring, a red record light on top, a stub of handle under it to hold it by, and a
 * band in the camera player's colour on each side. Generic, no brand look.
 */
export function cameraBodyGeometry(accent: number): THREE.BufferGeometry {
  const body = 0x2a2e33;
  return mergeParts([
    part(new THREE.BoxGeometry(0.1, 0.07, 0.05).translate(0, 0, 0.03), body),
    part(new THREE.CylinderGeometry(0.024, 0.026, 0.02, 14).rotateX(Math.PI / 2).translate(0, 0, -0.002), 0x141618),
    part(new THREE.CylinderGeometry(0.016, 0.016, 0.004, 14).rotateX(Math.PI / 2).translate(0, 0, -0.013), 0x3a6a8a),
    part(new THREE.BoxGeometry(0.012, 0.008, 0.012).translate(0.03, 0.039, 0.012), 0xe02020),
    part(new THREE.CylinderGeometry(0.013, 0.015, 0.075, 8).translate(0, -0.07, 0.035), 0x4a4f56),
    part(new THREE.BoxGeometry(0.102, 0.016, 0.03).translate(0, 0.012, 0.03), accent),
  ]);
}
