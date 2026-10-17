/** Projects: all of a piece of design work (brief, variants, pins, sketches), kept by name in this browser. */
import { describe, expect, it } from 'vitest';
import { addProject, MAX_PROJECTS, PROJECTS_KEY, readProjects, removeProject, writeProjects, type Project } from '../../src/shipyard/projects';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';
import { newDoc } from '../../src/shipyard/variants';
import { newBrief } from '../../src/shipyard/brief';

function memStore(): { getItem(k: string): string | null; setItem(k: string, v: string): void; data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}
const proj = (name: string, savedAt: number): Project => ({ name, savedAt, picture: '', summary: '', doc: { ...newDoc({ ...DEFAULT_DESIGN, length: 3 }), brief: { ...newBrief(), name } } });

describe('projects', () => {
  it('save and read back, newest first, the whole doc with its brief', () => {
    const s = memStore();
    expect(writeProjects(s, addProject(addProject([], proj('A', 1)), proj('B', 2)))).toBe(true);
    const back = readProjects(s);
    expect(back.map((p) => p.name)).toEqual(['B', 'A']);
    expect(back[1].doc.variants[0].design.length).toBe(3);
    expect(back[1].doc.brief?.name).toBe('A');
  });

  it('saving again under a name replaces it; delete takes one off; the list is capped', () => {
    let list = addProject([proj('A', 1)], proj('a', 5));
    expect(list).toHaveLength(1);
    list = removeProject(list, 'a', 5);
    expect(list).toHaveLength(0);
    for (let i = 0; i < MAX_PROJECTS + 3; i++) list = addProject(list, proj(`P${i}`, i));
    expect(list).toHaveLength(MAX_PROJECTS);
  });

  it('skips anything unreadable, never throws', () => {
    const s = memStore();
    s.setItem(PROJECTS_KEY, 'not json');
    expect(readProjects(s)).toEqual([]);
    s.setItem(PROJECTS_KEY, JSON.stringify([{ name: 'bad', doc: { v: 9 } }, proj('ok', 1)]));
    expect(readProjects(s).map((p) => p.name)).toEqual(['ok']);
    expect(readProjects(null)).toEqual([]);
  });

  it('a full browser storage says so', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    expect(writeProjects(full, [proj('A', 1)])).toBe(false);
  });
});
