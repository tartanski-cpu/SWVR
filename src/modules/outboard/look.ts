/**
 * How the petrol outboards look (owner, Oct 2026: first drawn for the Alaskan 38). Drawing
 * only: their physics is the module's (index.ts).
 *
 * One unit, in its own axes: the origin on its steering axis at the top of its mount (the
 * cowl's underside), forward -z, so it swings by turning about y. From the top: the cowl
 * (the engine), the pan under it, the air intake at its back; the leg down to the
 * anti-ventilation plate; the gearcase below it, its torpedo, nose and skeg; the propeller
 * behind the torpedo. One mesh, vertex-coloured.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { part } from '../../render/geometryUtils';

export type OutboardLook = typeof CONFIG.modules.outboard.look;

const COWL = 0xeeeeea; // the cowl
const DARK = 0x2f3438; // the pan, the leg and the lower unit
const BRONZE = 0xc08a3e; // the propeller

type V3 = [number, number, number];
const box = (w: number, h: number, l: number, at: V3, colour: number) => part(new THREE.BoxGeometry(w, h, l).translate(at[0], at[1], at[2]), colour);
const drum = (r: number, l: number, at: V3, colour: number, sides = 12) => part(new THREE.CylinderGeometry(r, r, l, sides).rotateX(Math.PI / 2).translate(at[0], at[1], at[2]), colour);

/** The leg's place aft of the steering axis (m): the propeller's, less the gearcase's length ahead of it. */
const legZ = (o: OutboardLook) => o.propAft - 0.42;

/**
 * One outboard's parts, in its own axes (see above). `propD`: the propeller's diameter.
 * `sterndrive`: a stern drive's outdrive leg instead (its engine is inside the boat): no cowl,
 * a low gimbal housing at the top of the leg in its place (`cowlWidth` by `cowlLength`).
 */
export function outboardUnitParts(o: OutboardLook, propD: number, sterndrive = false): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const zCowl = o.cowlLength / 2 - 0.05;
  if (sterndrive) parts.push(box(o.cowlWidth, 0.22, o.cowlLength, [0, -0.11, zCowl - 0.05], DARK)); // the gimbal housing
  else {
    parts.push(box(o.cowlWidth, o.cowlHeight, o.cowlLength, [0, o.cowlHeight / 2, zCowl], COWL));
    parts.push(box(o.cowlWidth + 0.02, 0.08, o.cowlLength - 0.1, [0, 0.04, zCowl], DARK)); // the pan
    parts.push(box(o.cowlWidth * 0.55, o.cowlHeight * 0.35, 0.02, [0, o.cowlHeight / 2 + 0.05, zCowl + o.cowlLength / 2 + 0.01], DARK)); // the air intake
  }
  const zl = legZ(o);
  const plate = -o.shaftLength;
  const gear = plate - o.gearDrop;
  parts.push(box(o.legWidth, o.shaftLength, 0.42, [0, plate / 2, zl], DARK)); // the leg
  parts.push(box(o.legWidth + 0.3, 0.025, 0.7, [0, plate, zl + 0.05], DARK)); // anti-ventilation plate
  parts.push(box(o.legWidth * 0.8, o.gearDrop, 0.34, [0, (plate + gear) / 2, zl], DARK)); // gearcase
  parts.push(drum(0.1, 0.62, [0, gear, zl + 0.06], DARK, 14)); // the torpedo
  parts.push(part(new THREE.ConeGeometry(0.1, 0.22, 14).rotateX(-Math.PI / 2).translate(0, gear, zl - 0.36), DARK)); // its nose
  parts.push(box(0.03, 0.42, 0.26, [0, gear - 0.1, zl - 0.08], DARK)); // the skeg
  parts.push(drum(0.045, 0.1, [0, gear, o.propAft], BRONZE, 10)); // the hub
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.BoxGeometry(0.07, propD / 2 - 0.04, 0.012).translate(0, propD / 4 + 0.02, 0);
    blade.rotateY(0.6).rotateZ((i * 2 * Math.PI) / 3).translate(0, gear, o.propAft);
    parts.push(part(blade, BRONZE));
  }
  return parts;
}

/** Each unit's clamp bracket on the mount (fixed: the unit swings behind it), boat axes; a stern drive's shield on the transom, round its bell housing. */
export function mountPlate(o: OutboardLook, x: number, mountY: number, mountZ: number, sterndrive = false): THREE.BufferGeometry {
  if (sterndrive) return box(o.cowlWidth + 0.15, 0.5, 0.05, [x, mountY - 0.15, mountZ + 0.025], DARK);
  return box(o.cowlWidth + 0.2, 0.6, 0.06, [x, mountY - 0.3, mountZ + 0.03], 0x9aa0a6);
}
