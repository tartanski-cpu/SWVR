import { CONFIG } from '../config';
import type { WorldState } from '../core/world';
import {
  acceptBlocker,
  buyBlocker,
  contractText,
  createCareer,
  money,
  officeAt,
  parseCareer,
  portName,
  repairBlocker,
  repairCost,
  repOf,
  serializeCareer,
  type CareerState,
  type Contract,
} from '../career/career';
import { tutorialLine } from '../career/tutorial';
import { PORTS } from '../world/archipelago';
import { COAST_REGION } from '../world/regions';
import { MODE } from '../mode';

/**
 * Career save slots (phase 3): swvr.fleetCareer.1..3, and which one is in use. Careers in the
 * fleet's beginner boat (owner, Oct 2026: new careers start afresh in her) have their own
 * keys: the careers saved before, in the old workboat (swvr.career.1..3, swvr.careerSlot),
 * are left as they are, never read or overwritten here (the live game and the test address
 * share one browser storage).
 */
// With the coast region on (the debug test of Oban, regions/index.ts) the careers are kept
// apart: the Sounds' and the Fjord's ports aren't in that world, and a career saved there
// would drop their reputation and contracts. Your real careers are never touched by it.
const KEY_PREFIX = COAST_REGION ? `swvr.coastTest.${COAST_REGION}` : 'swvr';
const CAREER_KEY = `${KEY_PREFIX}.fleetCareer`;
export const CAREER_SLOTS = 3;
const SLOT_KEY = `${KEY_PREFIX}.fleetCareerSlot`;
const slotKey = (n: number) => `${CAREER_KEY}.${n}`;

/**
 * The career in the slot last used, as saved (null: none yet, a new career), read before the
 * game is built: her boat is kitted out as it has her (App startFit).
 */
export function savedCareer(): CareerState | null {
  try {
    const n = Number(localStorage.getItem(SLOT_KEY));
    const slot = n >= 1 && n <= CAREER_SLOTS ? n : 1;
    return parseCareer(localStorage.getItem(slotKey(slot)));
  } catch {
    return null;
  }
}

/** What the career session needs from the app. */
export interface CareerHost {
  world(): WorldState;
  /** The workboat (her damage and wear go with the career). */
  vesselId(): string;
  /** A crew-mate plays the host's career: no slots, no saving here. */
  isClient(): boolean;
  notify(text: string, seconds: number): void;
  /** An environment intent (career, tutorial). */
  pushEnv(control: string, value: number, ref?: string): void;
}

/**
 * The career as this browser keeps it (split out of App): the save slots, saving when it
 * changes, the money pop-up, and the career's parts of the menu (the Office tab: Jobs, Yard, Career).
 * The career itself is world state (career/career.ts); this is only its home in the browser.
 */
export class CareerSession {
  /** The slot in use (1..CAREER_SLOTS). */
  slot = 1;
  /** The career's seq when last saved; the newest ledger line seen (for the pop-up). */
  private saved = -1;
  private seen: string | null = null;
  /** When "New career" was pressed once (ms). */
  private armed = -1e9;

  constructor(private readonly h: CareerHost) {}

  /** At start-up (host / solo): the slot last used. Voyage mode: no slots, nothing read. */
  restore(): void {
    if (MODE === 'voyage') return;
    const n = Number(localStorage.getItem(SLOT_KEY));
    this.slot = n >= 1 && n <= CAREER_SLOTS ? n : 1;
    this.load(this.slot);
  }

  /**
   * Put a saved career in play: the slot's career, or a new one (with the first voyage) if
   * it's empty; her damage and wear as they were left.
   */
  load(n: number): void {
    const w = this.h.world();
    let c = this.read(n);
    if (!c) {
      c = createCareer();
      c.tutorial = { step: 0, base: 0, said: false };
    }
    w.career = c;
    this.saved = -1;
    this.seen = null;
    const wb = w.vessels[this.h.vesselId()];
    if (wb && wb.damage !== undefined) {
      wb.damage = c.boat?.damage ?? 0;
      if (wb.engine.wear !== undefined) wb.engine.wear = c.boat?.wear ?? 0;
    }
  }

  private read(n: number): CareerState | null {
    try {
      return parseCareer(localStorage.getItem(slotKey(n)));
    } catch {
      return null;
    }
  }

  /** A slot's one-line summary for the menu. */
  summary(n: number): string {
    const w = this.h.world();
    const c = n === this.slot && w.career ? w.career : this.read(n);
    return c ? `${n}: ${money(c.money)}` : `${n}: empty`;
  }

  /** Every frame: save it when it changes (host / solo), and pop up money in or out. */
  tick(): void {
    const career = this.h.world().career;
    if (career && !this.h.isClient() && career.seq !== this.saved) {
      this.saved = career.seq;
      try {
        if (MODE !== 'voyage') localStorage.setItem(slotKey(this.slot), serializeCareer(career));
      } catch {
        // Not saved.
      }
    }
    // Money in or out: a short pop-up (desktop; the duty board shows it in VR).
    const top = career?.ledger[0];
    const key = top ? `${top.clock}|${top.text}|${top.amount}|${career!.money}` : null;
    if (key !== this.seen) {
      if (this.seen !== null && top) this.h.notify(`${top.amount >= 0 ? '+' : ''}${money(top.amount)}  ${top.text}  ·  ${money(career!.money)}`, 3);
      this.seen = key;
    }
  }

  /** The harbour office's offers where she lies (none at sea). */
  private officeOffers(): Contract[] {
    const w = this.h.world();
    const here = officeAt(w);
    return here ? (w.career?.offers ?? []).filter((o) => o.port === here) : [];
  }

  /** The career's parts of the menu host (the Office tab; see MenuHost). */
  menu() {
    const h = this.h;
    const w = () => h.world();
    const c = () => w().career;
    const own = () => !h.isClient();
    return {
      balance: () => (c() ? `${money(c()!.money)}  ·  ${c()!.contractsDone} contracts done  ·  ${c()!.upgrades.length} upgrades` : '-'),
      reputation: () => PORTS.map((p) => `${p.name.replace(' (anchorage)', '').split(' ')[0]} ${repOf(c(), p.id)}`).join('  ·  '),
      ledgerLine: (i: number) => {
        const e = c()?.ledger[i];
        return e ? `${e.clock}  ${e.amount >= 0 ? '+' : ''}${money(e.amount)}  ${e.text}` : '';
      },
      officeName: () => {
        const here = officeAt(w());
        return here ? `${portName(here)} harbour office` : 'At sea: come alongside a port (or anchor in its bay) to see its board';
      },
      offerText: (i: number) => {
        const k = this.officeOffers()[i];
        return k ? `${contractText(k)} · +${money(k.bonus)} · ${Math.round(k.allowed / 60)} min${k.minRep ? ` · rep ${k.minRep}` : ''}` : '';
      },
      offerBlocker: (i: number) => {
        const k = this.officeOffers()[i];
        return k ? (acceptBlocker(w(), k) ?? '') : '';
      },
      acceptOffer: (i: number) => {
        const k = this.officeOffers()[i];
        if (k && !acceptBlocker(w(), k)) h.pushEnv('careerAccept', 1, k.id);
      },
      contractText: () => {
        const k = c()?.active;
        if (!k) return 'None: take one from a harbour office job board';
        const left = Math.max(0, Math.round(((k.due ?? 0) - w().time) / 60));
        return `${contractText(k)}: ${k.done}/${k.count}, ${left} min left, +${money(k.bonus)}`;
      },
      abandonContract: () => h.pushEnv('careerAbandon', 1),
      upgradeText: (i: number) => {
        const u = CONFIG.career.upgrades[i];
        return u ? `${u.name} (${money(u.price)}): ${u.desc}` : '';
      },
      upgradeStatus: (i: number) => {
        const u = CONFIG.career.upgrades[i];
        return u ? (buyBlocker(w(), u.id) ?? '') : '';
      },
      buyUpgrade: (i: number) => {
        const u = CONFIG.career.upgrades[i];
        if (u && !buyBlocker(w(), u.id)) h.pushEnv('careerBuy', 1, u.id);
      },
      debugCash: () => h.pushEnv('careerDebugCash', 1),
      repairText: (i: number) => {
        const v = w().vessels[h.vesselId()];
        const what = i === 0 ? 'hull' : 'engine';
        const pct = Math.round(((i === 0 ? v?.damage : v?.engine.wear) ?? 0) * 100);
        return `${i === 0 ? 'Hull' : 'Engine'}: ${pct ? `${pct} % ${i === 0 ? 'damaged' : 'worn'} · ${money(repairCost(w(), what))}` : i === 0 ? 'sound' : 'in good order'}`;
      },
      repairStatus: (i: number) => repairBlocker(w(), i === 0 ? 'hull' : 'engine') ?? '',
      repair: (i: number) => {
        const what = i === 0 ? 'hull' : 'engine';
        if (!repairBlocker(w(), what)) h.pushEnv('careerRepair', 1, what);
      },
      debugDamage: () => h.pushEnv('careerDebugDamage', 1),
      // Slots (host / solo; a crew-mate plays the host's career).
      careerSlot: () => this.slot,
      slotText: (n: number) => (own() ? this.summary(n) : ''),
      switchSlot: (n: number) => {
        if (!own() || n === this.slot) return;
        const cur = c();
        try {
          if (cur) localStorage.setItem(slotKey(this.slot), serializeCareer(cur));
          localStorage.setItem(SLOT_KEY, String(n));
        } catch {
          // Not saved.
        }
        this.slot = n;
        this.load(n);
        h.notify(`Career slot ${n}: ${this.summary(n)}`, 3);
      },
      newCareer: () => {
        if (!own()) return;
        const now = performance.now();
        if (now - this.armed > 4000) {
          this.armed = now;
          h.notify(`Press again to start a new career in slot ${this.slot} (the old one is lost)`, 4);
          return;
        }
        this.armed = -1e9;
        try {
          localStorage.removeItem(slotKey(this.slot));
        } catch {
          // Nothing saved.
        }
        this.load(this.slot);
        h.notify('New career: the harbour master will talk you through your first voyage', 4);
      },
      newCareerText: () => (own() ? (performance.now() - this.armed < 4000 ? 'Press again to confirm' : 'New career in this slot') : "Playing the host's career"),
      tutorialText: () => tutorialLine(w()) ?? 'First voyage: done',
      tutorialSkip: () => h.pushEnv('tutorialSkip', 1),
      tutorialRestart: () => h.pushEnv('tutorialRestart', 1),
    };
  }
}
