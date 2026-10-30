/**
 * The kill cord (owner, 30 Oct 2026; the RYA scores it at every level): a lanyard from the
 * helmsman to the kill switch on the small open boats (CONFIG.killCord.boats: the skiff's
 * tiller, the RIB's console). Clipped on (the menu's Boat tab, or the `killCord` intent), it
 * stops her motor the moment the one wearing it is more than `reachM` from her helm (her
 * boarding spot, where the helm is) or off her: fallen in, stepped ashore. The cord is then
 * pulled; clip on again to start her.
 *
 * In Training the cord is required: on these boats the motor won't run without it. Elsewhere
 * it's the skipper's choice: unclipped, she runs as she always did.
 */
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';
import { VESSEL_DEFS } from './vesselDef';
import type { VesselState } from './vesselState';

export function hasKillCord(v: { defId: string }): boolean {
  return (CONFIG.killCord.boats as readonly string[]).includes(v.defId);
}

/** Is her motor running (or her electric outboard switched on)? */
function running(v: VesselState): boolean {
  return v.engine.phase !== 'off' || !!v.controls.obOn;
}

/** Stop her motor, as the kill switch does. */
function kill(v: VesselState): void {
  v.controls.obOn = 0;
  if (v.engine.phase !== 'off') {
    v.engine.phase = 'off';
    v.engine.key = 0;
  }
  v.controls.lever = 0;
}

/** `killCord` (target: the boat): 1 clip it on (the sender wears it), 0 take it off. */
export function applyKillCordIntent(v: VesselState, intent: Intent): void {
  if (!hasKillCord(v)) return;
  v.killCord = intent.value > 0.5 ? { by: intent.playerId } : {};
}

/** Each tick: the cord pulled when its wearer leaves the helm, and (in Training) no motor without it. */
export function stepKillCord(world: WorldState): void {
  for (const v of Object.values(world.vessels)) {
    if (!hasKillCord(v)) continue;
    const k = v.killCord;
    if (k?.by) {
      const p = world.players[k.by];
      const spot = VESSEL_DEFS[v.defId]?.boardingSpot;
      const away = !p || p.aboardVesselId !== v.id || !spot || Math.hypot(p.position[0] - spot[0], p.position[2] - spot[2]) > CONFIG.killCord.reachM;
      if (away) {
        if (running(v)) kill(v);
        v.killCord = { pulled: true };
      }
    } else if (world.training && running(v)) kill(v);
  }
}

/** A line for the menu: its state on this boat, or null if she has none. */
export function killCordLine(v: VesselState | undefined, playerId: string): string | null {
  if (!v || !hasKillCord(v)) return null;
  const k = v.killCord;
  if (k?.by) return k.by === playerId ? 'Clipped on (you)' : 'Clipped on (a crew-mate)';
  if (k?.pulled) return 'Pulled: the motor stopped. Clip on again to start her';
  return 'Not clipped on';
}
