/**
 * Back from a dive (Submersible World's milestone M9; docs/dive-contract.md): the crew were
 * recovered by the support ship and Submersible World sends them back here with the dive's
 * results, one JSON envelope (base64url of its compact JSON) in the address's `mv`, as the
 * Timber game's (voyage/metaverse.ts). Its `id` is the handoff id issued at the launch
 * (App.ts goDive): counted once and only once (the same issued/consumed lists as Timber's).
 *
 *   what came up   salvage crates on the dive ship's deck, one per find (named: "Salvage:
 *                  her bower anchor"), as heavy as the find, real deadweight. Sold when she's
 *                  in port and stopped (`sellSalvage`, each tick in career.ts), or carried
 *                  ashore by hand: each at its price (`CONFIG.dive.prices`, by kind);
 *   the survey     paid at once: so much a point of coverage gained this dive, more for
 *                  naming the wreck (her name then goes on the charts, `foundNames`);
 *   her story      the cause of her loss found this dive pays a finding fee, more if it was
 *                  right at the first filing;
 *   the sub        afloat off the stern at the end of her dive, the frame out over the transom
 *                  (`subAfloat`): recover her by hand (WINCH UP, FRAME IN, WINCH DOWN).
 *
 * Plain functions over the world; the app takes the envelope off the address and calls them.
 */
import { CONFIG } from '../config';
import { earn, money } from '../career/career';
import type { WorldState } from '../core/world';
import { aboard, footprint, deckHeightAt, cargoPortAt, type CargoItem } from '../cargo/cargo';
import { deckSpot } from '../cargo/deck';
import type { VesselState } from '../vessel/vesselState';
import { consumeIssued } from '../voyage/metaverse';
import { DIVE_FRAME, diveGeometry, maxWire } from '../modules/diveFrame/index';
import { diveFrameOf } from '../modules/diveFrame/onBoat';
import { DIVE_SITES, siteWorld } from './diveSites';

export interface DiveReturn {
  v: 1;
  id: string;
  from: 'submersible';
  site: string;
  status: 'recovered';
  items: { kind: string; cls: 'small' | 'medium' | 'heavy'; name: string; kg: number }[];
  survey: { pct: number; gain: number; identified: boolean; name: string | null; namedNow: boolean };
  story: { clues: number; of: number; solved: boolean; solvedNow: boolean; firstTime: boolean };
  minutes: number;
  depth: number;
}

const num = (x: unknown, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo);
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');

/** An `mv` parameter read as a dive's return, or null (malformed, or someone else's: Timber's). Every field checked and bounded. */
export function decodeDiveReturn(text: string | null): DiveReturn | null {
  if (!text) return null;
  try {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const s = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const e = JSON.parse(new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0)))) as Partial<DiveReturn>;
    if (!e || e.v !== 1 || e.from !== 'submersible' || typeof e.id !== 'string' || typeof e.site !== 'string') return null;
    const items = (Array.isArray(e.items) ? e.items : []).slice(0, CONFIG.dive.maxItems).map((i) => ({
      kind: str(i?.kind, 24),
      cls: (['small', 'medium', 'heavy'] as const).find((c) => c === i?.cls) ?? 'small',
      name: str(i?.name, 60) || 'A find',
      kg: num(i?.kg, 0, 2000),
    }));
    const sv = e.survey ?? ({} as Partial<DiveReturn['survey']>);
    const st = e.story ?? ({} as Partial<DiveReturn['story']>);
    return {
      v: 1,
      id: str(e.id, 16),
      from: 'submersible',
      site: str(e.site, 64),
      status: 'recovered',
      items,
      survey: { pct: num(sv.pct, 0, 100), gain: num(sv.gain, 0, 100), identified: sv.identified === true, name: sv.name ? str(sv.name, 60) : null, namedNow: sv.namedNow === true },
      story: { clues: num(st.clues, 0, 99), of: num(st.of, 0, 99), solved: st.solved === true, solvedNow: st.solvedNow === true, firstTime: st.firstTime === true },
      minutes: num(e.minutes, 0, 1000),
      depth: num(e.depth, 0, 1000),
    };
  } catch {
    return null;
  }
}

/**
 * The dive's return taken off the address (and the address without it, to put back with
 * history.replaceState, so a refresh never replays it). Another game's `mv` is left alone.
 */
export function takeDiveReturn(href: string): { back: DiveReturn | null; clean: string | null } {
  const u = new URL(href);
  const back = decodeDiveReturn(u.searchParams.get('mv'));
  if (!back) return { back: null, clean: null };
  u.searchParams.delete('mv');
  return { back, clean: u.toString() };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** A return counted once: its id one we issued at the launch and haven't counted. Else null. */
export function consumeDiveReturn(back: DiveReturn | null, store: Store = localStorage): DiveReturn | null {
  return back && consumeIssued(back.id, store) ? back : null;
}

/** What a find fetches (£), by its kind, else its class. */
export function priceOf(item: { kind: string; cls: string }): number {
  const p = CONFIG.dive.prices as Record<string, number>;
  return p[item.kind] ?? p[item.cls] ?? p.small;
}

/** The survey and the story: what's paid on coming back aboard, line by line. */
export function divePayments(back: DiveReturn): { text: string; amount: number }[] {
  const f = CONFIG.dive.fees;
  const out: { text: string; amount: number }[] = [];
  if (back.survey.gain > 0) out.push({ text: `Survey of the wreck: ${Math.round(back.survey.gain)} points of coverage`, amount: Math.round(back.survey.gain * f.perCoveragePoint) });
  if (back.survey.namedNow && back.survey.name) out.push({ text: `Wreck identified: the ${back.survey.name}`, amount: f.identified });
  if (back.story.solvedNow) out.push({ text: `Cause of her loss found${back.story.firstTime ? ', first time' : ''}`, amount: f.finding + (back.story.firstTime ? f.firstTime : 0) });
  return out;
}

export const NAMES_KEY = 'swvr.dive.names';

/** The wrecks named so far by their dive site (the charts write their names). */
export function foundNames(store?: Pick<Storage, 'getItem'>): Record<string, string> {
  try {
    const raw = (store ?? localStorage).getItem(NAMES_KEY) ?? '{}';
    // (The charts ask every time they draw: parsed again only when it changes.)
    if (raw !== namesCache.raw) {
      const v = JSON.parse(raw);
      namesCache.raw = raw;
      namesCache.names = v && typeof v === 'object' ? (v as Record<string, string>) : {};
    }
    return namesCache.names;
  } catch {
    return {};
  }
}
const namesCache: { raw: string | null; names: Record<string, string> } = { raw: null, names: {} };

function rememberName(site: string, name: string, store: Store): void {
  try {
    store.setItem(NAMES_KEY, JSON.stringify({ ...foundNames(store), [site]: name }));
  } catch {
    // Not saved: the chart keeps saying "wreck".
  }
}

/** Her sub afloat off the stern, the frame out and the wire slack: as she was when the dive began. */
export function subAfloat(v: VesselState): boolean {
  const f = diveFrameOf(v);
  if (!f) return false;
  const g = diveGeometry(f.config);
  v.modules ??= {};
  v.modules[f.path] = { v: DIVE_FRAME.version, s: { luff: g.outDeg, wire: maxWire(f.config, g.outDeg) }, id: DIVE_FRAME.id };
  return true;
}

/** The salvage crate's cargo kind (CONFIG.cargo.kinds). */
const SALVAGE_KIND = () => CONFIG.cargo.kinds.findIndex((k) => k.name === 'Salvage');

/**
 * The dive's return applied to the world: crates on the boat's deck, the survey and the story
 * paid, the sub afloat astern. Returns what to tell the skipper.
 */
export function applyDiveReturn(world: WorldState, v: VesselState, back: DiveReturn, store: Store = localStorage): string {
  const kind = SALVAGE_KIND();
  const k = CONFIG.cargo.kinds[kind];
  // On deck forward of her sub's cradle (or about her middle, with no frame).
  const f = diveFrameOf(v);
  const [x0, z0] = f ? [1.2, diveGeometry(f.config).cradleLiftZ - 2.5] : [0, 0];
  let n = 0;
  let worth = 0;
  for (const it of back.items) {
    const proto = { kind, mass: k.mass } as CargoItem;
    const others = aboard(world, v.id).map((c) => {
      const at = c.at as Extract<CargoItem['at'], { vessel: string }>;
      const fp = footprint(c);
      return { x: at.pos[0], z: at.pos[2], r: Math.max(fp.hx, fp.hz) };
    });
    const spot = deckSpot(v.defId, footprint(proto), x0, z0, others);
    if (!spot) break;
    const value = priceOf(it);
    const item: CargoItem = {
      id: `salvage-${back.id}-${n}`,
      kind,
      // Its weight in air (its weight in water was lifted; out of the sea it's about 15% more), and at least a crate's.
      mass: Math.max(k.mass, Math.round(it.kg * CONFIG.dive.airFactor)),
      from: 'dive',
      to: 'any',
      salvage: { name: it.name, value },
      at: { vessel: v.id, pos: [spot.x, deckHeightAt(v.defId, spot.z), spot.z], yaw: 0, vel: [0, 0], lashed: false },
    };
    world.cargo[item.id] = item;
    n++;
    worth += value;
  }
  let paid = 0;
  for (const p of divePayments(back)) {
    earn(world, 'dive', { base: p.amount, text: p.text });
    paid += p.amount;
  }
  if (back.survey.identified && back.survey.name) rememberName(back.site, back.survey.name, store);
  // Still over the site (a Voyage comes back where she was): her sub afloat astern, to recover.
  // Elsewhere (a career comes back in port) the ship has recovered her and steamed home.
  const site = DIVE_SITES.find((x) => x.id === back.site);
  const at = site && siteWorld(site);
  const over = !!at && Math.hypot(at.x - v.position[0], at.z - v.position[2]) < CONFIG.dive.radius * 3;
  if (over) subAfloat(v);
  const parts = [`Back aboard from the dive (${Math.round(back.minutes)} min, ${Math.round(back.depth)} m).`];
  if (n) parts.push(`${n} salvage crate${n === 1 ? '' : 's'} on deck, worth about ${money(worth)}: a buyer takes them when she's stopped in port.`);
  if (paid) parts.push(`${money(paid)} paid for the survey and her story.`);
  if (over && f) parts.push('The sub is afloat astern: WINCH UP, FRAME IN, WINCH DOWN to bring her aboard.');
  return parts.join(' ');
}

/**
 * Each tick: the salvage on the boat's deck sold once she's been stopped in a port for
 * `CONFIG.dive.sellAfterS` (the buyer comes down to the quay), so you see it aboard first.
 */
export function sellSalvage(world: WorldState, v: VesselState): void {
  const crates = aboard(world, v.id).filter((c) => c.salvage);
  const port = crates.length && Math.hypot(v.linearVelocity[0], v.linearVelocity[2]) <= CONFIG.dive.sellBelowMS ? cargoPortAt(v) : null;
  if (!port) {
    stoppedSince.delete(v.id);
    return;
  }
  const since = stoppedSince.get(v.id);
  if (since === undefined || since > world.time) {
    stoppedSince.set(v.id, world.time);
    return;
  }
  if (world.time - since < CONFIG.dive.sellAfterS) return;
  stoppedSince.delete(v.id);
  for (const c of crates) {
    earn(world, 'salvage', { base: c.salvage!.value, port: port.id, text: `Salvage sold at ${port.name}: ${c.salvage!.name}` });
    delete world.cargo[c.id];
  }
}
/** When each boat with salvage aboard was last seen stopping in port (world time; the host's only). */
const stoppedSince = new Map<string, number>();
