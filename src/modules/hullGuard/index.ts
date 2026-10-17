/**
 * Module hull.guard: permanent protection along her sides (owner: a Shipyard choice beside
 * the crew's fenders), one of
 *   strake  a solid black rubber rubbing strake, a half-round on her topsides just below the
 *           sheer, all round: both sides, across the transom, and across a square bow
 *           without a ramp (`aroundBow`);
 *   tyres   old lorry tyres in a close row along each side, all but touching, hanging
 *           against her deck edge, and one on her stem for pushing, as on a tug.
 *
 * It gives the boat a side guard: its outer face's points, which meet a quay before her
 * plating does, with the guard's own spring and grip (vessel/physics/guards.ts; the
 * physics in vesselPhysics.ts). Drawn in the boat's axes from her hull's shape; merged with
 * her fixed parts (no draw calls of its own). Its weight is designed into her hull by the
 * Shipyard build, as her deckhouse's is.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import type { ModuleDefinition } from '../../modular/module';
import { part } from '../../render/geometryUtils';
import { bowTyre, strakeLine, strakeProbes, tyreProbes, tyreSpots } from '../../vessel/physics/guards';

export interface HullGuardConfig {
  kind: 'strake' | 'tyres';
  /** Her bow has no ramp: the strake runs across a square bow; a tyre hangs on her stem. */
  aroundBow: boolean;
}

const RUBBER = 0x1b1c1e;

type P3 = [number, number, number];

/**
 * A half-round swept along a path (boat axes): its flat back on the path, bulging out to
 * the path's left looking down (outboard, for a path running aft up her starboard side),
 * `r` its radius. `closed`: the path's end joins its start.
 */
function sweepHalfRound(path: readonly P3[], r: number, closed: boolean): THREE.BufferGeometry {
  const ARC = 6; // segments round the half-round
  const n = path.length;
  const rings: THREE.Vector3[][] = [];
  const t = new THREE.Vector3();
  const out = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const a = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    t.set(b[0] - a[0], 0, b[2] - a[2]).normalize();
    out.crossVectors(up, t).normalize();
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k <= ARC; k++) {
      const ang = -Math.PI / 2 + (Math.PI * k) / ARC;
      ring.push(new THREE.Vector3(...path[i]).addScaledVector(out, r * Math.cos(ang)).addScaledVector(up, r * Math.sin(ang)));
    }
    rings.push(ring);
  }
  const pos: number[] = [];
  const quad = (p: THREE.Vector3, q: THREE.Vector3, s: THREE.Vector3, u: THREE.Vector3) => pos.push(p.x, p.y, p.z, q.x, q.y, q.z, s.x, s.y, s.z, p.x, p.y, p.z, s.x, s.y, s.z, u.x, u.y, u.z);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const r0 = rings[i];
    const r1 = rings[(i + 1) % n];
    // Wound to face outward (seen from outside her).
    for (let k = 0; k < ARC; k++) quad(r0[k], r0[k + 1], r1[k + 1], r1[k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals(); // (the boat's other fixed parts have normals: they merge only if all do)
  return g;
}

export const HULL_GUARD: ModuleDefinition<HullGuardConfig> = {
  id: 'hull.guard',
  version: 1,
  fits: ['hull.side'],
  defaults: { kind: 'strake', aroundBow: false },
  validateConfig: (c) => (c.kind === 'strake' || c.kind === 'tyres' ? [] : [`no guard of kind '${String(c.kind)}'`]),
  ports: {},
  provides: () => [{ gear: 'sideGuard' }],
  gear: (c, hull) => ({ sideGuard: { kind: c.kind, probes: c.kind === 'strake' ? strakeProbes(hull, c.aroundBow) : tyreProbes(hull, c.aroundBow) } }),
  view: {
    frame: 'boat',
    build({ config: c, hull }) {
      const parts: THREE.BufferGeometry[] = [];
      if (c.kind === 'strake') {
        // Up her starboard side from the stem, across the transom, down her port side to the
        // stem; and across a square bow back to the start, if it goes round it.
        const line = strakeLine(hull);
        const stbd = [...line].reverse();
        const [tx, ty, tz] = line[0];
        const across = (x0: number, y: number, z: number, steps: number): P3[] => Array.from({ length: steps - 1 }, (_, i) => [x0 - (2 * x0 * (i + 1)) / steps, y, z] as P3);
        const steps = Math.max(2, Math.ceil((2 * tx) / 0.5));
        const path: P3[] = [...stbd, ...across(tx, ty, tz, steps), ...line.map(([x, y, z]) => [-x, y, z] as P3)];
        const [bx, by, bz] = line[line.length - 1];
        const round = c.aroundBow && bx > 0.3;
        if (round) path.push(...across(-bx, by, bz, Math.max(2, Math.ceil((2 * bx) / 0.5))));
        parts.push(part(sweepHalfRound(path, CONFIG.modules.hullGuard.strake.radius, round), RUBBER));
      } else {
        // A close row along each side, all but touching, hanging against her deck edge (held
        // by a wire through them along the gunwale, too thin to draw), and one on her stem.
        // Fat lorry tyres: a torus with a small hole, stretched to the tread's width. Few
        // facets: there are many.
        const tc = CONFIG.modules.hullGuard.tyres;
        const tube = (tc.radius - tc.hole) / 2;
        const tyre = new THREE.TorusGeometry(tc.hole + tube, tube, 5, 10).scale(1, 1, tc.thickness / (2 * tube)).rotateY(Math.PI / 2);
        for (const side of [-1, 1]) for (const s of tyreSpots(hull)) parts.push(part(tyre.clone().translate(side * s.x, s.y, s.z), RUBBER));
        if (c.aroundBow) parts.push(part(tyre.clone().rotateY(Math.PI / 2).translate(...bowTyre(hull)), RUBBER));
      }
      return { staticParts: parts, movingParts: [], controls: [], update: () => {} };
    },
  },
};
