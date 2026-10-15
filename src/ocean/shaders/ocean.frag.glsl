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
uniform float uFoamAmount;      // 0..1 whitecaps from the sea's steepness
// The one port floodlight (see world/view/worldView.ts PortLighting): glints on the water.
uniform vec3 uPortLightPos;
uniform vec3 uPortLightColor;   // colour x strength (0 when off)
uniform float uPortLightRange;
// The boat's searchlight: a bright pool where the beam meets the water.
uniform vec3 uSpotPos;
uniform vec3 uSpotDir;
uniform vec2 uSpotCos;          // cos(outer), cos(inner) half-angles
uniform vec3 uSpotColor;        // colour x strength (0 when off)
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

  // Whitening on the highest crests: faint in a moderate sea, breaking whitecaps in a steep one.
  float crestLo = uCrestHeight * mix(0.75, 0.45, uFoamAmount);
  float foam = smoothstep(crestLo, uCrestHeight * mix(1.0, 0.8, uFoamAmount), vHeight) * mix(0.35, 0.85, uFoamAmount);
  col = mix(col, uFoam * (0.4 * uAmbient + 0.3 * uSunIntensity), foam);

  // Port floodlight: a soft pool of light and a long glinting reflection on the facets.
  // Uniform branch (the same for every pixel): skipped entirely by day, which on a mobile
  // GPU saves this whole block across the half of the screen that is sea.
  if (dot(uPortLightColor, uPortLightColor) > 0.0) {
    vec3 toL = uPortLightPos - vWorldPos;
    float dl = length(toL);
    vec3 ldir = toL / max(dl, 0.001);
    float atten = 1.0 / (1.0 + (dl / 14.0) * (dl / 14.0)) * (1.0 - smoothstep(uPortLightRange * 0.6, uPortLightRange, dl));
    float glint = pow(max(dot(n, normalize(ldir + v)), 0.0), 70.0);
    col += uPortLightColor * atten * (glint * 2.5 + 0.12 * max(dot(n, ldir), 0.0));
  }

  // Searchlight pool and glints (uniform branch: skipped while it's off).
  if (dot(uSpotColor, uSpotColor) > 0.0) {
    vec3 toS = uSpotPos - vWorldPos;
    float ds = length(toS);
    vec3 sdir = toS / max(ds, 0.001);
    float cone = smoothstep(uSpotCos.x, uSpotCos.y, dot(-sdir, uSpotDir));
    float satten = cone / (1.0 + (ds / 45.0) * (ds / 45.0));
    float sglint = pow(max(dot(n, normalize(sdir + v)), 0.0), 50.0);
    col += uSpotColor * satten * (0.5 * max(dot(n, sdir), 0.0) + sglint * 1.5);
  }

  float fogF = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, fogF);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
