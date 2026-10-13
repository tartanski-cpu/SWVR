import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { aboard, cargoPortAt, loadBlocker, payloadMass, unloadBlocker, type CargoItem } from '../src/cargo/cargo';
import { CONFIG } from '../src/config';
import type { Intent } from '../src/core/intents';
import { IdFactory } from '../src/core/ids';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';
import { placeVessel } from '../src/vessel/vesselControl';
import { PORTS } from '../src/world/archipelago';

const DT = 1 / 60;

function setup() {
  const { world, vesselId } = createWorld(new IdFactory());
  world.environment.waves = [];
  const v = world.vessels[vesselId];
  const send = (control: string, ref?: string, value = 1) => {
    const intent: Intent = { playerId: 't', targetId: v.id, control, value, ref };
    stepWorld(world, [intent], DT);
  };
  const run = (s: number) => {
    for (let i = 0; i < s / DT; i++) stepWorld(world, [], DT);
  };
  /** Lay the boat alongside a port's cargo berth, parallel to the quay/pier face. */
  const at = (portId: string) => {
    const b = PORTS.find((p) => p.id === portId)!.cargo.berth!;
    placeVessel(v, b.x, 0, b.z, portId === 'brannock' ? 135 : 0);
    run(3);
  };
  /** Height of the waterplane's centre of flotation (vessel z ≈ +1.5 m), where sinkage is measured. */
  const lcfY = () => new THREE.Vector3(0, 0, 1.5).applyQuaternion(new THREE.Quaternion().fromArray(v.orientation)).y + v.position[1];
  const waiting = (portId: string) => Object.values(world.cargo).filter((c) => 'port' in c.at && c.at.port === portId);
  const trim = () => {
    // Bow-up (stern down) positive, degrees.
    const [x, y, z, w] = v.orientation;
    return Math.asin(Math.max(-1, Math.min(1, 2 * (w * x - y * z)))) * 57.3;
  };
  return { world, v, send, run, at, waiting, trim, lcfY };
}

describe('cargo', () => {
  it('every port starts with cargo waiting, each bound somewhere else', () => {
    const { world, waiting } = setup();
    for (const p of PORTS) {
      const items = waiting(p.id);
      expect(items.length).toBe(CONFIG.cargo.perPort);
      for (const c of items) expect(c.to).not.toBe(p.id);
    }
    expect(world.deliveries).toBe(0);
  });

  it('loads alongside the berth when stopped, and the load sinks and trims her by the stern', () => {
    const { world, v, send, run, at, waiting, trim, lcfY } = setup();
    at('calder');
    expect(cargoPortAt(v)?.id).toBe('calder');
    const y0 = lcfY();
    const t0 = trim();
    const items = waiting('calder');
    for (const c of items) send('cargoLoad', c.id);
    expect(aboard(world, v.id).length).toBe(items.length);
    run(20);
    const mass = payloadMass(world, v.id);
    expect(mass).toBeGreaterThan(1000);
    // Sinkage ≈ ΔW / (ρ·A_wp); A_wp of this hull ~ 38 m².
    const sink = y0 - lcfY();
    expect(sink).toBeGreaterThan((0.5 * mass) / (1025 * 38));
    expect(sink).toBeLessThan((2 * mass) / (1025 * 38));
    expect(trim() - t0).toBeGreaterThan(0.1); // cargo is aft of the LCF
  });

  it('refuses to load away from the berth or while moving', () => {
    const { world, v, send, at, waiting } = setup();
    const item = waiting('calder')[0];
    placeVessel(v, 0, 0, -22, 0);
    expect(loadBlocker(world, v, item)).toMatch(/cargo berth/);
    send('cargoLoad', item.id);
    expect(aboard(world, v.id).length).toBe(0);
    at('calder');
    v.linearVelocity = [0, 0, -2];
    expect(loadBlocker(world, v, item)).not.toBeNull();
  });

  it('delivers only at the destination; a replacement then appears somewhere', () => {
    const { world, v, send, run, at, waiting } = setup();
    at('calder');
    const item = waiting('calder').find((c) => c.to === 'brannock') ?? waiting('calder')[0];
    send('cargoLoad', item.id);
    const total = Object.keys(world.cargo).length;
    // Wrong port: still aboard.
    const wrong = item.to === 'brannock' ? 'calder' : 'brannock';
    if (wrong !== 'calder') at(wrong);
    expect(unloadBlocker(v, item)).toMatch(/Deliver to/);
    send('cargoUnload', item.id);
    expect(world.cargo[item.id]).toBeDefined();
    // Right port.
    if (item.to === 'selkie') {
      const a = PORTS.find((p) => p.id === 'selkie')!.cargo.anchorage!;
      placeVessel(v, a.x, 0, a.z, 0);
      send('anchor');
      run(30);
    } else {
      at(item.to);
    }
    expect(unloadBlocker(v, item)).toBeNull();
    send('cargoUnload', item.id);
    expect(world.cargo[item.id]).toBeUndefined();
    expect(world.deliveries).toBe(1);
    expect(Object.keys(world.cargo).length).toBe(total); // replacement spawned
    run(1);
    expect(aboard(world, v.id).length).toBe(0);
  });

  it('at the anchorage, cargo is worked only with the anchor set in the bay', () => {
    const { world, v, send, run, waiting } = setup();
    const a = PORTS.find((p) => p.id === 'selkie')!.cargo.anchorage!;
    placeVessel(v, a.x, 0, a.z, 0);
    run(2);
    const item = waiting('selkie')[0];
    expect(loadBlocker(world, v, item)).not.toBeNull();
    send('anchor');
    run(30);
    expect(v.anchor.phase).toBe('set');
    expect(loadBlocker(world, v, item)).toBeNull();
  });

  it('respects the deck slots and the payload limit', () => {
    const { world, v, send, at } = setup();
    at('calder');
    // Fill the boat with heavy items conjured at Calder.
    for (let i = 0; i < 6; i++) {
      const c: CargoItem = { id: `test-${i}`, kind: 3, mass: 1400, from: 'calder', to: 'brannock', at: { port: 'calder', slot: 10 + i } };
      world.cargo[c.id] = c;
      send('cargoLoad', c.id);
    }
    expect(payloadMass(world, v.id)).toBeLessThanOrEqual(5000);
    expect(aboard(world, v.id).length).toBeLessThanOrEqual(4);
  });
});
