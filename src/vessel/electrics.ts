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
 */
import { clamp } from '../core/math';
import type { VesselDef } from './vesselDef';
import { VESSEL_DEFS } from './vesselDef';
import type { BreakerName, ElectricsState, VesselState } from './vesselState';

type Electrics = NonNullable<VesselDef['electrics']>;

/** Charge of the battery (or batteries) the selector is on. */
export function selectedSoc(e: ElectricsState): number {
  return e.selector === 1 ? e.soc[0] : e.selector === 2 ? e.soc[1] : Math.max(e.soc[0], e.soc[1]);
}

/**
 * Is there 12 V on the bus - and, given a breaker, is that circuit switched on? Boats
 * without modelled electrics always count as powered. What hangs on which breaker:
 *   instruments  dash displays (gauges)       chart     chart plotter
 *   radio        VHF (screen, speaker, handset) and FM
 *   navLights    navigation lights            deckLights  floods, rail LEDs, cabin lamp, searchlight
 *   bilge        the bilge pump (a load only)
 * The starter, fuel solenoid, horn and windlass are on the master alone.
 */
export function isPowered(s: VesselState, breaker?: BreakerName): boolean {
  const e = s.electrics;
  if (!e) return true;
  const cfg = VESSEL_DEFS[s.defId].electrics;
  return e.master > 0 && !!cfg && selectedSoc(e) > cfg.cutoffSoc && (!breaker || e.breakers[breaker] > 0);
}

/** Resting (no load) voltage at a state of charge. */
export function restVolts(cfg: Electrics, soc: number): number {
  return cfg.restVolts[0] + (cfg.restVolts[1] - cfg.restVolts[0]) * clamp(soc, 0, 1);
}

/** Current (A) drawn by what's switched on, the starter included. */
export function loadAmps(s: VesselState, cfg: Electrics): number {
  const c = s.controls;
  const L = cfg.loads;
  const b = s.electrics?.breakers;
  const on = (k: BreakerName) => !b || b[k] > 0;
  let a = L.base;
  if (on('instruments')) a += L.instruments;
  if (on('chart')) a += L.chart;
  if (on('radio')) a += L.radio + (c.fmOn > 0 ? L.fm : 0);
  if (on('navLights') && c.navLights > 0) a += L.navLights;
  if (on('deckLights')) {
    if (c.deckFore > 0) a += L.deckFlood;
    if (c.deckAft > 0) a += L.deckFlood;
    if (c.railLights > 0) a += L.railLights;
    if (c.cabinLight > 0) a += L.cabinLight;
    if (c.spotlight > 0) a += L.searchlight;
  }
  if (on('bilge')) a += L.bilge;
  if (c.horn > 0) a += L.horn;
  const an = s.anchor.phase;
  if (an === 'paying' || an === 'weighing' || (an === 'hanging' && c.anchor <= 0)) a += L.windlass;
  if (s.engine.phase === 'cranking') a += L.starter;
  if (s.engine.key > 0 && c.heat > 0) a += L.glowPlugs;
  return a;
}

/** Advance the electrics by dt: charge and discharge, and the bus voltage. */
export function stepElectrics(s: VesselState, dt: number): void {
  const e = s.electrics;
  const cfg = VESSEL_DEFS[s.defId].electrics;
  if (!e || !cfg) return;
  if (e.master <= 0 || selectedSoc(e) <= cfg.cutoffSoc) {
    // Master off (or the battery flat): nothing drawn; the voltmeter, on the bus, reads 0.
    e.amps = 0;
    e.volts = 0;
    return;
  }
  const charging = s.engine.phase === 'running' ? cfg.alternatorAmps * clamp(s.engine.rpm / 600, 0, 1) : 0;
  const net = loadAmps(s, cfg) - charging; // + = discharging
  const dSoc = (net * dt) / 3600 / cfg.batteryAh;
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
