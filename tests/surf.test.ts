/**
 * The coast extras plan, C5: surf on the shore, heard with the engine off when the waves are
 * big enough (world/surf.ts). On a stretch of the hand-built islands' shore facing open water:
 * nothing in a calm; louder nearer and in bigger seas; heard from the shore's side; quieter
 * with the waves running off the shore than onto it; rock booms where sand washes.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { prepareWaves, type WaveComponent } from '../src/ocean/waves';
import { BLOCKS } from '../src/world/archipelago';
import { clearShores, registerShore, type ShoreLayout } from '../src/world/coastShore';
import { SurfListener, surfAt } from '../src/world/surf';
import { groundHeight } from '../src/world/terrain';

/** A shore facing open water: a point on land and the bearing out to sea (rad; x east, z south). */
function aShore(): { x: number; z: number; out: number } {
  for (let x = -6000; x <= 6000; x += 250)
    for (let z = -6000; z <= 6000; z += 250) {
      if (groundHeight(x, z) < 1 || BLOCKS.some((b) => Math.hypot(b.x - x, b.z - z) < 800)) continue;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const at = (d: number) => groundHeight(x + Math.sin(a) * d, z - Math.cos(a) * d);
        // Land falling to the sea within 60 m, then open deep water out to 900 m.
        let edge = -1;
        for (let d = 5; d <= 60; d += 5) if (at(d) < -3) {
          edge = d;
          break;
        }
        if (edge < 0) continue;
        let open = true;
        for (let d = edge; d <= edge + 900 && open; d += 20) open = at(d) < -5;
        // ... and no other land within reach of the listening spots, either side.
        for (let d = edge + 40; d <= edge + 700 && open; d += 60)
          for (let s = -500; s <= 500 && open; s += 100) open = groundHeight(x + Math.sin(a) * d + Math.cos(a) * s, z - Math.cos(a) * d + Math.sin(a) * s) < -3 || Math.abs(s) < 1;
        if (open) return { x: x + Math.sin(a) * edge, z: z - Math.cos(a) * edge, out: a };
      }
    }
  throw new Error('no open shore');
}

/** One swell of significant height `hs` running toward bearing `toward` (rad). */
function swell(hs: number, toward: number): WaveComponent[] {
  // (Hs = 4σ, σ² = A²/2 for one sinusoid: A = Hs / (2√2).) The direction: whichever of the
  // sea's angles runs most nearly that way.
  const amplitude = hs / (2 * Math.SQRT2);
  let best: WaveComponent[] = [];
  let dot = -2;
  for (let deg = 0; deg < 360; deg += 5) {
    const c = [{ amplitude, period: 8, directionDeg: deg, steepness: 0.3, phase: 0 }];
    const p = prepareWaves(c, 0)[0];
    const d = p.dirX * Math.sin(toward) + p.dirZ * -Math.cos(toward);
    if (d > dot) {
      dot = d;
      best = c;
    }
  }
  return best;
}

const shore = aShore();
const at = (d: number) => ({ x: shore.x + Math.sin(shore.out) * d, z: shore.z - Math.cos(shore.out) * d });
const onshore = shore.out + Math.PI;
const hear = (d: number, sea: WaveComponent[]) => {
  const p = at(d);
  return surfAt(p.x, p.z, sea, prepareWaves(sea, 0));
};

afterEach(() => clearShores());

describe('surf on the shore (C5)', () => {
  it('nothing in a calm or a slight sea', () => {
    expect(hear(60, swell(CONFIG.surf.minHs * 0.8, onshore)).level).toBe(0);
    expect(hear(60, []).level).toBe(0);
  });

  it('heard off the shore in a swell, louder nearer and louder in a bigger sea; nothing far out', () => {
    const sea = swell(1.5, onshore);
    const near = hear(60, sea);
    const off = hear(300, sea);
    expect(near.level).toBeGreaterThan(0.3);
    expect(off.level).toBeGreaterThan(0);
    expect(off.level).toBeLessThan(near.level);
    expect(hear(60, swell(0.8, onshore)).level).toBeLessThan(near.level);
    expect(hear(CONFIG.surf.hearRange + 200, sea).level).toBe(0);
    expect(near.period).toBe(8);
  });

  it('heard from the shore’s side', () => {
    const s = hear(150, swell(1.5, onshore));
    const p = at(150);
    // From the listener, the surf lies back toward the land.
    const toward = (s.x - p.x) * -Math.sin(shore.out) + (s.z - p.z) * Math.cos(shore.out);
    expect(toward).toBeGreaterThan(50);
  });

  it('quieter with the waves running off the shore than onto it', () => {
    expect(hear(80, swell(1.5, shore.out)).level).toBeLessThan(hear(80, swell(1.5, onshore)).level * 0.6);
  });

  it('rock booms where sand washes (the shore map)', () => {
    const everywhere = (value: number) => {
      const layout: ShoreLayout = { file: '', cell: 50, x0: -20000, z0: -20000, width: 800, height: 800, kinds: ['none', 'sand', 'shingle', 'rock', 'cliff'] };
      const packed: number[] = [];
      for (let left = layout.width * layout.height; left > 0; left -= 255) packed.push(Math.min(255, left), value);
      registerShore('test', Uint8Array.from(packed).buffer, layout, 0, 0);
    };
    const sea = swell(1.5, onshore);
    everywhere(3);
    const rock = hear(60, sea);
    everywhere(1);
    const sand = hear(60, sea);
    everywhere(2);
    const shingle = hear(60, sea);
    expect(rock.boom).toBeGreaterThan(sand.boom * 2);
    expect(sand.wash).toBeGreaterThan(rock.wash);
    expect(shingle.hiss).toBeGreaterThan(sand.hiss * 2);
  });

  it('spread over frames (the game’s), a whole look round comes to the same', () => {
    const sea = swell(1.5, onshore);
    const p = at(100);
    const l = new SurfListener();
    for (let t = 0; t < CONFIG.surf.every + 0.05; t += 1 / 72) l.step(p.x, p.z, sea, prepareWaves(sea, 0), 1 / 72);
    const all = surfAt(p.x, p.z, sea, prepareWaves(sea, 0));
    expect(l.here.level).toBeCloseTo(all.level, 6);
    expect(l.here.x).toBeCloseTo(all.x, 3);
  });
});
