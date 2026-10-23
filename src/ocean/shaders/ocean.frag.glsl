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
// Your hand torch (player/handGear.ts): its own pool, so it lights the water whatever the
// searchlight is doing. Closer and narrower; it falls off faster.
uniform vec3 uTorchPos;
uniform vec3 uTorchDir;
uniform vec2 uTorchCos;
uniform vec3 uTorchColor;       // 0 when off
// Tidal races: the whirl points (x, z, radius, strength 0..1) for the whirl patches.
uniform vec4 uKnock[MAX_KNOCKS];
uniform int uKnockCount;
uniform vec4 uGust;             // a katabatic gust: x, z, radius, strength (0: none)
uniform vec2 uGustDir;          // the way it blows (world x, z)
uniform vec2 uGustLook;         // how much darker, how much spray (CONFIG.gusts.look)
uniform float uTime;
varying float vRace;
varying float vExpo;
varying float vShort;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform sampler2D uRipple;      // tiling ripple slopes (rg, 0.5 = flat), see rippleTexture.ts
uniform vec4 uRippleUv[2];      // per layer: uv drift offset (xy), 1/scale (z)
uniform float uRippleStrength;
uniform vec2 uRippleFade;       // near, far (m)

// The wind's foam (CONFIG.ocean.windFoam; OceanView.update): the direction it blows toward
// (xy), white horses 0..1 (z), streaks 0..1 (w); the streaks' scale (1 / (8 length), 1 / (8
// spacing): the noise has 8 blobs a tile) and their drift downwind (m, z); the noise.
uniform vec4 uWindFoam;
uniform vec3 uStreak;
uniform sampler2D uFoamNoise;
// Breaking waves on beaches (CONFIG.shore; OceanView.bakeShallows): the water's depth round
// the viewer as a map (red: depth / maxDepth), its rectangle (x0, z0, 1/w, 1/h), and the
// rule's numbers: maxDepth (m), the wash depth (m).
uniform sampler2D uShallows;
uniform vec4 uShallowsRect;
uniform vec2 uShore;

varying vec3 vWorldPos;
varying float vHeight;
varying vec2 vRest;
varying float vShelter;

void main() {
  // Facet normal. dFdx/dFdy span the triangle's plane; their cross product points at the viewer.
  vec3 n = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  if (n.y < 0.0) n = -n;
  // How steep the water is here (the facet, before the ripples): white horses break on steep faces.
  float facetSlope = 1.0 - n.y;

  vec3 toEye = cameraPosition - vWorldPos;
  float dist = length(toEye);

  // Wind ripples: two drifting layers of the ripple slopes tilt the facet normal, so even a
  // flat calm catches the sky and the sun. Faded out with distance (they'd only sparkle).
  float rippleFade = 1.0 - smoothstep(uRippleFade.x, uRippleFade.y, dist);
  if (rippleFade > 0.0) {
    vec2 s1 = texture2D(uRipple, vWorldPos.xz * uRippleUv[0].z + uRippleUv[0].xy).rg * 2.0 - 1.0;
    vec2 s2 = texture2D(uRipple, vWorldPos.xz * uRippleUv[1].z + uRippleUv[1].xy).rg * 2.0 - 1.0;
    vec2 slope = (s1 + 0.7 * s2) * uRippleStrength * rippleFade;
    n = normalize(n - vec3(slope.x, 0.0, slope.y));
  }
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
  // The sea here: the open sea's crests as exposed as the water is, and the short sea's own
  // (ocean/windSea.ts), which breaks sooner for its height: a short sea is a steep one.
  float crestH = max(0.02, uCrestHeight * vExpo + 0.75 * vShort);
  float foamAmt = max(uFoamAmount * vExpo, clamp((vShort - 0.2) / 0.35, 0.0, 1.0));
  float crestLo = crestH * mix(0.75, 0.45, foamAmt);
  float foam = smoothstep(crestLo, crestH * mix(1.0, 0.8, foamAmt), vHeight) * mix(0.35, 0.85, foamAmt);
  col = mix(col, uFoam * (0.4 * uAmbient + 0.3 * uSunIntensity), foam);

  // Breaking waves on beaches. A wave breaks where its height reaches about 0.78 of the
  // depth (the surf rule of thumb): the crest over that goes white, out to a depth that
  // grows with the sea (a calm breaks only in the last centimetres, a storm out to 2 m), and
  // the last of the water runs out on the sand as a line of wash. The foam is broken up by
  // the noise so it comes and goes along the beach.
  vec2 suv = (vWorldPos.xz - uShallowsRect.xy) * uShallowsRect.zw;
  if (all(greaterThan(suv, vec2(0.0))) && all(lessThan(suv, vec2(1.0)))) {
    float depth = texture2D(uShallows, suv).r * uShore.x;
    if (depth > 0.01) {
      // The sea's height here (the crest over the trough, with the shelter the vertex gave it).
      float seaH = max(0.12, uCrestHeight * 1.3 * vShelter);
      float breakDepth = seaH / 0.78;
      // Surf: the crests over the breaking depth go white, more the shallower; the foam
      // rolls shoreward with the noise, and the white water left behind fades over the
      // breaking depth.
      float sn = texture2D(uFoamNoise, vRest * 0.045 + vec2(0.0, uTime * 0.02)).r;
      float sn2 = texture2D(uFoamNoise, vRest * 0.11 + vec2(uTime * 0.01, -uTime * 0.03)).r;
      float onCrest = smoothstep(-0.3 * seaH, 0.6 * seaH, vHeight);
      float shallow = 1.0 - smoothstep(breakDepth * 0.8, breakDepth * 2.2, depth);
      float surf = shallow * max(onCrest * smoothstep(0.3, 0.55, sn), 0.55 * smoothstep(0.45, 0.7, sn2));
      // The wash: the last of the water running out over the sand.
      float wash = (1.0 - smoothstep(0.0, uShore.y, depth)) * (0.6 + 0.4 * smoothstep(0.3, 0.6, sn2));
      float f = max(surf, wash) * (1.0 - smoothstep(uShore.x * 0.7, uShore.x, depth));
      col = mix(col, uFoam * (0.5 * uAmbient + 0.3 * uSunIntensity), f * 0.9);
    }
  }

  // The wind's foam (uniform branch: skipped in light airs). White horses: patches of foam
  // on the upper half of the waves. Streaks: foam blown into long lines along the wind, the
  // contour lines of a noise stretched out downwind (thin where it crosses its middle
  // value), in patches. Both on the water's rest position, faded in sheltered water and far off.
  if (uWindFoam.z + uWindFoam.w > 0.0) {
    float open = smoothstep(0.25, 0.9, vShelter) * (1.0 - smoothstep(250.0, 900.0, dist));
    vec2 down = uWindFoam.xy;
    float along = dot(vRest, down) - uStreak.z;
    float across = dot(vRest, vec2(-down.y, down.x));
    // A line a set width on the water (owner: thin and faint, not bands): how far this
    // point is from the noise's middle-value contour, in metres (the noise's change per
    // metre from its screen derivatives), 0.15 m either side. Far off it thins away to nothing.
    float sn = texture2D(uFoamNoise, vec2(across * uStreak.y, along * uStreak.x)).r;
    float perMetre = fwidth(sn) / max(1e-4, length(fwidth(vRest)));
    float fromLine = abs(sn - 0.5) / max(1e-4, perMetre);
    // In patches, and broken along their length (not ruled lines).
    float patchy = smoothstep(0.35, 0.65, texture2D(uFoamNoise, vRest * 0.006 + 0.37).r)
      * smoothstep(0.42, 0.62, texture2D(uFoamNoise, vec2(across * uStreak.y * 3.0, along * uStreak.x * 6.0) + 0.61).r);
    float streak = (1.0 - smoothstep(0.08, 0.2, fromLine)) * patchy * uWindFoam.w;
    // White horses: small bright patches (a metre or two) where the water is steep, breaking
    // and fading again: two fields of patches sliding past each other with the drift (one
    // downwind, one across), foam only where both are high, so each one comes and goes in a
    // few seconds. (Not by height: a gale's long swell lifts whole stretches of sea at once.)
    float drift = uStreak.z;
    float capA = texture2D(uFoamNoise, vRest * 0.11 + down * drift * 0.03 + vec2(0.13, 0.71)).r;
    float capB = texture2D(uFoamNoise, vRest * 0.08 + vec2(-down.y, down.x) * drift * 0.025 + vec2(0.52, 0.27)).r;
    float steep = smoothstep(0.002, 0.03, facetSlope);
    // More of them as the wind rises, each as white (a light wind's few are no paler).
    float capAt = mix(0.52, 0.37, uWindFoam.z);
    float caps = smoothstep(capAt, capAt + 0.07, capA * capB) * mix(0.35, 1.0, steep) * min(1.0, uWindFoam.z * 4.0);
    float wf = max(streak * 0.22, caps * 0.85) * open;
    col = mix(col, uFoam * (0.4 * uAmbient + 0.3 * uSunIntensity), wf);
  }

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
  if (dot(uTorchColor, uTorchColor) > 0.0) {
    vec3 toT = uTorchPos - vWorldPos;
    float dt = length(toT);
    vec3 tdir = toT / max(dt, 0.001);
    float tcone = smoothstep(uTorchCos.x, uTorchCos.y, dot(-tdir, uTorchDir));
    float tatten = tcone / (1.0 + (dt / 18.0) * (dt / 18.0));
    float tglint = pow(max(dot(n, normalize(tdir + v)), 0.0), 50.0);
    col += uTorchColor * tatten * (0.6 * max(dot(n, tdir), 0.0) + tglint * 1.5);
  }

  // A running tidal race: broken water. Foam streaks drawn out along the set (the same
  // noise trick as the wind's streaks, on the water's rest position so they ride with it),
  // denser the stronger it runs, and whirl patches round the knock points: a dark eye with a
  // ring of foam turning round it. All within the zone (vRace), nothing outside.
  if (abs(vRace) > 0.02) {
    float st = abs(vRace);
    float near = 1.0 - smoothstep(300.0, 900.0, dist);
    float sn = texture2D(uFoamNoise, vec2(vRest.x * 0.08, vRest.y * 0.012 - uTime * 0.05 * sign(vRace))).r;
    float broken = smoothstep(0.62, 0.8, sn) * st;
    float sn2 = texture2D(uFoamNoise, vec2(vRest.x * 0.03 + 0.3, vRest.y * 0.004 - uTime * 0.03 * sign(vRace))).r;
    broken = max(broken, smoothstep(0.66, 0.84, sn2) * st * 0.7);
    float whirl = 0.0;
    float eye = 0.0;
    for (int k = 0; k < MAX_KNOCKS; k++) {
      if (k >= uKnockCount) break;
      vec4 kp = uKnock[k];
      vec2 d = vRest - kp.xy;
      float r = length(d) / kp.z;
      if (r > 1.0) continue;
      float ang = atan(d.y, d.x) + uTime * 1.2 * kp.w + r * 6.0;
      float arm = texture2D(uFoamNoise, vec2(ang * 0.4, r * 1.5 - uTime * 0.2)).r;
      whirl = max(whirl, smoothstep(0.5, 0.7, arm) * (1.0 - r) * kp.w);
      eye = max(eye, (1.0 - smoothstep(0.0, 0.35, r)) * kp.w);
    }
    col *= 1.0 - 0.35 * eye;
    float wf = clamp(max(broken * 0.4, whirl * 0.8), 0.0, 1.0) * near;
    col = mix(col, uFoam * (0.4 * uAmbient + 0.3 * uSunIntensity), wf);
  }

  // A katabatic gust: the water under it goes dark and ruffled (cat's paws), streaked with
  // spray blown along the way it goes, strongest in the middle of its patch. Uniform branch:
  // nothing to do between gusts.
  if (uGust.w > 0.01) {
    vec2 gd = vWorldPos.xz - uGust.xy;
    float gr = length(gd) / uGust.z;
    if (gr < 1.0) {
      float gs = (1.0 - smoothstep(0.55, 1.0, gr)) * uGust.w;
      vec2 gacross = vec2(-uGustDir.y, uGustDir.x);
      float galong = dot(vWorldPos.xz, uGustDir);
      float gside = dot(vWorldPos.xz, gacross);
      // Spray streaks: long along the gust, narrow across it, racing downwind.
      float gn = texture2D(uFoamNoise, vec2(gside * 0.16, galong * 0.014 - uTime * 0.6)).r;
      float gspray = smoothstep(0.7, 0.88, gn) * gs * gs;
      col *= 1.0 - uGustLook.x * gs;
      col = mix(col, uFoam * (0.4 * uAmbient + 0.3 * uSunIntensity), gspray * uGustLook.y);
    }
  }

  float fogF = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, fogF);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
