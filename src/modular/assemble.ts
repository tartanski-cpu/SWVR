/**
 * The assembler (modular boats): turns a recipe into a boat's modules.
 *
 * View side: for each mounted module with a view, build it at its socket. A socket's
 * place is in its parent's axes (the hull's, or the parent module's), so a module's place
 * on the boat is its parents' transforms in turn. Each module gets a group at that place;
 * its controls and moving parts go in it. What the boat's modules share is gathered here:
 *   - their fixed parts, to be merged into the boat's shared mesh (by her boat view,
 *     app/boatView.ts, which bakes every part marked fixed into its one draw call);
 *   - their engraved labels, drawn together in one mesh;
 *   - their screens, on one display atlas: one texture, one draw call;
 *   - their shared moving parts (switch bats, button caps): one instanced mesh per kind.
 * And it applies the recipe's interlocks that disable controls ("hatch shut: the dipstick
 * can't be pulled"), each frame from the bus. Interlocks that limit a key act in the
 * simulation, which joins in M4.
 *
 * The simulation side joins when the first module with a sim half is converted (M4).
 */
import * as THREE from 'three';
import type { Control } from '../controls/Control';
import { DisplayAtlas } from '../controls/instruments';
import type { EnvironmentState } from '../environment/environmentState';
import type { VesselDef } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { busOf, type BusReader } from './bus';
import { hullQueries, type HullLibrary } from './hull';
import type { Footprint, ModuleViewInstance, ViewFrame } from './module';
import { PALETTE } from './palette';
import { SharedParts } from './sharedParts';
import { evalCondition, flattenMounts, parseCondition, validateRecipe, type ModuleLibrary, type Recipe } from './recipe';
import type { Transform } from './socket';

/** A socket transform as a matrix (rotation applied Y, then X, then Z, like the vessel's). */
export function transformMatrix(t: Transform, out = new THREE.Matrix4()): THREE.Matrix4 {
  const [rx, ry, rz] = (t.rotationDeg ?? [0, 0, 0]).map((d) => (d * Math.PI) / 180);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  return out.compose(new THREE.Vector3(...t.position), q, new THREE.Vector3(1, 1, 1));
}

/** Noon, seen from the origin: for a view updated without a scene (tests). */
const NO_FRAME: ViewFrame = { darkness: 0, viewer: new THREE.Vector3() };

/** One module as built on this boat. */
export interface BuiltModule {
  path: string;
  id: string;
  /** Its group, at its place on the boat (vessel axes). */
  root: THREE.Group;
  instance: ModuleViewInstance<unknown>;
}

/** An engraved label, placed on the boat (vessel axes). See EngravedLabel. */
export interface PlacedLabel {
  text: string;
  at: [number, number, number];
  title: boolean;
  yaw: number;
  size?: readonly [number, number];
  offset?: number;
  underside?: boolean;
  face?: number;
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
  /** Their shared moving parts: one instanced mesh per kind (hang them with the modules). */
  shared: THREE.InstancedMesh[];
  /** How many parts each shared mesh draws (debug overlay). */
  sharedCounts: Record<string, number>;
  /** What only this machine knows, for the modules' views ('fm.status'). */
  setLocal(name: string, value: string): void;
  /** Is there a module on this socket path? */
  has(path: string): boolean;
  /** Where the modules' furniture stands (boat axes), with the boat as she is now (a leaf folded). */
  footprints(read: BusReader): Footprint[];
  /** The first module of this id's app-facing part (ModuleViewInstance.api), if any. */
  api<T extends object>(moduleId: string): T | null;
  /** Every module of this id's app-facing part, in recipe order (two tender cranes). */
  apis<T extends object>(moduleId: string): T[];
  /**
   * Each frame: every module's view from the boat's state, and the screens (only when
   * someone could see them: the atlas upload is the costly part on the Quest).
   */
  update(state: VesselState, dt: number, screens: { inView: boolean; def: VesselDef; env: EnvironmentState | null } | null, frame?: ViewFrame): void;
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
  const shared = new SharedParts();
  const full: ViewFrame = { darkness: 0, viewer: new THREE.Vector3() };
  const local = new Map<string, string>();
  const v = new THREE.Vector3();
  for (const m of mounted) {
    const parent = m.path.includes('/') ? places.get(m.path.slice(0, m.path.lastIndexOf('/'))) : undefined;
    // A module drawing in the boat's axes is placed at her origin, wherever it's fitted (see
    // ModuleView.frame); any other at its socket, through its parents' places.
    const boatFrame = m.def.view?.frame === 'boat';
    const place = boatFrame ? new THREE.Matrix4() : transformMatrix(m.socket.transform);
    if (parent && !boatFrame) place.premultiply(parent);
    places.set(m.path, place);
    if (!m.def.view) continue;
    const instance = m.def.view.build({
      config: m.config,
      socket: m.socket,
      path: m.path,
      keys: m.keys,
      hull,
      palette: PALETTE,
      share: (mesh, kind) => shared.share(mesh, kind),
      local: (name) => local.get(name) ?? '',
      display: (screen, plane, circuit) => atlas.add(screen, plane.applyMatrix4(place), circuit),
    });
    const root = new THREE.Group();
    root.name = `module:${m.path}`;
    place.decompose(root.position, root.quaternion, root.scale);
    for (const o of instance.movingParts) root.add(o);
    // A control the module has already hung somewhere in its own parts (the VHF's handset
    // on its clip) stays there.
    for (const c of instance.controls) if (!c.root.parent) root.add(c.root);
    for (const g of instance.staticParts) staticParts.push(g.applyMatrix4(place));
    // (A module stood out from a leaning face, its up tilted toward the helm: its labels stand
    // on that face, read facing the way its up leans, CS6.)
    const up = new THREE.Vector3(0, 1, 0).transformDirection(place);
    // (Only a face leaning back, as the dash's: upright wall panels keep their labels as they were.)
    const onFace = up.y < 0.95 && up.y > 0.05 && Math.hypot(up.x, up.z) > 0.3;
    for (const l of instance.labels ?? []) {
      v.set(...l.at).applyMatrix4(place);
      const face = l.face ?? (onFace ? Math.asin(up.y) : undefined);
      const yaw = l.face === undefined && onFace ? Math.atan2(up.x, up.z) : (l.yaw ?? 0);
      labels.push({ text: l.text, at: [v.x, v.y, v.z], title: !!l.title, yaw, size: l.size, offset: l.offset, underside: l.underside, face });
    }
    controls.push(...instance.controls);
    modules.push({ path: m.path, id: m.def.id, root, instance });
  }
  const screens = atlas.finish();
  // After every module is placed: the shared parts take their places from their modules.
  const sharedMeshes = shared.finish();
  const paths = new Set(mounted.map((m) => m.path));
  // The recipe's interlocks that disable controls (checked by validateRecipe already).
  const interlocks = (recipe.interlocks ?? []).flatMap((il) => {
    const parsed = parseCondition(il.when);
    if (!parsed.ok || !il.disable?.length) return [];
    const ids = new Set(il.disable.map((d) => d.replace(/^control:/, '')));
    const found = controls.filter((c) => ids.has(c.id));
    const missing = [...ids].filter((id) => !found.some((c) => c.id === id));
    if (missing.length) throw new Error(`Recipe '${recipe.id}': an interlock disables ${missing.map((id) => `'${id}'`).join(', ')}, and no module on her has a control by that id`);
    return [{ cond: parsed.cond, controls: found }];
  });
  const disabled = new Set<Control>();
  return {
    modules,
    controls,
    staticParts,
    labels,
    screens,
    shared: sharedMeshes,
    sharedCounts: shared.counts(),
    setLocal: (name, value) => local.set(name, value),
    has: (path) => paths.has(path),
    footprints: (read) =>
      modules.flatMap((m) =>
        (m.instance.footprints?.(read) ?? []).map((f) => {
          // The box's corners onto the boat (axis-aligned around them: sockets turn by right angles).
          m.root.updateMatrix();
          const xs: number[] = [];
          const zs: number[] = [];
          for (const [x, z] of [[f.x0, f.z0], [f.x1, f.z0], [f.x0, f.z1], [f.x1, f.z1]]) {
            v.set(x, 0, z).applyMatrix4(m.root.matrix);
            xs.push(v.x);
            zs.push(v.z);
          }
          return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), top: m.root.position.y + f.top };
        }),
      ),
    api: <T extends object>(id: string) => (modules.find((m) => m.id === id)?.instance.api as T | undefined) ?? null,
    apis: <T extends object>(id: string) => modules.filter((m) => m.id === id && m.instance.api).map((m) => m.instance.api as T),
    update(state, dt, s, frame = NO_FRAME) {
      if (modules.length) {
        const read = busOf(state);
        // (The boat and her weather ride along with the frame: one object, filled in again each time.)
        full.darkness = frame.darkness;
        full.viewer = frame.viewer;
        full.vessel = state;
        full.env = s?.env ?? frame.env ?? null;
        for (const m of modules) m.instance.update(read, state.modules?.[m.path]?.s, dt, full);
        if (interlocks.length) {
          disabled.clear();
          for (const il of interlocks) if (evalCondition(il.cond, read)) for (const c of il.controls) disabled.add(c);
          for (const il of interlocks) for (const c of il.controls) c.enabled = !disabled.has(c);
        }
      }
      shared.update();
      if (s?.inView) atlas.update(state, s.def, dt, s.env);
    },
  };
}
