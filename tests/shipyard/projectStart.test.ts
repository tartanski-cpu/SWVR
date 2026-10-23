/**
 * Projects that save themselves, and the Shipyard opening with no project (owner, Oct 2026:
 * "when you load in ... you don't have a project, so it cleans all the settings. And then it
 * says, do you want to make a new project or open an existing one?"): projects.ts saveAs and
 * keepLeftWork.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from '../../src/shipyard/design';
import { keepLeftWork, saveAs, type Project } from '../../src/shipyard/projects';
import { newDoc } from '../../src/shipyard/variants';

const doc = newDoc({ ...DEFAULT_DESIGN });
const proj = (name: string, savedAt = 1): Project => ({ name, savedAt, picture: '', summary: '', doc });

describe('projects that save themselves', () => {
  it('saving again updates the project; renamed, it takes the new name and leaves no copy behind', () => {
    let list = saveAs([proj('Other')], proj('Kittiwake', 2), '');
    expect(list.map((p) => p.name)).toEqual(['Kittiwake', 'Other']);
    list = saveAs(list, proj('Kittiwake', 3), 'Kittiwake');
    expect(list.map((p) => p.name)).toEqual(['Kittiwake', 'Other']);
    list = saveAs(list, proj('Puffin', 4), 'Kittiwake');
    expect(list.map((p) => p.name)).toEqual(['Puffin', 'Other']);
  });

  it('the work left on the table goes back into its project, or is kept as "Unsaved work"', () => {
    const changed = newDoc({ ...DEFAULT_DESIGN, hull: 2 });
    let list = keepLeftWork([proj('Kittiwake')], changed, 'Kittiwake', 10, '');
    expect(list).toHaveLength(1);
    expect(list[0].doc.variants[0].design.hull).toBe(2);
    expect(list[0].savedAt).toBe(10);
    list = keepLeftWork(list, changed, '', Date.UTC(2026, 9, 23, 9, 30), 'Pilot boat');
    expect(list).toHaveLength(2);
    expect(list[0].name).toMatch(/^Unsaved work \(23 Oct/);
    expect(list[0].summary).toBe('Pilot boat');
  });
});
