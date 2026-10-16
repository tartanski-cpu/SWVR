/**
 * Damage and wear (phase 2, owner request): what a hard life does to the boat, mended in
 * port for money (career.ts). Per vessel, no world needed; boats with a bilge (the
 * workboat) only.
 *
 *   hull     `damage` 0..1 (0 sound). A hard hit - a point of the hull touching rock, a
 *            quay or the bottom faster than `impactSafe` m/s - does
 *            (v - impactSafe)^2 x `impactDamage`; grinding along the bottom (sliding over
 *            `slideSafe` m/s under more than `grindForce` N) does `grindDamage` per m slid.
 *            A damaged hull leaks: damage x `leakRate` of the bilge per second (bilge.ts),
 *            on top of the rain; at about half damage that beats the bilge pump.
 *   water    water in the bilge is weight low in the hull: a full bilge is `bilgeMassFull`
 *            kg (simulation.ts adds it to the payload), so a flooding boat sits deeper and
 *            gets sluggish.
 *   engine   `wear` 0..1: running hot (coolant over `hotC`) wears it at (T - hotC) x
 *            `hotWear` per s, running with the sump nearly dry (oil under `lowOil`) at
 *            `dryWear` per s. A worn engine gives less: the governor's rack is capped at
 *            1 - wear x `powerLoss`.
 */
import { CONFIG } from '../config';
import type { VesselDef } from './vesselDef';
import type { EngineState, VesselState } from './vesselState';

export function stepWear(s: VesselState, def: VesselDef, dt: number): void {
  stepHullWear(s, dt);
  if (def.engine) engineWearStep(s.engine, dt);
}

/** The hull's damage from hard hits and grinding (on a recipe boat the engine's wear is its module's). */
export function stepHullWear(s: VesselState, dt: number): void {
  const c = CONFIG.wear;
  if (s.damage !== undefined) {
    const k = s.contact;
    let d = 0;
    if (k.impact > c.impactSafe) d += (k.impact - c.impactSafe) ** 2 * c.impactDamage;
    if (k.force > c.grindForce && k.slide > c.slideSafe) d += k.slide * dt * c.grindDamage;
    s.damage = Math.min(1, s.damage + d);
  }
}

/** Engine wear from running hot or with the sump nearly dry (the diesel module's, M4a). */
export function engineWearStep(e: EngineState, dt: number): void {
  const c = CONFIG.wear;
  if (e.wear !== undefined && e.phase === 'running') {
    let w = 0;
    if (e.coolantC > c.hotC) w += (e.coolantC - c.hotC) * c.hotWear * dt;
    if (e.oil !== undefined && e.oil < c.lowOil) w += c.dryWear * dt;
    e.wear = Math.min(1, e.wear + w);
  }
}

/** The worn engine's cap on the fuel rack (1: as new). */
export function wearRackCap(s: VesselState): number {
  return wearRackCapFor(s.engine.wear);
}

export function wearRackCapFor(wear: number | undefined): number {
  return 1 - (wear ?? 0) * CONFIG.wear.powerLoss;
}
