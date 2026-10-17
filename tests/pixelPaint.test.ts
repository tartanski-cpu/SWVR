import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { mergeParts, part } from '../src/render/geometryUtils';
import { PAINTS, TILE, paintIndex, paintPixels } from '../src/render/pixelPaint';

describe('pixel painting', () => {
  it('each tile is mid-grey on average (it adds detail, not a darker or lighter colour), and the same every time', () => {
    const px = paintPixels();
    PAINTS.forEach((name, k) => {
      const base = (k + 1) * TILE * TILE * 4;
      let sum = 0;
      for (let i = 0; i < TILE * TILE; i++) sum += px[base + i * 4];
      expect(sum / (TILE * TILE) / 255, name).toBeGreaterThan(0.44);
      expect(sum / (TILE * TILE) / 255, name).toBeLessThan(0.56);
    });
    expect(paintPixels()).toEqual(px);
  });

  it('a painted part carries its tile, and where on it each face falls, in metres along the face', () => {
    const plain = part(new THREE.BoxGeometry(1, 1, 1), 0xffffff);
    const deck = part(new THREE.BoxGeometry(3, 0.1, 2).translate(0, 1, 0), 0xffffff, 'nonSlip');
    const g = mergeParts([plain, deck]);
    const paint = g.attributes.paint;
    const uv = g.attributes.paintUv;
    const n = plain.attributes.position.count;
    expect(paint.getX(0)).toBe(0);
    expect(paint.getX(n)).toBe(paintIndex('nonSlip'));
    // The deck's top face (facing up) is mapped across (x) and along (z): it spans 3 x 2 m.
    const us: number[] = [];
    const vs: number[] = [];
    for (let i = n; i < g.attributes.position.count; i++) {
      if (Math.abs(g.attributes.normal.getY(i) - 1) > 1e-6) continue;
      us.push(uv.getX(i));
      vs.push(uv.getY(i));
    }
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(3);
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(2);
  });
});
