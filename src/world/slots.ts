/**
 * Berth slots and the anchorage (multi-boat M3, the owner's rule: look at each quay face's
 * length and fit the boats that fit; the biggest go to anchor). Nothing is stored: a slot is
 * free when no boat lies along that stretch of face now, so a boat that leaves frees it.
 *
 * A berth (world/berths.ts: one every 12 m on the hand-built quays, every 16 m from the
 * coast pipeline, plus the named ones) is a point on a quay face. A boat fits a berth when
 * her length plus `CONFIG.spawn.slotMargin` each end lies within the face, and no other
 * boat's length overlaps that stretch (boats within `nearFace` m of the face count).
 */
import { CONFIG } from '../config';
import { BLOCKS, PORTS, type BerthDef, type BlockDef, type PortDef } from './archipelago';
import { allBerths, inBlock, toLocal, type BlockFace } from './berths';
import { hullPlan } from '../vessel/layout';
import { VESSEL_DEFS } from '../vessel/vesselDef';
import type { VesselState } from '../vessel/vesselState';
import { berthPose } from '../vessel/physics/mooring';
import { harbourBoats } from './harbourBoats';
import { groundHeight } from './terrain';

/** The faces of a block, in its frame (as the world view and the berths walk them). */
export function blockFaces(b: BlockDef): BlockFace[] {
  const L = b.halfLength;
  const W = b.halfWidth;
  return [
    { nx: 1, nz: 0, half: L, offset: W, alongX: false },
    { nx: -1, nz: 0, half: L, offset: W, alongX: false },
    { nx: 0, nz: 1, half: W, offset: L, alongX: true },
    { nx: 0, nz: -1, half: W, offset: L, alongX: true },
  ];
}

export interface BerthFace {
  block: BlockDef;
  face: BlockFace;
  /** Where along the face the berth's centre is (m from the face's middle). */
  along: number;
}

/** Where a point stands against a face: along it and out from it (m), or null if not off this face. */
function againstFace(b: BlockDef, f: BlockFace, x: number, z: number, reach: number): { along: number; out: number } | null {
  const { lx, lz } = toLocal(b, x, z);
  const along = f.alongX ? lx : lz;
  const outward = f.alongX ? f.nz : f.nx;
  const out = (f.alongX ? lz : lx) * outward - f.offset;
  if (out < -0.5 || out > reach || Math.abs(along) > f.half + 1) return null;
  return { along, out };
}

/** The quay face a berth lies along (her shore side the face's inward normal), or null. */
export function berthFace(berth: BerthDef): BerthFace | null {
  for (const block of BLOCKS) {
    for (const face of blockFaces(block)) {
      const at = againstFace(block, face, berth.x, berth.z, 8);
      if (!at) continue;
      const { lx: sx, lz: sz } = toLocal({ ...block, x: 0, z: 0 }, berth.shoreX, berth.shoreZ);
      if ((face.alongX ? sz : sx) * (face.alongX ? face.nz : face.nx) > -0.7) continue;
      return { block, face, along: at.along };
    }
  }
  return null;
}

/** Her draught (m): the keel's depth below the waterline at her deepest station. */
export function vesselDraught(defId: string): number {
  const def = VESSEL_DEFS[defId];
  if (!def) return 1.5;
  return Math.max(0.3, -Math.min(...def.hull.stations.flatMap((s) => s.polygon.map((p) => p[1]))));
}

/** Her widest half-beam (m) at the deck. */
export function vesselHalfBeam(defId: string): number {
  const def = VESSEL_DEFS[defId];
  return def ? Math.max(...def.hull.stations.map((s) => s.halfBeamDeck)) : 2.1;
}

/** Her length overall (m): stem to transom of her hull. */
export function vesselLength(defId: string): number {
  const def = VESSEL_DEFS[defId];
  if (!def) return 10;
  const plan = hullPlan(def);
  return Math.abs(plan.transom - plan.stem);
}

/**
 * A free berth at a port for a boat of type `defId`: on a face long enough for her, with
 * her draught and `CONFIG.spawn.underKeel` m of water under her whole hull where she'd lie, and no other boat (`except`
 * hers) along that stretch. The nearest to the port's own berth first.
 */
export function freeBerthFor(vessels: Record<string, VesselState>, portId: string, defId: string, except?: string): BerthDef | null {
  const m = CONFIG.spawn.slotMargin;
  const lengthM = vesselLength(defId);
  const port = PORTS.find((p) => p.id === portId);
  const centre = port?.cargo.berth ?? port ?? { x: 0, z: 0 };
  // Every dockable berth of the port: the named ones and one per bollard pair along its faces.
  const berths = allBerths().filter((b) => b.portId === portId).sort((a, b) => Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z));
  for (const berth of berths) {
    const bf = berthFace(berth);
    if (!bf) continue;
    const half = lengthM / 2 + m;
    if (bf.along - half < -bf.face.half || bf.along + half > bf.face.half) continue;
    // Water under her whole hull where she'd lie: her draught and `underKeel` to spare, at
    // five stations from stem to stern and across her beam (a coast map's quays are dredged
    // only so far, and the foot of a wall can be a ledge; a hand-built quay shoals at its ends).
    const at = berthPose({ defId }, berth);
    const h = (at.headingDeg * Math.PI) / 180;
    const need = vesselDraught(defId) + CONFIG.spawn.underKeel;
    const hb = vesselHalfBeam(defId);
    // ...and no quay, pier or pontoon under any part of her (a face's berth can lie where
    // another block, a corner's apron or a finger, stands: she'd be thrown off it).
    let deep = true;
    for (let s = -lengthM / 2; s <= lengthM / 2 && deep; s += lengthM / 4) {
      for (const w of [-hb + 0.1, 0, hb - 0.1]) {
        const x = at.x + Math.sin(h) * s + Math.cos(h) * w;
        const z = at.z - Math.cos(h) * s + Math.sin(h) * w;
        if (groundHeight(x, z) > -need || BLOCKS.some((o) => inBlock(o, x, z, 0))) deep = false;
      }
    }
    if (!deep) continue;
    const taken = Object.values(vessels).some((v) => {
      if (v.id === except) return false;
      const at = againstFace(bf.block, bf.face, v.position[0], v.position[2], CONFIG.spawn.nearFace);
      if (!at) return false;
      return Math.abs(at.along - bf.along) < half + vesselLength(v.defId) / 2;
    });
    // (A coast map's harbour boats alongside make way for her: world/harbourBoats.ts.)
    if (!taken) return berth;
  }
  return null;
}

/**
 * A spot to anchor off a port for a boat `lengthM` long: in the port's anchorage circle if
 * it has one, else `CONFIG.spawn.anchorOff` m off the port in deep enough water
 * (`anchorDepth`), clear of land around her and `anchorClear` m from every other boat.
 */
export function anchorSpotFor(vessels: Record<string, VesselState>, port: PortDef, lengthM: number): { x: number; z: number } | null {
  const c = CONFIG.spawn;
  const a = port.cargo.anchorage;
  const candidates: { x: number; z: number }[] = [];
  if (a) {
    for (let i = 0; i < 24; i++) {
      const r = a.radius * Math.sqrt((i + 1) / 25);
      const t = i * 2.399963; // the golden angle: spread about the circle
      candidates.push({ x: a.x + Math.cos(t) * r, z: a.z + Math.sin(t) * r });
    }
  }
  for (let r = c.anchorOff[0]; r <= c.anchorOff[1]; r += 40) for (let k = 0; k < 12; k++) candidates.push({ x: port.x + Math.sin((k * Math.PI) / 6) * r, z: port.z - Math.cos((k * Math.PI) / 6) * r });
  const clear = Math.max(c.anchorClear, lengthM * 1.5);
  for (const p of candidates) {
    const d = -groundHeight(p.x, p.z);
    if (d < c.anchorDepth[0] || d > c.anchorDepth[1]) continue;
    // Swinging room: water all round her.
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) if (groundHeight(p.x + Math.cos((k * Math.PI) / 4) * clear * 0.8, p.z + Math.sin((k * Math.PI) / 4) * clear * 0.8) > -2) ok = false;
    if (!ok) continue;
    if (Object.values(vessels).some((v) => Math.hypot(v.position[0] - p.x, v.position[2] - p.z) < clear)) continue;
    // Clear of the harbour boats on their moorings and at anchor too (their swinging circles).
    if (harbourBoats().some((b) => b.how !== 'alongside' && Math.hypot(b.x - p.x, b.z - p.z) < clear + b.r)) continue;
    return p;
  }
  return null;
}
