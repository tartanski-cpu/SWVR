import { BREAKERS, type BreakerName } from './vesselState';
import * as THREE from 'three';
import type { Intent } from '../core/intents';
import { clamp } from '../core/math';
import { CONFIG } from '../config';
import { toggleEngine } from './physics/propulsion';
import { toggleDock } from './physics/mooring';
import { isWorkboat, VESSEL_DEFS, type VesselDef, type WorkboatDef } from './vesselDef';
import { fuelBerthAt } from '../world/geography';
import { BERTHS, PORTS } from '../world/archipelago';
import type { VesselState } from './vesselState';

const q = new THREE.Quaternion();
const e = new THREE.Euler();

/**
 * Place a vessel at rest. Heading is a compass bearing (0 = bow north = -Z, 90 = east).
 * Heel is positive to starboard, trim positive bow-down (degrees).
 */
export function placeVessel(
  s: VesselState,
  x: number,
  y: number,
  z: number,
  headingDeg: number,
  heelDeg = 0,
  trimDeg = 0,
): void {
  const D = Math.PI / 180;
  // Vessel axes: roll about z (bow is -z, so +rotation about z lifts port -> heel to stbd
  // is negative), pitch about x (bow-down is negative about +x), yaw about y.
  e.set(-trimDeg * D, -headingDeg * D, -heelDeg * D, 'YXZ');
  q.setFromEuler(e);
  s.position = [x, y, z];
  s.orientation = [q.x, q.y, q.z, q.w];
  s.linearVelocity = [0, 0, 0];
  s.angularVelocity = [0, 0, 0];
  // A tender placed somewhere is off the crane and afloat.
  if (s.tender) s.tender = { hostId: s.tender.hostId, phase: 'free', t: 0 };
}

/** Debug test: drop the vessel from height at the spawn point. */
export function dropVessel(s: VesselState): void {
  const sp = VESSEL_DEFS[s.defId].spawn;
  placeVessel(s, sp.x, sp.dropHeight, sp.z, sp.headingDeg, 6, -3);
}

/** Grab controls that can be held, by channel. */
const HOLDABLE: Record<string, true> = { lever: true, helm: true, spotPan: true, monPan: true };
/** Intent -> the hold that guards it (the joystick drives pan and tilt). */
const HOLD_KEY: Record<string, string> = { lever: 'lever', helm: 'helm', spotPan: 'spotPan', spotTilt: 'spotPan', monPan: 'monPan', monTilt: 'monPan' };

/** Let go of everything a player is holding (they left, or the game ended). */
export function releaseHolds(s: VesselState, playerId?: string): void {
  for (const [k, who] of Object.entries(s.holds)) if (playerId === undefined || who === playerId) delete s.holds[k];
}

/**
 * Vessel intents: the only way players (local or, later, remote) operate a vessel.
 * Values are absolute (lever at 0.6, not "+0.1") so a repeated or late intent is harmless.
 */
export function applyVesselIntent(s: VesselState, intent: Intent): void {
  // A grab control someone else has a hand on only answers to them.
  const guard = HOLD_KEY[intent.control];
  const holder = guard ? s.holds[guard] : undefined;
  if (holder && holder !== intent.playerId) return;
  switch (intent.control) {
    case 'hold': {
      // ref = the control's channel; value 1 = hand on, 0 = hand off.
      const key = intent.ref ?? '';
      if (!(key in HOLDABLE)) break;
      const current = s.holds[key];
      if (intent.value > 0.5) {
        if (!current) s.holds[key] = intent.playerId;
      } else if (current === intent.playerId) {
        delete s.holds[key];
      }
      break;
    }
    case 'lever':
      s.controls.lever = clamp(intent.value, -1, 1);
      break;
    case 'helm':
      s.controls.helm = clamp(intent.value, -1, 1);
      break;
    case 'navLights':
      s.controls.navLights = intent.value > 0.5 ? 1 : 0;
      break;
    case 'horn':
      s.controls.horn = intent.value > 0.5 ? 1 : 0;
      break;
    case 'wipers':
      s.controls.wipers = intent.value > 0.5 ? 1 : 0;
      break;
    case 'chartLamp':
      s.controls.chartLamp = intent.value > 0.5 ? 1 : 0;
      break;
    case 'fenders':
      s.controls.fenders = intent.value > 0.5 ? 1 : 0;
      break;
    case 'trawl':
      s.controls.trawl = intent.value > 0.5 ? 1 : 0;
      break;
    case 'winchHeave':
    case 'winchPayOut':
    case 'netOut':
    case 'netIn':
      s.controls[intent.control] = intent.value > 0.5 ? 1 : 0;
      break;
    case 'door':
      s.controls.door = intent.value > 0.5 ? 1 : 0;
      break;
    case 'dipstick':
      // Oil checked: the clock to the next check starts again.
      if (s.engine.oil !== undefined) s.engine.sinceCheck = 0;
      break;
    case 'oilTopUp':
      if (s.engine.oil !== undefined) s.engine.oil = 1;
      break;
    case 'debugOil':
      // Debug: oil level (0..1) and an oil check due now.
      if (s.engine.oil !== undefined) {
        s.engine.oil = Math.max(0, Math.min(1, intent.value));
        s.engine.sinceCheck = 1e6;
      }
      break;
      break;
    case 'engineStartStop': {
      const def = VESSEL_DEFS[s.defId];
      if (isWorkboat(def)) toggleEngine(s, def);
      break;
    }
    case 'debugFuel': {
      // Set the tank to `value` litres (debug/test, e.g. to try running dry).
      const tank = VESSEL_DEFS[s.defId].engine?.fuel.tankL ?? 0;
      s.engine.fuelL = clamp(intent.value, 0, tank);
      break;
    }
    case 'debugCoolingFault':
      // Raw-water pump impeller failure on (1) / repaired (0).
      s.engine.coolingFault = intent.value > 0.5;
      break;
    case 'anchor':
      s.controls.anchor = intent.value > 0.5 ? 1 : 0;
      break;
    case 'key':
      // Ignition key 1 on / 0 off.
      s.engine.key = intent.value > 0.5 ? 1 : 0;
      break;
    case 'heat':
      s.controls.heat = intent.value > 0.5 ? 1 : 0;
      break;
    case 'start':
      s.controls.start = intent.value > 0.5 ? 1 : 0;
      break;
    case 'batSelect':
      // Battery selector: 1, 2 or 3 (both); any other value steps 1 -> both -> 2 -> 1.
      if (s.electrics) {
        const v = Math.round(intent.value);
        s.electrics.selector = v >= 1 && v <= 3 ? v : s.electrics.selector === 1 ? 3 : s.electrics.selector === 3 ? 2 : 1;
      }
      break;
    case 'quickStart':
      // One press does it all (quick-start option / debug): master, main breakers, start.
      if (s.electrics) {
        s.electrics.master = 1;
        for (const k of ['instruments', 'chart', 'radio', 'navLights', 'hydraulics'] as const) s.electrics.breakers[k] = 1;
      }
      {
        const def = VESSEL_DEFS[s.defId];
        if (s.engine.phase === 'off' && isWorkboat(def)) toggleEngine(s, def as WorkboatDef);
      }
      break;
    case 'master':
      // Battery master switch: 1 on / 0 off.
      if (s.electrics) s.electrics.master = intent.value > 0.5 ? 1 : 0;
      break;
    default:
      // Breakers: 'brk_<name>' 1 on / 0 off.
      if (intent.control.startsWith('brk_') && s.electrics) {
        const k = intent.control.slice(4) as BreakerName;
        if (k in s.electrics.breakers) s.electrics.breakers[k] = intent.value > 0.5 ? 1 : 0;
      }
      break;
    case 'debugElectrics':
      // Debug: 0 = both batteries flat, 1 = fill both, 2 = power everything on (master on, full),
      // 3 = battery 1 flat (try the selector).
      if (s.electrics) {
        if (intent.value < 0.5) s.electrics.soc = [0, 0];
        else if (intent.value > 2.5) s.electrics.soc = [0, s.electrics.soc[1]]; // 3: battery 1 flat
        else s.electrics.soc = [1, 1];
        if (intent.value > 1.5 && intent.value < 2.5) {
          s.electrics.master = 1;
          for (const k of BREAKERS) s.electrics.breakers[k] = 1;
        }
      }
      break;
    case 'debugBilge':
      // Debug: set the bilge water level (0..1).
      if (s.bilge !== undefined) s.bilge = Math.max(0, Math.min(1, intent.value));
      break;
    case 'cabinLight':
      // Three-way: 0 off, 1 white, 2 red (night: keeps your eyes dark-adapted).
      s.controls.cabinLight = Math.max(0, Math.min(2, Math.round(intent.value)));
      break;
    case 'spotlight':
      s.controls.spotlight = intent.value > 0.5 ? 1 : 0;
      break;
    case 'deckFore':
    case 'deckAft':
    case 'railLights':
    case 'fmOn':
      s.controls[intent.control] = intent.value > 0.5 ? 1 : 0;
      break;
    case 'obPower':
      // The outboard's on/off button (a press toggles it).
      s.controls.obOn = s.controls.obOn ? 0 : 1;
      break;
    case 'obGear': {
      // Gear lever: forward / neutral / reverse. Like a real outboard, shifting closes the
      // throttle (you can't slam it from full ahead into reverse).
      const g = Math.sign(Math.round(intent.value));
      if (g !== s.controls.obGear) s.controls.lever = 0;
      s.controls.obGear = g;
      break;
    }
    case 'fmTune': {
      // TUNE: on to the next station (switching the set on if it was off).
      const n = CONFIG.fmRadio.stations.length;
      if (s.controls.fmOn) s.controls.fmStation = (s.controls.fmStation + 1) % n;
      s.controls.fmOn = 1;
      break;
    }
    case 'fmStation': {
      const n = CONFIG.fmRadio.stations.length;
      if (Number.isInteger(intent.value) && intent.value >= 0 && intent.value < n) {
        s.controls.fmStation = intent.value;
        s.controls.fmOn = 1;
      }
      break;
    }
    case 'spotPan': {
      const sp = VESSEL_DEFS[s.defId].spotlight;
      if (!sp) break;
      s.controls.spotPan = clamp(intent.value, -sp.panLimitDeg, sp.panLimitDeg);
      break;
    }
    case 'spotTilt': {
      const sp = VESSEL_DEFS[s.defId].spotlight;
      if (!sp) break;
      s.controls.spotTilt = clamp(intent.value, sp.tiltMinDeg, sp.tiltMaxDeg);
      break;
    }
    case 'firePump':
      s.controls.firePump = intent.value > 0.5 ? 1 : 0;
      break;
    case 'monPan': {
      const m = VESSEL_DEFS[s.defId].fireMonitor;
      if (!m) break;
      s.controls.monPan = clamp(intent.value, -m.panLimitDeg, m.panLimitDeg);
      break;
    }
    case 'monTilt': {
      const m = VESSEL_DEFS[s.defId].fireMonitor;
      if (!m) break;
      s.controls.monTilt = clamp(intent.value, m.tiltMinDeg, m.tiltMaxDeg);
      break;
    }
    case 'dock':
      // DOCK button: dock in a berth's hot spot, or cast off.
      toggleDock(s);
      break;
    case 'refuel':
      // Start (1) or stop (0) taking fuel; stepRefuelling checks the berth each tick.
      s.refuelling = intent.value > 0.5;
      break;
    case 'debugDrop':
      dropVessel(s);
      break;
    case 'teleportToGround': {
      // Menu shortcut (Tests, ref = fishing ground name): in the middle of it, lever neutral.
      const g = CONFIG.fishing.grounds.find((o) => o.name === intent.ref);
      if (!g) break;
      placeVessel(s, g.x, 0, g.z, 0);
      s.controls.lever = 0;
      s.anchor = { phase: 'stowed', x: 0, z: 0, rodeM: 0, tension: 0, dragging: false };
      s.controls.anchor = 0;
      s.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
      break;
    }
    case 'teleportToPort': {
      // Menu shortcut (ref = port id): lie at the port's cargo berth, ready to DOCK, or in
      // the middle of its anchorage. Lever to neutral, anchor stowed, lines off.
      const port = PORTS.find((p) => p.id === intent.ref);
      if (!port) break;
      const berth = BERTHS.find((b) => b.portId === port.id && b.id.endsWith('cargo'));
      const a = port.cargo.anchorage;
      if (berth) placeVessel(s, berth.x, 0, berth.z, berth.headingDeg);
      else if (a) placeVessel(s, a.x, 0, a.z, 0);
      else break;
      s.controls.lever = 0;
      s.anchor = { phase: 'stowed', x: 0, z: 0, rodeM: 0, tension: 0, dragging: false };
      s.controls.anchor = 0;
      s.mooring = { phase: 'free', berthId: null, reversed: false, t: 0 };
      s.refuelling = false;
      break;
    }
    case 'debugHeel': {
      // Heel to `value` degrees at the current position and heading, then release.
      q.fromArray(s.orientation);
      e.setFromQuaternion(q, 'YXZ');
      placeVessel(s, s.position[0], s.position[1], s.position[2], -e.y / (Math.PI / 180), intent.value);
      break;
    }
  }
}

/** Below this speed (m/s) a boat counts as alongside for fuelling. */
const REFUEL_MAX_SPEED = 0.6;

/** Whether a vessel is at a fuel berth and slow enough to take fuel. */
export function canRefuel(s: VesselState): boolean {
  return fuelBerthAt(s.position[0], s.position[2]) !== null && Math.hypot(s.linearVelocity[0], s.linearVelocity[2]) < REFUEL_MAX_SPEED;
}

/** Fuel flows while `refuelling` is on, the boat stays at the berth and the tank isn't full. */
export function stepRefuelling(s: VesselState, def: VesselDef, dt: number, archipelago: boolean): void {
  if (!s.refuelling || !def.engine) return;
  const f = def.engine.fuel;
  if (!archipelago || !canRefuel(s) || s.engine.fuelL >= f.tankL) {
    s.refuelling = false;
    return;
  }
  s.engine.fuelL = Math.min(f.tankL, s.engine.fuelL + f.refuelRateLps * dt);
}
