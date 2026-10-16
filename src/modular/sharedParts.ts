/**
 * Shared moving parts (modular boats, Part C and 2.10): every toggle bat on the boat drawn
 * as ONE instanced mesh, every button cap as another, instead of a draw call each. In VR
 * each draw call is made once per eye, so twenty switch bats cost forty calls a frame;
 * shared, they cost two.
 *
 * How: a control keeps its own bat mesh (it moves it, the pointer hits it: three's
 * Raycaster ignores `visible`), but the mesh is hidden. Each frame its place on the boat,
 * its colour and its glow (the hover highlight, a lit button) are copied to its instance.
 * Copying is a few matrix products per part, and the upload only happens when something
 * moved or changed colour.
 *
 * The glow: three's instanced meshes carry a colour per instance but not a glow
 * ("emissive"), so the material is given one more per-instance attribute, added to the
 * glow in the shader, exactly where three adds the material's own.
 */
import * as THREE from 'three';
import { DECK_SHARED_KINDS, type SharedPartKind } from './module';

interface Slot {
  mesh: THREE.Mesh;
  index: number;
}

/** One kind of shared part: its instanced mesh, and the hidden meshes it draws. */
class SharedKind {
  readonly slots: Slot[] = [];
  mesh: THREE.InstancedMesh | null = null;
  private emissive: THREE.InstancedBufferAttribute | null = null;
  private readonly m = new THREE.Matrix4();
  private readonly prev = new THREE.Matrix4();
  private readonly colour = new THREE.Color();

  constructor(private readonly kind: SharedPartKind) {}

  /** Build the instanced mesh, once every part has been shared and placed. */
  finish(): THREE.InstancedMesh | null {
    if (!this.slots.length) return null;
    const geometry = this.slots[0].mesh.geometry.clone();
    this.emissive = new THREE.InstancedBufferAttribute(new Float32Array(this.slots.length * 3), 3);
    geometry.setAttribute('instanceEmissive', this.emissive);
    const mesh = new THREE.InstancedMesh(geometry, sharedMaterial(), this.slots.length);
    mesh.name = `shared:${this.kind}`;
    // The wheelhouse's: hidden with its other small parts while you're out on deck.
    mesh.userData.interiorDetail = !DECK_SHARED_KINDS.includes(this.kind);
    this.mesh = mesh;
    this.update(true);
    mesh.computeBoundingSphere();
    return mesh;
  }

  /** Copy each part's place, colour and glow to its instance (only uploads on change). */
  update(force = false): void {
    const mesh = this.mesh;
    if (!mesh) return;
    let moved = false;
    let recoloured = false;
    for (const { mesh: part, index } of this.slots) {
      placeIn(part, mesh.parent, this.m);
      mesh.getMatrixAt(index, this.prev);
      if (force || !this.m.equals(this.prev)) {
        mesh.setMatrixAt(index, this.m);
        moved = true;
      }
      const mat = part.material as THREE.MeshLambertMaterial;
      if (!force) mesh.getColorAt(index, this.colour);
      if (force || !this.colour.equals(mat.color)) {
        mesh.setColorAt(index, mat.color);
        recoloured = true;
      }
      const e = this.emissive!;
      const glow = mat.emissive;
      if (force || e.getX(index) !== glow.r || e.getY(index) !== glow.g || e.getZ(index) !== glow.b) {
        e.setXYZ(index, glow.r, glow.g, glow.b);
        e.needsUpdate = true;
      }
    }
    if (moved) mesh.instanceMatrix.needsUpdate = true;
    if (recoloured && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

/**
 * A part's place in the frame of `frame` (the object the instanced mesh hangs in): the
 * product of its own and its parents' transforms up to there. Before the boat's modules
 * are hung on the bridge (frame null) that is up to the module's group, which is placed in
 * the boat's axes: the same frame the bridge's own root is.
 */
function placeIn(part: THREE.Object3D, frame: THREE.Object3D | null, out: THREE.Matrix4): THREE.Matrix4 {
  part.updateMatrix();
  out.copy(part.matrix);
  for (let o = part.parent; o && o !== frame; o = o.parent) {
    o.updateMatrix();
    out.premultiply(o.matrix);
  }
  return out;
}

/** Flat-shaded Lambert (as the controls' own parts), with a glow per instance. */
function sharedMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 instanceEmissive;\nvarying vec3 vInstanceEmissive;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceEmissive = instanceEmissive;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vInstanceEmissive;')
      .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive + vInstanceEmissive;');
  };
  return m;
}

/** A boat's shared parts, by kind. */
export class SharedParts {
  private readonly kinds = new Map<SharedPartKind, SharedKind>();

  /** Draw `mesh` as an instance of `kind` (it is hidden from now on). */
  share(mesh: THREE.Mesh, kind: SharedPartKind): void {
    let k = this.kinds.get(kind);
    if (!k) this.kinds.set(kind, (k = new SharedKind(kind)));
    mesh.visible = false;
    k.slots.push({ mesh, index: k.slots.length });
  }

  /** The instanced meshes (call once, after every module is built and placed). */
  finish(): THREE.InstancedMesh[] {
    return [...this.kinds.values()].map((k) => k.finish()).filter((m): m is THREE.InstancedMesh => !!m);
  }

  /** Each frame. */
  update(): void {
    for (const k of this.kinds.values()) k.update();
  }

  /** How many parts of each kind (debug overlay, tests). */
  counts(): Record<string, number> {
    return Object.fromEntries([...this.kinds].map(([kind, k]) => [kind, k.slots.length]));
  }
}
