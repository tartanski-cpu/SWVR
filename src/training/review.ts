/**
 * The review of a recorded run (docs/TRAINING.md section 6, milestone 2: the chart review):
 * what the reviewer reads at any moment of it, and how the chart is framed. Pure functions
 * on a Run (recording.ts); the picture is reviewPanel.ts's.
 */
import { CONFIG } from '../config';
import { BLOCKS } from '../world/archipelago';
import type { ChartView } from '../voyage/planChart';
import { KN } from './exercises';
import { sampleAt, sampleCount, sampleHeading, type Run, type RunEvent } from './recording';

/** m:ss */
export function clock(s: number): string {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Distance (m) from (x, z) to the nearest quay, pier or jetty face: how far off the quay she lies (her centre). */
export function offQuay(x: number, z: number): number {
  let best = Infinity;
  for (const b of BLOCKS) {
    if (b.farm) continue;
    const yaw = (b.yawDeg * Math.PI) / 180;
    const dx = x - b.x;
    const dz = z - b.z;
    // Block-local: across and along (world/berths.ts inBlock's frame).
    const lx = dx * Math.cos(yaw) + dz * Math.sin(yaw);
    const lz = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const ox = Math.max(0, Math.abs(lx) - b.halfWidth);
    const oz = Math.max(0, Math.abs(lz) - b.halfLength);
    best = Math.min(best, Math.hypot(ox, oz));
  }
  return best;
}

/** The numbers at `t` s into the run, as the review shows them. */
export function reviewNumbers(run: Run, t: number): [string, string][] {
  const r = sampleAt(run, t);
  const kn = Math.hypot(r.vx, r.vz) / KN;
  const lever = Math.abs(r.lever) < 0.03 ? 'neutral' : `${r.lever > 0 ? 'ahead' : 'astern'} ${Math.round(Math.abs(r.lever) * 100)} %`;
  const rudderDeg = (r.rudder * 180) / Math.PI;
  const rudder = Math.abs(rudderDeg) < 0.5 ? 'amidships' : `${Math.abs(rudderDeg).toFixed(0)}° ${rudderDeg > 0 ? 'starboard' : 'port'}`;
  const off = offQuay(r.x, r.z);
  return [
    ['Time', `${clock(t)} of ${clock(run.header.duration)}`],
    ['Speed', `${kn.toFixed(1)} kn`],
    ['Heading', `${String(Math.round(sampleHeading(r)) % 360).padStart(3, '0')}°`],
    ['Lever', lever],
    ['Rudder', rudder],
    ['Engine', r.engine === 2 ? `${Math.round(r.rpm)} rpm` : r.engine === 1 ? 'starting' : 'off'],
    ['Off the quay', Number.isFinite(off) ? `${off.toFixed(1)} m` : '-'],
    ['Lines', r.moor === 2 ? 'made fast' : r.moor === 1 ? 'a line ashore' : 'free'],
  ];
}

/** The last event at or before `t` (the radio's lines left out: they're long), or null. */
export function eventAt(run: Run, t: number): RunEvent | null {
  let found: RunEvent | null = null;
  for (const e of run.events) {
    if (e.t > t + 1e-6) break;
    if (e.kind !== 'radio') found = e;
  }
  return found;
}

/** The next event after `t` worth stopping at (not the radio), or null. */
export function nextEvent(run: Run, t: number): RunEvent | null {
  return run.events.find((e) => e.t > t + 0.05 && e.kind !== 'radio') ?? null;
}

/** The previous event before `t` worth stopping at, or null. */
export function prevEvent(run: Run, t: number): RunEvent | null {
  return [...run.events].reverse().find((e) => e.t < t - 0.05 && e.kind !== 'radio') ?? null;
}

/** A chart view framing the runs' tracks (their boxes together) on a W x H chart, with a margin; no closer than `minSpan` m across. */
export function frameRuns(runs: Run[], W: number, H: number, minSpan = 140): ChartView {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const run of runs) {
    const n = sampleCount(run);
    const w = run.header.fields.length;
    for (let i = 0; i < n; i++) {
      const x = run.samples[i * w + 1];
      const z = run.samples[i * w + 3];
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  }
  if (!Number.isFinite(x0)) return { cx: 0, cz: 0, span: 600 };
  const margin = 1.35;
  const span = Math.max(minSpan, (x1 - x0) * margin, (z1 - z0) * margin * (W / H));
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, span };
}

/** The track's colour at a speed: blue at rest, through green and yellow, red at CONFIG.training.review.fastKn and over. */
export function speedColour(kn: number): string {
  const k = Math.max(0, Math.min(1, kn / CONFIG.training.review.fastKn));
  // Hue 220 (blue) down to 0 (red).
  return `hsl(${Math.round(220 * (1 - k))}, 85%, ${k > 0.45 && k < 0.7 ? 42 : 48}%)`;
}
