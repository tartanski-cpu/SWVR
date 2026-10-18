// Gerstner wave displacement, shared by every shader that must sit on the water (the
// ocean itself, the wake foam). Must match displacedPosition() in ../waves.ts.
//   theta_i = k_i * dot(D_i, p0) - phase_i      (phase_i = omega_i*t - phi_i, wrapped on CPU)
//   P = p0 + s(p0) * sum( Q_i*A_i * D_i * cos(theta_i) ),  y = s(p0) * sum( A_i * sin(theta_i) )
// with p0 the REST position on the mean surface and s the shelter factor (harbours, bays;
// world/shelter.ts). Each wave is faded out (visually only) beyond the distance where the
// ocean grid becomes too coarse to represent it, to avoid aliasing shimmer at the horizon.

uniform vec4 uWaveA[MAX_WAVES]; // dirX, dirZ, k, amplitude
uniform vec4 uWaveB[MAX_WAVES]; // horizontal (Q*A), phase, fadeEnd (m), unused
uniform int uWaveCount;
uniform vec2 uCenter;           // viewer position (xz) used for distance fading
uniform vec4 uShelter[MAX_SHELTERS];      // x, z, rIn, rOut
uniform float uShelterK[MAX_SHELTERS];    // amplitude factor at full shelter
uniform int uShelterCount;
// A bay with a gap (ShelterDef.openArcDeg): the bearing it is open from and the half-arc, in
// radians (arc 0: no gap, in shelterAt; else in arcShelterAt, per wave by its direction).
uniform vec2 uShelterArc[MAX_SHELTERS];
// Tidal races (world/currents.ts): the waves stand up inside a running one. Each zone is an
// oriented rectangle: uRace = x, z, halfLength, halfWidth; uRaceB = set.x, set.z,
// strength now (-1..1, the clock), waveFactor at peak; uRaceFade the edge fade (m).
uniform vec4 uRace[MAX_RACES];
uniform vec4 uRaceB[MAX_RACES];
uniform int uRaceCount;
uniform float uRaceFade;

/** How much of race j the rest position p0 is in, 0..1 (currents.ts zoneWeight). */
float raceWeight(int j, vec2 p0) {
  vec4 r = uRace[j];
  vec2 s = uRaceB[j].xy;
  vec2 d = p0 - r.xy;
  float along = dot(d, s);
  float across = -d.x * s.y + d.y * s.x;
  float m = min(r.z - abs(along), r.w - abs(across));
  if (m <= 0.0) return 0.0;
  float t = min(1.0, m / uRaceFade);
  return t * t * (3.0 - 2.0 * t);
}

/** The races' amplitude factor at p0 (>= 1), and (out) the strongest running race's signed strength there. */
float raceAt(vec2 p0, out float running) {
  float f = 1.0;
  running = 0.0;
  for (int j = 0; j < MAX_RACES; j++) {
    if (j >= uRaceCount) break;
    float w = raceWeight(j, p0);
    if (w <= 0.0) continue;
    float st = uRaceB[j].z;
    f = max(f, 1.0 + (uRaceB[j].w - 1.0) * abs(st) * w);
    if (abs(st * w) > abs(running)) running = st * w;
  }
  return f;
}

float shelterAt(vec2 p0) {
  float shelter = 1.0;
  for (int j = 0; j < MAX_SHELTERS; j++) {
    if (j >= uShelterCount) break;
    if (uShelterArc[j].y > 0.0) continue;
    vec4 sz = uShelter[j];
    float k = mix(uShelterK[j], 1.0, smoothstep(sz.z, sz.w, distance(p0, sz.xy)));
    shelter = min(shelter, k);
  }
  return shelter;
}

/** The gapped bays' shelter at p0 for a wave travelling along dir (world/shelter.ts arcShelter). */
float arcShelterAt(vec2 p0, vec2 dir) {
  float shelter = 1.0;
  for (int j = 0; j < MAX_SHELTERS; j++) {
    if (j >= uShelterCount) break;
    float arc = uShelterArc[j].y;
    if (arc <= 0.0) continue;
    vec4 sz = uShelter[j];
    float d = distance(p0, sz.xy);
    if (d >= sz.w) continue;
    // The sea comes FROM the bearing opposite its travel (0 north = -z, clockwise).
    float from = atan(-dir.x, dir.y);
    float diff = abs(mod(from - uShelterArc[j].x + 3.14159265, 6.2831853) - 3.14159265);
    float edge = 0.2618; // 15 degrees
    float open = clamp((arc + edge - diff) / (2.0 * edge), 0.0, 1.0);
    float k = mix(uShelterK[j], 1.0, smoothstep(sz.z, sz.w, d));
    shelter = min(shelter, k + (1.0 - k) * open);
  }
  return shelter;
}

/** Displacement (x, y, z) of the water particle whose rest position is p0. */
vec3 gerstnerDisplacement(vec2 p0) {
  float dist = distance(p0, uCenter);
  float running;
  float shelter = shelterAt(p0) * raceAt(p0, running);
  vec3 disp = vec3(0.0);
  for (int i = 0; i < MAX_WAVES; i++) {
    if (i >= uWaveCount) break;
    vec4 a = uWaveA[i];
    vec4 b = uWaveB[i];
    float fade = (1.0 - smoothstep(b.z * 0.6, b.z, dist)) * shelter * arcShelterAt(p0, a.xy);
    float theta = a.z * dot(a.xy, p0) - b.y;
    disp.y += a.w * sin(theta) * fade;
    disp.xz += a.xy * (b.x * cos(theta) * fade);
  }
  return disp;
}
