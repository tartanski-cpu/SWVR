/**
 * The bridge's screens and switches, smaller (owner, Oct 2026): switches a little smaller,
 * screen lettering smaller so each screen fits more. The new readings must read right.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { Button } from '../src/controls/Button';
import { headingDeg, rateOfTurn } from '../src/controls/instruments';
import { Toggle } from '../src/controls/Toggle';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { placeVessel } from '../src/vessel/vesselControl';
import * as THREE from 'three';

/** The size of what's drawn (the hidden hit targets left out). */
function drawnSize(root: THREE.Object3D): THREE.Vector3 {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.visible) box.expandByObject(o);
  });
  return box.getSize(new THREE.Vector3());
}

describe('smaller switches', () => {
  it('toggles and push buttons are drawn at switchScale, and are still pressed and aimed at from as far', () => {
    const k = CONFIG.interaction.switchScale;
    expect(k).toBeLessThan(1);
    const t = new Toggle('t', 'x', 'T', () => 0);
    const size = drawnSize(t.root);
    expect(size.z).toBeCloseTo(0.09 * k, 3); // the plate's length
    const b = new Button('b', 'y', 'B', 'pulse', 0xffffff);
    const bs = drawnSize(b.root);
    expect(bs.x).toBeGreaterThan(0.95 * 0.084 * k); // (a 14-sided housing: a little under its diameter across)
    expect(bs.x).toBeLessThanOrEqual(0.084 * k + 1e-6);
    expect(CONFIG.interaction.touchRadius).toBe(0.06);
    // Aimed at: the hidden hit targets keep their first size.
    expect(new THREE.Box3().setFromObject(t.root).getSize(new THREE.Vector3()).z).toBeCloseTo(0.09, 3);
  });
});

describe('rate of turn', () => {
  it('reads positive turning to starboard (her heading rising), negative to port', () => {
    const { world, vesselId } = createWorld(new IdFactory(), 'workboat');
    const v = world.vessels[vesselId];
    placeVessel(v, 0, 0, 0, 0);
    world.environment.waves = [];
    world.geography = 'openSea';
    const send = (control: string, value: number) => stepWorld(world, [{ playerId: 'p', targetId: v.id, control, value } as Intent], 1 / 60);
    send('quickStart', 1);
    for (let i = 0; i < 6 * 60; i++) stepWorld(world, [], 1 / 60);
    send('lever', 0.8);
    for (let i = 0; i < 10 * 60; i++) stepWorld(world, [], 1 / 60);
    for (const [helm, sign] of [[1, 1], [-1, -1]] as const) {
      send('helm', helm);
      for (let i = 0; i < 4 * 60; i++) stepWorld(world, [], 1 / 60);
      const h0 = headingDeg(v);
      stepWorld(world, [], 1);
      const turned = ((headingDeg(v) - h0 + 540) % 360) - 180;
      expect(Math.sign(turned)).toBe(sign);
      expect(Math.sign(rateOfTurn(v))).toBe(sign);
      expect(Math.abs(rateOfTurn(v))).toBeGreaterThan(30); // °/min: a hard-over turn
    }
  });
});
