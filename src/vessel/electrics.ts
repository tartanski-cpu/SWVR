/**
 * The workboat's 12 V electrics: two batteries, a battery master switch, the loads that are
 * switched on, and the alternator. Plain state, stepped by the simulation like the engine.
 *
 *   powered   master on and the selected battery not flat. Everything electrical (displays,
 *             lights, radios, horn, windlass, the starter and the engine's fuel solenoid)
 *             checks isPowered(); unpowered, the bridge is dark and silent.
 *   current   I = sum of the loads switched on (+ the starter while cranking) - alternator
 *             (while the engine runs), drawn from the battery the selector picks (both: half
 *             each). Charge changes by I dt / capacity.
 *   voltage   resting voltage from the charge (flat .. full); discharging it sags by I R,
 *             charging it rises toward the alternator's regulated voltage.
 *
 * Modular boats (M4a): this is the ENERGY NETWORK (`stepEnergyNetwork`). The loads and
 * the sources are declared by the boat's modules (each light, pump, radio, the starter and
 * glow plugs, the alternator), the batteries are the battery-bank module's; the master,
 * the selector and the breakers (the circuits) are the network's own. What counts as
 * powered (isPowered) is the same rule as before; it still reads the vessel's own battery
 * config (a test keeps it equal to the battery module's) until M6.
 */
import { clamp } from '../core/math';
import { VESSEL_DEFS } from './vesselDef';
import type { BreakerName, ElectricsState, VesselState } from './vesselState';

/** Charge of the battery (or batteries) the selector is on. */
export function selectedSoc(e: ElectricsState): number {
  return e.selector === 1 ? e.soc[0] : e.selector === 2 ? e.soc[1] : Math.max(e.soc[0], e.soc[1]);
}

/**
 * Is there 12 V on the bus - and, given a breaker, is that circuit switched on? Boats
 * without modelled electrics always count as powered. What hangs on which breaker:
 *   instruments  dash displays (gauges), wipers   chart     chart plotter
 *   radio        VHF (screen, speaker, handset) and FM
 *   navLights    navigation lights            deckLights  floods, rail LEDs, cabin lamp, searchlight,
 *                                                         chart table lamp
 *   bilge        the bilge pump (float switch: runs while there's water; vessel/bilge.ts)
 *   hydraulics   the deck hydraulics' pump clutch and valve solenoids (see hydraulicsOn)
 * The starter, fuel solenoid, horn and windlass are on the master alone.
 */
export function isPowered(s: VesselState, breaker?: BreakerName): boolean {
  const e = s.electrics;
  if (!e) return true;
  const cfg = VESSEL_DEFS[s.defId].electrics;
  return e.master > 0 && !!cfg && selectedSoc(e) > cfg.cutoffSoc && (!breaker || e.breakers[breaker] > 0);
}

/**
 * Deck hydraulics: the tender crane, the tow winch and the trawl's net drum are hydraulic,
 * driven by a pump on the engine's power take-off. The pump only turns with the engine
 * running, and its electric clutch (and the machines' valve solenoids) are on the DECK HYD
 * breaker: no engine or no breaker, no pressure, and the machines stop where they are
 * (a hydraulic machine holds its load on its valves; nothing runs back).
 */
export function hydraulicsOn(s: VesselState): boolean {
  return s.engine.phase === 'running' && isPowered(s, 'hydraulics');
}

/** Resting (no load) voltage at a state of charge. */
export function restVolts(cfg: { restVolts: readonly [number, number] }, soc: number): number {
  return cfg.restVolts[0] + (cfg.restVolts[1] - cfg.restVolts[0]) * clamp(soc, 0, 1);
}

/** Is the bilge pump running: its breaker live and water over the float switch? */
export function bilgePumping(s: VesselState): boolean {
  return (s.bilge ?? 0) > 0.01 && isPowered(s, 'bilge');
}

/** The batteries, as the network needs them. */
interface Bank {
  ah: number;
  restVolts: readonly [number, number];
  internalOhm: number;
  chargeVolts: number;
  cutoffSoc: number;
}

/**
 * The energy network's tick on a boat built from a recipe: the loads and sources her
 * modules declare (only on circuits whose breaker is on), drawn from the battery bank
 * module's batteries.
 */
export function stepEnergyNetwork(s: VesselState, net: { loadAmps(): number; sourceAmps(): number; store: Bank | null }, dt: number): void {
  if (!s.electrics || !net.store) return;
  chargeAndVolts(s, net.store, () => net.loadAmps(), () => net.sourceAmps(), dt);
}

/** Charge and discharge the selected batteries, and the bus voltage. */
function chargeAndVolts(s: VesselState, cfg: Bank, load: () => number, charge: () => number, dt: number): void {
  const e = s.electrics!;
  if (e.master <= 0 || selectedSoc(e) <= cfg.cutoffSoc) {
    // Master off (or the battery flat): nothing drawn; the voltmeter, on the bus, reads 0.
    e.amps = 0;
    e.volts = 0;
    return;
  }
  const charging = charge();
  const net = load() - charging; // + = discharging
  const dSoc = (net * dt) / 3600 / cfg.ah;
  if (e.selector === 1) e.soc[0] = clamp(e.soc[0] - dSoc, 0, 1);
  else if (e.selector === 2) e.soc[1] = clamp(e.soc[1] - dSoc, 0, 1);
  else {
    e.soc[0] = clamp(e.soc[0] - dSoc / 2, 0, 1);
    e.soc[1] = clamp(e.soc[1] - dSoc / 2, 0, 1);
  }
  const rest = restVolts(cfg, selectedSoc(e));
  e.amps = net;
  e.volts = net >= 0 ? rest - net * cfg.internalOhm : Math.min(cfg.chargeVolts, rest + -net * 0.04);
}

/**
 * How well the starter turns at the bus voltage: full from 11.5 V, nothing below 9 V. A
 * tired battery cranks slowly, and a flat one won't start her.
 */
export function starterFactor(s: VesselState): number {
  const e = s.electrics;
  if (!e) return 1;
  return clamp((e.volts - 9) / 2.5, 0, 1);
}
