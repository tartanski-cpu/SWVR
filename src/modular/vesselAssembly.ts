/**
 * A vessel definition from a recipe (modular boats M6a): what the physics, the views and
 * the walk area read about a boat type, built from her hull and her modules.
 *
 *   shape      the hull's form (stations), wetted surface
 *   mass       the hull's lightship plus every module that declares a mass, at its socket
 *              (modular/massProperties.ts): mass, CG, inertia, and the displacement that
 *              floats it (design volume)
 *   handling   the hull's added mass, damping, resistance, windage
 *   layout     the hull's deck and wheelhouse, cargo deck, helm position, spawn
 *   equipment  until 6b, the positions of what only some boats carry still come from the
 *              vessel config the hull names (`legacyDef`)
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Vec3 } from '../core/math';
import { buildHullForm } from '../vessel/hullForm';
import { equipmentOf, wettedSurfaceAtDWL, type VesselConfig, type VesselDef } from '../vessel/vesselDef';
import type { HullLibrary } from './hull';
import { combine, type PointMass } from './massProperties';
import { flattenMounts, type ModuleLibrary, type MountedModule, type Recipe } from './recipe';
import type { Transform } from './socket';

const matrixOf = (t: Transform): THREE.Matrix4 => {
  const [rx, ry, rz] = (t.rotationDeg ?? [0, 0, 0]).map((d) => (d * Math.PI) / 180);
  return new THREE.Matrix4().compose(new THREE.Vector3(...t.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
};

/** The modules that declare a mass, as point masses at their CG in the boat's axes. */
export function moduleMasses(mounted: readonly MountedModule[]): PointMass[] {
  const places = new Map<string, THREE.Matrix4>();
  const out: PointMass[] = [];
  for (const m of mounted) {
    const slash = m.path.lastIndexOf('/');
    const parent = slash >= 0 ? places.get(m.path.slice(0, slash)) : undefined;
    const place = matrixOf(m.socket.transform);
    if (parent) place.premultiply(parent);
    places.set(m.path, place);
    const p = m.def.physical?.(m.config as never);
    if (!p?.massKg) continue;
    const at = new THREE.Vector3(...(p.cg ?? [0, 0, 0])).applyMatrix4(place);
    out.push({ massKg: p.massKg, at: [at.x, at.y, at.z] });
  }
  return out;
}

export function vesselDefFrom(id: string, recipe: Recipe, lib: { hulls: HullLibrary; modules: ModuleLibrary }): VesselDef {
  const hull = lib.hulls.get(recipe.hull);
  if (!hull) throw new Error(`Recipe '${recipe.id}': unknown hull '${recipe.hull}'`);
  const { mounted, errors } = flattenMounts(recipe, lib.hulls, lib.modules);
  if (errors.length) throw new Error(`Recipe '${recipe.id}' has problems:\n  ${errors.join('\n  ')}`);
  const mass = combine(hull.lightship, moduleMasses(mounted));
  const form = buildHullForm(hull.form.params);
  const a = hull.addedMass;
  const legacy = (CONFIG.vessels as Record<string, VesselConfig>)[hull.legacyDef];
  return {
    id,
    hull: form,
    mass: mass.massKg,
    cg: mass.cg as Vec3,
    inertia: mass.inertia,
    addedLinear: [a.sway, a.heave, a.surge],
    addedAngular: [a.pitch, a.yaw, a.roll],
    damping: hull.damping,
    designVolume: mass.massKg / CONFIG.ocean.density,
    wettedSurface: wettedSurfaceAtDWL(form),
    resistance: hull.resistance,
    boardingSpot: [...hull.helm.stand] as Vec3,
    spawn: hull.spawn,
    windage: hull.windage,
    layout: hull.layout,
    cargo: hull.cargo,
    ...equipmentOf(legacy),
  };
}
