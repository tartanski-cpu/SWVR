/**
 * The first voyage (phase 3, owner request): a short guided run for a new career, kept with
 * it (CareerState.tutorial). Each step is a plain check on the world; when one is met the
 * next comes over the VHF from the Calder harbour master, and the duty board ticks them off
 * (duties.ts). Done, it pays a small welcome bonus. Skip or restart from the Office tab
 * (intents tutorialSkip / tutorialRestart). A career saved before this existed counts as
 * experienced (no tutorial).
 */
import { CONFIG } from '../config';
import type { Intent } from '../core/intents';
import { homeVessel, type WorldState } from '../core/world';
import { aboard, carriedBy } from '../cargo/cargo';
import { sayRadio } from '../rescue/rescue';
import { isPowered } from '../vessel/electrics';
import type { VesselState } from '../vessel/vesselState';
import { PORTS } from '../world/archipelago';
import { createCareer } from './career';

export interface TutorialState {
  /** The step being worked on (index into TUTORIAL), or TUTORIAL.length when done. */
  step: number;
  /** Deliveries counted when the delivery step began (it wants one more). */
  base: number;
  /** The current step has been announced on the VHF. */
  said: boolean;
}

interface Step {
  /** Duty board line. */
  text: string;
  /** What the harbour master says when it comes up. */
  say: string;
  done(world: WorldState, v: VesselState, t: TutorialState): boolean;
}

const calder = () => PORTS.find((p) => p.id === 'calder')!;
const meAboard = (world: WorldState, v: VesselState) => Object.values(world.players).some((p) => p.aboardVesselId === v.id);

export const TUTORIAL: Step[] = [
  {
    text: 'Step aboard the workboat from the quay (walk on, or B / left stick click)',
    say: 'Good morning, skipper, Calder harbour master here. Welcome to the islands. That is your boat alongside the quay: step aboard and we will get her going.',
    done: (w, v) => meAboard(w, v),
  },
  {
    text: 'Battery MASTER on (aft wall of the wheelhouse, by the door)',
    say: 'She is cold and dark. First the battery master switch: on the aft wall of the wheelhouse, by the door.',
    done: (_w, v) => (v.electrics?.master ?? 1) > 0,
  },
  {
    text: 'INSTR breaker on (the panel by the helm)',
    say: 'Now the instruments: the INSTR breaker on the panel beside the helm.',
    done: (_w, v) => isPowered(v, 'instruments'),
  },
  {
    text: 'Start the engine: throttle neutral, KEY on, hold HEAT, then hold START',
    say: 'Start her up. Throttle in neutral, key on, hold HEAT until the glow lamp goes out, then hold START until she runs.',
    done: (_w, v) => v.engine.phase === 'running',
  },
  {
    text: 'Load a crate: carry one from the quay onto the deck (or menu Cargo, Load)',
    say: 'Lovely. You are lying at the cargo berth, and there is cargo waiting on the quay. Carry a crate aboard, or use the Cargo page of the menu. The colour says where it is going.',
    done: (w, v) => aboard(w, v.id).length > 0 || Object.values(w.players).some((p) => p.aboardVesselId === v.id && carriedBy(w, p.id).length > 0),
  },
  {
    text: 'Cast off (click the cleats fore and aft, or menu Boat, Cast off) and go out between the breakwater lights',
    say: 'Now cast off: click the cleats fore and aft on the quay side to let the lines go. Fenders in, and out between the breakwater lights, slow in the harbour.',
    done: (_w, v) => v.mooring.phase === 'free' && Math.hypot(v.position[0] - calder().x, v.position[2] - calder().z) > CONFIG.rescue.harbourRadius * 0.5,
  },
  {
    text: 'Deliver it: take her to its port and set it down by the goods stack',
    say: 'Now take it where it is bound and set it down ashore by the goods stack there. Lash it on deck if there is any sea running.',
    done: (w, _v, t) => w.deliveries > t.base,
  },
];

function workboat(world: WorldState): VesselState | undefined {
  return homeVessel(world);
}

/** One tick: announce the step, check it, move on. */
export function stepTutorial(world: WorldState): void {
  const c = world.career;
  const t = c?.tutorial;
  const v = workboat(world);
  if (!c || !t || !v || t.step >= TUTORIAL.length) return;
  const step = TUTORIAL[t.step];
  if (!t.said) {
    t.said = true;
    if (t.step === TUTORIAL.length - 1) t.base = world.deliveries;
    sayRadio(world, 'info', step.say);
    c.seq += 1;
    return;
  }
  if (!step.done(world, v, t)) return;
  t.step += 1;
  t.said = false;
  c.seq += 1;
  if (t.step >= TUTORIAL.length) {
    c.money += CONFIG.career.tutorialBonus;
    c.ledger.unshift({ clock: '', text: 'First voyage: welcome bonus', amount: CONFIG.career.tutorialBonus });
    sayRadio(world, 'info', `Well done, skipper - that is your first job done. A small welcome from the harbour. From here on it is your choice: the job boards in port, the radio, or the sea. Good luck.`);
  }
}

/** Office tab: skip it, or start it again. */
export function applyTutorialIntent(world: WorldState, intent: Intent): void {
  const c = (world.career ??= createCareer());
  if (intent.control === 'tutorialSkip' && c.tutorial) c.tutorial.step = TUTORIAL.length;
  if (intent.control === 'tutorialRestart') c.tutorial = { step: 0, base: 0, said: false };
  c.seq += 1;
}

export function isTutorialIntent(control: string): boolean {
  return control === 'tutorialSkip' || control === 'tutorialRestart';
}

/** For the Office tab: "First voyage 3/8: ..." or null once done. */
export function tutorialLine(world: WorldState): string | null {
  const t = world.career?.tutorial;
  if (!t || t.step >= TUTORIAL.length) return null;
  return `First voyage ${t.step + 1}/${TUTORIAL.length}: ${TUTORIAL[t.step].text}`;
}
