import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EnvironmentState } from './environmentState';
import type { EnvironmentView } from './environmentView';
import { cloudSky } from './clouds';
import { windVector } from './weather';

/**
 * Gradient sky dome with a sun disc and glow, and the cloud layer. A large inside-out
 * sphere that follows the viewer, drawn first with no depth write so everything else draws
 * over it. Below the horizon it stays at the horizon colour, which is also the fog colour,
 * so the far edge of the ocean dissolves into the sky without a seam.
 *
 * Clouds (environment/clouds.ts says what to show): drawn in the same shader, so no extra
 * draw call. Each direction above the horizon is followed up to a flat cloud deck; a small
 * tiling noise picture, looked up twice at two sizes, gives the cloud shapes there, drifting
 * downwind. How much of it is cloud is the cover; the upwind side takes the coming weather's
 * cover and darkness, so a storm shows as a dark wall on the upwind horizon before it
 * arrives. Thick parts of rain cloud are darker underneath; lightning lights them up; they
 * thin into the haze at the horizon and into fog.
 */
const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform sampler2D uNoise;
  uniform vec2 uDrift;
  uniform vec2 uUpwind;
  uniform vec2 uUpwindRange;
  uniform vec4 uCloud; // cover, dark (now); cover, dark (ahead, upwind)
  uniform vec3 uCloudLit;
  uniform float uScale;
  uniform float uMinCover;
  uniform float uHorizonFade;
  uniform float uBaseDark;
  uniform float uFlash;
  uniform float uClear;
  varying vec3 vDir;

  void main() {
    vec3 dir = normalize(vDir);
    float up = max(dir.y, 0.0);
    // Horizon colour holds near the horizon then blends to zenith.
    vec3 sky = mix(uHorizon, uZenith, pow(up, 0.55));

    float cosAngle = dot(dir, uSunDir);
    float visible = smoothstep(-0.02, 0.01, uSunDir.y);       // sun below horizon: no disc
    float disc = smoothstep(0.99985, 0.99992, cosAngle);       // ~0.7 deg radius
    float glow = pow(max(cosAngle, 0.0), 180.0) * 0.6 + pow(max(cosAngle, 0.0), 12.0) * 0.12;
    vec3 sun = uSunColor * (disc * 3.0 + glow * min(uSunIntensity, 1.5)) * visible;

    // The cloud deck: where this direction meets it (in deck heights; the 0.12 keeps the
    // far deck at a finite distance), how far upwind that is, and the weather there.
    vec2 q = dir.xz / (up + 0.12);
    float ahead = smoothstep(uUpwindRange.x, uUpwindRange.y, dot(q, uUpwind));
    float cover = mix(uCloud.x, uCloud.z, ahead);
    float dark = mix(uCloud.y, uCloud.w, ahead);
    vec2 uv = q * uScale + uDrift;
    // The shapes, and finer detail breaking up their edges.
    float n = texture2D(uNoise, uv).r + (texture2D(uNoise, uv * 3.0 + vec2(0.31, 0.17)).r - 0.5) * 0.3;
    float edge = 1.0 - (uMinCover + cover * (1.0 - uMinCover));
    float a = smoothstep(edge - 0.06, edge + 0.12, n);
    // Under a heavy cover the gaps hold a thin veil (not holes into the greyed sky).
    float c2 = cover * cover;
    a = mix(a, 1.0, c2 * c2 * 0.75);
    float thick = smoothstep(edge, edge + 0.35, n);
    // Rain cloud is dark underneath, darkest where thickest.
    vec3 cloud = mix(uCloudLit, uHorizon * uBaseDark, clamp(dark * (0.7 + 0.3 * thick), 0.0, 1.0));
    cloud += vec3(0.85, 0.88, 1.0) * uFlash * (0.3 + 0.7 * thick);
    a *= smoothstep(0.0, uHorizonFade, dir.y) * uClear;
    // The sun shows through thin cloud, not thick.
    sky = mix(sky + sun, cloud + sun * (1.0 - thick) * 0.4, a);

    gl_FragColor = vec4(sky, 1.0);
    #include <colorspace_fragment>
  }
`;

/** A tiling noise picture: smooth value noise in four octaves (red channel), made once. */
function cloudNoise(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const lattice = (period: number, seed: number) => {
    const g = new Float32Array(period * period);
    for (let i = 0; i < g.length; i++) {
      const s = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453;
      g[i] = s - Math.floor(s);
    }
    return (x: number, y: number) => {
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const at = (i: number, j: number) => g[(((j % period) + period) % period) * period + (((i % period) + period) % period)];
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const octaves = [4, 8, 16, 32].map((period, k) => ({ period, f: lattice(period, k + 1), w: 0.5 ** k }));
  const values = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const o of octaves) v += o.f((x / size) * o.period, (y / size) * o.period) * o.w;
      values[y * size + x] = v;
    }
  }
  // Evened out (each value replaced by its rank): then a cover of 0.3 is cloud over 30 % of
  // the picture, and the shapes keep their soft edges.
  const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);
  order.forEach((k, rank) => {
    const c = Math.round((rank / (order.length - 1)) * 255);
    data[k * 4] = data[k * 4 + 1] = data[k * 4 + 2] = c;
    data[k * 4 + 3] = 255;
  });
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export class SkyView {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uSunIntensity: { value: 1 },
    uNoise: { value: cloudNoise(CONFIG.clouds.noiseSize) },
    uDrift: { value: new THREE.Vector2() },
    uUpwind: { value: new THREE.Vector2(0, -1) },
    uUpwindRange: { value: new THREE.Vector2(...CONFIG.clouds.upwind) },
    uCloud: { value: new THREE.Vector4() },
    uCloudLit: { value: new THREE.Color() },
    uScale: { value: CONFIG.clouds.scale },
    uMinCover: { value: CONFIG.clouds.minCover },
    uHorizonFade: { value: CONFIG.clouds.horizon },
    uBaseDark: { value: CONFIG.clouds.baseDark },
    uFlash: { value: 0 },
    uClear: { value: 1 },
  };
  private lastTime: number | null = null;
  private readonly wind = { x: 0, z: 0 };
  private readonly warm = new THREE.Color();

  constructor() {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.environment.skyRadius, 32, 16), material);
    this.mesh.name = 'sky';
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }

  /** `state`: the weather (for the clouds); `time`: world time (s), for their drift. */
  update(env: EnvironmentView, viewer: THREE.Vector3, state?: EnvironmentState, time = 0): void {
    this.mesh.position.copy(viewer);
    const u = this.uniforms;
    u.uZenith.value.copy(env.zenith);
    u.uHorizon.value.copy(env.horizon);
    u.uSunDir.value.copy(env.sunDir);
    u.uSunColor.value.copy(env.sunColor);
    u.uSunIntensity.value = env.sunIntensity;

    const c = CONFIG.clouds;
    const s = cloudSky(state?.weather, time);
    u.uCloud.value.set(s.cover, s.dark, s.coverAhead, s.darkAhead);
    // Lit cloud: whiter and brighter than the (weather-greyed) horizon, warmed by the sun.
    const h = env.horizon;
    const lum = Math.min(1, (0.3 * h.r + 0.59 * h.g + 0.11 * h.b) * 1.45);
    u.uCloudLit.value.setRGB(lum, lum, lum).lerp(h, 0.3).add(this.warm.copy(env.sunColor).multiplyScalar(0.12 * Math.min(1, env.sunIntensity)));
    u.uFlash.value = env.flash * c.flash;
    // Thinned into fog: none below ~300 m visibility, all above ~3 km.
    const vis = Math.max(1, env.visibility);
    u.uClear.value = Math.min(1, Math.max(0, (Math.log(vis) - Math.log(300)) / (Math.log(3000) - Math.log(300))));
    // Downwind drift, and the side the weather comes from.
    const w = state ? windVector(state, this.wind) : this.wind;
    const dt = this.lastTime === null ? 0 : Math.min(1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    u.uDrift.value.x -= w.x * dt * c.drift;
    u.uDrift.value.y -= w.z * dt * c.drift;
    // (The picture tiles every 1, and the finer look is at 3x: wrapping by 1 never shows.)
    u.uDrift.value.x %= 1;
    u.uDrift.value.y %= 1;
    const speed = Math.hypot(w.x, w.z);
    if (speed > 0.1) u.uUpwind.value.set(-w.x / speed, -w.z / speed);
  }
}
