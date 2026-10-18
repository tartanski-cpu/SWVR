/**
 * One-off boats' own geometry (owner, Oct 2026: the Alaskan 38 is a one-off hull and
 * superstructure, only her working parts modules). A boat listed here has, besides what her
 * stations and layout draw (vessel/view/hullMesh.ts), a builder for the rest of her:
 * VesselView adds what it returns to her root. By vessel def id.
 *
 * (View code only: the simulation never sees this.)
 */
import type * as THREE from 'three';
import type { VesselDef } from '../vessel/vesselDef';
import { buildAlaskan38Parts } from './alaskan38/view';

export const ONE_OFF_VIEWS: Record<string, (def: VesselDef) => THREE.Object3D> = {
  alaskan38: buildAlaskan38Parts,
};
