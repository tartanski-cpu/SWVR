/**
 * The crew whiteboard: sticky notes on a board in the wheelhouse. Shared simulation state
 * (WorldState.board, host-authoritative like everything else), so every player sees the
 * same notes; the host also keeps a copy in its browser (see App), so the notes survive a
 * reload.
 *
 * A note sits at (x, y) on the board, 0..1 from the top-left corner (its centre). Intents:
 *   noteAdd     ref = text, args [x, y, colour]
 *   noteMove    ref = note id, args [x, y]   (moved notes come to the front)
 *   noteDelete  ref = note id
 */
import type { Intent } from '../core/intents';
import type { WorldState } from '../core/world';

export interface Note {
  id: string;
  text: string;
  /** Index into NOTE_COLOURS. */
  colour: number;
  x: number;
  y: number;
  /** Who wrote it (player name at the time). */
  by: string;
}

export interface BoardState {
  notes: Note[];
  seq: number;
}

export const NOTE_COLOURS = ['#ffe873', '#ff9ec2', '#9ef0a2', '#9fd6ff'];
export const MAX_NOTES = 40;
export const MAX_TEXT = 80;

export function createBoard(): BoardState {
  return { notes: [], seq: 0 };
}

/** A note's centre stays this far inside the edges (board fractions). */
const EDGE = 0.07;
const clamp01 = (v: number) => Math.min(1 - EDGE, Math.max(EDGE, v));

export function isBoardIntent(control: string): boolean {
  return control === 'noteAdd' || control === 'noteMove' || control === 'noteDelete';
}

export function applyBoardIntent(world: WorldState, intent: Intent): void {
  const b = (world.board ??= createBoard());
  const a = intent.args ?? [];
  switch (intent.control) {
    case 'noteAdd': {
      const text = (intent.ref ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
      if (!text || a.length < 2 || !a.every(Number.isFinite)) return;
      // A full board drops its oldest note.
      if (b.notes.length >= MAX_NOTES) b.notes.shift();
      b.seq += 1;
      const colour = Math.abs(Math.round(a[2] ?? 0)) % NOTE_COLOURS.length;
      b.notes.push({ id: `n${b.seq}`, text, colour, x: clamp01(a[0]), y: clamp01(a[1]), by: world.players[intent.playerId]?.name ?? '' });
      return;
    }
    case 'noteMove': {
      const i = b.notes.findIndex((n) => n.id === intent.ref);
      if (i < 0 || a.length < 2 || !a.every(Number.isFinite)) return;
      const [n] = b.notes.splice(i, 1);
      n.x = clamp01(a[0]);
      n.y = clamp01(a[1]);
      b.notes.push(n);
      b.seq += 1;
      return;
    }
    case 'noteDelete': {
      const i = b.notes.findIndex((n) => n.id === intent.ref);
      if (i >= 0) {
        b.notes.splice(i, 1);
        b.seq += 1;
      }
      return;
    }
  }
}

/** A saved board (from localStorage), checked: anything malformed is dropped. */
export function parseBoard(json: string | null): BoardState | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as BoardState;
    if (!raw || !Array.isArray(raw.notes)) return null;
    const notes = raw.notes
      .filter((n) => n && typeof n.text === 'string' && typeof n.id === 'string' && Number.isFinite(n.x) && Number.isFinite(n.y))
      .slice(-MAX_NOTES)
      .map((n) => ({ id: n.id, text: n.text.slice(0, MAX_TEXT), colour: Math.abs(Math.round(n.colour || 0)) % NOTE_COLOURS.length, x: clamp01(n.x), y: clamp01(n.y), by: String(n.by ?? '') }));
    const seq = Math.max(Number(raw.seq) || 0, ...notes.map((n) => Number(n.id.slice(1)) || 0));
    return { notes, seq };
  } catch {
    return null;
  }
}
