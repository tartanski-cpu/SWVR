// Flat-shaded water: per-facet normals from screen-space derivatives (the low-poly look),
// Schlick Fresnel blend between the water body colour and the sky reflection, sun glint,
// faint crest highlight, and linear distance fog matching THREE.Fog.

uniform vec3 uDeep;
uniform vec3 uScatter;
uniform vec3 uFoam;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunIntensity;
uniform float uAmbient;
uniform float uSpecPower;
uniform float uReflection;
uniform float uCrestHeight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;

varying vec3 vWorldPos;
varying float vHeight;

void main() {
  // Facet normal. dFdx/dFdy span the triangle's plane; their cross product points at the viewer.
  vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  if (n.y < 0.0) n = -n;

  vec3 toEye = cameraPosition - vWorldPos;
  float dist = length(toEye);
  vec3 v = toEye / dist;
  float ndv = clamp(dot(n, v), 0.0, 1.0);

  // Water body: dark deep colour plus some light scattered through the upper water,
  // stronger towards crests.
  float sunUp = clamp(uSunDir.y * 3.0, 0.0, 1.0);
  float diffuse = max(dot(n, uSunDir), 0.0);
  float scatter = clamp(0.35 + vHeight * 0.9, 0.0, 1.0) * (0.25 + 0.75 * sunUp);
  vec3 body = uDeep * (0.45 * uAmbient + 0.35 * diffuse * uSunIntensity) + uScatter * scatter * 0.4 * uAmbient;

  // Sky reflection (same gradient as the sky dome).
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(r.y, 0.0, 1.0), 0.55));
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 col = mix(body, sky, fresnel * uReflection);

  // Sun glint (Blinn-Phong). With flat facets this sparkles facet by facet.
  vec3 h = normalize(uSunDir + v);
  float spec = pow(max(dot(n, h), 0.0), uSpecPower) * sunUp;
  col += uSunColor * spec * uSunIntensity * 0.8;

  // Faint whitening on the highest crests.
  col = mix(col, uFoam * (0.4 * uAmbient + 0.3 * uSunIntensity), smoothstep(uCrestHeight * 0.75, uCrestHeight, vHeight) * 0.35);

  float fogF = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, fogF);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
