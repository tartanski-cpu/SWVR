/**
 * The engine rooms' look (owner, Oct 2026: "another pass on the engine room textures to make
 * it pop"), shared by the plain room's shell (view.ts) and the tug's room (tug/room.ts), with
 * no new shapes or draw calls:
 *
 *   - the game's pixel paint on everything big (render/pixelPaint.ts: painted steel plating
 *     on the sides and bulkheads, perforated cladding on the deckhead, painted machinery,
 *     lagging, galvanised sheet), in one material;
 *   - a satin sheen on that paint (Phong in place of Lambert), so the lamps catch the pipes,
 *     rails and engines;
 *   - dirt baked into the vertex colours by height (`grime`): a room is dirtiest low down,
 *     round the bilges and the floor plates, and a little sooty under the deckhead.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { withPixelPaint } from '../../render/pixelPaint';

/** The rooms' material: vertex colours, the pixel paint, a satin sheen (CONFIG.engineRoom.look.sheen). */
export function roomMaterial(): THREE.MeshPhongMaterial {
  const s = CONFIG.engineRoom.look.sheen;
  return withPixelPaint(new THREE.MeshPhongMaterial({ vertexColors: true, specular: new THREE.Color(s.specular, s.specular, s.specular), shininess: s.shininess }));
}

/**
 * Darkens a merged geometry's vertex colours by height (CONFIG.engineRoom.look.grime): `floor`
 * darker at the sole, clean from `height` up; `deckhead` darker in the last `under` metres under
 * the deckhead. Faces looking straight up at the sole (the floor plates' own faces) are left.
 * The geometry's normals must be made first (mergeParts does).
 */
export function grime(g: THREE.BufferGeometry, sole: number, deckhead: number): void {
  const c = CONFIG.engineRoom.look.grime;
  const pos = g.attributes.position;
  const col = g.attributes.color;
  const nrm = g.attributes.normal;
  if (!col || !nrm) return;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (nrm.getY(i) > 0.9 && y < sole + 0.01) continue; // the floor plates' faces
    const low = 1 - THREE.MathUtils.smoothstep(y, sole, sole + c.height);
    const high = THREE.MathUtils.smoothstep(y, deckhead - c.under, deckhead);
    const k = 1 - c.floor * low - c.deckhead * high;
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
}
