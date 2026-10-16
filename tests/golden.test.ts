/**
 * Golden runs (modular boats, M1): today's boat, recorded once; every milestone of the
 * modular rebuild must reproduce it. See tests/golden/scenarios.ts.
 *
 * The comparison allows only rounding (a millionth, relative): the rebuild moves code,
 * it shouldn't change a single sum. If a later step has to reorder arithmetic and the
 * numbers drift by more, that is reported and decided, not loosened silently.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { crashStop, fullAheadTurn, SCENARIOS, type Checkpoint, type Value } from './golden/scenarios';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'golden', 'fixtures');
const RECORD = process.env.GOLDEN_RECORD === '1';

function same(a: Value | undefined, b: Value | undefined): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  return a === b;
}

/** Every difference between a run and its fixture, as "t=12.5 propulsion.rpm: 1680 -> 1702". */
function differences(got: Checkpoint[], want: Checkpoint[]): string[] {
  const out: string[] = [];
  if (got.length !== want.length) out.push(`${got.length} checkpoints, fixture has ${want.length}`);
  for (let i = 0; i < Math.min(got.length, want.length); i++) {
    for (const k of new Set([...Object.keys(got[i]), ...Object.keys(want[i])])) {
      if (!same(got[i][k], want[i][k])) out.push(`t=${want[i].t} ${k}: ${JSON.stringify(want[i][k])} -> ${JSON.stringify(got[i][k])}`);
    }
  }
  return out;
}

describe('golden runs: today\'s boat, reproduced exactly', { timeout: 60000 }, () => {
  for (const [name, run] of Object.entries(SCENARIOS)) {
    it(name, () => {
      const file = join(DIR, `${name}.json`);
      const got = run();
      if (RECORD) {
        mkdirSync(DIR, { recursive: true });
        writeFileSync(file, JSON.stringify(got, null, 0).replace(/\},\{/g, '},\n{') + '\n');
        return;
      }
      expect(existsSync(file), `no fixture for '${name}': record with GOLDEN_RECORD=1`).toBe(true);
      const want = JSON.parse(readFileSync(file, 'utf8')) as Checkpoint[];
      const diff = differences(got, want);
      expect(diff.slice(0, 20), `${diff.length} differences`).toEqual([]);
    });
  }

  // Modular boats M2: the throttle-lever module sends the bus key 'throttle.demand'; driven
  // that way she must do exactly what she does on the old 'lever' channel.
  for (const [name, run] of [['full-ahead-turn', fullAheadTurn], ['crash-stop', crashStop]] as const) {
    it(`${name}, driven through the bus key throttle.demand`, () => {
      if (RECORD) return;
      const want = JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as Checkpoint[];
      expect(differences(run('throttle.demand'), want).slice(0, 20)).toEqual([]);
    });
  }
});
