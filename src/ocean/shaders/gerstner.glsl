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
    vec4 sz = uShelter[j];
    float k = mix(uShelterK[j], 1.0, smoothstep(sz.z, sz.w, distance(p0, sz.xy)));
    shelter = min(shelter, k);
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
    float fade = (1.0 - smoothstep(b.z * 0.6, b.z, dist)) * shelter;
    float theta = a.z * dot(a.xy, p0) - b.y;
    disp.y += a.w * sin(theta) * fade;
    disp.xz += a.xy * (b.x * cos(theta) * fade);
  }
  return disp;
}
