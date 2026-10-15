import * as THREE from 'three';

/**
 * A small tiling ripple pattern for the water's surface detail, made once at start-up
 * (no image to download): the slope (dh/dx, dh/dz) of a height field that is a sum of
 * sine ripples, stored in red and green (0.5 = flat).
 *
 * Every ripple has a whole number of cycles across the tile, so the pattern tiles without
 * seams. Amplitudes fall off with wavenumber like a wind-ripple spectrum; directions are
 * spread around one way so it reads as cat's paws from a breeze rather than noise.
 * Deterministic (fixed seed): every player sees the same water.
 */
export function createRippleTexture(size = 256, count = 28, seed = 7): THREE.DataTexture {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const waves: { kx: number; kz: number; amp: number; phase: number }[] = [];
  while (waves.length < count) {
    // Wavenumber 3..18 cycles per tile, mostly within ±70° of the "wind" (+x).
    const k = 3 + rand() * 15;
    const dir = (rand() - 0.5) * 2.4;
    const kx = Math.round(Math.cos(dir) * k);
    const kz = Math.round(Math.sin(dir) * k);
    if (kx === 0 && kz === 0) continue;
    waves.push({ kx, kz, amp: Math.pow(Math.hypot(kx, kz), -1.6), phase: rand() * Math.PI * 2 });
  }
  // Slope of h = Σ A sin(2π (kx x + kz z)/N + φ): dh/dx = Σ A (2π kx/N) cos(...).
  const gx = new Float32Array(size * size);
  const gz = new Float32Array(size * size);
  let maxG = 0;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let dx = 0;
      let dz = 0;
      for (const w of waves) {
        const c = Math.cos((2 * Math.PI * (w.kx * i + w.kz * j)) / size + w.phase);
        dx += w.amp * w.kx * c;
        dz += w.amp * w.kz * c;
      }
      gx[j * size + i] = dx;
      gz[j * size + i] = dz;
      maxG = Math.max(maxG, Math.abs(dx), Math.abs(dz));
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let p = 0; p < size * size; p++) {
    data[p * 4] = Math.round(127.5 + (gx[p] / maxG) * 127.5);
    data[p * 4 + 1] = Math.round(127.5 + (gz[p] / maxG) * 127.5);
    data[p * 4 + 2] = 128;
    data[p * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
