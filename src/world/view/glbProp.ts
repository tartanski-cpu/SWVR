import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';

/**
 * A test (owner): an outside 3D model (a .glb file) brought into the world as a static prop.
 * It's loaded only when asked for (the bike: `?bike` in the address), so nobody else downloads it.
 *
 * Made cheap for the Quest and drawn in the game's own style: every part is merged into one
 * flat-shaded mesh, each part in its material's base colour (its textures, normal maps and
 * shine dropped). So however many pieces and materials the file has, it costs one draw call.
 */
export async function loadFlatProp(url: string): Promise<THREE.Mesh> {
  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const src = mesh.geometry;
    // One part per material group (a primitive can share a mesh with others).
    const groups = src.groups.length ? src.groups : [{ start: 0, count: src.index ? src.index.count : src.attributes.position.count, materialIndex: 0 }];
    for (const g of groups) {
      const m = mats[g.materialIndex ?? 0] as THREE.MeshStandardMaterial | undefined;
      const geo = new THREE.BufferGeometry();
      // Positions as plain floats: a slimmed file stores them as normalised integers, which
      // moving them into place (below) would clip.
      const pos = src.attributes.position;
      const xyz = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) xyz.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(xyz, 3));
      if (src.index) geo.setIndex(Array.from(src.index.array).slice(g.start, g.start + g.count));
      geo.applyMatrix4(mesh.matrixWorld);
      parts.push(part(geo, m?.color?.getHex() ?? 0x888888));
    }
  });
  const prop = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
  prop.name = 'prop';
  return prop;
}
