/**
 * The bus key table (modular boats M4a): every key the registry knows, as a Markdown table
 * for docs/BUS_KEYS.md. A test regenerates it and compares, so the document can't drift
 * from the code; `KEY_TABLE_WRITE=1 npx vitest run tests/modular/keyTable.test.ts` rewrites it.
 */
import { allKeys, specOf } from './bus';

const cell = (s: string) => s.replace(/\|/g, '\\|');

export function keyTable(): string {
  const groups = new Map<string, string[]>();
  for (const key of allKeys()) {
    const s = specOf(key);
    const what =
      s.type === 'enum'
        ? (s.values ?? []).join(' / ')
        : s.type === 'boolean'
          ? 'on / off'
          : [s.unit, s.range && !s.unit?.includes('..') ? `${s.range[0]} to ${s.range[1]}` : '', s.integer ? 'whole' : ''].filter(Boolean).join(', ');
    const how = [s.kind === 'intent' ? (s.press ? 'press' : 'player sets') : 'read only', s.hold ? `held: ${s.hold}` : '', s.persist ? 'saved' : '', s.followedBy ? `also set by ${s.followedBy}` : ''].filter(Boolean).join('; ');
    const row = `| \`${key}\` | ${cell(what)} | ${how} | ${s.writer} | ${(s.aliases ?? []).map((a) => `\`${a}\``).join(', ')} | ${cell(s.doc)} |`;
    const group = key.split('.')[0];
    groups.set(group, [...(groups.get(group) ?? []), row]);
  }
  const out = [
    '# Bus keys',
    '',
    'Every value on a boat\'s bus (modular boats; `src/modular/busKeys.ts`). Generated from the registry by `src/modular/keyTable.ts` and checked by a test: edit the registry, not this file.',
    '',
    '- **Values:** what it holds (a number\'s unit and range, on / off, or its names).',
    '- **Use:** a player (or a control) sets it; or it is read only, worked out by the boat; a press does something once. "Held" keys belong to the first hand on them (multiplayer). Only "saved" keys are kept between sessions.',
    '- **Written by:** `module` (a module\'s port), `core` (the game itself), `legacy` (code not yet a module).',
    '- **Old names:** older intent names that still reach it.',
    '',
  ];
  for (const [group, rows] of groups) {
    out.push(`## ${group}`, '', '| Key | Values | Use | Written by | Old names | What it is |', '|---|---|---|---|---|---|', ...rows, '');
  }
  return out.join('\n');
}
