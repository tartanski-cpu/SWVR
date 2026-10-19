/**
 * The career (phase 1, owner request): what the work is for. Plain shared state
 * (WorldState.career), host-authoritative like the rest; the host saves it in its browser.
 *
 *   money       every job pays (cargo by distance, fish boxes, salvage logs, debris cleared,
 *               tows, rescues, fires), and fuel and oil cost. You can go into the red
 *               (the harbour gives credit), but you can't buy upgrades on credit.
 *   ledger      the last `ledgerKeep` entries (clock, what, amount): the menu's Office tab
 *               and the duty board show them.
 *   reputation  per port, 0..100: earned by work for that port (deliveries to it, catch
 *               landed or logs sold there, tows and survivors brought in), lost by cargo
 *               lost overboard and contracts failed. It raises that port's pay (up to
 *               +repPayBonus at 100) and unlocks its bigger contracts.
 *   contracts   each port's harbour office offers `perPort` jobs, refreshed every `refresh`
 *               s: deliver N cargo items to it, land N boxes of fish there, or sell N
 *               salvage logs there, within a time limit, for a bonus on top of the usual
 *               pay. Accept one at the port (the boat alongside or anchored there); one at a
 *               time. Late: it's failed (reputation down).
 *   upgrades    bought at any port: radar (debris and floating crates on the plotter), a
 *               heavy towing post (the towline holds more), a bigger trawl (fills faster),
 *               an ice machine (fish fetch more). Some need reputation first.
 *
 * Phase 2: damage and wear (vessel/wear.ts) are mended in port for money (careerRepair), and
 * the boat's condition is kept with the career; rescues, tows and fires in heavy weather
 * pay danger money (`stormBonus`).
 *
 * Jobs report here through earn() from where they finish (cargo.ts, salvage.ts, tow.ts,
 * rescue.ts, fire.ts); refuelling and oil are noticed in stepCareer().
 */
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import { homeVessel, type WorldState } from '../core/world';
import { PORTS, type PortDef } from '../world/archipelago';
import { fuelBerthAt } from '../world/geography';
import type { VesselState } from '../vessel/vesselState';
import { sayRadio } from '../rescue/rescue';
import { cargoPortAt } from '../cargo/cargo';
import { significantWaveHeight } from '../ocean/waves';
import type { TutorialState } from './tutorial';
import { gearOf, hasModule } from '../boats/sims';

export type JobKind = 'cargo' | 'fish' | 'log' | 'debris' | 'tow' | 'rescue' | 'fire' | 'crate' | 'catch' | 'rod';
export type ContractKind = 'cargo' | 'fish' | 'logs';

export interface LedgerEntry {
  /** Ship's clock "HH:MM", what for, and the amount (+ earned, - spent). */
  clock: string;
  text: string;
  amount: number;
}

export interface Contract {
  id: string;
  /** The port it's for (its office offers it; the work is done there). */
  port: string;
  kind: ContractKind;
  count: number;
  done: number;
  bonus: number;
  /** Time allowed (s), and once accepted, the world time it's due. */
  allowed: number;
  due?: number;
  /** Reputation at that port needed to take it. */
  minRep: number;
}

export interface CareerState {
  money: number;
  ledger: LedgerEntry[];
  rep: Record<string, number>;
  upgrades: string[];
  offers: Contract[];
  active: Contract | null;
  /** World time the offers are refreshed next (s). */
  offersAt: number;
  /** Bumped on every change (views redraw, the host saves). */
  seq: number;
  /** Counters for ids and the hash. */
  n: number;
  /** Refuelling under way: litres taken so far (billed when it stops); the oil level last tick. */
  fuelTaken: number;
  lastFuel?: number;
  lastOil?: number;
  contractsDone: number;
  /** The workboat's condition as last saved (phase 2: it carries over to the next session). */
  boat?: { damage: number; wear: number };
  /** The guided first voyage (phase 3, career/tutorial.ts); absent: none. */
  tutorial?: TutorialState;
}

export function createCareer(): CareerState {
  return { money: CONFIG.career.startMoney, ledger: [], rep: {}, upgrades: [], offers: [], active: null, offersAt: 0, seq: 0, n: 0, fuelTaken: 0, contractsDone: 0 };
}

function hash(c: CareerState): number {
  const n = ++c.n;
  const s = Math.sin(n * 57.31 + 9.71) * 43758.5453;
  return s - Math.floor(s);
}

function clock(world: WorldState): string {
  const t = world.environment.timeOfDay;
  const h = Math.floor(t) % 24;
  const m = Math.floor((t - Math.floor(t)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const portName = (id: string | null | undefined): string => PORTS.find((p) => p.id === id)?.name.replace(' (anchorage)', '') ?? 'the harbour';

/** Format money: "£1,240" (negative: "-£80"). */
export function money(n: number): string {
  // Thousands by hand: toLocaleString goes through Intl, slow for something drawn each frame.
  const v = Math.round(n);
  const digits = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${v < 0 ? '-' : ''}£${digits}`;
}

export function repOf(c: CareerState | undefined, port: string | null | undefined): number {
  return (port && c?.rep[port]) || 0;
}

export function hasUpgrade(world: WorldState, id: string): boolean {
  return !!world.career?.upgrades.includes(id);
}

/**
 * The workboat's equipment the yard fits (CONFIG.career.upgrades with `fit`) that these
 * upgrades haven't got: the upgrade ids. A new career has none of it (the starter boat).
 */
export function equipmentWithout(upgrades: readonly string[]): string[] {
  return CONFIG.career.upgrades.filter((u) => u.fit && !upgrades.includes(u.id)).map((u) => u.id);
}

/** The sockets of the workboat's recipe left empty for that equipment (boats/sims.ts useWorkboatFit). */
export function socketsWithout(equipment: readonly string[]): string[] {
  return CONFIG.career.upgrades.filter((u) => u.fit && equipment.includes(u.id)).flatMap((u) => u.fit!);
}

/** The pay factor at a port: 1 at no reputation, 1 + repPayBonus at 100. */
export function payFactor(c: CareerState, port: string | null | undefined): number {
  return 1 + (CONFIG.career.repPayBonus * repOf(c, port)) / 100;
}

function post(world: WorldState, c: CareerState, text: string, amount: number): void {
  c.money += amount;
  c.ledger.unshift({ clock: clock(world), text, amount });
  c.ledger.length = Math.min(c.ledger.length, CONFIG.career.ledgerKeep);
  c.seq += 1;
}

function addRep(c: CareerState, port: string | null | undefined, d: number): void {
  if (!port) return;
  c.rep[port] = Math.max(0, Math.min(CONFIG.career.rep.max, (c.rep[port] ?? 0) + d));
}

/** What a port's buyer pays over the odds (PortDef.economy.buys), by what's sold: 1 where nothing is set. */
function buyerFactor(port: string | null | undefined, kind: JobKind): number {
  const buys = PORTS.find((p) => p.id === port)?.economy?.buys;
  if (!buys) return 1;
  const key = kind === 'fish' || kind === 'rod' ? 'fish' : kind === 'catch' ? 'shellfish' : kind === 'log' ? 'log' : kind === 'cargo' ? 'cargo' : null;
  return (key && buys[key]) || 1;
}

/** What a job pays before the port's reputation factor. */
function basePay(world: WorldState, kind: JobKind, o: EarnOpts): number {
  const p = CONFIG.career.pay;
  switch (kind) {
    case 'cargo': {
      const a = PORTS.find((x) => x.id === o.from);
      const b = PORTS.find((x) => x.id === o.port);
      const km = a && b ? Math.hypot(a.x - b.x, a.z - b.z) / 1000 : 1;
      return p.cargoBase + p.cargoPerKm * km;
    }
    case 'fish':
      return p.fishBox * (hasUpgrade(world, 'ice') ? p.iceFactor : 1);
    case 'log':
      return p.log;
    case 'debris':
      return p.debris;
    case 'crate':
      return p.crate;
    case 'tow':
      return p.tow[o.what ?? ''] ?? p.towDefault;
    case 'rescue':
      return p.rescue + p.rescuePerPerson * (o.people ?? 0);
    case 'fire':
      return p.fire;
    case 'catch':
      // A pot's crab and lobster, by the animal (lobster fetches far more).
      return (o.lobster ?? 0) * CONFIG.potting.price.lobster + (o.crab ?? 0) * CONFIG.potting.price.crab;
    case 'rod':
      // The rod's bucket, by weight (fishing/rod.ts).
      return Math.round((o.kg ?? 0) * CONFIG.rod.pricePerKg);
  }
}

export interface EarnOpts {
  /** The port the work is credited to (reputation, contracts, pay factor). */
  port?: string | null;
  /** Cargo: where it came from. Tow: the def id. Rescue: survivors brought in. */
  from?: string;
  what?: string;
  people?: number;
  /** The rod's bucket: its weight (kg). */
  kg?: number;
  /** A pot's catch sold: how many of each. */
  lobster?: number;
  crab?: number;
  /** The ledger line. */
  text: string;
}

const REP_GAIN: Record<JobKind, () => number> = {
  cargo: () => CONFIG.career.rep.cargo,
  fish: () => CONFIG.career.rep.fish,
  log: () => CONFIG.career.rep.log,
  debris: () => CONFIG.career.rep.debris,
  crate: () => CONFIG.career.rep.debris,
  tow: () => CONFIG.career.rep.tow,
  rescue: () => CONFIG.career.rep.rescue,
  fire: () => CONFIG.career.rep.fire,
  catch: () => CONFIG.career.rep.fish,
  rod: () => 1,
};

/** A job done: pay it, raise the port's reputation, count it toward the contract. */
export function earn(world: WorldState, kind: JobKind, o: EarnOpts): void {
  const c = (world.career ??= createCareer());
  // Danger money: rescues, tows and fires in heavy weather pay more (phase 2).
  const storm = (kind === 'rescue' || kind === 'tow' || kind === 'fire') && heavyWeather(world);
  const amount = Math.round(basePay(world, kind, o) * payFactor(c, o.port) * buyerFactor(o.port, kind) * (storm ? 1 + CONFIG.career.stormBonus : 1));
  post(world, c, storm ? `${o.text} (heavy weather)` : o.text, amount);
  addRep(c, o.port, REP_GAIN[kind]());
  // The contract: the right kind of work, at its port.
  const k = c.active;
  const counts = k && k.port === o.port && ((k.kind === 'cargo' && kind === 'cargo') || (k.kind === 'fish' && kind === 'fish') || (k.kind === 'logs' && kind === 'log'));
  if (k && counts) {
    k.done += 1;
    if (k.done >= k.count) {
      c.active = null;
      c.contractsDone += 1;
      post(world, c, `Contract done: ${contractText(k)}`, k.bonus);
      addRep(c, k.port, CONFIG.career.rep.contract);
      sayRadio(world, 'info', `${portName(k.port)} harbour office: contract complete, skipper. ${money(k.bonus)} bonus paid to your account.`);
    }
  }
}

/** A squall, or a big sea: danger money for the crews that go out. */
export function heavyWeather(world: WorldState): boolean {
  return world.environment.weather?.preset === 'Squall' || significantWaveHeight(world.environment.waves) > CONFIG.career.stormHs;
}

/** The boatyard at the port she's in (alongside, or anchored in its bay), if that port has one. */
export function yardAt(world: WorldState): { yard: (typeof CONFIG.boatyards)[number]; port: PortDef } | null {
  const id = officeAt(world);
  const yard = CONFIG.boatyards.find((y) => y.port === id);
  const port = PORTS.find((p) => p.id === id);
  return yard && port ? { yard, port } : null;
}

/** The yard's repair rates: a factor on the standard (PortDef.economy.repairs); 1 away from any yard. */
function repairFactor(world: WorldState, what: 'hull' | 'engine'): number {
  const r = yardAt(world)?.port.economy?.repairs;
  return r ? r[what] : 1;
}

/** What repairs cost now: the hull (by damage) and an engine overhaul (by wear), at this yard's rates. */
export function repairCost(world: WorldState, what: 'hull' | 'engine'): number {
  const v = workboat(world);
  if (!v) return 0;
  const r = CONFIG.career.repairs;
  const f = repairFactor(world, what);
  return what === 'hull' ? Math.round((v.damage ?? 0) * 100 * r.hullPerPercent * f) : Math.round((v.engine.wear ?? 0) * 100 * r.enginePerPercent * f);
}

/** Why a repair can't be done now, or null. */
export function repairBlocker(world: WorldState, what: 'hull' | 'engine'): string | null {
  const v = workboat(world);
  if (!v || repairCost(world, what) < 1) return 'Nothing to do';
  const y = yardAt(world);
  if (!y) return 'Bring her into a boatyard';
  if (y.port.economy?.repairs === false) return 'No repairs here';
  if (what === 'engine' && v.engine.phase !== 'off') return 'Stop the engine first';
  return null;
}

/** Money out (fuel, oil, losses). */
export function spend(world: WorldState, amount: number, text: string): void {
  const c = (world.career ??= createCareer());
  post(world, c, text, -Math.round(amount));
}

/** Cargo from a port's stock lost overboard: it's paid for, and that port remembers. */
export function cargoLost(world: WorldState, from: string): void {
  const c = (world.career ??= createCareer());
  if (!PORTS.some((p) => p.id === from)) return;
  post(world, c, `Cargo lost overboard (${portName(from)} stock)`, -CONFIG.career.costs.lostCargo);
  addRep(c, from, CONFIG.career.rep.lostCargo);
}

export function contractText(k: Contract): string {
  const where = portName(k.port);
  if (k.kind === 'cargo') return `deliver ${k.count} cargo to ${where}`;
  if (k.kind === 'fish') return `land ${k.count} boxes of fish at ${where}`;
  return `sell ${k.count} salvage ${k.count === 1 ? 'log' : 'logs'} at ${where}`;
}

/** New offers at every port (the old ones go). */
function refreshOffers(world: WorldState, c: CareerState): void {
  const cfg = CONFIG.career.contracts;
  c.offers = [];
  for (const p of PORTS) {
    for (let i = 0; i < cfg.perPort; i++) {
      const kinds: ContractKind[] = ['cargo', 'fish', 'logs'];
      const kind = kinds[Math.floor(hash(c) * kinds.length)];
      const k = cfg.kinds[kind];
      const tier = Math.floor(hash(c) * k.counts.length);
      const count = k.counts[tier];
      c.offers.push({
        id: `k${c.n}`,
        port: p.id,
        kind,
        count,
        done: 0,
        bonus: Math.round((k.bonusPer * count) / 10) * 10,
        allowed: k.secondsPer * count,
        minRep: cfg.tierRep[tier],
      });
    }
  }
  c.offersAt = world.time + cfg.refresh;
  c.seq += 1;
}

function workboat(world: WorldState): VesselState | undefined {
  return homeVessel(world);
}

/** The port whose office she's at: alongside its berth or anchored in its bay (cargo.ts's test). */
export function officeAt(world: WorldState): string | null {
  const v = workboat(world);
  return v ? (cargoPortAt(v)?.id ?? null) : null;
}

/** One tick: the bills (fuel taken, oil), contract deadlines, the offers. */
export function stepCareer(world: WorldState): void {
  const c = (world.career ??= createCareer());
  const v = workboat(world);
  if (c.offersAt <= world.time) refreshOffers(world, c);
  if (v) {
    // The boatyard's bigger fuel tank (fuelTank.ts reads it).
    const base = gearOf(v, 'diesel')?.engine.fuel.tankL;
    if (base && c.upgrades.includes('bigTank')) v.engine.tankL = Math.round(base * CONFIG.career.bigTankFactor);
    else delete v.engine.tankL;
    // Fuel: count what flows in while refuelling, bill it when the hose comes off.
    const fuel = v.engine.fuelL;
    if (v.refuelling && c.lastFuel !== undefined && fuel > c.lastFuel) c.fuelTaken += fuel - c.lastFuel;
    if (!v.refuelling && c.fuelTaken > 0.5) {
      // At the port's price, where it has one (PortDef.economy.fuelPrice).
      const perL = fuelBerthAt(v.position[0], v.position[2])?.economy?.fuelPrice ?? CONFIG.career.costs.fuelPerL;
      spend(world, c.fuelTaken * perL, `Fuel, ${Math.round(c.fuelTaken)} L`);
      c.fuelTaken = 0;
    }
    c.lastFuel = fuel;
    // Oil: a top-up (the level jumps back up) is a can of oil.
    const oil = v.engine.oil;
    if (oil !== undefined && c.lastOil !== undefined && oil - c.lastOil > 0.05) spend(world, CONFIG.career.costs.oil, 'Engine oil');
    c.lastOil = oil;
    // Her condition, kept with the career (saved when it changes by a percent or more).
    const damage = v.damage ?? 0;
    const wear = v.engine.wear ?? 0;
    if (!c.boat || Math.abs(c.boat.damage - damage) > 0.01 || Math.abs(c.boat.wear - wear) > 0.01 || (damage === 0 && c.boat.damage > 0) || (wear === 0 && c.boat.wear > 0)) {
      c.boat = { damage, wear };
      c.seq += 1;
    }
  }
  const k = c.active;
  if (k?.due !== undefined && world.time > k.due) {
    c.active = null;
    addRep(c, k.port, CONFIG.career.rep.contractFail);
    c.seq += 1;
    sayRadio(world, 'info', `${portName(k.port)} harbour office: we had to give that job to someone else, skipper (${contractText(k)}).`);
  }
}

/** Why an upgrade can't be bought now, or null. */
export function buyBlocker(world: WorldState, id: string): string | null {
  const c = world.career;
  const u = CONFIG.career.upgrades.find((x) => x.id === id);
  if (!c || !u) return 'Unknown';
  if (c.upgrades.includes(id)) return 'Fitted';
  // Gear for something she hasn't got (the crane's motion compensation, on a boat without a crane).
  const v = workboat(world);
  if (u.needs && !(v && hasModule(v.defId, u.needs))) return `Needs ${u.needsName ?? u.needs}`;
  // The yard fits the workboat's equipment to the workboat only.
  if (u.fit && v?.defId !== 'workboat') return 'Workboat only';
  const y = yardAt(world);
  if (!y) return 'Bring her into a boatyard';
  // Each yard sells its own list (PortDef.economy.sells; none listed: everything).
  const sells = y.port.economy?.sells;
  if (sells && !sells.includes(id)) {
    const elsewhere = PORTS.find((p) => p.economy?.sells?.includes(id) && CONFIG.boatyards.some((b) => b.port === p.id));
    return elsewhere ? `Fitted at ${elsewhere.name}` : 'Not sold here';
  }
  const best = Math.max(0, ...Object.values(c.rep));
  if (best < u.minRep) return `Needs reputation ${u.minRep}`;
  if (c.money < u.price) return 'Not enough money';
  return null;
}

/** Why a contract can't be taken now, or null. */
export function acceptBlocker(world: WorldState, k: Contract): string | null {
  const c = world.career;
  if (!c) return 'No office';
  if (c.active) return 'One contract at a time';
  if (officeAt(world) !== k.port) return `At ${portName(k.port)} only`;
  if (repOf(c, k.port) < k.minRep) return `Needs reputation ${k.minRep} here`;
  return null;
}

/**
 * Career intents (targetId: environment): careerAccept ref=offer id, careerAbandon,
 * careerBuy ref=upgrade id. Checked here (the host), whoever sent them.
 */
export function applyCareerIntent(world: WorldState, intent: Intent): void {
  const c = (world.career ??= createCareer());
  switch (intent.control) {
    case 'careerAccept': {
      const k = c.offers.find((o) => o.id === intent.ref);
      if (!k || acceptBlocker(world, k)) return;
      c.offers = c.offers.filter((o) => o !== k);
      c.active = { ...k, done: 0, due: world.time + k.allowed };
      c.seq += 1;
      sayRadio(world, 'info', `${portName(k.port)} harbour office: it's yours, skipper - ${contractText(k)}. ${Math.round(k.allowed / 60)} minutes.`);
      break;
    }
    case 'careerAbandon':
      if (c.active) {
        addRep(c, c.active.port, CONFIG.career.rep.contractFail);
        c.active = null;
        c.seq += 1;
      }
      break;
    case 'careerBuy': {
      const u = CONFIG.career.upgrades.find((x) => x.id === intent.ref);
      if (!u || buyBlocker(world, u.id)) return;
      c.upgrades.push(u.id);
      post(world, c, `Fitted: ${u.name}`, -u.price);
      break;
    }
    case 'careerRepair': {
      // In port: the yard mends the hull (and pumps her out) or overhauls the engine. Repairs
      // can go on credit - you have to be able to go back out.
      const what = intent.ref === 'engine' ? 'engine' : 'hull';
      const v = workboat(world);
      if (!v || repairBlocker(world, what)) return;
      const cost = repairCost(world, what);
      if (what === 'hull') {
        v.damage = 0;
        if (v.bilge !== undefined) v.bilge = 0;
      } else v.engine.wear = 0;
      post(world, c, what === 'hull' ? 'Hull repaired' : 'Engine overhauled', -cost);
      break;
    }
    case 'careerDebugDamage': {
      const v = workboat(world);
      if (v && v.damage !== undefined) v.damage = Math.min(1, v.damage + 0.3);
      if (v && v.engine.wear !== undefined) v.engine.wear = Math.min(1, v.engine.wear + 0.3);
      c.seq += 1;
      break;
    }
    case 'careerDebugCash':
      post(world, c, 'Debug: cash', 5000);
      for (const p of PORTS) addRep(c, p.id, 25);
      break;
  }
}

export function isCareerIntent(control: string): boolean {
  return control.startsWith('career');
}

/** A saved career (from localStorage), checked loosely: anything malformed gives null. */
export function parseCareer(raw: string | null): CareerState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<CareerState>;
    if (typeof o.money !== 'number' || !Array.isArray(o.ledger) || typeof o.rep !== 'object' || !Array.isArray(o.upgrades)) return null;
    const c = createCareer();
    c.money = o.money;
    c.ledger = o.ledger.filter((e) => e && typeof e.text === 'string' && typeof e.amount === 'number').slice(0, CONFIG.career.ledgerKeep);
    c.rep = Object.fromEntries(Object.entries(o.rep ?? {}).filter(([k, v]) => PORTS.some((p) => p.id === k) && typeof v === 'number'));
    c.upgrades = o.upgrades.filter((u) => CONFIG.career.upgrades.some((x) => x.id === u));
    // A career saved before the starter workboat (no `kit`) had her with all her equipment.
    if (typeof (o as { kit?: unknown }).kit !== 'number') for (const u of CONFIG.career.upgrades) if (u.fit && !c.upgrades.includes(u.id)) c.upgrades.push(u.id);
    c.contractsDone = typeof o.contractsDone === 'number' ? o.contractsDone : 0;
    if (o.tutorial && typeof o.tutorial.step === 'number') c.tutorial = { step: Math.max(0, Math.floor(o.tutorial.step)), base: 0, said: false };
    if (o.boat && typeof o.boat.damage === 'number' && typeof o.boat.wear === 'number') {
      c.boat = { damage: Math.max(0, Math.min(1, o.boat.damage)), wear: Math.max(0, Math.min(1, o.boat.wear)) };
    }
    return c;
  } catch {
    return null;
  }
}

/**
 * What's kept between sessions: money, ledger, reputation, upgrades (not offers or the
 * contract). `kit: 1`: the workboat's equipment is in the upgrades (see parseCareer).
 */
export function serializeCareer(c: CareerState): string {
  return JSON.stringify({ kit: 1, money: c.money, ledger: c.ledger, rep: c.rep, upgrades: c.upgrades, contractsDone: c.contractsDone, boat: c.boat, tutorial: c.tutorial ? { step: c.tutorial.step } : undefined });
}
