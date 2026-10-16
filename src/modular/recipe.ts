/**
 * Contract: the RECIPE (docs/MODULAR_BOATS.md 3.5).
 *
 * A boat is a hull plus a recipe: plain data, loadable from JSON, written by hand now and
 * by the shipyard later. It lists which module goes on which socket (with config overrides
 * and port rebinding), and the interlocks: the relationships between modules on THIS boat
 * ("hatch shut: the dipstick can't be pulled"). Interlocks live here, not in the modules,
 * so the modules stay generic.
 *
 * validateRecipe() checks a recipe in milliseconds, before anything is built, and says
 * what's wrong in plain sentences: a bad recipe is caught at load, not in the headset.
 */
import { allKeys, resolveKey, specOf, type BusReader } from './bus';
import type { BusKey } from './busKeys';
import type { HullLibrary } from './hull';
import { mergeConfig, resolvePorts, type GearKind, type ModuleDefinition, type Provision, type Requirement } from './module';
import { fits, socketPath, type Socket } from './socket';

export interface Recipe {
  /** 'vessel.starter-workboat'. Stable forever. */
  id: string;
  version: number;
  /** What players see. */
  name: string;
  /** The hull's id. */
  hull: string;
  modules: Mount[];
  interlocks?: InterlockSpec[];
}

/** One module on one socket. */
export interface Mount {
  /** A socket on the hull, or (for children) on the parent module. */
  socket: string;
  /** A module id or alias. */
  module: string;
  /** Overrides of the module's defaults. */
  config?: Record<string, unknown>;
  /** Port -> bus key, where it differs from the module's default (2.4). */
  bind?: Record<string, string>;
  /** Modules on this module's own sockets (a console's instruments). */
  modules?: Mount[];
}

/**
 * A rule between modules on this boat. While `when` holds, either a bus key is limited, or
 * controls are disabled (touching one gives the usual warning and buzz, with `message`).
 */
export interface InterlockSpec {
  /** "hatch.engine.open == false", "ramp.state != 'lockedUp' && propulsion.gear != 0". */
  when: string;
  limit?: { key: string; to: number | [number, number] };
  /** 'control:<control id>'. */
  disable?: string[];
  message?: string;
}

// ── Module library ───────────────────────────────────────────────────────────

export interface ModuleLibrary {
  get(idOrAlias: string): ModuleDefinition | undefined;
  all(): readonly ModuleDefinition[];
}

export function createModuleLibrary(defs: readonly ModuleDefinition[]): ModuleLibrary {
  const byId = new Map<string, ModuleDefinition>();
  for (const d of defs) {
    for (const name of [d.id, ...(d.aliases ?? [])]) {
      if (byId.has(name)) throw new Error(`two modules called '${name}'`);
      byId.set(name, d);
    }
  }
  return { get: (id) => byId.get(id), all: () => defs };
}

// ── Conditions (interlocks) ──────────────────────────────────────────────────

export type CompareOp = '<' | '<=' | '>' | '>=' | '==' | '!=';
export interface Comparison {
  key: string;
  op: CompareOp;
  value: number | string | boolean;
}
/** Either of the groups (||), each all of its comparisons (&&). No brackets. */
export interface Condition {
  any: { all: Comparison[] }[];
}

const TOKEN = /\s*(?:(&&|\|\|)|(<=|>=|==|!=|<|>)|('[^']*'|"[^"]*")|(-?\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_.]*))/y;

/**
 * Parse "key op value [&& ...] [|| ...]". Values: numbers, 'strings', true / false.
 * The key is kept as written; the recipe check resolves it against the registry.
 */
export function parseCondition(text: string): { ok: true; cond: Condition } | { ok: false; error: string } {
  type Tok = { kind: 'logic' | 'op' | 'str' | 'num' | 'id'; text: string; at: number };
  const toks: Tok[] = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < text.length) {
    if (/^\s*$/.test(text.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(text);
    if (!m) return { ok: false, error: `can't read "${text.slice(pos).trim()}" (at character ${pos + 1})` };
    const at = m.index + m[0].length - m[0].trimStart().length;
    if (m[1]) toks.push({ kind: 'logic', text: m[1], at });
    else if (m[2]) toks.push({ kind: 'op', text: m[2], at });
    else if (m[3]) toks.push({ kind: 'str', text: m[3].slice(1, -1), at });
    else if (m[4]) toks.push({ kind: 'num', text: m[4], at });
    else toks.push({ kind: 'id', text: m[5], at });
    pos = TOKEN.lastIndex;
  }
  if (toks.length === 0) return { ok: false, error: 'empty condition' };
  const cond: Condition = { any: [{ all: [] }] };
  let i = 0;
  for (;;) {
    const [k, op, v] = [toks[i], toks[i + 1], toks[i + 2]];
    if (!k || k.kind !== 'id' || k.text === 'true' || k.text === 'false') return { ok: false, error: `expected a key at character ${(k?.at ?? text.length) + 1}` };
    if (!op || op.kind !== 'op') return { ok: false, error: `expected <, <=, >, >=, == or != after '${k.text}'` };
    if (!v || (v.kind !== 'num' && v.kind !== 'str' && !(v.kind === 'id' && (v.text === 'true' || v.text === 'false')))) {
      return { ok: false, error: `expected a number, 'text', true or false after '${k.text} ${op.text}'` };
    }
    const value = v.kind === 'num' ? Number(v.text) : v.kind === 'str' ? v.text : v.text === 'true';
    cond.any[cond.any.length - 1].all.push({ key: k.text, op: op.text as CompareOp, value });
    i += 3;
    if (i >= toks.length) return { ok: true, cond };
    const logic = toks[i];
    if (logic.kind !== 'logic') return { ok: false, error: `expected && or || at character ${logic.at + 1}` };
    if (logic.text === '||') cond.any.push({ all: [] });
    i += 1;
  }
}

/** Does the condition hold on this bus? (Keys already checked by validateRecipe.) */
export function evalCondition(cond: Condition, read: BusReader): boolean {
  return cond.any.some((g) =>
    g.all.every((c) => {
      const key = resolveKey(c.key);
      if (!key) return false;
      if (typeof c.value === 'string') {
        const eq = read.get(key) === c.value;
        return c.op === '==' ? eq : c.op === '!=' ? !eq : false;
      }
      const a = read.num(key);
      const b = typeof c.value === 'boolean' ? (c.value ? 1 : 0) : c.value;
      switch (c.op) {
        case '<':
          return a < b;
        case '<=':
          return a <= b;
        case '>':
          return a > b;
        case '>=':
          return a >= b;
        case '==':
          return a === b;
        case '!=':
          return a !== b;
      }
    }),
  );
}

// ── Mounting ─────────────────────────────────────────────────────────────────

/** One module as mounted on a boat, after the recipe is read. */
export interface MountedModule {
  /** Socket path ('helm/slot3'): its name on this boat and its key in VesselState.modules. */
  path: string;
  socket: Socket;
  def: ModuleDefinition;
  config: unknown;
  /** Port -> bus key, after rebinding. */
  keys: Record<string, BusKey>;
}

/**
 * Walk the recipe's mounts (children after their parent), collecting the modules and
 * every problem met on the way.
 */
export function flattenMounts(recipe: Recipe, hulls: HullLibrary, modules: ModuleLibrary): { mounted: MountedModule[]; errors: string[] } {
  const errors: string[] = [];
  const mounted: MountedModule[] = [];
  const hull = hulls.get(recipe.hull);
  if (!hull) return { mounted, errors: [`unknown hull '${recipe.hull}'`] };

  const walk = (mounts: readonly Mount[], sockets: readonly Socket[], parentPath: string, parentName: string) => {
    const used = new Set<string>();
    for (const m of mounts) {
      const path = socketPath(parentPath, m.socket);
      const socket = sockets.find((s) => s.id === m.socket);
      if (!socket) {
        const have = sockets.map((s) => s.id).join(', ') || 'none';
        errors.push(`${path}: ${parentName} has no socket '${m.socket}' (sockets: ${have})`);
        continue;
      }
      if (used.has(m.socket)) {
        errors.push(`${path}: two modules on the same socket`);
        continue;
      }
      used.add(m.socket);
      const def = modules.get(m.module);
      if (!def) {
        errors.push(`${path}: unknown module '${m.module}'`);
        continue;
      }
      const config = mergeConfig(def, m.config);
      for (const e of def.validateConfig?.(config) ?? []) errors.push(`${path}: ${def.id}: ${e}`);
      const ok = fits(def, socket, config);
      if (!ok.ok) errors.push(`${path}: ${ok.why}`);
      const bind: Record<string, BusKey> = {};
      for (const [port, name] of Object.entries(m.bind ?? {})) {
        if (!(port in def.ports)) {
          errors.push(`${path}: ${def.id} has no port '${port}' (ports: ${Object.keys(def.ports).join(', ') || 'none'})`);
          continue;
        }
        const key = resolveKey(name);
        if (!key) errors.push(`${path}: port '${port}' bound to unknown key '${name}'${suggest(name)}`);
        else bind[port] = key;
      }
      const keys = resolvePorts(def, bind);
      for (const port of Object.keys(def.ports)) if (!keys[port]) errors.push(`${path}: ${def.id}'s '${port}' port must be bound to a key in the recipe ("bind": { "${port}": "..." })`);
      mounted.push({ path, socket, def, config, keys });
      if (m.modules?.length) {
        const own = def.sockets?.(config) ?? [];
        if (own.length === 0) errors.push(`${path}: ${def.id} has no sockets for the ${m.modules.length} module(s) listed under it`);
        else walk(m.modules, own, path, def.id);
      }
    }
  };
  walk(recipe.modules, hull.sockets, '', hull.id);
  return { mounted, errors };
}

/** Does a provision cover a requirement? */
function covers(p: Provision, r: Requirement): boolean {
  if ('fuel' in r) return 'fuel' in p && p.fuel === r.fuel;
  if ('gear' in r) return 'gear' in p && p.gear === r.gear;
  if (!('power' in p) || p.power !== r.power) return false;
  if (r.power === 'electrical' && r.circuit) return p.power === 'electrical' && !!p.circuits?.includes(r.circuit);
  return true;
}

const GEAR_WORDS: Record<GearKind, string> = {
  tenderCrane: 'a tender crane',
  towWinch: 'a tow winch',
  towPoint: 'a tow point (a stern roller)',
  trawlGantry: 'a trawl gantry (an A-frame)',
  trawl: 'a trawl',
  anchor: 'an anchor',
};

function describeNeed(r: Requirement): string {
  if ('fuel' in r) return `${r.fuel} fuel`;
  if ('gear' in r) return GEAR_WORDS[r.gear];
  if (r.power === 'electrical') return r.circuit ? `12 V on the '${r.circuit}' circuit` : '12 V';
  if (r.power === 'hydraulic') return 'deck hydraulic pressure';
  return "the engine's power take-off";
}

/**
 * Check a recipe against the hulls, modules and the bus registry. Every problem, each one
 * plain sentence starting with where it is. Empty: good to build.
 *
 * Checked: the hull and each module exist; each socket exists, takes this module and
 * isn't used twice; configs; port bindings; every required read port has a writer (a
 * module on this boat, or the boat's own motion / not-yet-converted code); no two modules
 * write the same state key, and none writes a key the boat works out itself; every need
 * (12 V on a circuit, hydraulics, fuel) is met; interlocks parse, name real keys and
 * compare like with like.
 */
export function validateRecipe(recipe: Recipe, lib: { hulls: HullLibrary; modules: ModuleLibrary }): string[] {
  const { mounted, errors } = flattenMounts(recipe, lib.hulls, lib.modules);
  const hull = lib.hulls.get(recipe.hull);
  if (!hull) return errors;

  // Who writes what.
  const writers = new Map<BusKey, string[]>();
  for (const m of mounted) {
    for (const [port, p] of Object.entries(m.def.ports)) {
      const key = m.keys[port];
      if (p.dir !== 'write' || !key) continue;
      const spec = specOf(key);
      if (spec.kind === 'state' && spec.writer === 'core') errors.push(`${m.path}: ${m.def.id} writes '${key}', which the boat works out from her own motion`);
      else if (spec.kind === 'state' && spec.writer === 'legacy') {
        errors.push(`${m.path}: ${m.def.id} writes '${key}', but the registry says today's code still writes it (set its writer to 'module' when this module takes it over)`);
      }
      writers.set(key, [...(writers.get(key) ?? []), m.path]);
    }
  }
  for (const [key, paths] of writers) {
    if (specOf(key).kind === 'state' && paths.length > 1) errors.push(`${paths.join(' and ')}: both write '${key}'; one value can have only one writer (rebind one of them)`);
  }

  // Everything read must be written by something.
  for (const m of mounted) {
    for (const [port, p] of Object.entries(m.def.ports)) {
      const key = m.keys[port];
      if (p.dir !== 'read' || p.required === false || !key) continue;
      if (specOf(key).writer === 'module' && !writers.has(key)) errors.push(`${m.path}: ${m.def.id} reads '${key}', but nothing on this boat writes it`);
    }
  }

  // Needs and provisions.
  const provided: Provision[] = [...(hull.provides ?? []), ...mounted.flatMap((m) => m.def.provides?.(m.config) ?? [])];
  for (const m of mounted) {
    for (const r of m.def.needs?.(m.config) ?? []) {
      if (!provided.some((p) => covers(p, r))) errors.push(`${m.path}: ${m.def.id} needs ${describeNeed(r)}, and nothing on this boat gives it`);
    }
  }

  // Interlocks.
  (recipe.interlocks ?? []).forEach((il, i) => {
    const where = `interlock ${i + 1}`;
    const parsed = parseCondition(il.when);
    if (!parsed.ok) errors.push(`${where}: ${parsed.error}`);
    else {
      for (const c of parsed.cond.any.flatMap((g) => g.all)) {
        const key = resolveKey(c.key);
        if (!key) {
          errors.push(`${where}: unknown key '${c.key}'${suggest(c.key)}`);
          continue;
        }
        const spec = specOf(key);
        if (spec.type === 'enum') {
          if (typeof c.value !== 'string') errors.push(`${where}: '${c.key}' is one of ${spec.values?.join(' / ')}; compare it with a 'name'`);
          else if (!spec.values?.includes(c.value)) errors.push(`${where}: '${c.key}' is never '${c.value}' (it is one of ${spec.values?.join(' / ')})`);
          else if (c.op !== '==' && c.op !== '!=') errors.push(`${where}: '${c.key}' can only be compared with == or !=`);
        } else if (typeof c.value === 'string') errors.push(`${where}: '${c.key}' is a ${spec.type}, not a name`);
        else if (spec.type === 'boolean' && c.op !== '==' && c.op !== '!=') errors.push(`${where}: '${c.key}' is on/off; compare it with == or !=`);
      }
    }
    if (!il.limit && !il.disable?.length) errors.push(`${where}: does nothing (give it a limit or controls to disable)`);
    if (il.limit) {
      const key = resolveKey(il.limit.key);
      if (!key) errors.push(`${where}: unknown key '${il.limit.key}'${suggest(il.limit.key)}`);
      else if (specOf(key).type !== 'number') errors.push(`${where}: can only limit a number, and '${il.limit.key}' is a ${specOf(key).type}`);
    }
    for (const d of il.disable ?? []) {
      if (!/^control:.+/.test(d)) errors.push(`${where}: '${d}' should be 'control:<control id>'`);
    }
  });
  return errors;
}

/** " (did you mean 'x'?)" for a near miss among the keys and aliases, else "". */
function suggest(name: string): string {
  let best = '';
  let bestD = 4;
  for (const k of allKeys()) {
    for (const cand of [k, ...(specOf(k).aliases ?? [])]) {
      const d = editDistance(name, cand);
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
  }
  return best ? ` (did you mean '${best}'?)` : '';
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// ── Loading from JSON ────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A recipe from parsed JSON, checked for shape (not yet against the libraries: that's
 * validateRecipe). Unknown fields are refused, so a misspelt field isn't silently ignored.
 */
export function parseRecipe(json: unknown): { recipe: Recipe } | { errors: string[] } {
  const errors: string[] = [];
  if (!isObj(json)) return { errors: ['a recipe is a JSON object'] };
  const known = (o: Record<string, unknown>, fields: string[], where: string) => {
    for (const k of Object.keys(o)) if (!fields.includes(k)) errors.push(`${where}: unknown field '${k}'`);
  };
  known(json, ['id', 'version', 'name', 'hull', 'modules', 'interlocks'], 'recipe');
  for (const f of ['id', 'name', 'hull'] as const) if (typeof json[f] !== 'string') errors.push(`recipe: '${f}' should be text`);
  if (typeof json.version !== 'number') errors.push(`recipe: 'version' should be a number`);
  const mount = (m: unknown, where: string) => {
    if (!isObj(m)) return errors.push(`${where}: a mount is an object`);
    known(m, ['socket', 'module', 'config', 'bind', 'modules'], where);
    if (typeof m.socket !== 'string') errors.push(`${where}: 'socket' should be text`);
    if (typeof m.module !== 'string') errors.push(`${where}: 'module' should be text`);
    if (m.config !== undefined && !isObj(m.config)) errors.push(`${where}: 'config' should be an object`);
    if (m.bind !== undefined && (!isObj(m.bind) || Object.values(m.bind).some((v) => typeof v !== 'string'))) errors.push(`${where}: 'bind' maps port names to key names`);
    if (m.modules !== undefined) {
      if (!Array.isArray(m.modules)) errors.push(`${where}: 'modules' should be a list`);
      else m.modules.forEach((c, i) => mount(c, `${where}.modules[${i}]`));
    }
  };
  if (!Array.isArray(json.modules)) errors.push(`recipe: 'modules' should be a list`);
  else json.modules.forEach((m, i) => mount(m, `modules[${i}]`));
  if (json.interlocks !== undefined) {
    if (!Array.isArray(json.interlocks)) errors.push(`recipe: 'interlocks' should be a list`);
    else
      json.interlocks.forEach((il, i) => {
        const where = `interlocks[${i}]`;
        if (!isObj(il)) return errors.push(`${where}: an interlock is an object`);
        known(il, ['when', 'limit', 'disable', 'message'], where);
        if (typeof il.when !== 'string') errors.push(`${where}: 'when' should be text`);
        if (il.limit !== undefined) {
          const l = il.limit;
          const range = Array.isArray(isObj(l) ? l.to : null) && (l as { to: unknown[] }).to.length === 2 && (l as { to: unknown[] }).to.every((n) => typeof n === 'number');
          if (!isObj(l) || typeof l.key !== 'string' || !(typeof l.to === 'number' || range)) errors.push(`${where}: 'limit' is { key, to: number or [min, max] }`);
        }
        if (il.disable !== undefined && (!Array.isArray(il.disable) || il.disable.some((d) => typeof d !== 'string'))) errors.push(`${where}: 'disable' is a list of 'control:<id>'`);
        if (il.message !== undefined && typeof il.message !== 'string') errors.push(`${where}: 'message' should be text`);
      });
  }
  return errors.length ? { errors } : { recipe: json as unknown as Recipe };
}
