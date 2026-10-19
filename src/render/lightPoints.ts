import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Small lights seen as points (ships' navigation lights, buoys, harbour lamps; owner: the
 * AI ships' square lights looked too big far off). THREE.PointsMaterial draws a point either
 * at a fixed pixel size (so a light a mile off is as big as one alongside) or scaled by
 * 1/distance like a real object (so it vanishes to nothing at a few hundred metres). A
 * light is in between: a bright point that shrinks with distance but never below a couple
 * of pixels, so it still reads far off. This material does that, as a soft round glow:
 *
 *   pixels = clamp(size x ref / distance, min, max)
 *
 * `size` at `ref` metres (CONFIG.lightPoints). Each point's colour is its vertex colour.
 * Additive, no depth write, no fog: a light shows through haze as a point long after the
 * hull around it has faded.
 */
export class LightPointsMaterial extends THREE.ShaderMaterial {
  constructor(map: THREE.Texture, size = CONFIG.lightPoints.size) {
    const c = CONFIG.lightPoints;
    super({
      uniforms: {
        uMap: { value: map },
        uSize: { value: size },
        uRef: { value: c.ref },
        uMinMax: { value: new THREE.Vector2(c.min, c.max) },
        uOpacity: { value: 1 },
        uPixelRatio: { value: 1 },
      },
      vertexShader: /* glsl */ `
        uniform float uSize, uRef, uPixelRatio;
        uniform vec2 uMinMax;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float dist = max(1.0, length(mv.xyz));
          gl_PointSize = clamp(uSize * uRef / dist, uMinMax.x, uMinMax.y) * uPixelRatio;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform float uOpacity;
        varying vec3 vColor;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a;
          gl_FragColor = vec4(vColor * a * uOpacity, a * uOpacity);
          #include <colorspace_fragment>
        }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
    });
  }

  /** The size at the reference distance (px) and the opacity, as the dark comes. */
  set(size: number, opacity: number, pixelRatio = 1): void {
    this.uniforms.uSize.value = size;
    this.uniforms.uOpacity.value = opacity;
    this.uniforms.uPixelRatio.value = pixelRatio;
  }
}

/** A soft round glow for the points (white; the colour is the vertex's). */
export function glowSprite(): THREE.Texture {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const g = canvas.getContext('2d')!;
  const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(canvas);
}
