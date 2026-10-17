/**
 * Undo and redo for the Shipyard: your own changes, one step at a time. A slider dragged
 * through many steps is one step to undo (changes to the same fields within `MERGE_MS`
 * are merged). Other people's changes aren't on your stack; undoing yours puts your fields
 * back to what they were before you changed them, and is shared like any other change.
 */
import type { ShipDesign } from './design';
import type { DesignPatch } from './session';

const MERGE_MS = 1200;
const MAX_STEPS = 100;

interface Step {
  before: DesignPatch;
  after: DesignPatch;
  at: number;
}

export class UndoStack {
  private done: Step[] = [];
  private undone: Step[] = [];

  /** You changed the design from `design` by `patch` (at time `now`, ms). */
  record(design: ShipDesign, patch: DesignPatch, now: number): void {
    const keys = Object.keys(patch) as (keyof ShipDesign)[];
    const changed = keys.filter((k) => design[k] !== patch[k]);
    if (!changed.length) return;
    const before: DesignPatch = {};
    const after: DesignPatch = {};
    for (const k of changed) {
      (before as Record<string, number>)[k] = design[k];
      (after as Record<string, number>)[k] = patch[k]!;
    }
    this.undone = [];
    const last = this.done[this.done.length - 1];
    // The same control still moving: one step.
    if (last && now - last.at < MERGE_MS && sameKeys(last.after, after)) {
      last.after = after;
      last.at = now;
      return;
    }
    this.done.push({ before, after, at: now });
    if (this.done.length > MAX_STEPS) this.done.shift();
  }

  /** The patch that undoes your last step (null if none). */
  undo(): DesignPatch | null {
    const s = this.done.pop();
    if (!s) return null;
    this.undone.push(s);
    return s.before;
  }

  /** The patch that redoes the last undone step (null if none). */
  redo(): DesignPatch | null {
    const s = this.undone.pop();
    if (!s) return null;
    this.done.push({ ...s, at: 0 });
    return s.after;
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }
  get canRedo(): boolean {
    return this.undone.length > 0;
  }
}

function sameKeys(a: DesignPatch, b: DesignPatch): boolean {
  const ka = Object.keys(a).sort().join();
  return ka === Object.keys(b).sort().join();
}
