/**
 * Modules never import each other (docs/MODULAR_BOATS.md 2.12). Each module lives in its
 * own folder under src/modules/; it may import the contracts (src/modular/), the shared
 * libraries (controls, render, mechanism helpers...), but never another module's folder.
 * They meet only on the bus. A test rather than a lint tool: no new dependency, and the
 * Pages build runs it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODULES = join(ROOT, 'src', 'modules');

/** Import / export-from specifiers in a TypeScript source. */
export function importsOf(source: string): string[] {
  const out: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (let m = re.exec(source); m; m = re.exec(source)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** The module folder a path is in ('throttleLever'), or null if it's not under src/modules. */
function moduleOf(path: string): string | null {
  const rel = relative(MODULES, path);
  if (rel.startsWith('..') || rel === '') return null;
  return rel.split(sep)[0];
}

/** Every "a imports b" where a and b are different modules. */
export function crossings(files: { path: string; source: string }[]): string[] {
  const bad: string[] = [];
  for (const f of files) {
    const own = moduleOf(f.path);
    if (!own) continue;
    for (const spec of importsOf(f.source)) {
      if (!spec.startsWith('.')) continue;
      const other = moduleOf(resolve(dirname(f.path), spec));
      if (other && other !== own) bad.push(`${relative(ROOT, f.path)} imports module '${other}' ('${spec}')`);
    }
  }
  return bad;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('module boundaries', () => {
  it('no module imports another module', () => {
    const files = walk(MODULES).map((path) => ({ path, source: readFileSync(path, 'utf8') }));
    expect(crossings(files)).toEqual([]);
  });

  it('the check itself catches a crossing (and allows the contracts and libraries)', () => {
    const src = (p: string) => join(MODULES, p);
    const files = [
      {
        path: src('rpmGauge/view.ts'),
        source: [
          "import * as THREE from 'three';",
          "import type { ModuleDefinition } from '../../modular/module';",
          "import { Button } from '../../controls/Button';",
          "import { paint } from './paint';",
          "import { ENGINE } from '../dieselInboard/sim';",
          "export { x } from '../dieselInboard';",
          "const lazy = () => import('../battery/bank');",
        ].join('\n'),
      },
    ];
    expect(crossings(files)).toEqual([
      "src/modules/rpmGauge/view.ts imports module 'dieselInboard' ('../dieselInboard/sim')",
      "src/modules/rpmGauge/view.ts imports module 'dieselInboard' ('../dieselInboard')",
      "src/modules/rpmGauge/view.ts imports module 'battery' ('../battery/bank')",
    ]);
  });
});
