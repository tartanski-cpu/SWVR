/**
 * docs/BUS_KEYS.md is generated from the key registry; this keeps it from going stale.
 * After changing keys: KEY_TABLE_WRITE=1 npx vitest run tests/modular/keyTable.test.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { keyTable } from '../../src/modular/keyTable';

const FILE = 'docs/BUS_KEYS.md';

describe('the bus key table in docs/', () => {
  it('is exactly what the registry says', () => {
    const want = keyTable();
    if (process.env.KEY_TABLE_WRITE === '1') writeFileSync(FILE, want);
    expect(readFileSync(FILE, 'utf8'), 'regenerate with KEY_TABLE_WRITE=1').toBe(want);
  });
});
