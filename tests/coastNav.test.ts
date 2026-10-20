/**
 * The coast pipeline's navigation stage (tools/coast/src/nav.ts; milestone 2): the Oban
 * region's nav.json. Checks the marks, lights, skerries and the Falls of Lora race zone it
 * wrote hang together: marks stand in water, each mark's colours match its kind (port red,
 * starboard green, cardinals yellow and black), light characters read as on a chart, the
 * Dunollie sector light keeps its sectors, and the race lies across the narrows at Connel.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'regions', 'oban');
const region = JSON.parse(readFileSync(join(dir, 'region.json'), 'utf8'));
const nav = JSON.parse(readFileSync(join(dir, 'nav.json'), 'utf8'));
const inBox = (x: number, z: number) => x >= region.box.x0 && x <= region.box.x1 && z >= region.box.z0 && z <= region.box.z1;

describe('the Oban navigation layer (pipeline milestone 2)', () => {
  it('region.json points at nav.json', () => {
    expect(region.nav).toBe('nav.json');
  });

  it('every buoy floats in water deep enough to float in, inside the box', () => {
    expect(nav.marks.length).toBeGreaterThanOrEqual(10);
    for (const m of nav.marks) {
      expect(inBox(m.x, m.z)).toBe(true);
      if (m.type.startsWith('buoy')) expect(m.depth).toBeLessThan(-1);
    }
  });

  it("each mark's colours match its kind", () => {
    for (const m of nav.marks) {
      if (m.gameKind === 'port') expect(m.colour).toBe('red');
      if (m.gameKind === 'stbd') expect(m.colour).toBe('green');
      if (m.gameKind === 'N') expect(m.colour).toBe('black;yellow');
      if (m.gameKind === 'S') expect(m.colour).toBe('yellow;black');
    }
    const kinds = new Set(nav.marks.map((m: { gameKind: string }) => m.gameKind));
    for (const k of ['port', 'stbd', 'N', 'S']) expect(kinds.has(k)).toBe(true);
  });

  it('lights read as charted, and Dunollie keeps its red, white and green sectors', () => {
    const labels = nav.lights.map((l: { label: string }) => l.label);
    for (const l of labels) expect(l).toMatch(/^(F|Fl|Fl\(\d\)|Q|VQ|Iso|Oc|LFl|Q\+LFl\(\d\)|VQ\+LFl\(\d\))[WRGY]+(\.[\d.]+s)?$/);
    const dunollie = nav.lights.find((l: { name: string }) => l.name === 'Dunollie');
    expect(dunollie.label).toBe('Fl(2)GWR.6s');
    const colours = new Set(dunollie.sectors.map((s: { colour: string }) => s.colour));
    expect([...colours].sort()).toEqual(['green', 'red', 'white']);
    for (const s of dunollie.sectors) (expect(s.from).toBeGreaterThanOrEqual(0), expect(s.to).toBeLessThanOrEqual(360));
    // The south cardinal off Sgeir Rathaid: quick flashes, six, then a long flash.
    expect(nav.lights.find((l: { name: string }) => l.name === 'Sgeir Rathaid').label).toBe('Q+LFl(6)W');
  });

  it('skerries the mesh lost are listed to stand up (Sgeir Rathaid, under its south cardinal)', () => {
    const lost = nav.hazards.filter((h: { kind: string; drawn: boolean }) => h.kind === 'skerry' && !h.drawn);
    expect(lost.length).toBeGreaterThan(0);
    const cardinal = nav.marks.find((m: { name: string }) => m.name === 'Sgeir Rathaid');
    // The rock lies north of its south cardinal (z is south), within 150 m.
    const rock = lost.find((h: { x: number; z: number }) => Math.hypot(h.x - cardinal.x, h.z - cardinal.z) < 150);
    expect(rock).toBeTruthy();
    expect(rock.z).toBeLessThan(cardinal.z);
  });

  it('the Falls of Lora race lies across the narrows at Connel, nearly all over water', () => {
    expect(nav.currents).toHaveLength(1);
    const c = nav.currents[0];
    expect(c.name).toBe('Falls of Lora');
    expect(c.peakKn).toBe(6);
    expect(c.waterShare).toBeGreaterThan(0.9);
    expect(inBox(c.x, c.z)).toBe(true);
    // Connel is at the north-east corner of the box.
    expect(c.x).toBeGreaterThan(region.box.x1 - 2500);
    expect(c.z).toBeLessThan(0);
  });
});
