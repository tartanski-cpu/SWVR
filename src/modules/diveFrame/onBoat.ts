/**
 * A boat's dive A-frame (modules/diveFrame) and its sub, for the world: the sub's weight where
 * she is (simulation.ts adds it to her payload), and the frame's state for the app's hints.
 * Plain geometry over her recipe and her state, as cargo/craneHook.ts finds a deck crane's hook.
 */
import * as THREE from 'three';
import { simOf } from '../../boats/sims';
import type { VesselState } from '../../vessel/vesselState';
import { cradleAxis, DIVE_FRAME, docked, subAt, type DiveFrameConfig, type DiveFrameState } from './index';

/** Her dive A-frame: its path (its key in VesselState.modules) and config (null: she has none). */
export function diveFrameOf(v: { defId: string }): { path: string; config: DiveFrameConfig } | null {
  const m = simOf(v.defId)?.mounts.find((x) => x.def.id === DIVE_FRAME.id);
  return m ? { path: m.path, config: m.config as DiveFrameConfig } : null;
}

/** Its state on her (undefined until her machinery has first run). */
export function diveFrameState(v: VesselState): DiveFrameState | undefined {
  const f = diveFrameOf(v);
  return f ? (v.modules?.[f.path]?.s as DiveFrameState | undefined) : undefined;
}

/** Is her sub home in the docking head (the frame may swing)? True with no frame. */
export function diveSubDocked(v: VesselState): boolean {
  const f = diveFrameOf(v);
  const s = diveFrameState(v);
  return !f || !s || docked(f.config, s);
}

/**
 * The sub's weight moved from where it's designed into her (on her cradle: the module's
 * `physical`), as point masses (her axes): none on her cradle; hanging from the frame, her
 * weight taken off the cradle and put where she hangs; afloat, taken off altogether (the sea
 * carries her, the wire hangs slack).
 */
export function diveSubPayload(v: VesselState): { mass: number; pos: THREE.Vector3 }[] {
  const f = diveFrameOf(v);
  if (!f) return [];
  const s = diveFrameState(v) ?? DIVE_FRAME.sim!.init(f.config);
  const at = subAt(f.config, s);
  if (at.on === 'cradle') return [];
  const m = f.config.sub.massKg;
  const off = { mass: -m, pos: new THREE.Vector3(...cradleAxis(f.config)) };
  return at.on === 'afloat' ? [off] : [off, { mass: m, pos: new THREE.Vector3(...at.axis) }];
}
