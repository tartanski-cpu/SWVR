/**
 * Her machinery, drawn for the Shipyard's Engine step (owner, Oct 2026): the engine she has
 * (one of the four types, singly or as a twin installation), its gearbox, the shaft down to
 * the propeller, the propeller at the diameter her design gives it, and the rudder behind.
 * Shown inside a ghost of her hull and house, so you see what's fitted and where.
 *
 * The engines are the game's own models (vessel/view/engineModels.ts: the game draws them too,
 * under their hatch, baked into the boat's fixed parts), sized as build.ts ENGINES says;
 * the shafts, propellers, Kort nozzles and rudders are drawn only here.
 */
import * as THREE from 'three';
import type { HullForm } from '../vessel/hullForm';
import { box, BRONZE, buildEngineModel, drum, ENGINE_LOOKS, mat, placeEngine, STEEL } from '../vessel/view/engineModels';
import { CONFIG } from '../config';
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
  /** Stern drives: the engines only (no shaft, propeller or rudder: the legs are the outboard module's). */
  sterndrive?: boolean;
  /** A Kort nozzle round each propeller (design.nozzle; CONFIG.nozzle.look). */
  nozzle?: boolean;
  /**
   * Drawn as Z-drives (the harbour tug's, DesignHull.zDrives: her stand-in shafts until her
   * azimuth drives come): see zDrive.
   */
  zDrive?: boolean;
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
 * A Kort nozzle (CONFIG.nozzle.look) round a propeller of diameter `d`: a duct `lengthD` d
 * long, turned (lathed) from its section. Inside, the mouth flares wider forward and closes
 * to its throat at the propeller, the blade tips `tipGap` d from it, then opens a little to
 * the outlet; outside, nearly straight. The section is thick and rounded at its leading
 * edge, thin at its trailing edge, as a duct's foil is. Its axis along her length (the
 * propeller's shaft line: the caller tilts it), centred on the propeller.
 */
export function buildNozzle(d: number): THREE.Group {
  const k = CONFIG.nozzle.look;
  const r = d / 2 + k.tipGap * d; // the throat
  const half = (k.lengthD * d) / 2;
  const nose = k.noseD * d;
  // The section in (radius, along): y = -half is the mouth (forward), +half the outlet (aft).
  const inner: [number, number][] = [
    [r * (1 + k.inletFlare), -half],
    [r * (1 + k.inletFlare * 0.35), -half * 0.6],
    [r * 1.005, -half * 0.2],
    [r, 0],
    [r * 1.01, half * 0.5],
    [r * 1.03, half],
  ];
  const outer: [number, number][] = [
    [r * 1.03 + 0.01 * d, half],
    [r + nose * 0.75, half * 0.2],
    [r + nose, -half * 0.5],
    [r * (1 + k.inletFlare) + nose * 0.6, -half * 0.92],
  ];
  const pts = [...inner, ...outer, inner[0]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.Group();
  const duct = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), new THREE.MeshStandardMaterial({ color: 0x3b4148, metalness: 0.45, roughness: 0.55, side: THREE.DoubleSide }));
  duct.rotation.x = Math.PI / 2; // the lathe's axis (y) along her length (z), the mouth forward
  duct.name = 'nozzle';
  g.add(duct);
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
    // (A Z-drive's engine lies level: its shaft runs level aft to the drive's top.)
    const { holder, model: e } = placeEngine(m.engine, size, { x: s * sh.x, flangeY: sh.flangeY, flangeZ: sh.flangeZ, angleDeg: m.zDrive ? 0 : sh.angleDeg });
    if (!sh.fits) e.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.material = TOO_TALL;
    });
    out.add(holder);
    if (m.sterndrive) continue;
    if (m.zDrive) {
      zDrive(out, m, holder.position, s * (m.twin ? m.twinX : 0), sh.propY);
      continue;
    }
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
    // A Kort nozzle round it, on its shaft line, hung from her bottom by its headbox plate.
    const chord = Math.max(0.25, m.propD * 0.45);
    let rudderZ = m.rudderZ + 0.05;
    if (m.nozzle) {
      const k = CONFIG.nozzle.look;
      const nz = buildNozzle(m.propD);
      nz.position.copy(to);
      nz.rotation.x = tilt;
      out.add(nz);
      const outerR = m.propD / 2 + k.tipGap * m.propD + k.noseD * m.propD;
      const half = (k.lengthD * m.propD) / 2;
      if (k.headbox) {
        const bottom = bottomAt(m.form, px, m.propZ);
        const h = bottom - (to.y + outerR * 0.9);
        if (h > 0.02) box(out, 0.05, h + 0.05, half * 1.2, px, to.y + outerR * 0.9 + h / 2, m.propZ, 0x3b4148);
      }
      // (The rudder hangs just aft of the duct's outlet, its lower lip swung aft by the shaft's
      // angle: drawn clear of it.)
      rudderZ = Math.max(rudderZ, m.propZ + half * Math.cos(tilt) + outerR * Math.sin(Math.abs(tilt)) + chord / 2 + 0.03);
    }
    // The rudder: from her bottom over it down to the propeller's lower tip.
    const top = bottomAt(m.form, px, m.nozzle ? rudderZ : m.rudderZ);
    const rh = Math.max(0.2, top - (to.y - m.propD / 2));
    const rudder = box(out, 0.04, rh, chord, px, top - rh / 2, rudderZ, 0x5d646b);
    rudder.name = 'rudder';
  }
  return out;
}

/**
 * A Z-drive (owner, Oct 2026: the harbour tug's nozzles "facing the direction of travel. So like
 * a Z in between the shaft and the thing"): from the engine's flange a shaft level aft to the
 * drive's top, an upright leg down through her bottom, and at its foot the lower gear housing
 * with the propeller in its nozzle, level, facing ahead. No rudder: an azimuth drive steers by
 * turning. Drawn only (the boat still has her stand-in shafts and nozzles: her real drives,
 * with their controls, come later).
 */
function zDrive(out: THREE.Group, m: Machinery, flange: THREE.Vector3, px: number, propY: number): void {
  const d = m.propD;
  const top = new THREE.Vector3(px, flange.y, m.propZ);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, flange.distanceTo(top), 10), mat(STEEL, 0.7));
  shaft.position.copy(flange).add(top).multiplyScalar(0.5);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(flange).normalize());
  out.add(shaft);
  // The upper gearbox (the shaft's turn down), the leg (streamlined: narrow across, long fore and aft), the lower housing.
  const grey = 0x4a5560;
  box(out, 0.5, 0.45, 0.6, px, top.y, m.propZ, grey);
  const legTop = top.y;
  const legFoot = propY;
  box(out, 0.22, legTop - legFoot, 0.32 * d, px, (legTop + legFoot) / 2, m.propZ + 0.05 * d, grey);
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * d, 0.07 * d, 0.7 * d, 12), mat(grey, 0.4));
  housing.rotation.x = Math.PI / 2;
  housing.position.set(px, propY, m.propZ + 0.2 * d);
  out.add(housing);
  // The propeller and its nozzle, level, at the housing's forward end (a pulling propeller, as on most azimuth drives).
  const prop = buildPropeller(d);
  prop.position.set(px, propY, m.propZ);
  prop.name = 'propeller';
  out.add(prop);
  if (m.nozzle) {
    const nz = buildNozzle(d);
    nz.position.set(px, propY, m.propZ);
    out.add(nz);
  }
}

/** An engine that doesn't fit: tinted red. */
const TOO_TALL = new THREE.MeshStandardMaterial({ color: 0xd04a3a, roughness: 0.6, transparent: true, opacity: 0.85 });
