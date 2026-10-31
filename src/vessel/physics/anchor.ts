/**
 * Anchor, chain and windlass (model and constants in CONFIG.vessels.*.anchor).
 *
 * Windlass, driven by the bridge switch (controls.anchor):
 *   switch ON  : stowed -> "paying": the anchor drops under the bow roller to the seabed and
 *                chain runs out to the scope for the depth, then "set". Scope is
 *                `scopeRatio` × the water depth (5:1, the usual minimum; 7:1 is the
 *                recommended figure for heavy weather), but never under 3:1 measured from
 *                the bow roller, below which the anchor can't hold properly.
 *   switch OFF : "weighing": chain comes in at `heaveRate` unless the pull exceeds the
 *                windlass's limit (it stalls); the boat is drawn up to the anchor. When the
 *                chain is up-and-down the anchor breaks out ("hanging") and is then stowed.
 *
 * Scope chosen (AnchorState.scope, the menu's Anchor 2:1 / 3:1 / 5:1 / 7:1): the chain runs out to
 * that over the depth instead; raised with the anchor down, the windlass veers to it; lowered,
 * it heaves in to it and holds there (the anchor stays down: hold, not weigh).
 *
 * Chain force at the bow: horizontal, towards the anchor, from a catenary-like law - soft
 * while the chain still lies on the bottom and lifts, stiff once it's bar taut (see config).
 * Above the holding power the anchor drags towards the boat; holding power falls off below a
 * 3:1 scope (the chain lifts the shank), to 15 % at about 1.3:1.
 */
import { clamp } from '../../core/math';
import { groundHeight } from '../../world/terrain';
import { CONFIG } from '../../config';
import { bottomAt } from '../../world/geography';
import type { AnchorState } from '../vesselState';

/**
 * Advance the windlass and return the chain force on the bow (world, N), on the anchor's
 * own state (the anchor-windlass module's, M5a): `down` the switch is on (let go),
 * `windlass` there's 12 V for it (the windlass is electric: without it the chain neither
 * runs out nor comes in).
 * @param hawse     bow roller, world position
 * @param hawseVel  its world velocity
 */
export function anchorStep(
  a: AnchorState,
  cfg: typeof CONFIG.vessels.workboat.anchor,
  down: boolean,
  windlass: boolean,
  hawse: { x: number; y: number; z: number },
  hawseVel: { x: number; y: number; z: number },
  dt: number,
  out: { x: number; y: number; z: number },
): void {
  out.x = out.y = out.z = 0;
  a.tension = 0;
  a.dragging = false;

  if (a.phase === 'stowed') {
    if (!down) return;
    a.phase = 'paying';
    a.x = hawse.x;
    a.z = hawse.z;
    a.rodeM = 0;
  }

  const seabed = groundHeight(a.x, a.z);
  const h = Math.max(0.5, hawse.y - seabed);
  const depth = Math.max(0.5, -seabed);

  // ── Windlass ──
  if (down) {
    if (a.phase === 'weighing' || (a.phase === 'hanging' && a.rodeM < cfg.chainM)) a.phase = 'paying';
    // (A scope chosen may be short of the 3:1 the windlass otherwise keeps to: 2:1 lifts the
    // shank and holds about half, below; the trainee sees her drag.)
    const minFromRoller = a.scope !== undefined ? 1.2 : cfg.minScopeFromRoller;
    const scope = Math.min(cfg.chainM, Math.max((a.scope ?? cfg.scopeRatio) * depth, minFromRoller * h));
    // A longer scope chosen with the anchor down: veer to it.
    if (a.scope !== undefined && a.phase === 'set' && a.rodeM < scope - 0.5) a.phase = 'paying';
    if (a.phase === 'paying' && windlass) {
      a.rodeM = Math.min(scope, a.rodeM + cfg.payOutRate * dt);
      if (a.rodeM >= scope) a.phase = 'set';
    }
    // A shorter one: heave in to it, the anchor left down (unless the pull stalls the windlass).
    if (a.scope !== undefined && a.phase === 'set' && windlass && a.rodeM > scope + 0.5 && a.tension < cfg.windlassPullN) a.rodeM = Math.max(scope, a.rodeM - cfg.heaveRate * dt);
  } else if (a.phase !== 'weighing' && a.phase !== 'hanging') {
    a.phase = 'weighing';
  }

  // Off the bottom: not enough chain to reach it (too deep), or broken out while weighing.
  // Once broken out it stays off while it comes up, even if the boat moves into water
  // shallower than the chain still out (it would otherwise "set" again where it is, hold
  // the boat, and - not being 'weighing' any more - never come in).
  if (a.rodeM < h || (a.phase === 'hanging' && !down)) {
    // The anchor hangs under the bow: it follows the boat.
    a.x = hawse.x;
    a.z = hawse.z;
    out.y = -cfg.chainWeightNPerM * a.rodeM;
    if (down) {
      // Still running out, or all the chain out and not on the bottom (too deep).
      a.phase = a.rodeM >= cfg.chainM ? 'hanging' : 'paying';
    } else {
      a.phase = 'hanging';
      if (windlass) a.rodeM = Math.max(0, a.rodeM - cfg.heaveRate * dt);
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
  // Short scope lifts the anchor's shank and it holds far less: full holding from 3:1. And
  // the bottom: sand holds, mud less, weed and rock poorly (CONFIG.anchoring, the anchorage's).
  // (A scope chosen, the seamanship rule: the holding goes on building as the chain's pull on
  // the anchor flattens, full only from CONFIG.anchoring.chosenFullScope; so 3:1 holds less
  // than 5:1, and 7:1 is the heavy-weather figure. Unchosen, the windlass's 5:1 as before.)
  const fullAt = a.scope !== undefined ? CONFIG.anchoring.chosenFullScope : 3;
  const holding = cfg.holdingN * clamp((L / h - 1) / (fullAt - 1), 0.15, 1) * CONFIG.anchoring.bottomHolding[bottomAt(a.x, a.z)];
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
  if (a.phase === 'weighing' && windlass && T < cfg.windlassPullN) a.rodeM = Math.max(0, a.rodeM - cfg.heaveRate * dt);

  // Force on the bow: horizontal towards the anchor plus the hanging chain's weight.
  const suspended = Math.min(L, Math.hypot(Math.min(x, xTaut), h));
  out.x = T * ux;
  out.z = T * uz;
  out.y = -cfg.chainWeightNPerM * suspended - (x >= xTaut && L > 0 ? (T * h) / Math.max(L, 1) : 0);
}
