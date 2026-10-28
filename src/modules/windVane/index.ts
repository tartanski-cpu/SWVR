/**
 * Module mount.wind-vane: a masthead wind vane of the sailing-yacht kind (owner, Oct 2026:
 * "something every ship should have, just like every ship has navigation lights and an anchor
 * ... I want it to look like a Windex"; our own design of that type, no maker's marks). It
 * stands on top of the masthead light (light.navigation's `vane` socket): a thin spindle, two
 * fixed reference arms splayed aft below with an orange reflector tab at each end, and on top
 * the vane itself, a long arm turning freely on the spindle with an arrowhead forward and a
 * swept tail fin aft.
 *
 * What it shows: the APPARENT wind, the true wind (weather.ts windVector, gusts and all) less
 * the boat's own way through the air, as it's felt at the masthead. The arrowhead points into
 * it, where the wind comes from; the fin trails downwind.
 *
 * How it moves (modelled, so it swings and settles as a real vane does rather than snapping):
 * the fin, off the wind by an angle e, makes a turning moment that grows with the dynamic
 * pressure, so with the vane's inertia it's a torsion pendulum whose natural frequency scales
 * with the airspeed v: wn = v * sqrt(stiffness) / armLength. Air damping scales with v too, so
 * the damping ratio is about constant (`damping`, under 1: a little overshoot). Below
 * `minWind` the bearing's friction holds it where it is. In the boat's axes; she turns under it.
 *
 * Draw calls: the spindle and reference arms join the boat's fixed parts; the vane is one mesh.
 */
import * as THREE from 'three';
import { CONFIG } from '../../config';
import { windVector } from '../../environment/weather';
import type { ModuleDefinition } from '../../modular/module';
import { flatVertexColorMaterial, mergeParts, part } from '../../render/geometryUtils';

export type WindVaneConfig = typeof CONFIG.modules.windVane;

/** An angle brought into (-pi, pi]. */
const wrap = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

/**
 * One step of the vane's swing: its heading `yaw` (rad, about the boat's up; 0 points the
 * arrow at her bow) and turn rate `rate` (rad/s), toward the apparent wind coming from
 * `windYaw` at `speed` m/s. Returns the new [yaw, rate].
 */
export function vaneStep(yaw: number, rate: number, windYaw: number, speed: number, dt: number, c: Pick<WindVaneConfig, 'stiffness' | 'damping' | 'minWind' | 'armLength'>): [number, number] {
  if (speed < c.minWind) return [yaw, 0];
  const wn = (speed * Math.sqrt(c.stiffness)) / c.armLength;
  // (Small steps: the swing is quick in a gale, so the frame's dt is cut into pieces.)
  const n = Math.max(1, Math.ceil(dt * wn * 4));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const accel = wn * wn * Math.sin(wrap(windYaw - yaw)) - 2 * c.damping * wn * rate;
    rate += accel * h;
    yaw = wrap(yaw + rate * h);
  }
  return [yaw, rate];
}

export const WIND_VANE: ModuleDefinition<WindVaneConfig> = {
  id: 'mount.wind-vane',
  version: 1,
  fits: ['roof.mount'],
  defaults: CONFIG.modules.windVane,
  validateConfig: (c) => [
    ...(c.scale > 0 ? [] : ['scale should be over 0']),
    ...(c.damping > 0 ? [] : ['damping should be over 0']),
  ],
  ports: {},
  view: {
    build({ config }) {
      const k = config.scale;
      const L = config.armLength * k;
      const spindleH = 0.3 * k;
      const dark = config.colours.body;
      // The fixed parts: a clamp on the light's top, the spindle, the reference arms and tabs.
      const fixed: THREE.BufferGeometry[] = [
        part(new THREE.BoxGeometry(0.05 * k, 0.03 * k, 0.05 * k).translate(0, 0.015 * k, 0), dark),
        part(new THREE.CylinderGeometry(0.006 * k, 0.008 * k, spindleH, 6).translate(0, spindleH / 2, 0), dark),
      ];
      const armY = spindleH * 0.42;
      const armLen = 0.17 * k;
      for (const side of [-1, 1]) {
        // Splayed aft and a little up, as a yacht's tack reference arms are.
        const yaw = side * config.referenceDeg * (Math.PI / 180);
        const rot = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(-10 * (Math.PI / 180)));
        const arm = new THREE.CylinderGeometry(0.0035 * k, 0.0035 * k, armLen, 5).rotateX(Math.PI / 2).translate(0, 0, armLen / 2);
        fixed.push(part(arm.applyMatrix4(rot).translate(0, armY, 0), dark));
        const tab = new THREE.BoxGeometry(0.004 * k, 0.022 * k, 0.04 * k).translate(0, 0, armLen - 0.01 * k);
        fixed.push(part(tab.applyMatrix4(rot).translate(0, armY, 0), config.colours.tab));
      }
      // The vane: a hub on the spindle's top, the arm, the arrowhead forward, the fin aft.
      const front = L * 0.38;
      const back = L - front;
      const fin = new THREE.Shape();
      // (Swept back: its leading edge raked aft, a tall trailing edge.)
      fin.moveTo(0, 0);
      fin.lineTo(0.11 * k, 0);
      fin.lineTo(0.12 * k, 0.1 * k);
      fin.lineTo(0.07 * k, 0.1 * k);
      fin.closePath();
      const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.004 * k, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.002 * k, -0.02 * k, back - 0.11 * k);
      const stripe = new THREE.BoxGeometry(0.006 * k, 0.018 * k, 0.05 * k).translate(0, 0.05 * k, back - 0.03 * k);
      const vane = mergeParts([
        part(new THREE.CylinderGeometry(0.012 * k, 0.012 * k, 0.03 * k, 8), dark),
        part(new THREE.CylinderGeometry(0.004 * k, 0.004 * k, L, 5).rotateX(Math.PI / 2).translate(0, 0, (back - front) / 2), dark),
        part(new THREE.ConeGeometry(0.018 * k, 0.07 * k, 4).rotateX(-Math.PI / 2).translate(0, 0, -front - 0.03 * k), config.colours.arrow),
        part(finGeo, dark),
        part(stripe, config.colours.tab),
      ]);
      const mesh = new THREE.Mesh(vane, flatVertexColorMaterial());
      mesh.name = 'windVane';
      mesh.position.y = spindleH;
      // The swing (vaneStep) and its state between frames.
      let yaw = 0;
      let rate = 0;
      const wind = { x: 0, z: 0 };
      const q = new THREE.Quaternion();
      const v = new THREE.Vector3();
      return {
        staticParts: fixed,
        movingParts: [mesh],
        controls: [],
        update: (_read, _s, dt, frame) => {
          const s = frame.vessel;
          if (!s || !frame.env || dt <= 0) return;
          windVector(frame.env, wind, { x: s.position[0], z: s.position[2] });
          // The air past the masthead in the boat's axes: the wind less her own way.
          q.fromArray(s.orientation).invert();
          v.set(wind.x - s.linearVelocity[0], 0, wind.z - s.linearVelocity[2]).applyQuaternion(q);
          const speed = Math.hypot(v.x, v.z);
          // The arrow (the vane's -z) points into the wind, against the air's flow.
          const windYaw = Math.atan2(v.x, v.z);
          [yaw, rate] = vaneStep(yaw, rate, windYaw, speed, Math.min(dt, 0.1), config);
          mesh.rotation.y = yaw;
        },
      };
    },
  },
};
