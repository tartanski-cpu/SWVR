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
 *   fittings   what's built into the hull: lights, exhaust outlet, rescue places, the
 *              bridge's fit-out (6b); her machinery and gear are her modules' (gearOf)
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Vec3 } from '../core/math';
import { wettedSurfaceAtDWL, type VesselDef } from '../vessel/vesselDef';
import { hullFormOf, hullQueries, type HullLibrary } from './hull';
import type { HullQueries } from './module';
import { combine, type PointMass } from './massProperties';
import { flattenMounts, type ModuleLibrary, type MountedModule, type Recipe } from './recipe';
import type { Transform } from './socket';

export const matrixOf = (t: Transform): THREE.Matrix4 => {
  const [rx, ry, rz] = (t.rotationDeg ?? [0, 0, 0]).map((d) => (d * Math.PI) / 180);
  return new THREE.Matrix4().compose(new THREE.Vector3(...t.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
};

/** Where each mounted module sits: its socket's place in the boat's axes, through its parents'. */
export function mountPlaces(mounted: readonly MountedModule[]): Map<string, THREE.Matrix4> {
  const places = new Map<string, THREE.Matrix4>();
  for (const m of mounted) {
    const slash = m.path.lastIndexOf('/');
    const parent = slash >= 0 ? places.get(m.path.slice(0, slash)) : undefined;
    const place = matrixOf(m.socket.transform);
    if (parent) place.premultiply(parent);
    places.set(m.path, place);
  }
  return places;
}

/** The modules that declare a mass, as point masses at their CG in the boat's axes. */
export function moduleMasses(mounted: readonly MountedModule[], hull?: HullQueries): PointMass[] {
  const places = mountPlaces(mounted);
  const out: PointMass[] = [];
  for (const m of mounted) {
    const place = places.get(m.path)!;
    const toBoat = (q: readonly [number, number, number]): [number, number, number] => new THREE.Vector3(...q).applyMatrix4(place).toArray();
    const p = m.def.physical?.(m.config as never, hull, toBoat);
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
  const form = hullFormOf(hull.form);
  const mass = combine(hull.lightship, moduleMasses(mounted, hullQueries({ hull: form, layout: hull.layout })));
  const a = hull.addedMass;
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
    ...(hull.planing ? { planing: hull.planing } : {}),
    boardingSpot: [...hull.helm.stand] as Vec3,
    spawn: hull.spawn,
    windage: hull.windage,
    layout: hull.layout,
    cargo: hull.cargo,
    ...hull.fittings,
  };
}
