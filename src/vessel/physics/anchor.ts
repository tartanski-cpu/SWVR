/**
 * Anchor, chain and windlass (model and constants in CONFIG.vessels.*.anchor).
 *
 * Windlass, driven by the bridge switch (controls.anchor):
 *   switch ON  : stowed -> "paying": the anchor drops under the bow roller to the seabed and
 *                chain runs out to the scope for the depth (4 × depth + 5 m), then "set".
 *   switch OFF : "weighing": chain comes in at `heaveRate` unless the pull exceeds the
 *                windlass's limit (it stalls); the boat is drawn up to the anchor. When the
 *                chain is up-and-down the anchor breaks out ("hanging") and is then stowed.
 *
 * Chain force at the bow: horizontal, towards the anchor, from a catenary-like law - soft
 * while the chain still lies on the bottom and lifts, stiff once it's bar taut (see config).
 * Above the holding power the anchor drags towards the boat; holding power falls off below a
 * 3:1 scope (the chain lifts the shank), to 15 % at about 1.3:1.
 */
import { clamp } from '../../core/math';
import { groundHeight } from '../../world/terrain';
import type { WorkboatDef } from '../vesselDef';
import type { VesselState } from '../vesselState';

/**
 * Advance the windlass and return the chain force on the bow (world, N).
 * @param hawse     bow roller, world position
 * @param hawseVel  its world velocity
 */
export function stepAnchor(
  s: VesselState,
  def: WorkboatDef,
  hawse: { x: number; y: number; z: number },
  hawseVel: { x: number; y: number; z: number },
  dt: number,
  out: { x: number; y: number; z: number },
): void {
  const a = s.anchor;
  const cfg = def.anchor;
  out.x = out.y = out.z = 0;
  a.tension = 0;
  a.dragging = false;
  const down = s.controls.anchor > 0.5;

  if (a.phase === 'stowed') {
    if (!down) return;
    a.phase = 'paying';
    a.x = hawse.x;
    a.z = hawse.z;
    a.rodeM = 0;
  }

  const seabed = groundHeight(a.x, a.z);
  const h = Math.max(0.5, hawse.y - seabed);

  // ── Windlass ──
  if (down) {
    if (a.phase === 'weighing' || (a.phase === 'hanging' && a.rodeM < cfg.chainM)) a.phase = 'paying';
    const scope = Math.min(cfg.chainM, 4 * h + 5);
    if (a.phase === 'paying') {
      a.rodeM = Math.min(scope, a.rodeM + cfg.payOutRate * dt);
      if (a.rodeM >= scope) a.phase = 'set';
    }
  } else if (a.phase !== 'weighing' && a.phase !== 'hanging') {
    a.phase = 'weighing';
  }

  // Off the bottom: not enough chain to reach it (too deep), or broken out while weighing.
  if (a.rodeM < h) {
    // The anchor hangs under the bow: it follows the boat.
    a.x = hawse.x;
    a.z = hawse.z;
    out.y = -cfg.chainWeightNPerM * a.rodeM;
    if (down) {
      // Still running out, or all the chain out and not on the bottom (too deep).
      a.phase = a.rodeM >= cfg.chainM ? 'hanging' : 'paying';
    } else {
      a.phase = 'hanging';
      a.rodeM = Math.max(0, a.rodeM - cfg.heaveRate * dt);
      if (a.rodeM <= 0) a.phase = 'stowed';
    }
    return;
  }

  // ── Chain force (anchor on the bottom) ──
  const dx = a.x - hawse.x;
  const dz = a.z - hawse.z;
  const x = Math.max(1e-3, Math.hypot(dx, dz));
  const ux = dx / x;
  const uz = dz / x;
  const L = a.rodeM;
  const xTaut = Math.sqrt(Math.max(0, L * L - h * h));
  const wh = cfg.chainWeightNPerM * h;
  // Rate at which the bow moves away from the anchor.
  const opening = -(hawseVel.x * ux + hawseVel.z * uz);
  let T: number;
  if (x < xTaut) {
    T = wh * Math.exp((x - xTaut) / cfg.catenarySoftness);
  } else {
    T = wh + cfg.tautStiffness * (x - xTaut) + cfg.tautDamping * Math.max(0, opening);
  }
  // Short scope lifts the anchor's shank and it holds far less: full holding from 3:1.
  const holding = cfg.holdingN * clamp((L / h - 1) / 2, 0.15, 1);
  T = clamp(T, 0, holding * 1.5);
  a.tension = T;

  // Dragging: past the holding power the anchor ploughs towards the boat.
  if (T > holding) {
    a.dragging = true;
    const slip = Math.min(1.5, 0.4 * (T / holding - 1) + 0.05) * dt;
    a.x -= ux * slip;
    a.z -= uz * slip;
  }

  // Weighing: heave in unless the windlass stalls against the pull.
  if (a.phase === 'weighing' && T < cfg.windlassPullN) a.rodeM = Math.max(0, a.rodeM - cfg.heaveRate * dt);

  // Force on the bow: horizontal towards the anchor plus the hanging chain's weight.
  const suspended = Math.min(L, Math.hypot(Math.min(x, xTaut), h));
  out.x = T * ux;
  out.z = T * uz;
  out.y = -cfg.chainWeightNPerM * suspended - (x >= xTaut && L > 0 ? (T * h) / Math.max(L, 1) : 0);
}
