import * as THREE from 'three';
import { mergeParts, part } from '../render/geometryUtils';

/**
 * The catch, as simple low-poly shapes at about real size (m), each facing +x with its
 * origin under its middle. Drawn instanced (cargo/cargoView.ts) in open pots and catch
 * crates: one draw call per kind, and only when there's some to show.
 */

/** A brown crab, about 0.15 m across the shell: a flattened shell, two claws, four legs a side. */
export function crabGeometry(): THREE.BufferGeometry {
  const shell = 0x8a4a26;
  const dark = 0x3a1e10;
  const parts = [part(new THREE.SphereGeometry(0.075, 9, 5).scale(0.75, 0.32, 1).translate(0, 0.025, 0), shell)];
  for (const s of [-1, 1]) {
    // The claws: an arm forward and a fat pincer with a black tip.
    parts.push(part(new THREE.BoxGeometry(0.05, 0.018, 0.02).rotateY(s * 0.5).translate(0.06, 0.015, s * 0.045), shell));
    parts.push(part(new THREE.BoxGeometry(0.045, 0.026, 0.03).rotateY(-s * 0.3).translate(0.095, 0.017, s * 0.05), shell));
    parts.push(part(new THREE.BoxGeometry(0.018, 0.018, 0.022).rotateY(-s * 0.3).translate(0.125, 0.017, s * 0.042), dark));
    // Legs, splayed out and back.
    for (let i = 0; i < 4; i++) parts.push(part(new THREE.BoxGeometry(0.008, 0.008, 0.06).rotateY(s * (0.2 + i * 0.28)).translate(0.02 - i * 0.022, 0.01, s * 0.075), shell));
  }
  return mergeParts(parts);
}

/** A lobster, about 0.3 m nose to tail: blue-black, a jointed tail and fan, two big claws, feelers. */
export function lobsterGeometry(): THREE.BufferGeometry {
  const body = 0x1c2a46;
  const dark = 0x10182a;
  const parts = [
    // Head and body (carapace), then the tail in three segments and the fan.
    part(new THREE.CylinderGeometry(0.03, 0.026, 0.11, 7).rotateZ(Math.PI / 2).translate(0.03, 0.03, 0), body),
    ...[0, 1, 2].map((i) => part(new THREE.BoxGeometry(0.03, 0.035 - i * 0.004, 0.045 - i * 0.004).translate(-0.04 - i * 0.03, 0.026, 0), i % 2 ? dark : body)),
    part(new THREE.BoxGeometry(0.035, 0.008, 0.07).translate(-0.14, 0.015, 0), body),
  ];
  for (const s of [-1, 1]) {
    // Claws: an arm out and forward, and a long pincer.
    parts.push(part(new THREE.BoxGeometry(0.06, 0.016, 0.016).rotateY(s * 0.6).translate(0.1, 0.022, s * 0.03), body));
    parts.push(part(new THREE.BoxGeometry(0.08, 0.026, 0.035).rotateY(-s * 0.15).translate(0.16, 0.022, s * 0.05), body));
    // Feelers, long and thin.
    parts.push(part(new THREE.BoxGeometry(0.14, 0.004, 0.004).rotateY(s * 0.35).translate(0.15, 0.04, s * 0.03), 0x7a3a2a));
    // Walking legs.
    for (let i = 0; i < 3; i++) parts.push(part(new THREE.BoxGeometry(0.006, 0.006, 0.04).rotateY(s * 0.3).translate(0.05 - i * 0.02, 0.01, s * 0.035), body));
  }
  return mergeParts(parts);
}

/** A small fish (a little wrasse): a 0.18 m block with a tail. */
export function smallFishGeometry(): THREE.BufferGeometry {
  return mergeParts([
    part(new THREE.BoxGeometry(0.14, 0.035, 0.04).translate(0.02, 0.018, 0), 0x7a8a5a),
    part(new THREE.BoxGeometry(0.035, 0.03, 0.045).translate(-0.065, 0.016, 0), 0x5a6a40),
  ]);
}

/** A starfish: five orange arms, about 0.16 m across. */
export function starfishGeometry(): THREE.BufferGeometry {
  return mergeParts([0, 1, 2, 3, 4].map((i) => part(new THREE.BoxGeometry(0.08, 0.012, 0.022).translate(0.04, 0.006, 0).rotateY((i * 2 * Math.PI) / 5), 0xd8642a)));
}

/** An old rubber boot lying on its side. */
export function bootGeometry(): THREE.BufferGeometry {
  return mergeParts([
    part(new THREE.BoxGeometry(0.25, 0.09, 0.1).translate(0, 0.045, 0), 0x2a2a24),
    part(new THREE.BoxGeometry(0.1, 0.09, 0.2).translate(0.075, 0.045, 0.14), 0x2a2a24),
    part(new THREE.BoxGeometry(0.11, 0.02, 0.21).translate(0.075, 0.01, 0.15), 0x5a4a2a),
  ]);
}

/**
 * Where the n-th animal sits on a floor `L` x `W` (m), with a little skew each so they
 * don't read as a grid: a few rows across, filling the floor. Returns [x, z, yaw].
 */
export function floorSlot(i: number, n: number, L: number, W: number): [number, number, number] {
  const rows = n > 6 ? 3 : 2;
  const cols = Math.max(1, Math.ceil(n / rows));
  const r = i % rows;
  const c = Math.floor(i / rows);
  const jitter = (k: number) => (((i * 7919 + k * 104729) % 1000) / 1000 - 0.5);
  const x = (-L / 2 + ((c + 0.5) * L) / cols) * 0.85 + jitter(1) * 0.04;
  const z = (-W / 2 + ((r + 0.5) * W) / rows) * 0.8 + jitter(2) * 0.03;
  return [x, z, jitter(3) * 2.4 + (c % 2 ? Math.PI : 0)];
}
