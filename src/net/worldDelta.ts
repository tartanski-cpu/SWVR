import type { WorldState } from '../core/world';

/**
 * Snapshots by their changes (multiplayer study #3). The whole world went to every crew-mate
 * 20 times a second, 18 KB on Tayvallich to 159 KB on the Clyde, nine tenths of it the
 * crates standing on the quays, which hardly ever change: 3 MB/s of upload per crew-mate on
 * the Clyde, more than a home line sends. Now each send says only what changed since the
 * last: a part of the world (`time`, `environment`...) whole if it changed, and for a part
 * that's a set of things (`vessels`, `cargo`, `players`...) only the things in it that
 * changed, came or went. Worked out once per send, the same text for every crew-mate.
 *
 * Each piece is compared as its JSON text. A crew page keeps the same texts and builds the
 * world from them afresh each time (one parse, as the whole world used to be), so nothing
 * on the page shares an object with the next snapshot.
 */
export interface WorldDelta {
  /** Parts given whole (changed, or new). */
  val?: Record<string, unknown>;
  /** Parts that are sets of things: the things changed or new (`set`), gone (`del`); `reset`: the whole set anew. */
  obj?: Record<string, { set?: Record<string, unknown>; del?: string[]; reset?: true }>;
  /** Parts gone from the world. */
  del?: string[];
}

/** A part kept as text: whole, or a set's things each as text. */
type Piece = { kind: 'val'; s: string } | { kind: 'obj'; m: Map<string, string> };

/** A set of things: a plain object (not an array, not null). */
function isSet(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** The host's side: the world's changes since the last `pack`. */
export class DeltaPacker {
  private sent = new Map<string, Piece>();

  /** What changed since the last call (everything, the first time); null if nothing did. */
  pack(world: WorldState): WorldDelta | null {
    const d: WorldDelta = {};
    const now = new Map<string, Piece>();
    for (const [k, v] of Object.entries(world)) {
      if (v === undefined) continue;
      const was = this.sent.get(k);
      if (isSet(v)) {
        const m = new Map<string, string>();
        const ch: { set?: Record<string, unknown>; del?: string[]; reset?: true } = {};
        const old = was?.kind === 'obj' ? was.m : null;
        if (!old) ch.reset = true;
        for (const [id, x] of Object.entries(v)) {
          if (x === undefined) continue;
          const s = JSON.stringify(x);
          m.set(id, s);
          if (!old || old.get(id) !== s) (ch.set ??= {})[id] = x;
        }
        if (old) for (const id of old.keys()) if (!m.has(id)) (ch.del ??= []).push(id);
        if (ch.reset || ch.set || ch.del) (d.obj ??= {})[k] = ch;
        now.set(k, { kind: 'obj', m });
      } else {
        const s = JSON.stringify(v);
        if (was?.kind !== 'val' || was.s !== s) (d.val ??= {})[k] = v;
        now.set(k, { kind: 'val', s });
      }
    }
    for (const k of this.sent.keys()) if (!now.has(k)) (d.del ??= []).push(k);
    this.sent = now;
    return d.val || d.obj || d.del ? d : null;
  }
}

/** The crew's side: the host's world, rebuilt from its changes. */
export class DeltaReader {
  private pieces = new Map<string, Piece>();

  /** A whole world (the welcome): everything as it is. */
  reset(world: WorldState): void {
    this.pieces.clear();
    for (const [k, v] of Object.entries(world)) {
      if (v === undefined) continue;
      if (isSet(v)) this.pieces.set(k, { kind: 'obj', m: new Map(Object.entries(v).filter(([, x]) => x !== undefined).map(([id, x]) => [id, JSON.stringify(x)])) });
      else this.pieces.set(k, { kind: 'val', s: JSON.stringify(v) });
    }
  }

  /** The world after these changes (a new object, parsed afresh). */
  apply(d: WorldDelta): WorldState {
    for (const k of d.del ?? []) this.pieces.delete(k);
    for (const [k, v] of Object.entries(d.val ?? {})) this.pieces.set(k, { kind: 'val', s: JSON.stringify(v) });
    for (const [k, ch] of Object.entries(d.obj ?? {})) {
      const was = this.pieces.get(k);
      const m = !ch.reset && was?.kind === 'obj' ? was.m : new Map<string, string>();
      for (const id of ch.del ?? []) m.delete(id);
      for (const [id, x] of Object.entries(ch.set ?? {})) m.set(id, JSON.stringify(x));
      this.pieces.set(k, { kind: 'obj', m });
    }
    return this.world();
  }

  /** The world as the pieces have it, as one text parsed once. */
  world(): WorldState {
    const parts: string[] = [];
    for (const [k, p] of this.pieces) {
      const body = p.kind === 'val' ? p.s : `{${[...p.m].map(([id, s]) => `${JSON.stringify(id)}:${s}`).join(',')}}`;
      parts.push(`${JSON.stringify(k)}:${body}`);
    }
    return JSON.parse(`{${parts.join(',')}}`) as WorldState;
  }
}
