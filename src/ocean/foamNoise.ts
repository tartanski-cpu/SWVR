import * as THREE from 'three';

/** Tileable blotchy noise (value noise, a few octaves) for the foam pattern. */
export function foamNoiseTexture(): THREE.Texture {
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const lattice = (s: number) => {
    const g = new Float32Array(s * s);
    for (let i = 0; i < g.length; i++) g[i] = Math.random();
    return (x: number, y: number) => {
      const xi = Math.floor(x) % s;
      const yi = Math.floor(y) % s;
      const fx = x - Math.floor(x);
      const fy = y - Math.floor(y);
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const at = (i: number, j: number) => g[((j + s) % s) * s + ((i + s) % s)];
      const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
      const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
      return a + (b - a) * sy;
    };
  };
  const octaves = [lattice(8), lattice(16), lattice(32)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = 0.55 * octaves[0]((x / N) * 8, (y / N) * 8) + 0.3 * octaves[1]((x / N) * 16, (y / N) * 16) + 0.15 * octaves[2]((x / N) * 32, (y / N) * 32);
      const b = Math.round(v * 255);
      data.set([b, b, b, 255], (y * N + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
