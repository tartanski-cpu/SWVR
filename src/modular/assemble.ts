/**
 * The assembler (modular boats): turns a recipe into a boat's modules.
 *
 * View side (here, M2): for each mounted module with a view, build it at its socket. A
 * socket's place is in its parent's axes (the hull's, or the parent module's), so a
 * module's place on the boat is its parents' transforms in turn. Each module gets a group
 * at that place; its controls and moving parts go in it, and its fixed parts are merged
 * into the boat's shared meshes by whoever owns them (for now the Bridge, which bakes
 * every part marked fixed into its one draw call, as before).
 *
 * The simulation side joins when the first module with a sim half is converted (M4).
 */
import * as THREE from 'three';
import type { Control } from '../controls/Control';
import type { VesselDef } from '../vessel/vesselDef';
import { busOf } from './bus';
import { hullQueries, type HullLibrary } from './hull';
import type { ModuleViewInstance } from './module';
import { PALETTE } from './palette';
import { flattenMounts, validateRecipe, type ModuleLibrary, type Recipe } from './recipe';
import type { Transform } from './socket';
import type { VesselState } from '../vessel/vesselState';

/** A socket transform as a matrix (rotation applied Y, then X, then Z, like the vessel's). */
export function transformMatrix(t: Transform, out = new THREE.Matrix4()): THREE.Matrix4 {
  const [rx, ry, rz] = (t.rotationDeg ?? [0, 0, 0]).map((d) => (d * Math.PI) / 180);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  return out.compose(new THREE.Vector3(...t.position), q, new THREE.Vector3(1, 1, 1));
}

/** One module as built on this boat. */
export interface BuiltModule {
  path: string;
  id: string;
  /** Its group, at its place on the boat (vessel axes). */
  root: THREE.Group;
  instance: ModuleViewInstance<unknown>;
}

/** A boat's modules, drawn. */
export interface AssembledView {
  /** Every built module, parents before children. */
  modules: BuiltModule[];
  /** All their controls, for the interaction system. */
  controls: Control[];
  /** All their extra fixed geometry, in vessel axes, for the boat's merged mesh. */
  staticParts: THREE.BufferGeometry[];
  /** Is there a module on this socket path? */
  has(path: string): boolean;
  /** Each frame: every module's view from the boat's state. */
  update(state: VesselState, dt: number): void;
}

/**
 * Build the view side of a boat from her recipe. The recipe is checked first; a bad one
 * throws with every problem listed (a shipped recipe is also checked by the tests, so this
 * is for one being worked on).
 */
export function assembleView(recipe: Recipe, def: VesselDef, lib: { hulls: HullLibrary; modules: ModuleLibrary }): AssembledView {
  const errors = validateRecipe(recipe, lib);
  if (errors.length) throw new Error(`Recipe '${recipe.id}' has problems:\n  ${errors.join('\n  ')}`);
  const { mounted } = flattenMounts(recipe, lib.hulls, lib.modules);
  const hull = hullQueries(def);
  const places = new Map<string, THREE.Matrix4>();
  const modules: BuiltModule[] = [];
  const controls: Control[] = [];
  const staticParts: THREE.BufferGeometry[] = [];
  for (const m of mounted) {
    const parent = m.path.includes('/') ? places.get(m.path.slice(0, m.path.lastIndexOf('/'))) : undefined;
    const place = transformMatrix(m.socket.transform);
    if (parent) place.premultiply(parent);
    places.set(m.path, place);
    if (!m.def.view) continue;
    const instance = m.def.view.build({
      config: m.config,
      socket: m.socket,
      path: m.path,
      keys: m.keys,
      hull,
      palette: PALETTE,
      instance: () => {
        throw new Error('shared instanced parts arrive in M3');
      },
    });
    const root = new THREE.Group();
    root.name = `module:${m.path}`;
    place.decompose(root.position, root.quaternion, root.scale);
    for (const c of instance.controls) root.add(c.root);
    for (const o of instance.movingParts) root.add(o);
    for (const g of instance.staticParts) staticParts.push(g.clone().applyMatrix4(place));
    controls.push(...instance.controls);
    modules.push({ path: m.path, id: m.def.id, root, instance });
  }
  const paths = new Set(mounted.map((m) => m.path));
  return {
    modules,
    controls,
    staticParts,
    has: (path) => paths.has(path),
    update(state, dt) {
      if (!modules.length) return;
      const read = busOf(state);
      for (const m of modules) m.instance.update(read, undefined, dt);
    },
  };
}
