import { describe, expect, it } from 'vitest';
import { submergedSection, type SubmergedSection } from '../src/vessel/physics/sectionClip';

const out = (): SubmergedSection => ({ area: 0, cx: 0, cy: 0, maxDepth: 0 });
// 2 m x 2 m box section from y = -1 to +1.
const box: [number, number][] = [[-1, 1], [-1, -1], [1, -1], [1, 1]];
const depthsForLevel = (level: number) => box.map(([, y]) => level - y);

describe('submergedSection', () => {
  it('half-immersed box: area 2, centroid at y = -0.5', () => {
    const s = submergedSection(box, depthsForLevel(0), out());
    expect(s.area).toBeCloseTo(2, 9);
    expect(s.cx).toBeCloseTo(0, 9);
    expect(s.cy).toBeCloseTo(-0.5, 9);
    expect(s.maxDepth).toBeCloseTo(1, 9);
  });

  it('fully submerged and fully dry', () => {
    expect(submergedSection(box, depthsForLevel(5), out()).area).toBeCloseTo(4, 9);
    expect(submergedSection(box, depthsForLevel(-5), out()).area).toBe(0);
  });

  it('sloping waterline shifts the centroid to the deeper side', () => {
    // Water surface y = 0.5 * x : deeper on the starboard (+x) side.
    const depths = box.map(([x, y]) => 0.5 * x - y);
    const s = submergedSection(box, depths, out());
    expect(s.area).toBeCloseTo(2, 9); // line through the centre halves the square
    expect(s.cx).toBeGreaterThan(0);
  });
});
