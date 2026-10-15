import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Rain: streaks falling in a box around the viewer, the one new visual effect allowed.
 * Capped and cheap:
 *   - a fixed set of line segments (CONFIG.rain.count), ONE draw call; how many are drawn
 *     follows the rain (draw range), so light rain costs less;
 *   - all motion in the vertex shader from a time uniform: each drop has a random spot in
 *     the box and a phase; it falls at `speed`, blown sideways by the wind, and wraps
 *     round the box as the viewer moves - no per-frame CPU work or buffer uploads;
 *   - none inside the wheelhouse (a box in the boat's frame) or below the sea surface.
 */
export class RainView {
  readonly mesh: THREE.LineSegments;
  private readonly material: THREE.ShaderMaterial;
  private readonly max: number;
  /** Rain quality: 'high' (all streaks), 'low', or 'off'. A local setting. */
  quality: 'high' | 'low' | 'off' = 'high';

  constructor() {
    const c = CONFIG.rain;
    this.max = c.count;
    const n = this.max;
    // Two vertices per drop, sharing its seed; `end` 0 = head, 1 = tail.
    const seed = new Float32Array(n * 2 * 3);
    const end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const sx = Math.random();
      const sz = Math.random();
      const ph = Math.random();
      for (let k = 0; k < 2; k++) {
        seed.set([sx, sz, ph], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3)); // unused, required
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 3));
    geo.setAttribute('end', new THREE.BufferAttribute(end, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uArea: { value: c.area },
        uHeight: { value: c.height },
        uSpeed: { value: c.speed },
        uLen: { value: c.length },
        uWind: { value: new THREE.Vector2() },
        uOpacity: { value: c.opacity },
        uColor: { value: new THREE.Color(0xb4bec8) },
        uHouseInv: { value: new THREE.Matrix4() },
        uHouseMin: { value: new THREE.Vector3(1, 1, 1) },
        uHouseMax: { value: new THREE.Vector3(-1, -1, -1) },
      },
      vertexShader: /* glsl */ `
        attribute vec3 seed;
        attribute float end;
        uniform float uTime, uArea, uHeight, uSpeed, uLen;
        uniform vec3 uCenter;
        uniform vec2 uWind;
        uniform mat4 uHouseInv;
        uniform vec3 uHouseMin, uHouseMax;
        varying float vFade;
        void main() {
          // Where in the box: blown downwind over time, wrapped round the viewer.
          vec2 base = seed.xy * uArea + uWind * uTime;
          vec2 xz = uCenter.xz + (fract((base - uCenter.xz) / uArea) - 0.5) * uArea;
          // Height: falling at uSpeed, wrapping from the bottom of the box to the top.
          float fall = fract(seed.z - uTime * uSpeed / uHeight);
          vec3 head = vec3(xz.x, uCenter.y - uHeight * 0.5 + fall * uHeight, xz.y);
          // The streak trails back along its velocity (down and downwind): what the eye
          // smears in a moment, at most uLen long.
          vec3 vel = vec3(uWind.x, -uSpeed, uWind.y);
          vec3 p = head - vel * (uLen / length(vel)) * end;
          vec3 local = (uHouseInv * vec4(head, 1.0)).xyz;
          bool inHouse = all(greaterThan(local, uHouseMin)) && all(lessThan(local, uHouseMax));
          // Fade toward the edge of the box, and right in front of the eyes (no scratches).
          vFade = (1.0 - smoothstep(uArea * 0.2, uArea * 0.5, distance(head.xz, uCenter.xz))) * smoothstep(1.2, 3.5, distance(head, uCenter));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          // Hidden drops: pushed outside the clip volume.
          if (inHouse || head.y < 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vFade;
        void main() {
          gl_FragColor = vec4(uColor, uOpacity * vFade);
        }`,
    });
    this.mesh = new THREE.LineSegments(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    this.mesh.name = 'rain';
  }

  /**
   * @param rain    0..1 where the viewer is
   * @param center  viewer (world)
   * @param wind    wind velocity (m/s, world x/z)
   * @param house   the wheelhouse: its boat's world matrix and box in boat axes (or null)
   */
  update(rain: number, time: number, center: THREE.Vector3, wind: { x: number; z: number }, house: { matrixWorld: THREE.Matrix4; min: THREE.Vector3; max: THREE.Vector3 } | null, light: number): void {
    const cap = this.quality === 'off' ? 0 : this.quality === 'low' ? CONFIG.rain.lowCount : this.max;
    const n = Math.round(cap * Math.min(1, rain * 1.2));
    this.mesh.visible = n > 0;
    if (!this.mesh.visible) return;
    this.mesh.geometry.setDrawRange(0, n * 2);
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uCenter.value.copy(center);
    // Lean with the wind, but only half of it: flat streaks don't read as rain.
    u.uWind.value.set(wind.x * 0.5, wind.z * 0.5);
    // Streaks catch the daylight; dimmer at night.
    u.uOpacity.value = CONFIG.rain.opacity * (0.35 + 0.65 * light);
    if (house) {
      u.uHouseInv.value.copy(house.matrixWorld).invert();
      u.uHouseMin.value.copy(house.min);
      u.uHouseMax.value.copy(house.max);
    } else {
      u.uHouseMin.value.set(1, 1, 1);
      u.uHouseMax.value.set(-1, -1, -1);
    }
  }
}
