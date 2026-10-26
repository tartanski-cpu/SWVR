/**
 * The design document (parametric boats P1): a design as named fields, travelling as her short
 * code while one holds her, else as a document token; links and files; reading that forgives
 * and says so; a field a document lacks is the starting design's.
 */
import { describe, expect, it } from 'vitest';
import { ALL_FIELDS, CONSOLE_FIELDS, DEFAULT_DESIGN, FURNITURE_FIELDS, CODE_ENGINES, CODE_HULLS, decodeDesign, encodeDesign, type ShipDesign, fromSteps, toSteps } from '../../src/shipyard/design';
import {
  DOC_FIELDS,
  designDoc,
  designFromFields,
  designToken,
  docFileName,
  docFileText,
  docToken,
  isDocToken,
  readDesign,
  sameDesign,
  shortCode,
} from '../../src/shipyard/designDoc';
import { readFavourites } from '../../src/shipyard/favourites';
import { checkCode, ShipyardCodes } from '../../src/shipyard/takeHer';
import { cleanDesign } from '../../src/shipyard/variants';

/**
 * A spread of designs: the default, each field at its top step, and some mixed ones; each as the
 * code holds it (the code reads a retired field, the lower front's rake, as 0, and keeps the
 * deckhouse's sizes only with a deckhouse).
 */
function designs(): ShipDesign[] {
  return rawDesigns().map((d) => {
    const r = decodeDesign(encodeDesign(d));
    if (!('design' in r)) throw new Error(r.error);
    return r.design;
  });
}
/** The choices her short code holds: all but the helm assist panel, the cockpit overhead, the walked deckhouse top, the cabin below, extra sheer and a raised foredeck (a design with one travels as a document). */
const NOT_IN_CODE: (keyof ShipDesign)[] = ['helmAssist', 'overhead', 'dhWalk', 'dhAft', 'bowFender', 'finish', 'stackMount', 'stackPos', 'stackCasing', 'markings', 'battery', 'aftFacets', 'foreCabin', 'fishHold', 'rescueBoat', 'netDrum', 'trawlWinches', 'diveFrame', 'sheer', 'fcLength', 'fcHeight', 'oldSchool', 'touch', 'consoleLen', 'houseX', ...FURNITURE_FIELDS.map((f) => f.key), ...CONSOLE_FIELDS.map((f) => f.key)];
const CODE_FIELDS = ALL_FIELDS.filter((f) => !NOT_IN_CODE.includes(f.key));
function rawDesigns(): ShipDesign[] {
  const out: ShipDesign[] = [{ ...DEFAULT_DESIGN }];
  // (The hull and engine fields' steps include the types beyond the code: the stern trawler and the 750 kW diesel travel as a document; so do high window sills and the paints added in Oct 2026.)
  const CODE_TOPS: Partial<Record<keyof ShipDesign, number>> = { hull: CODE_HULLS, engine: CODE_ENGINES, sills: 2, paint: 8, roofPaint: 5, roofTop: 5, houseColour: 10 };
  const top = (f: (typeof CODE_FIELDS)[number]) => CODE_TOPS[f.key] ?? f.steps;
  for (const f of CODE_FIELDS) out.push({ ...DEFAULT_DESIGN, ...fromSteps({ [f.key]: top(f) - 1 }) });
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    // (In the code's steps, then the wheelhouse's measurements as values.)
    const d = { ...toSteps(DEFAULT_DESIGN)! };
    for (const f of CODE_FIELDS) if (rnd() < 0.4) d[f.key] = Math.floor(rnd() * Math.min(top(f), 40));
    out.push(fromSteps(d));
  }
  return out;
}

describe('the design document: its fields', () => {
  it('a field a document lacks is the starting design’s (no old designs are kept: owner, Oct 2026)', () => {
    expect([...DOC_FIELDS].sort()).toEqual(Object.keys(DEFAULT_DESIGN).sort());
    expect(designFromFields({}).design).toEqual(DEFAULT_DESIGN);
    expect(designFromFields({ hull: 3 }).design).toEqual({ ...DEFAULT_DESIGN, hull: 3 });
    expect(cleanDesign(DEFAULT_DESIGN)).toEqual(DEFAULT_DESIGN);
  });

  it('reads forgivingly, saying what it did: unknown fields left out, values brought onto their scales; never throws', () => {
    const r = designFromFields({ hull: 3, length: 99, beam: -2, depth: 4.4, paint: 'red', wings: 2 });
    expect(r.design.hull).toBe(3);
    expect(r.design.length).toBe(15);
    expect(r.design.beam).toBe(0);
    expect(r.design.depth).toBe(4);
    expect(r.design.paint).toBe(0);
    expect(r.warnings.join(' ')).toMatch(/length.*off its scale/);
    expect(r.warnings.join(' ')).toMatch(/paint.*isn't a number/);
    expect(r.warnings.join(' ')).toMatch(/newer Shipyard: wings/);
    for (const junk of [null, 3, 'x', [], { design: null }]) expect(() => designFromFields(junk)).not.toThrow();
  });
});

describe('the design document: tokens, links and files', () => {
  it('every design goes round as a document token, a file and her code, the same boat', () => {
    for (const d of designs()) {
      const fromToken = readDesign(docToken(d, 'Kittiwake'));
      expect(fromToken).toMatchObject({ design: d, name: 'Kittiwake', warnings: [] });
      expect(readDesign(docFileText(d, 'Kittiwake'))).toMatchObject({ design: d, name: 'Kittiwake' });
      expect(readDesign(encodeDesign(d))).toMatchObject({ design: d });
    }
  });

  it('her token is her short code while one holds her (all designs today), and a document otherwise', () => {
    for (const d of designs()) expect(designToken(d)).toBe(encodeDesign(d));
    // A value no code can hold (a design from a later Shipyard's free values): a document.
    const off = { ...DEFAULT_DESIGN, length: 20 } as ShipDesign;
    expect(shortCode(off)).toBeNull();
    expect(isDocToken(designToken(off))).toBe(true);
    // The helm assist panel isn't in the code either: a document, and it reads back.
    const assist = { ...DEFAULT_DESIGN, controls: 1, helmAssist: 1 };
    expect(shortCode(assist)).toBeNull();
    expect(readDesign(designToken(assist))).toMatchObject({ design: assist, warnings: [] });
  });

  it('a compact token holds only what differs from the starting design: a short link', () => {
    expect(Object.keys(designDoc(DEFAULT_DESIGN, '', true).design)).toEqual([]);
    expect(Object.keys(designDoc({ ...DEFAULT_DESIGN, hull: 3, outboards: 2 }, '', true).design)).toEqual(['hull', 'outboards']);
    expect(docToken(DEFAULT_DESIGN).length).toBeLessThan(80);
    // Every field written in a file.
    expect(Object.keys(designDoc(DEFAULT_DESIGN).design)).toHaveLength(DOC_FIELDS.length);
  });

  it('reads codes, links and addresses as players give them', () => {
    const d = { ...DEFAULT_DESIGN, hull: 3, outboards: 2 };
    const code = encodeDesign(d);
    const grouped = code.match(/.{1,5}/g)!.join('-').toLowerCase();
    for (const text of [code, grouped, ` ${code} `, `https://x.github.io/SWVR/next/?design=${code}&t=1`, `https://x.github.io/SWVR/next/shipyard.html#${code}`, `https://x.github.io/SWVR/next/shipyard.html#${docToken(d, 'K')}`, `./?design=${docToken(d)}`])
      expect(readDesign(text), text).toMatchObject({ design: d });
    expect(sameDesign(code, docToken(d, 'Other name'))).toBe(true);
    expect(sameDesign(code, encodeDesign(DEFAULT_DESIGN))).toBe(false);
  });

  it('says why a design won’t read', () => {
    expect(readDesign('{"format":"something.else","v":1,"design":{}}')).toHaveProperty('error');
    expect(readDesign('{"format":"swvr.design","v":99,"design":{}}')).toEqual({ error: expect.stringMatching(/newer Shipyard/) });
    expect(readDesign('{ not json')).toHaveProperty('error');
    expect(readDesign('doc.!!!!')).toHaveProperty('error');
    expect(readDesign(docToken(DEFAULT_DESIGN).slice(0, 20))).toHaveProperty('error');
    expect(docFileName('Kittiwake II!')).toBe('Kittiwake-II.swvr-design.json');
  });
});

describe('the design document: where codes went, links go', () => {
  it('a favourite, the in-game box and its check take a link as well as a code', () => {
    const d = { ...DEFAULT_DESIGN, hull: 2 };
    const token = docToken(d, 'Gull');
    const store = { items: new Map<string, string>(), getItem(k: string) { return this.items.get(k) ?? null; }, setItem(k: string, v: string) { this.items.set(k, v); } };
    store.setItem('swvr.shipyard.favourites', JSON.stringify([{ name: 'Gull', code: token, savedAt: 1 }]));
    expect(readFavourites(store)).toHaveLength(1);
    expect(checkCode(token, true)).toMatchObject({ ok: true, text: expect.stringMatching(/^Gull: /) });
    const codes = new ShipyardCodes(() => null);
    expect(codes.paste(`have a look https://x.github.io/SWVR/next/shipyard.html#${token} cheers`)).toBe(true);
    expect(codes.code).toBe(token);
  });
});
