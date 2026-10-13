// Gerstner wave sum - must match prepareWaves()/displacedPosition() in ../waves.ts.
//   theta_i = k_i * dot(D_i, p0) - phase_i      (phase_i = omega_i*t - phi_i, wrapped on CPU)
//   P = p0 + sum( Q_i*A_i * D_i * cos(theta_i) ),  y = sum( A_i * sin(theta_i) )
// Each wave is faded out (visually only) beyond the distance where the grid becomes too
// coarse to represent it, to avoid aliasing shimmer near the horizon.

uniform vec4 uWaveA[MAX_WAVES]; // dirX, dirZ, k, amplitude
uniform vec4 uWaveB[MAX_WAVES]; // horizontal (Q*A), phase, fadeEnd (m), unused
uniform int uWaveCount;
uniform vec2 uCenter;           // viewer position (xz) used for distance fading
// Sheltered water (harbours, bays) - must match shelterFactor() in world/shelter.ts.
uniform vec4 uShelter[MAX_SHELTERS];      // x, z, rIn, rOut
uniform float uShelterK[MAX_SHELTERS];    // amplitude factor at full shelter
uniform int uShelterCount;

varying vec3 vWorldPos;
varying float vHeight;

void main() {
  vec4 world0 = modelMatrix * vec4(position, 1.0);
  vec2 p0 = world0.xz;
  float dist = distance(p0, uCenter);

  float shelter = 1.0;
  for (int j = 0; j < MAX_SHELTERS; j++) {
    if (j >= uShelterCount) break;
    vec4 sz = uShelter[j];
    float k = mix(uShelterK[j], 1.0, smoothstep(sz.z, sz.w, distance(p0, sz.xy)));
    shelter = min(shelter, k);
  }

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

  vec3 wp = vec3(p0.x + disp.x, world0.y + disp.y, p0.y + disp.z);
  vWorldPos = wp;
  vHeight = disp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
