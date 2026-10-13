// The ocean grid: each vertex is a water particle at its rest position, displaced by the
// shared Gerstner sum (gerstner.glsl, prepended by OceanView).

varying vec3 vWorldPos;
varying float vHeight;

void main() {
  vec4 world0 = modelMatrix * vec4(position, 1.0);
  vec2 p0 = world0.xz;
  vec3 disp = gerstnerDisplacement(p0);
  vec3 wp = vec3(p0.x + disp.x, world0.y + disp.y, p0.y + disp.z);
  vWorldPos = wp;
  vHeight = disp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
