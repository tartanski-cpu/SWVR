/**
 * Training mode's runs on this page (milestone 2): the recorder fed each tick by the host
 * (or alone), each finished run kept (runStore.ts, and in memory for this session if the
 * browser won't store it), the list for the menu's Training tab, a run reviewed on the chart
 * (reviewPanel.ts), downloaded as a file, or a file loaded back. A crew-mate's page records
 * nothing (it has the host's 20 Hz world only); its own review works on runs it has.
 */
import type * as THREE from 'three';
import type { WorldState } from '../core/world';
import { CONFIG } from '../config';
import { decodeRun, encodeRun, Recorder, runFileName, type Run, type RunHeader } from './recording';
import { clock, eventAt, nextEvent, prevEvent } from './review';
import { ReviewPanel } from './reviewPanel';
import { RunStore } from './runStore';

/** What the menu's Training tab works (trainingMenu.ts). */
export interface TrainingRunsApi {
  /** The runs kept, newest first. */
  list(): RunHeader[];
  recording(): boolean;
  /** The run being reviewed, or null. */
  reviewing(): RunHeader | null;
  review(id: string): void;
  closeReview(): void;
  download(id: string): void;
  /** Load a recording from a file (the desktop's file picker; not in VR). */
  load(): void;
  canLoad(): boolean;
  seekBy(s: number): void;
  seekEvent(dir: 1 | -1): void;
  togglePlay(): void;
  cycleRate(): void;
  /** How many times real time it plays at. */
  rate(): number;
  /** "0:32 of 2:10, paused" */
  playLine(): string;
  /** The event at this moment of the review, or ''. */
  eventLine(): string;
  /** The last thing said about the runs (saved, a file that wouldn't load), or ''. */
  note(): string;
}

export interface TrainingRunsHost {
  world(): WorldState;
  inXR(): boolean;
  camera(): THREE.Camera;
  /** What the VR review panel is carried by (the player's rig). */
  carrier(): THREE.Object3D;
  notify(text: string, s?: number): void;
}

export class TrainingRuns implements TrainingRunsApi {
  readonly panel: ReviewPanel;
  private readonly store = new RunStore();
  private readonly recorder: Recorder;
  /** This session's runs (and any loaded), by id: kept here too in case the browser won't store them. */
  private readonly mine = new Map<string, Run>();
  private headers: RunHeader[] = [];
  private said = '';

  constructor(private readonly host: TrainingRunsHost) {
    this.panel = new ReviewPanel(() => host.world());
    this.recorder = new Recorder((run) => this.keep(run, true));
    void this.refresh();
  }

  /** After each simulation tick on this page (alone or hosting). */
  afterTick(world: WorldState): void {
    this.recorder.tick(world);
  }

  /** Each frame. */
  update(dt: number): void {
    this.panel.update(dt);
  }

  private async keep(run: Run, recorded: boolean): Promise<void> {
    this.mine.set(run.header.id, run);
    this.headers = [run.header, ...this.headers.filter((h) => h.id !== run.header.id)];
    if (recorded) this.host.notify(`Recorded: ${run.header.name}, attempt ${run.header.attempt}. Training tab, Runs, to review it on the chart.`, 5);
    try {
      await this.store.put(run);
      await this.refresh();
    } catch {
      this.said = 'This browser would not keep the run: it is here until the page closes';
    }
  }

  private async refresh(): Promise<void> {
    try {
      const stored = await this.store.list();
      const ids = new Set(stored.map((h) => h.id));
      this.headers = [...[...this.mine.values()].map((r) => r.header).filter((h) => !ids.has(h.id)), ...stored].sort((a, b) => (a.date < b.date ? 1 : -1));
    } catch {
      // Storage blocked: this session's runs only.
    }
  }

  private async fetch(id: string): Promise<Run | null> {
    const own = this.mine.get(id);
    if (own) return own;
    try {
      return await this.store.get(id);
    } catch {
      return null;
    }
  }

  list(): RunHeader[] {
    return this.headers;
  }

  recording(): boolean {
    return this.recorder.recording;
  }

  reviewing(): RunHeader | null {
    return this.panel.current?.header ?? null;
  }

  review(id: string): void {
    void (async () => {
      const run = await this.fetch(id);
      if (!run) {
        this.said = 'That run is no longer kept';
        return;
      }
      // The other attempt at the same exercise beside it: the nearest in time within the hour.
      const h = run.header;
      const at = Date.parse(h.date);
      const near = this.headers
        .filter((o) => o.exercise === h.exercise && o.attempt !== h.attempt && Math.abs(Date.parse(o.date) - at) < 3600e3)
        .sort((a, b) => Math.abs(Date.parse(a.date) - at) - Math.abs(Date.parse(b.date) - at))[0];
      const other = near ? await this.fetch(near.id) : null;
      this.panel.show(run, other, this.host.inXR(), this.host.camera(), this.host.carrier());
      this.said = '';
    })();
  }

  closeReview(): void {
    this.panel.close();
  }

  download(id: string): void {
    void (async () => {
      const run = await this.fetch(id);
      if (!run) return;
      const bytes = await encodeRun(run);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/gzip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = runFileName(run.header);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      this.said = `Saved as ${a.download} (${Math.max(1, Math.round(bytes.length / 1024))} KB)`;
    })();
  }

  load(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gz,application/gzip';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void (async () => {
        try {
          const run = await decodeRun(new Uint8Array(await file.arrayBuffer()));
          await this.keep(run, false);
          this.review(run.header.id);
          this.said = `Loaded ${file.name}`;
        } catch (e) {
          this.said = `${file.name}: ${(e as Error).message}`;
        }
      })();
    };
    input.click();
  }

  canLoad(): boolean {
    return !this.host.inXR();
  }

  seekBy(s: number): void {
    this.panel.playing = false;
    this.panel.seek(this.panel.t + s);
  }

  seekEvent(dir: 1 | -1): void {
    const run = this.panel.current;
    if (!run) return;
    const e = dir > 0 ? nextEvent(run, this.panel.t) : prevEvent(run, this.panel.t);
    this.panel.playing = false;
    this.panel.seek(e ? e.t : dir > 0 ? run.header.duration : 0);
  }

  togglePlay(): void {
    const run = this.panel.current;
    if (!run) return;
    if (!this.panel.playing && this.panel.t >= run.header.duration) this.panel.seek(0);
    this.panel.playing = !this.panel.playing;
  }

  cycleRate(): void {
    const rates = CONFIG.training.review.playRates;
    this.panel.rate = rates[(rates.indexOf(this.panel.rate) + 1) % rates.length];
  }

  rate(): number {
    return this.panel.rate;
  }

  playLine(): string {
    const run = this.panel.current;
    if (!run) return '';
    return `${clock(this.panel.t)} of ${clock(run.header.duration)}, ${this.panel.playing ? `playing ×${this.panel.rate}` : 'paused'}`;
  }

  eventLine(): string {
    const run = this.panel.current;
    const e = run ? eventAt(run, this.panel.t) : null;
    return e ? `${clock(e.t)} ${e.text}` : '';
  }

  note(): string {
    return this.said;
  }
}
