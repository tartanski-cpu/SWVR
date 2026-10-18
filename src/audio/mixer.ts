/**
 * The volume settings: a master level and one per kind of sound, each a GainNode the
 * sound modules connect to instead of the AudioContext's destination:
 *
 *   sources -> bus gain (engine | effects | radio | voice | music) -> master gain -> speakers
 *
 * Levels are 0..1, kept in localStorage per browser (so each player sets their own).
 * Sounds that don't go through WebAudio - speech synthesis and the FM radio's <audio>
 * element - read `level(bus)` and set their own volume from it.
 */

export type Bus = 'engine' | 'effects' | 'radio' | 'voice' | 'music';

export const BUSES: { id: Bus | 'master'; label: string }[] = [
  { id: 'master', label: 'Master' },
  { id: 'engine', label: 'Engine' },
  { id: 'effects', label: 'Sea & effects' },
  { id: 'radio', label: 'VHF calls' },
  { id: 'voice', label: 'Crew voices' },
  { id: 'music', label: 'FM radio' },
];

const KEY = 'swvr.volume';
const DEFAULTS: Record<Bus | 'master', number> = { master: 0.9, engine: 0.8, effects: 1, radio: 1, voice: 1, music: 0.5 };

class Mixer {
  private readonly levels = { ...DEFAULTS };
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<Bus, GainNode>();

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<typeof DEFAULTS>;
      for (const k of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
        const v = saved[k];
        if (typeof v === 'number' && Number.isFinite(v)) this.levels[k] = Math.min(1, Math.max(0, v));
      }
    } catch {
      // No storage (private window, tests): defaults.
    }
  }

  /** The node a sound of this kind connects to (created on first use). */
  bus(ctx: AudioContext, bus: Bus): AudioNode {
    if (this.ctx !== ctx) {
      this.ctx = ctx;
      this.buses.clear();
      this.master = ctx.createGain();
      this.master.gain.value = this.levels.master;
      this.master.connect(ctx.destination);
    }
    let g = this.buses.get(bus);
    if (!g) {
      g = ctx.createGain();
      g.gain.value = this.levels[bus];
      g.connect(this.master!);
      this.buses.set(bus, g);
    }
    return g;
  }

  /** A setting as stored (0..1). */
  get(id: Bus | 'master'): number {
    return this.levels[id];
  }

  /** Effective level of a bus including master (for sounds outside WebAudio). */
  level(bus: Bus): number {
    return this.levels[bus] * this.levels.master;
  }

  /** Back to the default levels. */
  reset(): void {
    for (const k of Object.keys(DEFAULTS) as (Bus | 'master')[]) this.set(k, DEFAULTS[k]);
  }

  set(id: Bus | 'master', v: number): void {
    this.levels[id] = Math.min(1, Math.max(0, Math.round(v * 10) / 10));
    const node = id === 'master' ? this.master : this.buses.get(id);
    if (node && this.ctx) node.gain.setTargetAtTime(this.levels[id], this.ctx.currentTime, 0.05);
    try {
      localStorage.setItem(KEY, JSON.stringify(this.levels));
    } catch {
      // Not saved; still applies now.
    }
  }
}

export const mixer = new Mixer();
