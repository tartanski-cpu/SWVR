/** Stable entity identifier. Plain strings so state serializes to JSON unchanged. */
export type EntityId = string;

/** Well-known singleton entities. */
export const ENVIRONMENT_ID: EntityId = 'env';

/**
 * Deterministic id factory: `player-1`, `player-2`, `vessel-1`...
 * The simulation owner (later: the host) is the only one that should mint ids.
 */
export class IdFactory {
  private counters = new Map<string, number>();

  next(prefix: string): EntityId {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}-${n}`;
  }
}
