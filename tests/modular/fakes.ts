/**
 * A small made-up hull and set of modules for testing the contracts (M1). They are not the
 * real boat's; they exist to exercise sockets, ports, needs and the recipe check.
 */
import { specOf, type BusWriter } from '../../src/modular/bus';
import type { BusKey } from '../../src/modular/busKeys';
import { hullDataFrom } from '../../src/boats/hullData';
import { CONFIG } from '../../src/config';
import { createHullLibrary, type HullDefinition } from '../../src/modular/hull';
import type { ModuleDefinition } from '../../src/modular/module';
import { createModuleLibrary } from '../../src/modular/recipe';
import type { Socket } from '../../src/modular/socket';

const at = (x: number, y: number, z: number) => ({ position: [x, y, z] as const });

export const TEST_HULL: HullDefinition = {
  id: 'hull.test',
  version: 1,
  name: 'Test hull',
  helm: { stand: [0, 1.2, -0.75], yawDeg: 0 },
  // Its shape and handling borrowed from the workboat's config (the tests here are about sockets).
  ...hullDataFrom(CONFIG.vessels.workboat),
  sockets: [
    { id: 'helm', type: 'helm.console', transform: at(0, 2.15, -1.4) },
    { id: 'engineBay', type: 'engine.bay', transform: at(0.8, 0.2, 0.3), capacity: { maxPowerKw: 450, maxMassKg: 2000, size: [1.2, 1, 2] }, tags: ['inboard'] },
    { id: 'foredeck', type: 'deck.equipment', transform: at(1.25, 1.4, -2.25), capacity: { loadRatingKg: 500 } },
    { id: 'roof', type: 'roof.mount', transform: at(0, 3.5, -1.5) },
  ],
  provides: [{ power: 'electrical', circuits: ['instruments', 'radio'] }],
};

const slot = (id: string, x: number): Socket => ({ id, type: 'panel.slot', transform: at(x, 0, 0) });

export const CONSOLE: ModuleDefinition<{ slots: number }> = {
  id: 'console.test',
  version: 1,
  fits: ['helm.console'],
  defaults: { slots: 3 },
  ports: {},
  sockets: (c) => Array.from({ length: c.slots }, (_, i) => slot(`slot${i + 1}`, i * 0.2)),
};

export const LEVER: ModuleDefinition = {
  id: 'control.lever',
  aliases: ['control.throttle'],
  version: 1,
  fits: ['panel.slot'],
  defaults: {},
  ports: { demand: { dir: 'write', key: 'throttle.demand' } },
};

export const RPM_GAUGE: ModuleDefinition = {
  id: 'instrument.rpm',
  version: 1,
  fits: ['panel.slot'],
  defaults: {},
  ports: { rpm: { dir: 'read', key: 'propulsion.rpm' } },
  needs: () => [{ power: 'electrical', circuit: 'instruments' }],
};

export interface EngineConfig {
  powerKw: number;
  massKg: number;
}
export const ENGINE: ModuleDefinition<EngineConfig, { hours: number }> = {
  id: 'engine.test',
  version: 2,
  fits: ['engine.bay'],
  needsTags: ['inboard'],
  defaults: { powerKw: 400, massKg: 1500 },
  validateConfig: (c) => (c.powerKw > 0 ? [] : ['powerKw must be more than 0']),
  ports: { demand: { dir: 'read', key: 'throttle.demand' }, rpm: { dir: 'write', key: 'propulsion.rpm' } },
  physical: (c) => ({ powerKw: c.powerKw, massKg: c.massKg, size: [0.8, 0.7, 1.2] }),
  provides: () => [{ power: 'pto' }],
  sim: { init: () => ({ hours: 0 }), tick: () => {} },
  // Version 1 kept running time in minutes.
  migrate: (old, from) => (from === 1 ? { hours: (old as { minutes: number }).minutes / 60 } : (old as { hours: number })),
};

export const CRANE: ModuleDefinition<{ swlKg: number }> = {
  id: 'deck.crane-test',
  version: 1,
  fits: ['deck.equipment'],
  defaults: { swlKg: 400 },
  ports: {},
  physical: (c) => ({ swlKg: c.swlKg }),
  needs: () => [{ power: 'hydraulic' }],
};

export const RADIO: ModuleDefinition = {
  id: 'radio.test',
  version: 1,
  fits: ['roof.mount', 'panel.slot'],
  defaults: {},
  ports: {},
  needs: () => [{ power: 'electrical', circuit: 'radio' }],
};

export const HYDRAULIC_PUMP: ModuleDefinition = {
  id: 'hydraulics.test-pump',
  version: 1,
  fits: ['engine.bay'],
  defaults: {},
  ports: {},
  provides: () => [{ power: 'hydraulic' }],
};

export const hulls = createHullLibrary([TEST_HULL]);
export const modules = createModuleLibrary([CONSOLE, LEVER, RPM_GAUGE, ENGINE, CRANE, RADIO, HYDRAULIC_PUMP]);
export const lib = { hulls, modules };

/**
 * Run `fn` as if `key`'s writer were already `writer` (as it will be once its module is
 * converted), then put the registry back.
 */
export function withWriter<T>(key: BusKey, writer: BusWriter, fn: () => T): T {
  const spec = specOf(key);
  const was = spec.writer;
  spec.writer = writer;
  try {
    return fn();
  } finally {
    spec.writer = was;
  }
}

/**
 * Screens and labels draw on a canvas; in Node, give them one whose 2D context ignores
 * every call (what is drawn isn't under test, where things go is).
 */
export function fakeCanvas(): void {
  // Every call returns something that answers anything: measureText(...).width is 0,
  // createImageData(...).data is an array, and so on.
  const anything: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === 'width' || k === 'height' ? 0 : k === 'data' ? [] : typeof k === 'symbol' ? undefined : anything),
    apply: () => anything,
  });
  const ctx = anything;
  (globalThis as { document?: unknown }).document ??= {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
}
