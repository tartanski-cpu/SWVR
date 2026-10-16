/**
 * The assembler (modular boats): turns a recipe into a boat's modules.
 *
 * View side: for each mounted module with a view, build it at its socket. A socket's
 * place is in its parent's axes (the hull's, or the parent module's), so a module's place
 * on the boat is its parents' transforms in turn. Each module gets a group at that place;
 * its controls and moving parts go in it. What the boat's modules share is gathered here:
 *   - their fixed parts, to be merged into the boat's shared mesh (for now by the Bridge,
 *     which bakes every part marked fixed into its one draw call, as before);
 *   - their engraved labels, drawn together in one mesh;
 *   - their screens, on one display atlas: one texture, one draw call.
 *
 * The simulation side joins when the first module with a sim half is converted (M4).
 */
import * as THREE from 'three';
import type { Control } from '../controls/Control';
import { DisplayAtlas } from '../controls/instruments';
import type { EnvironmentState } from '../environment/environmentState';
import type { VesselDef, WorkboatDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { busOf } from './bus';
import { hullQueries, type HullLibrary } from './hull';
import type { ModuleViewInstance } from './module';
import { PALETTE } from './palette';
import { flattenMounts, validateRecipe, type ModuleLibrary, type Recipe } from './recipe';
import type { Transform } from './socket';

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

/** An engraved label, placed on the boat (vessel axes). */
export interface PlacedLabel {
  text: string;
  at: [number, number, number];
  title: boolean;
  yaw: number;
}

/** A boat's modules, drawn. */
export interface AssembledView {
  /** Every built module, parents before children. */
  modules: BuiltModule[];
  /** All their controls, for the interaction system. */
  controls: Control[];
  /** All their extra fixed geometry, in vessel axes, for the boat's merged mesh. */
  staticParts: THREE.BufferGeometry[];
  /** All their engraved labels, in vessel axes. */
  labels: PlacedLabel[];
  /** Their screens, merged (one draw call), or null if none. */
  screens: THREE.Mesh | null;
  /** Is there a module on this socket path? */
  has(path: string): boolean;
  /**
   * Each frame: every module's view from the boat's state, and the screens (only when
   * someone could see them: the atlas upload is the costly part on the Quest).
   */
  update(state: VesselState, dt: number, screens: { inView: boolean; def: WorkboatDef; env: EnvironmentState | null } | null): void;
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
  const labels: PlacedLabel[] = [];
  const atlas = new DisplayAtlas();
  const v = new THREE.Vector3();
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
        throw new Error('shared instanced parts are not built yet');
      },
      display: (screen, plane, circuit) => atlas.add(screen, plane.applyMatrix4(place), circuit),
    });
    const root = new THREE.Group();
    root.name = `module:${m.path}`;
    place.decompose(root.position, root.quaternion, root.scale);
    for (const c of instance.controls) root.add(c.root);
    for (const o of instance.movingParts) root.add(o);
    for (const g of instance.staticParts) staticParts.push(g.applyMatrix4(place));
    for (const l of instance.labels ?? []) {
      v.set(...l.at).applyMatrix4(place);
      labels.push({ text: l.text, at: [v.x, v.y, v.z], title: !!l.title, yaw: l.yaw ?? 0 });
    }
    controls.push(...instance.controls);
    modules.push({ path: m.path, id: m.def.id, root, instance });
  }
  const screens = atlas.finish();
  const paths = new Set(mounted.map((m) => m.path));
  return {
    modules,
    controls,
    staticParts,
    labels,
    screens,
    has: (path) => paths.has(path),
    update(state, dt, s) {
      if (modules.length) {
        const read = busOf(state);
        for (const m of modules) m.instance.update(read, undefined, dt);
      }
      if (s?.inView) atlas.update(state, s.def, dt, s.env);
    },
  };
}
