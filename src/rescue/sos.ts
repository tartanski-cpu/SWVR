import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import type { VesselState } from '../vessel/vesselState';
import { berthPose } from '../vessel/physics/mooring';
import { placeVessel } from '../vessel/vesselControl';
import { BERTHS } from '../world/archipelago';
import { createRescueState, sayRadio } from './rescue';

/**
 * SOS (owner, Oct 2026): when a boat has gone over (capsized) or under (sunk), the crew send
 * an SOS, from the main menu (Boat > SOS) or the red button under the VHF set, and the
 * salvage tug recovers her: she's put back upright at the nearest boatyard's port, at its
 * cargo berth, her engine stopped, her lines off and her anchor stowed. Whatever damage she
 * took stays for the yard to mend (the yard board). No charge: the game isn't ended by a
 * knockdown, that's the point of it.
 *
 * Upright and afloat, an SOS is turned down over the radio: the coastguard can see she's
 * fine. (A boat merely aground or broken down is for the ordinary means: back off, mend her.)
 *
 * Plain JSON and intents (`sos`), so it works the same for the host and the crew.
 */

/** Her state as the SOS sees it. */
export type SosCondition = 'upright' | 'capsized' | 'sunk';

/** Capsized: her mast points more than CONFIG.sos.overturnDeg from straight up (rolled or pitch-poled). Sunk: her waterline well under. */
export function sosCondition(s: VesselState, c = CONFIG.sos): SosCondition {
  if (s.position[1] < -c.sunkDepth) return 'sunk';
  const [qx, , qz] = s.orientation;
  // The y component of her up axis (0, 1, 0) turned by her orientation.
  const upY = 1 - 2 * (qx * qx + qz * qz);
  return upY < Math.cos((c.overturnDeg * Math.PI) / 180) ? 'capsized' : 'upright';
}

/** One line for the menu and the VHF's screen. */
export function sosStatus(s: VesselState | undefined): string {
  if (!s) return 'No boat';
  const c = sosCondition(s);
  return c === 'capsized' ? 'CAPSIZED: send an SOS' : c === 'sunk' ? 'SUNK: send an SOS' : 'Upright and afloat';
}

/** The boatyard nearest her (CONFIG.boatyards), and the berth she's brought to there. */
export function sosYard(s: VesselState): { yard: (typeof CONFIG.boatyards)[number]; berth: (typeof BERTHS)[number] } | null {
  let best: { yard: (typeof CONFIG.boatyards)[number]; berth: (typeof BERTHS)[number]; d: number } | null = null;
  for (const yard of CONFIG.boatyards) {
    const berth = BERTHS.find((b) => b.portId === yard.port && b.id.endsWith('cargo'));
    if (!berth) continue;
    const d = Math.hypot(berth.x - s.position[0], berth.z - s.position[2]);
    if (!best || d < best.d) best = { yard, berth, d };
  }
  return best && { yard: best.yard, berth: best.berth };
}

/** The `sos` intent (value 1) on a vessel: recover her if she's over or under, else say no. */
export function applySosIntent(world: WorldState, intent: Intent): void {
  const s = world.vessels[intent.targetId];
  if (!s || intent.value < 0.5) return;
  const cond = sosCondition(s);
  if (cond === 'upright') {
    sayRadio(world, 'reply', "Coastguard: we have you in sight, skipper. You're upright and afloat. No SOS needed.");
    return;
  }
  const to = sosYard(s);
  if (!to) return;
  const r = (world.rescue ??= createRescueState());
  r.sos = { sent: (r.sos?.sent ?? 0) + 1, t: world.time };
  // Upright, at the berth, stopped: engine off, lever to neutral, lines off, anchor stowed.
  const at = berthPose(s, to.berth);
  placeVessel(s, at.x, 0, at.z, at.headingDeg);
  s.engine.phase = 'off';
  s.engine.rpm = 0;
  s.engine.rack = 0;
  s.engine.gear = 0;
  s.controls.lever = 0;
  s.anchor = { phase: 'stowed', x: 0, z: 0, rodeM: 0, tension: 0, dragging: false };
  s.controls.anchor = 0;
  s.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
  s.refuelling = false;
  // Whatever was on her tow line is let go.
  if (world.tow?.line) world.tow.line = null;
  const what = cond === 'sunk' ? 'raised her' : 'righted her';
  sayRadio(world, 'reply', `Coastguard: SOS received. The salvage tug has ${what} and brought you into ${to.yard.name}. Have the yard look her over before you sail.`);
}
