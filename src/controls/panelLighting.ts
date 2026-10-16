import * as THREE from 'three';
import { CONFIG } from '../config';

/**
 * Panel lighting for the self-lit displays and labels in the wheelhouse (owner request:
 * the instruments were too bright at night, and a red night mode to keep your eyes dark
 * adapted for looking out):
 *   - dimming: as it gets dark, everything registered here dims toward
 *     `panelLighting.nightLevel` of its daytime brightness (follows the daylight, like an
 *     auto-dimming backlight);
 *   - red: as night falls it all turns to shades of red by itself (its brightness kept,
 *     its colour dropped), dimmer still (`redLevel`). Automatic (owner: no switch needed).
 * One shared pair of uniforms drives every registered material (a few lines added to the
 * basic material's shader), so nothing is redrawn or re-uploaded per frame: the canvas
 * screens keep drawing in their daytime colours.
 */
const uniforms = { uPanelLevel: { value: 1 }, uPanelRed: { value: 0 } };

/** Put a self-lit (basic) material on the panel lighting. Returns it. */
export function panelLit<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPanelLevel = uniforms.uPanelLevel;
    shader.uniforms.uPanelRed = uniforms.uPanelRed;
    shader.fragmentShader = 'uniform float uPanelLevel;\nuniform float uPanelRed;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum * 1.4, lum * 0.1, lum * 0.06), uPanelRed) * uPanelLevel;
      }`,
    );
  };
  m.customProgramCacheKey = () => 'panelLit';
  return m;
}

/**
 * Once a frame.
 * @param darkness 0 (day) .. 1 (night)
 */
export function updatePanelLighting(darkness: number): void {
  const c = CONFIG.panelLighting;
  const r = uniforms.uPanelRed;
  r.value = THREE.MathUtils.smoothstep(darkness, c.redFrom, c.redTo);
  const dim = 1 - (1 - c.nightLevel) * Math.min(1, Math.max(0, darkness));
  uniforms.uPanelLevel.value = dim * (1 - (1 - c.redLevel) * r.value);
}
