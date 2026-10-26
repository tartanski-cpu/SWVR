/**
 * The submersible as seen from her support ship (owner, Oct 2026: "take the 3D model from the
 * other repo"): the outside of the submersible game's three-person work sub, as that game
 * draws it (Submersible-World src/sub/exterior.ts and its dimensions, src/sub/layout.ts and
 * config/tuning.json `thrusters`), so she looks the same on deck as she does diving. Its
 * yellow fairing round the pressure hull and the tail cone, the hatch fairing on top, the
 * frame posts and light bar over the dome, the skids, the sample basket, the stowed arms and
 * the thruster ducts; and, seen from outside here (it's the cabin's glass there), the dome
 * and the two side ports, dark.
 *
 * Her axes: the pressure hull's axis along z, her bow forward (-z), y up, as in that game.
 * One geometry of coloured parts (render/geometryUtils `part`), merged by the module: one draw.
 */
import * as THREE from 'three';
import { part } from '../../render/geometryUtils';

const YELLOW = 0xe0a21c;
const FRAME = 0x3c4146;
const STEEL = 0x8b9095;
const DUCT = 0x2b2f33;
const GLASS = 0x22323e;

/** The submersible game's sizes (its src/sub/layout.ts `HULL`). */
const HULL = { radius: 1.1, front: -1.2, fairing: 1.22, fairingAft: 3.0 };
/** Her thrusters (its config/tuning.json `thrusters`): four vectored at the corners, two vertical. */
const THRUSTERS = {
  horizontal: [
    { forwardM: 2.6, starboardM: 0.95, angleDeg: -45 },
    { forwardM: 2.6, starboardM: -0.95, angleDeg: 45 },
    { forwardM: -2.6, starboardM: 0.95, angleDeg: 45 },
    { forwardM: -2.6, starboardM: -0.95, angleDeg: -45 },
  ],
  vertical: [{ forwardM: 1.4 }, { forwardM: -1.4 }],
};
/** Her light bar over the dome (its `LIGHTS.bar`). */
const BAR = new THREE.Vector3(0, 1.28, -1.75);
const DEG = Math.PI / 180;

const box = (c: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot?: THREE.Euler) => {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot));
  return part(g.translate(x, y, z), c, c === YELLOW ? 'sheet' : c === STEEL ? 'steel' : 'worn');
};

/** Her outside, in her own axes, as coloured parts to merge. */
export function submersibleParts(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  // The fairing: a yellow skin over the pressure hull (its ports dark discs below), and the tail cone.
  out.push(part(new THREE.CylinderGeometry(HULL.fairing, HULL.fairing, HULL.fairingAft - HULL.front - 0.04, 24, 1, true).rotateX(Math.PI / 2).translate(0, 0, (HULL.front + 0.04 + HULL.fairingAft) / 2), YELLOW, 'sheet'));
  out.push(part(new THREE.ConeGeometry(HULL.fairing, 1.4, 24, 1, true).rotateX(Math.PI / 2).translate(0, 0, HULL.fairingAft + 0.7), YELLOW, 'sheet'));
  // The dome: the acrylic half-sphere on the front, dark from outside, and a yellow ring round its rim.
  out.push(part(new THREE.SphereGeometry(HULL.radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).translate(0, 0, HULL.front), GLASS));
  out.push(part(new THREE.TorusGeometry(HULL.fairing - 0.03, 0.05, 6, 24).translate(0, 0, HULL.front + 0.04), YELLOW));
  // The two side ports (the manipulator operator's, starboard, low and forward; one to port).
  for (const p of [
    { y: -0.32, z: -0.55, side: 1, r: 0.19 },
    { y: 0.12, z: 0.25, side: -1, r: 0.17 },
  ]) {
    const x = p.side * Math.sqrt(HULL.fairing ** 2 - p.y ** 2);
    const disc = new THREE.CircleGeometry(p.r, 12);
    disc.lookAt(new THREE.Vector3(x, p.y, 0));
    out.push(part(disc.translate(x * 1.005, p.y * 1.005, p.z), GLASS));
  }
  out.push(box(YELLOW, 0, HULL.fairing + 0.12, 0.8, 1.0, 0.3, 2.6)); // top fairing over the hatch
  // Frame posts either side of the dome and the light bar across the top; the skids along the bottom.
  for (const side of [-1, 1]) {
    out.push(box(FRAME, side * 1.15, -0.1, -1.75, 0.1, 2.7, 0.1));
    out.push(box(FRAME, side * 1.15, 1.2, -1.4, 0.1, 0.1, 0.8));
    out.push(box(FRAME, side * 0.85, -1.4, 0.2, 0.12, 0.12, 5.4));
    out.push(box(FRAME, side * 0.85, -1.2, -1.9, 0.08, 0.4, 0.08));
    out.push(box(FRAME, side * 0.85, -1.2, 2.0, 0.08, 0.4, 0.08));
  }
  out.push(box(FRAME, 0, BAR.y, BAR.z, 2.4, 0.1, 0.14));
  out.push(box(0x222222, 0, BAR.y - 0.07, BAR.z - 0.05, 0.9, 0.08, 0.06)); // the bar lamp
  // The sample basket on the front skid crossbar.
  out.push(box(FRAME, 0, -1.4, -2.45, 1.8, 0.08, 0.08));
  out.push(box(STEEL, 0, -1.25, -2.5, 0.9, 0.04, 0.5));
  for (const sx of [-0.45, 0.45]) out.push(box(STEEL, sx, -1.12, -2.5, 0.03, 0.26, 0.5));
  out.push(box(STEEL, 0, -1.12, -2.75, 0.9, 0.26, 0.03));
  // The arms, stowed low ahead of the dome.
  out.push(box(0x9aa0a6, 0.55, -1.05, -2.0, 0.12, 0.12, 0.6, new THREE.Euler(0.4, 0, 0)));
  out.push(box(0x9aa0a6, 0.55, -0.95, -2.35, 0.1, 0.1, 0.45, new THREE.Euler(-0.9, 0, 0)));
  out.push(box(0x9aa0a6, -0.55, -1.05, -2.0, 0.12, 0.12, 0.5, new THREE.Euler(0.4, 0, 0)));
  // The thruster ducts: four vectored at the corners, two vertical.
  for (const t of THRUSTERS.horizontal) {
    const duct = new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12, 1, true).rotateX(Math.PI / 2).rotateY(-t.angleDeg * DEG);
    out.push(part(duct.translate(t.starboardM * 1.25, -0.75, -t.forwardM), DUCT));
  }
  for (const t of THRUSTERS.vertical) out.push(part(new THREE.CylinderGeometry(0.24, 0.24, 0.25, 12, 1, true).translate(0, HULL.fairing + 0.05, -t.forwardM + 0.3), DUCT));
  // Her lift point: a padeye on the top fairing, where the docking head takes her.
  out.push(box(FRAME, 0, HULL.fairing + 0.33, 0.5, 0.08, 0.14, 0.24));
  return out;
}
