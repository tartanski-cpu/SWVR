/**
 * The Alaskan 38's one-off geometry (owner, Oct 2026: a one-off hull and superstructure;
 * only the working parts are modules). What her hull mesh (vessel/view/hullMesh.ts, from
 * her stations and layout) doesn't give her, built here from her definition and merged
 * into one vertex-coloured mesh (one draw call):
 *
 *   stage 1  the outboard bracket off her transom with its swim platform and rails, the
 *            twin outboards (cowls, legs, propellers), the two spray rails along her
 *            topsides carried round the stem, and the bow rail;
 *   stage 2  the superstructure (trunk cabin, pilothouse, saloon, cockpit overhead);
 *   stage 3  the interior.
 *
 * Drawing only: her physics is her stations and her modules'. The outboards are drawn here;
 * her thrust comes from a twin diesel-inboard module placed at them (boats/alaskan38.json)
 * until there's an outboard engine module.
 */
import * as THREE from 'three';
import { bar } from '../../mechanisms/line';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';
import { CONFIG } from '../../config';
import type { VesselDef } from '../../vessel/vesselDef';

const ALU = 0x9aa0a6; // bare aluminium: bracket, platform frame
const GRATING = 0xb4b9be; // the platform's non-slip top
const BLACK = 0x1a1c1e; // rails, the outboards' legs
const COWL = 0xeeeeea; // the outboards' cowls
const DARK = 0x2f3438; // the outboards' lower units
const BRONZE = 0xc08a3e;

type V3 = [number, number, number];

function box(w: number, h: number, l: number, at: V3, colour: number): THREE.BufferGeometry {
  return part(new THREE.BoxGeometry(w, h, l).translate(at[0], at[1], at[2]), colour);
}
function drum(r: number, l: number, at: V3, colour: number, sides = 12): THREE.BufferGeometry {
  return part(new THREE.CylinderGeometry(r, r, l, sides).rotateX(Math.PI / 2).translate(at[0], at[1], at[2]), colour);
}

/** Her one-off parts, as one mesh in her axes. */
export function buildAlaskan38Parts(def: VesselDef): THREE.Mesh {
  const c = CONFIG.vessels.alaskan38;
  const st = def.hull.stations;
  const transom = st[0].z;
  const parts: THREE.BufferGeometry[] = [];

  // ── The outboard bracket and swim platform ──
  // A buoyant box off the transom (as the hull's topsides: it's welded on), its top the swim
  // platform a couple of steps below the deck, a rail round it except where the outboards hang.
  const b = c.bracket;
  const deckAft = st[0].polygon[0][1];
  parts.push(box(2 * b.halfWidth - 0.1, b.top - b.bottom, b.length, [0, (b.top + b.bottom) / 2, transom + b.length / 2], 0x3a3f44));
  parts.push(box(2 * b.halfWidth, 0.05, b.length + 0.15, [0, b.top + 0.025, transom + (b.length + 0.15) / 2], GRATING));
  // A step down from the deck to the platform, through the transom gate (two treads).
  const gateX = b.gateX;
  for (const [k, y] of [0.33, 0.67].entries()) parts.push(box(0.6, 0.04, 0.3, [gateX, b.top + y * (deckAft - b.top), transom + 0.2 + k * 0.3], GRATING));
  // The rail: posts on the platform's edge, a top rail joining them; open across the stern
  // between the outboards and at the gate.
  const railTop = b.top + b.railHeight;
  const corner = (x: number, z: number) => [new THREE.Vector3(x, b.top, z), new THREE.Vector3(x, railTop, z)] as const;
  const zEnd = transom + b.length + 0.15;
  const posts: [number, number][] = [];
  for (const side of [-1, 1]) posts.push([side * (b.halfWidth - 0.05), transom + 0.1], [side * (b.halfWidth - 0.05), zEnd - 0.05], [side * (b.outboardX + 0.5), zEnd - 0.05]);
  for (const [x, z] of posts) {
    const [lo, hi] = corner(x, z);
    parts.push(bar(lo, hi, 0.018, BLACK, 8));
  }
  for (const side of [-1, 1]) {
    const x = side * (b.halfWidth - 0.05);
    parts.push(bar(new THREE.Vector3(x, railTop, transom + 0.1), new THREE.Vector3(x, railTop, zEnd - 0.05), 0.02, BLACK, 8));
    parts.push(bar(new THREE.Vector3(x, railTop, zEnd - 0.05), new THREE.Vector3(side * (b.outboardX + 0.5), railTop, zEnd - 0.05), 0.02, BLACK, 8));
  }

  // ── The outboards ──
  // Each hangs on a mounting plate at the bracket's aft face: a cowl (the engine) above the
  // platform, a slim leg down through it, the lower unit and its propeller under water.
  const o = c.outboards;
  for (const side of [-1, 1]) {
    const x = side * b.outboardX;
    const zPlate = transom + b.length;
    parts.push(box(o.cowlWidth + 0.2, 0.6, 0.06, [x, b.top + 0.3, zPlate + 0.03], ALU)); // mounting plate
    const zCowl = zPlate + 0.1 + o.cowlLength / 2;
    const yCowl = o.legTop + o.cowlHeight / 2;
    parts.push(box(o.cowlWidth, o.cowlHeight, o.cowlLength, [x, yCowl, zCowl], COWL));
    parts.push(box(o.cowlWidth + 0.02, 0.08, o.cowlLength - 0.1, [x, o.legTop + 0.04, zCowl], DARK)); // the pan under the cowl
    parts.push(box(o.cowlWidth * 0.55, o.cowlHeight * 0.35, 0.02, [x, yCowl + 0.05, zCowl + o.cowlLength / 2 + 0.01], DARK)); // the air intake panel at the back
    // The leg: from under the cowl down to the anti-ventilation plate, then the lower unit.
    const zLeg = zPlate + 0.1 + o.cowlLength * 0.45;
    parts.push(box(o.legWidth, o.legTop - o.plateY, 0.42, [x, (o.legTop + o.plateY) / 2, zLeg], DARK));
    parts.push(box(o.legWidth + 0.3, 0.025, 0.7, [x, o.plateY, zLeg + 0.05], DARK)); // anti-ventilation plate
    parts.push(box(o.legWidth * 0.8, o.plateY - o.gearY, 0.34, [x, (o.plateY + o.gearY) / 2, zLeg], DARK));
    parts.push(drum(0.1, 0.62, [x, o.gearY, zLeg + 0.06], DARK, 14)); // the torpedo
    parts.push(part(new THREE.ConeGeometry(0.1, 0.22, 14).rotateX(-Math.PI / 2).translate(x, o.gearY, zLeg - 0.36), DARK)); // its nose
    parts.push(box(0.03, 0.42, 0.26, [x, o.gearY - 0.1, zLeg - 0.08], DARK)); // the skeg
    // The propeller behind the torpedo.
    const zProp = zLeg + 0.42;
    parts.push(drum(0.045, 0.1, [x, o.gearY, zProp], BRONZE, 10));
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.BoxGeometry(0.07, o.propDiameter / 2 - 0.04, 0.012).translate(0, o.propDiameter / 4 + 0.02, 0);
      blade.rotateY(0.6).rotateZ((i * 2 * Math.PI) / 3).translate(x, o.gearY, zProp);
      parts.push(part(blade, BRONZE));
    }
  }

  // ── The spray rails ──
  // Two strakes along the topsides, each at a set share of the way from the chine up to the
  // deck edge, standing proud, carried from the transom round to the stem.
  for (const share of c.sprayRails.shares) {
    const run: THREE.Vector3[] = [];
    for (const s of st) {
      const [, chine, , , deck] = [s.polygon[0], s.polygon[1], s.polygon[2], s.polygon[3], s.polygon[4]];
      // (The starboard side; mirrored below.)
      const x = chine[0] + share * (deck[0] - chine[0]);
      const y = chine[1] + share * (deck[1] - chine[1]);
      run.push(new THREE.Vector3(x, y, s.z));
    }
    for (const side of [1, -1]) {
      for (let i = 1; i < run.length; i++) {
        const a = run[i - 1].clone();
        const d = run[i].clone();
        a.x = side * (Math.abs(a.x) + c.sprayRails.proud);
        d.x = side * (Math.abs(d.x) + c.sprayRails.proud);
        if (Math.abs(d.x) < 0.1 && i === run.length - 1) d.x = 0; // meeting at the stem
        parts.push(bar(a, d, c.sprayRails.radius, c.sprayRails.colour, 6));
      }
    }
  }

  // ── The bow rail ──
  // From the house's forward end to the stem: posts on the deck edge each side, a rail
  // along their tops meeting at the stem, where it stands the highest.
  const r = c.bowRail;
  const plan = (z: number) => {
    // The deck edge at z (between stations).
    let i = 0;
    while (i < st.length - 2 && st[i + 1].z > z) i++;
    const a = st[i];
    const d = st[i + 1];
    const t = (z - a.z) / (d.z - a.z || 1);
    return { x: a.halfBeamDeck + (d.halfBeamDeck - a.halfBeamDeck) * t, y: a.polygon[0][1] + (d.polygon[0][1] - a.polygon[0][1]) * t };
  };
  const stem = st[st.length - 1].z;
  const zs: number[] = [];
  for (let z = r.from; z > stem + 0.15; z -= r.spacing) zs.push(z);
  for (const side of [-1, 1]) {
    const tops: THREE.Vector3[] = [];
    for (const z of zs) {
      const e = plan(z);
      const foot = new THREE.Vector3(side * (e.x - 0.04), e.y + def.layout.bulwarkHeight, z);
      const top = foot.clone().setY(foot.y + r.height);
      parts.push(bar(foot, top, 0.016, BLACK, 8));
      tops.push(top);
    }
    const stemTop = new THREE.Vector3(0, plan(stem + 0.02).y + def.layout.bulwarkHeight + r.height + 0.05, stem + 0.1);
    tops.push(stemTop);
    for (let i = 1; i < tops.length; i++) parts.push(bar(tops[i - 1], tops[i], 0.02, BLACK, 8));
  }

  const mesh = new THREE.Mesh(mergeParts(parts), flatVertexColorMaterial());
  mesh.name = 'alaskan38';
  return mesh;
}

/** For tests: where her outboards' propellers turn (her axes). */
export function alaskan38PropellerAt(def: VesselDef): V3[] {
  const c = CONFIG.vessels.alaskan38;
  const transom = def.hull.stations[0].z;
  const zLeg = transom + c.bracket.length + 0.1 + c.outboards.cowlLength * 0.45;
  return [-1, 1].map((side) => [side * c.bracket.outboardX, c.outboards.gearY, zLeg + 0.42] as V3);
}
