import { describe, expect, it } from 'vitest';
import { MAX_NOTES, parseBoard } from '../src/board/board';
import { IdFactory } from '../src/core/ids';
import type { Intent } from '../src/core/intents';
import { stepWorld } from '../src/core/simulation';
import { createWorld } from '../src/core/world';

function setup() {
  const { world, localPlayerId } = createWorld(new IdFactory());
  const send = (control: string, ref: string, args?: number[]) => {
    const i: Intent = { playerId: localPlayerId, targetId: 'board', control, value: 1, ref, args };
    stepWorld(world, [i], 1 / 60);
  };
  return { world, send };
}

describe('whiteboard notes', () => {
  it('adds, moves (to the front) and deletes notes, clamped to the board', () => {
    const { world, send } = setup();
    send('noteAdd', '  Check   the oil  ', [0.2, 0.3, 1]);
    send('noteAdd', 'Fenders out', [2, -1, 0]);
    const [a, b] = world.board!.notes;
    expect(a.text).toBe('Check the oil');
    expect(a.colour).toBe(1);
    expect(b.x).toBeLessThan(1);
    expect(b.y).toBeGreaterThan(0);
    send('noteMove', a.id, [0.5, 0.5]);
    expect(world.board!.notes.map((n) => n.id)).toEqual([b.id, a.id]);
    expect(world.board!.notes[1].x).toBe(0.5);
    send('noteDelete', b.id);
    expect(world.board!.notes).toHaveLength(1);
  });

  it('ignores empty notes; a full board drops the oldest', () => {
    const { world, send } = setup();
    send('noteAdd', '   ', [0.5, 0.5]);
    expect(world.board?.notes ?? []).toHaveLength(0);
    for (let i = 0; i < MAX_NOTES + 2; i++) send('noteAdd', `n${i}`, [0.5, 0.5]);
    expect(world.board!.notes).toHaveLength(MAX_NOTES);
    expect(world.board!.notes[0].text).toBe('n2');
  });

  it('a saved board is read back, malformed notes dropped', () => {
    const { world, send } = setup();
    send('noteAdd', 'Keep me', [0.4, 0.4, 2]);
    const saved = JSON.parse(JSON.stringify(world.board));
    saved.notes.push({ id: 'bad', x: 'nope' });
    const b = parseBoard(JSON.stringify(saved))!;
    expect(b.notes.map((n) => n.text)).toEqual(['Keep me']);
    expect(b.seq).toBeGreaterThanOrEqual(1);
    expect(parseBoard('not json')).toBeNull();
  });
});
