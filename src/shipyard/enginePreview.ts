/**
 * Her machinery, drawn for the Shipyard's Engine step (owner, Oct 2026): the engine she has
 * (one of the four types, singly or as a twin installation), its gearbox, the shaft down to
 * the propeller, the propeller at the diameter her design gives it, and the rudder behind.
 * Shown inside a ghost of her hull and house, so you see what's fitted and where.
 *
 * The engines are the game's own models (vessel/view/engineModels.ts: the game draws them too,
 * under their hatch, baked into the boat's fixed parts), sized as build.ts ENGINES says;
 * the shafts, propellers and rudders are drawn only here.
 */
import * as THREE from 'three';
import type { HullForm } from '../vessel/hullForm';
import { box, BRONZE, buildEngineModel, drum, ENGINE_LOOKS, mat, placeEngine, STEEL } from '../vessel/view/engineModels';
import { ENGINES } from './build';
import { bottomAt, type ShaftLine } from './machinery';

export { ENGINE_LOOKS };

/** What to draw (from her design: build.ts puts the engine bed, propeller and rudder). */
export interface Machinery {
  /** ENGINES index. */
  engine: number;
  /** Two engines, side by side, each with its own shaft, propeller and rudder. */
  twin: boolean;
  /** Her hull (its stations: where her bottom is, machinery.ts). */
  form: Pick<HullForm, 'stations'>;
  /** Her shaft line and the engine on it, as build.ts laid it (machinery.ts layShaft). */
  shaft: ShaftLine;
  /** Twin propellers' distance off the centreline (m). */
  twinX: number;
  /** The propeller's diameter (m) and place along her; the rudder stock's. */
  propD: number;
  propZ: number;
  rudderZ: number;
}

/** One engine and its gearbox (vessel/view/engineModels.ts), at its own size (ENGINES `size`). */
export function buildEngine(type: number): { group: THREE.Group; length: number; height: number } {
  return buildEngineModel(type, ENGINES[type]?.size ?? ENGINES[0].size);
}

/** A propeller of diameter `d`: a hub and four blades, its disc across her length (facing aft). */
export function buildPropeller(d: number): THREE.Group {
  const g = new THREE.Group();
  const r = d / 2;
  drum(g, Math.max(0.05, d * 0.09), Math.max(0.1, d * 0.2), 0, 0, 0, BRONZE);
  for (let i = 0; i < 4; i++) {
    // A blade: wide in the middle, rounded off at the tip, pitched about 25°.
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.05 * d);
    shape.quadraticCurveTo(r * 0.55, -0.32 * r, r, -0.05 * r);
    shape.quadraticCurveTo(r * 1.02, 0.12 * r, r * 0.8, 0.2 * r);
    shape.quadraticCurveTo(r * 0.4, 0.3 * r, 0, 0.05 * d);
    const blade = new THREE.Mesh(new THREE.ShapeGeometry(shape, 6), new THREE.MeshStandardMaterial({ color: BRONZE, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
    blade.rotation.x = 0.45; // pitch
    const arm = new THREE.Group();
    arm.rotation.z = (i * Math.PI) / 2 + 0.3;
    arm.add(blade);
    g.add(arm);
  }
  return g;
}

/**
 * Her machinery (one or two of everything) for the Engine step's view, as build.ts laid its
 * shaft line (machinery.ts): each propeller hung under her bottom, the shaft rising forward
 * from it at the shaft angle, the engine tilted to the same angle on the end of it (tinted
 * red if it stands up through her floor), a rudder from her bottom down behind each
 * propeller.
 */
export function buildMachinery(m: Machinery): THREE.Group {
  const out = new THREE.Group();
  const size = ENGINES[m.engine]?.size ?? ENGINES[0].size;
  const sh = m.shaft;
  const tilt = (sh.angleDeg * Math.PI) / 180;
  for (const s of m.twin ? [-1, 1] : [0]) {
    const { holder, model: e } = placeEngine(m.engine, size, { x: s * sh.x, flangeY: sh.flangeY, flangeZ: sh.flangeZ, angleDeg: sh.angleDeg });
    if (!sh.fits) e.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = TOO_TALL;
    });
    out.add(holder);
    // The shaft, straight from the flange to the propeller, out through her bottom.
    const from = holder.position.clone();
    const px = s * (m.twin ? m.twinX : 0);
    const to = new THREE.Vector3(px, sh.propY, m.propZ);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, from.distanceTo(to), 10), mat(STEEL, 0.7));
    shaft.position.copy(from).add(to).multiplyScalar(0.5);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    out.add(shaft);
    const prop = buildPropeller(m.propD);
    prop.position.copy(to);
    prop.rotation.x = tilt; // square to its shaft
    prop.name = 'propeller';
    out.add(prop);
    // The rudder: from her bottom over it down to the propeller's lower tip.
    const top = bottomAt(m.form, px, m.rudderZ);
    const rh = Math.max(0.2, top - (to.y - m.propD / 2));
    const rudder = box(out, 0.04, rh, Math.max(0.25, m.propD * 0.45), px, top - rh / 2, m.rudderZ + 0.05, 0x5d646b);
    rudder.name = 'rudder';
  }
  return out;
}

/** An engine that doesn't fit: tinted red. */
const TOO_TALL = new THREE.MeshStandardMaterial({ color: 0xd04a3a, roughness: 0.6, transparent: true, opacity: 0.85 });
