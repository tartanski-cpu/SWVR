/**
 * Fuel consumption and engine temperatures (see CONFIG.vessels.*.engine.fuel / thermal for
 * the model). Runs after the shaft dynamics each tick; the governor reads the derate cap.
 */
import { CONFIG } from '../../config';
import { clamp } from '../../core/math';
import type { EngineState, VesselState } from '../vesselState';
import { fullLoadTorque, type EngineSpec } from './propulsion';

const TWO_PI = Math.PI * 2;

/** Fuel mass flow (kg/s) for the engine's current rack and RPM (0 unless running). */
export function fuelFlowFor(e: EngineState, def: EngineSpec): number {
  if (e.phase !== 'running' || e.rack <= 0) return 0;
  const f = def.engine.fuel;
  const indicatedKw = (e.rack * fullLoadTorque(def, e.rpm) * ((e.rpm * TWO_PI) / 60)) / 1000;
  const sfc = f.sfcGPerKWh * (1 + f.partLoadPenalty * (1 - e.rack) ** 2);
  return (indicatedKw * sfc) / 1000 / 3600;
}

/** Highest fuel rack the governor may use at this coolant temperature (overheat derate). */
export function derateRackCap(def: EngineSpec, coolantC: number): number {
  const th = def.engine.thermal;
  const t = clamp((coolantC - th.derateStartC) / (th.derateFullC - th.derateStartC), 0, 1);
  return 1 - t * (1 - th.derateRack);
}

/**
 * Burn fuel, heat and cool the engine, and stop it if it runs dry or overheats: on the
 * engine's own state, drawing from a tank holding `fuelL`; returns what's left in the tank.
 */
export function fuelAndHeatStep(e: EngineState, def: EngineSpec, fuelL: number, dt: number): number {
  const f = def.engine.fuel;
  const th = def.engine.thermal;
  const seaC = CONFIG.environment.seaTempC;

  // ── Fuel ──
  const kgPerS = fuelFlowFor(e, def);
  e.fuelFlowLph = (kgPerS / f.densityKgPerL) * 3600;
  const left = Math.max(0, fuelL - (kgPerS / f.densityKgPerL) * dt);
  if (e.phase === 'running' && left <= 0) e.phase = 'off'; // ran dry

  // ── Heat ──
  const qIn = kgPerS * th.lhvMJPerKg * 1000 * th.heatToCoolant; // kW
  const opening = clamp((e.coolantC - th.thermostatOpenC) / (th.thermostatFullC - th.thermostatOpenC), 0, 1);
  // The raw-water pump is driven by the engine: no flow through the exchanger when stopped.
  const pump = e.phase === 'running' ? 1 : 0;
  const exchanger = th.exchangerKwPerK * opening * pump * (e.coolingFault ? th.faultExchangerFraction : 1);
  const qOut = (th.baseLossKwPerK + exchanger) * (e.coolantC - seaC);
  e.coolantC += ((qIn - qOut) / th.heatCapacity) * dt;

  const oilTarget = e.coolantC + (e.phase === 'running' ? th.oilLoadRiseC * e.rack : 0);
  e.oilC += (oilTarget - e.oilC) * Math.min(1, dt / th.oilLagS);

  if (e.phase === 'running' && e.coolantC > th.shutdownC) e.phase = 'off'; // engine protection
  return left;
}

/** Alarms for displays and audio. */
export function engineAlarms(s: VesselState, def: EngineSpec): { highTemp: boolean; lowFuel: boolean } {
  return {
    highTemp: s.engine.coolantC > def.engine.thermal.alarmC,
    lowFuel: s.engine.fuelL < def.engine.fuel.lowFraction * (s.engine.tankL ?? def.engine.fuel.tankL),
  };
}
