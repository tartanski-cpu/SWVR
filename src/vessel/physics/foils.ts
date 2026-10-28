/**
 * Hydrofoils (owner, Oct 2026: a small foiling electric ferry; the hull modifications chat).
 * A boat with `VesselDef.foils` flies on fully submerged foils: at speed they lift her hull
 * clear of the water, and her hull's resistance, damping and added mass fade with its
 * immersion (vesselPhysics.ts), leaving the foils and their struts to carry her.
 *
 * What's modelled, each tick, for each foil panel (a straight wing, its own flap):
 *   - its angle of attack: its incidence, its flap's, and the angle its motion through the
 *     water meets it at (her speed, heave, pitch and roll, the waves' orbital motion: the
 *     physics port's flow at the panel);
 *   - lift, CL = CLa x alpha, CLa = 2 pi AR / (AR + 2) (a finite wing); past `stallDeg` it
 *     stalls, falling to `postStall` of its peak;
 *   - drag, CD = cd0 + CL^2 / (pi e AR) (profile and induced);
 *   - the free surface: a foil near it loses lift, 1 - exp(-depth / (surfaceChords x chord)),
 *     none at all once it breaks through (ventilated);
 *   - lift square to its motion through the water, drag along it, at the panel.
 * And each strut (upright, piercing the surface): drag on its wetted length, and a side force
 * against sideslip as a low aspect-ratio foil (the surface its mirror: AR = 2 x wet / chord);
 * what keeps her straight and turns her once her hulls are out of the water.
 *
 * Fully submerged foils aren't stable on their own (a surface-piercing foil is; these aren't),
 * so she flies on a flight computer, as real ones do. Stateless here: each tick it works
 * out the lift each panel should give, then the flap angle that gives it (inverting the
 * panel's own lift sum), clamped to `flapMaxDeg`:
 *   forward foil   her weight's share on it, more if she's flying too deep (the error capped at
 *                  `climb`, so she climbs to her ride height steadily) and less if she's rising
 *                  or her bow's up past her trim: x (1 + kh (depth - rideDepth) - kv x rising -
 *                  kpf x (pitch - trim, if up)); its port and starboard
 *                  halves differ to hold her roll, banked into her turns as a coordinated turn
 *                  (bank x atan(U r / g), at most maxBankDeg), with roll-rate damping;
 *   aft foil       its share x (1 + kp (pitch - trim) + kq x pitch rate): her trim.
 * It takes over from `engageFrom` of her take-off speed, fully at it; below, her flaps are
 * level and she runs on her hulls (her foils lifting a little at their incidence). Heeled past
 * `safeHeelDeg` (a sea beyond her: a foil come out of the water), it brings her down onto her
 * hulls, holding her level as she lands, rather than fight to stay up. HULL at her helm
 * (`VesselControls.foilMode` 0) does the same at any speed: she stays down on her hulls, or
 * comes down gently onto them if she was flying. SHALLOW (2) does too, then once she's off her
 * foils and slowed, retracts them (`FoilSystem.retract` m up, over `retractSeconds`); FOIL or
 * HULL lowers them again. Her ride height is her design's
 * `rideDepth`, a step deeper (low) or shallower (high) by `controls.foilRide`.
 */
import { CONFIG } from '../../config';
import type { PhysicsPort } from '../../modular/module';

type V3 = readonly [number, number, number];

export interface FoilPanel {
  /** Its middle, vessel axes (m: x to starboard, y up from her DWL, z aft). */
  at: V3;
  span: number;
  chord: number;
  /** Its section's angle to her keel line, nose up (deg), its flap level. */
  incidenceDeg: number;
  /** What the flight computer holds with it: her height and roll (the forward foil's halves), or her trim (the aft foil). */
  role: 'port' | 'starboard' | 'aft';
}

export interface FoilStrut {
  /** Where it stands (vessel axes, m): x and z. */
  x: number;
  z: number;
  /** Its top (at her hull) and its foot (at the foil), heights in vessel axes (m). */
  top: number;
  bottom: number;
  chord: number;
  /** A pod on its foot (an electric motor's): its drag area (m^2, CD x frontal area). */
  podDragArea?: number;
  /** A streamlined bulb on its foot where its foil meets it: its drag area (m^2). */
  bulbDragArea?: number;
  /**
   * It turns with her steering (the foiling ferry's pod strut, owner 28 Oct 2026: "hardly
   * steers"): its side force from the water's angle to it as it's swung, so it steers her as a
   * rudder does, rather than holding her straight as a fixed strut does.
   */
  steered?: boolean;
}

export interface FoilSystem {
  panels: FoilPanel[];
  struts: FoilStrut[];
  /** Her forward foil's end plates (winglets), their height (m): a wing with them acts as a longer one (Hoerner: AR x (1 + 1.9 h / span)). */
  endPlate?: number;
  /** How far her foils and struts rise when retracted (shallow mode, m): her struts slide up into her hulls. 0: they don't retract. */
  retract?: number;
  /** How deep her flight computer flies her forward foil (m under the surface). */
  rideDepth: number;
  /** Her trim flying (deg, bow up). */
  trimDeg: number;
  /** Her take-off speed (m/s): her flight computer has full authority from here. */
  takeoff: number;
}

/** The last tick's foils, for tests and the helm's display: each panel's flap (deg), lift (N), depth (m); flying or not. */
export const foilTelemetry = { flaps: [] as number[], lift: [] as number[], depth: [] as number[], engaged: 0, drag: 0 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Her foils' and struts' forces this tick, through the physics port. `mass` and `cgZ`: hers
 * now (payload in), for the share of her weight each foil should carry.
 */
export function stepFoils(
  fs: FoilSystem,
  port: PhysicsPort,
  mass: number,
  cgZ: number,
  controls: { foilMode?: number; foilRide?: number } = {},
  /** Her steering's angle (rad), for a strut that turns with it (FoilStrut.steered). */
  steer = 0,
  /** How far her foils were down last tick (0 retracted .. 1 down; unset: down), and the tick (s). */
  deployWas = 1,
  dt = 0,
): { engaged: number; flaps: number[]; deploy: number; draught: number } {
  const c = CONFIG.foils;
  // Her helm: 1 FOIL, 0 HULL (on her hulls, foils down), 2 SHALLOW (on her hulls, foils
  // retracted); and her ride height (a step deeper or shallower than her design's).
  const mode = Math.round(Math.min(2, Math.max(0, controls.foilMode ?? 1)));
  const foiling = mode === 1;
  const rideDepth = fs.rideDepth + c.rideSteps[Math.round(Math.min(2, Math.max(0, controls.foilRide ?? 1)))];
  const rho = CONFIG.ocean.density;
  const g = CONFIG.ocean.gravity;
  const W = mass * g;

  // ── Her attitude, from points of hers in the world (the port's) ──
  const o = port.worldPoint([0, 0, 0]);
  const sb = port.worldPoint([1, 0, 0]);
  const bw = port.worldPoint([0, 0, -1]);
  const heelDown = -Math.asin(clamp(sb.y - o.y, -1, 1)); // + starboard down
  const pitch = Math.asin(clamp(bw.y - o.y, -1, 1)); // + bow up
  const vo = port.worldVelocity([0, 0, 0]);
  const vs = port.worldVelocity([1, 0, 0]);
  const vb = port.worldVelocity([0, 0, -1]);
  const rollRateDown = -(vs.y - vo.y);
  const pitchRate = vb.y - vo.y;
  // Her yaw rate, + turning to starboard (her bow moving to starboard).
  const sx = sb.x - o.x;
  const sz = sb.z - o.z;
  const sl = Math.hypot(sx, sz) || 1;
  const yawRate = ((vb.x - vo.x) * sx + (vb.z - vo.z) * sz) / sl;
  const flow0 = port.flowAt([0, 0, 0], true);
  const U = -flow0.z;

  // ── The flight computer's authority: none below engageFrom x take-off, full at it ──
  const k = c.control;
  const t = clamp((U - k.engageFrom * fs.takeoff) / Math.max(1e-6, (1 - k.engageFrom) * fs.takeoff), 0, 1);
  const engaged = t * t * (3 - 2 * t);

  // ── Her foils down or retracted (SHALLOW): they move at `retractSeconds` for the whole
  // travel; up only once she's come down off them and slowed (until then SHALLOW is HULL),
  // down at any time. Each foil and each strut's foot that much higher (vessel axes). ──
  const travel = fs.retract ?? 0;
  const wantDown = mode === 2 && travel > 0 ? 0 : 1;
  let deploy = clamp(deployWas, 0, 1);
  const step = dt / Math.max(1e-6, c.retractSeconds);
  if (wantDown > deploy) deploy = Math.min(wantDown, deploy + step);
  else if (wantDown < deploy && engaged === 0) deploy = Math.max(wantDown, deploy - step);
  const up = (1 - deploy) * travel;
  const at = (p: FoilPanel): V3 => [p.at[0], p.at[1] + up, p.at[2]];

  // Each foil's share of her weight, by where it is against her CG.
  const fwd = fs.panels.filter((p) => p.role !== 'aft');
  const aft = fs.panels.filter((p) => p.role === 'aft');
  const fwdSpan = fwd.reduce((a, p) => a + p.span, 0);
  const zF = fwd.reduce((a, p) => a + p.at[2], 0) / Math.max(1, fwd.length);
  const zA = aft.reduce((a, p) => a + p.at[2], 0) / Math.max(1, aft.length);
  const shareF = aft.length ? clamp((zA - cgZ) / (zA - zF), 0, 1) : 1;
  const shareA = 1 - shareF;
  // Her forward foil's depth and how fast it's rising (world). The depth her flight computer
  // flies by (owner, 28 Oct 2026, "they should be pretty much completely smooth because they ride
  // over the waves"): under the mean sea, still water level, not the wave over the foil, so she
  // holds her height level over the crests and troughs ("platforming") and her foils run deeper
  // under a crest and shallower in a trough. `control.follow` of the wave over it is taken in as
  // well (0 level over them, 1 up and down with every one: "contouring"). In a trough deep enough
  // to bring a foil within `control.guard` m of the surface, she follows it down, as much as it
  // takes to keep the foil that far under (a foil near the surface loses its lift, and out of it
  // she'd drop).
  const depthF =
    fwd.reduce((a, p) => {
      const still = -port.worldPoint(at(p)).y;
      const local = port.depthAt(at(p));
      return a + Math.min(still + k.follow * (local - still), local + rideDepth - k.guard);
    }, 0) / Math.max(1, fwd.length);
  const riseF = fwd.reduce((a, p) => a + port.worldVelocity(at(p)).y, 0) / Math.max(1, fwd.length);
  const maxBank = (k.maxBankDeg * Math.PI) / 180;
  const bankTarget = clamp(k.bank * Math.atan((U * yawRate) / g), -maxBank, maxBank);
  const eRoll = heelDown - bankTarget;
  // (Her height error capped at `climb`: from her hulls, 1.4 m under her ride depth, she climbs
  // steadily to it, not on full flap; and her forward foil eases off as her bow rises past her
  // trim, so she doesn't leap bow-high out of the water.)
  const trim = (fs.trimDeg * Math.PI) / 180;
  // Past `safeHeelDeg` of heel (a sea beyond her, a foil out of the water) she comes down onto
  // her hulls: each foil asked for only `landShare` of its share, her roll still held level.
  const safe = (k.safeHeelDeg * Math.PI) / 180;
  // (HULL at her helm: the same, her foils asked for only `landShare` whatever her heel.)
  const over = foiling ? clamp((Math.abs(heelDown) - safe) / (0.5 * safe), 0, 1) : 1;
  const land = 1 - (1 - k.landShare) * over;
  const front = land * W * shareF * (1 + k.kh * clamp(depthF - rideDepth, -k.climb, k.climb) - k.kv * riseF - k.kpf * Math.max(0, pitch - trim));
  const roll = k.kr * eRoll + k.krd * rollRateDown;
  const after = land * W * shareA * (1 + k.kp * (pitch - trim) + k.kq * pitchRate);
  const stall = (c.stallDeg * Math.PI) / 180;
  const flapMax = (c.flapMaxDeg * Math.PI) / 180;
  // Each panel's flow: its depth, dynamic pressure, lift slope and angle before its flap.
  const flows = fs.panels.map((p) => {
    const pa = at(p);
    const f = port.flowAt(pa);
    const u = -f.z;
    const depth = port.depthAt(pa);
    const S = p.span * p.chord;
    // (The forward foil's two halves are one wing: their aspect ratio is the whole foil's,
    // longer in effect for its end plates.)
    const AR = p.role === 'aft' ? p.span / p.chord : (fwdSpan / p.chord) * (1 + (1.9 * (fs.endPlate ?? 0)) / fwdSpan);
    const CLa = (2 * Math.PI * AR) / (AR + 2);
    const surface = depth <= 0 ? 0 : 1 - Math.exp(-depth / (c.surfaceChords * p.chord));
    const q = 0.5 * rho * (u * u + f.y * f.y);
    const alphaGeo = (p.incidenceDeg * Math.PI) / 180 + Math.atan2(-f.y, Math.max(Math.abs(u), 0.5));
    return { pa, f, depth, S, AR, CLa, surface, q, alphaGeo };
  });
  // Pitch first: while her after foils can't give their share even on full flap (climbing out
  // of the water, slow), her forward foil is asked for no more than they can match, so she
  // rises level on both rather than bow-first.
  const aftMax = fs.panels.reduce((a, p, i) => {
    if (p.role !== 'aft') return a;
    const w = flows[i];
    return a + w.q * w.S * w.surface * w.CLa * Math.min(stall, w.alphaGeo + c.flapTau * flapMax);
  }, 0);
  const match = after > 0 && aftMax < after ? Math.max(0, aftMax) / after : 1;
  // Her roll: each foil's half (or, aft, each hull's foil where there's one under each) asked
  // for more or less by `roll` of its share of her weight, the starboard ones more for + (her
  // roll held at full strength even while she's coming down, or she can't right herself).
  const sideOf = (p: FoilPanel) => (p.role === 'starboard' ? 1 : p.role === 'port' ? -1 : p.at[0] > 0.3 ? 1 : p.at[0] < -0.3 ? -1 : 0);
  const rollLift = (p: FoilPanel) => sideOf(p) * roll * W * (p.role === 'aft' ? shareA / aft.length : shareF / fwd.length);
  const want = (p: FoilPanel) => (p.role === 'aft' ? after / aft.length : (match * front) / fwd.length) + rollLift(p);

  foilTelemetry.flaps.length = 0;
  foilTelemetry.lift.length = 0;
  foilTelemetry.depth.length = 0;
  foilTelemetry.engaged = engaged;
  foilTelemetry.drag = 0;
  let draught = 0;
  for (let i = 0; i < fs.panels.length; i++) {
    const p = fs.panels[i];
    const { pa, f, depth, S, AR, CLa, surface, q, alphaGeo } = flows[i];
    draught = Math.max(draught, depth + c.belowFoil);
    // The flap that gives the lift wanted, from the panel's own lift sum.
    let flap = 0;
    if (engaged > 0 && q * S * surface > 1) {
      const clWant = want(p) / (q * S * surface);
      flap = engaged * clamp((clWant / CLa - alphaGeo) / c.flapTau, -flapMax, flapMax);
    }
    const alpha = alphaGeo + c.flapTau * flap;
    const a = Math.abs(alpha);
    const CL = Math.sign(alpha) * CLa * (a <= stall ? a : stall * Math.max(c.postStall, 1 - (a - stall) / stall));
    const L = q * S * CL * surface;
    const D = depth > 0 ? q * S * (c.cd0 + (CL * CL) / (Math.PI * c.oswald * AR)) : 0;
    // Square to her motion through the water (in her y-z plane), and along it.
    const m = Math.hypot(f.y, f.z) || 1;
    const dy = f.y / m;
    const dz = f.z / m;
    port.addForce(pa, 0, L * -dz - D * dy, L * dy - D * dz);
    foilTelemetry.flaps.push((flap * 180) / Math.PI);
    foilTelemetry.lift.push(L);
    foilTelemetry.depth.push(depth);
    foilTelemetry.drag += D;
  }

  for (const s of fs.struts) {
    const bottom = s.bottom + up;
    const foot: V3 = [s.x, bottom, s.z];
    draught = Math.max(draught, port.depthAt(foot) + c.belowFoil);
    const wet = clamp(port.depthAt(foot), 0, Math.max(0, s.top - bottom));
    if (wet <= 0) continue;
    const mid: V3 = [s.x, bottom + wet / 2, s.z];
    const f = port.flowAt(mid, true);
    const sp = Math.hypot(f.x, f.z);
    if (sp < 1e-4) continue;
    const q = 0.5 * rho * sp * sp;
    const A = wet * s.chord;
    const AR = (2 * wet) / s.chord;
    // (A steered strut swung by `steer`, as a pod is: + its push turned to port. Its chord
    // points along (-sin, -cos) in her x and z, its side across that; the water's angle to it.)
    const d = s.steered ? steer : 0;
    const along = -f.x * Math.sin(d) - f.z * Math.cos(d);
    const across = f.x * Math.cos(d) - f.z * Math.sin(d);
    const beta = Math.atan2(across, Math.max(Math.abs(along), 0.5));
    const side = q * A * ((2 * Math.PI * AR) / (AR + 2)) * clamp(beta, -0.25, 0.25);
    const D = q * (A * c.strutCd + (s.podDragArea ?? 0) + (s.bulbDragArea ?? 0));
    port.addForce(mid, -side * Math.cos(d) - (D * f.x) / sp, 0, side * Math.sin(d) - (D * f.z) / sp);
    foilTelemetry.drag += D;
  }
  return { engaged: foiling ? engaged : 0, flaps: [...foilTelemetry.flaps], deploy, draught };
}
